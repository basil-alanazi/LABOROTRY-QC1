// Cloudflare Worker for the Infection Control site.
//
//   /api/auth/login   POST {username, password}      -> {user, token}
//   /api/auth/me      GET                             -> {user}  (refresh session)
//   /api/db           POST {table, op, ...}           -> {data, error}
//   /api/storage/:bucket/:path   PUT (file body)      -> {data:{path}, error}
//   /files/:bucket/:path         GET                  -> the file (public, like Supabase public buckets)
//   everything else                                   -> the built React app (static assets)
//
// Bindings (see wrangler.toml): DB (D1), FILES (R2), ASSETS (static site),
// secret SESSION_SECRET (random string, set with `wrangler secret put`).
import { TABLES } from "./schema.js";
import { runQuery, ApiError } from "./query.js";
import { signToken, verifyToken, sha256Hex } from "./auth.js";
import { checkAccess } from "./access.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function apiError(err, status = 400) {
  return json({ data: null, error: { message: err.message || String(err), code: err.code || "ERROR" } }, status);
}

function publicUser(row) {
  if (!row) return row;
  const { password_hash, ...rest } = row;
  return rest;
}

async function getSession(request, env) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  return verifyToken(token, env.SESSION_SECRET);
}

async function handleLogin(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) return apiError(new ApiError("Incorrect username or password", "PGRST116"), 401);
  const hash = await sha256Hex(password);
  const row = await env.DB.prepare(
    `SELECT * FROM users WHERE lower(username) = lower(?) AND active = 1 AND password_hash = ? LIMIT 1`
  )
    .bind(String(username).trim(), hash)
    .first();
  if (!row) return apiError(new ApiError("Incorrect username or password", "PGRST116"), 401);
  const user = decodeRow("users", row);
  const token = await signToken({ uid: user.id, role: user.role, u: user.username }, env.SESSION_SECRET);
  return json({ data: { user: publicUser(user), token }, error: null });
}

async function handleMe(session, env) {
  if (!session) return apiError(new ApiError("Not signed in", "AUTH"), 401);
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND active = 1`).bind(session.uid).first();
  if (!row) return apiError(new ApiError("Account disabled", "AUTH"), 401);
  return json({ data: { user: publicUser(decodeRow("users", row)) }, error: null });
}

export function decodeRow(table, row) {
  const cols = TABLES[table]?.cols || {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const t = cols[k]?.t;
    if (v === null || v === undefined) out[k] = null;
    else if (t === "b") out[k] = v === 1 || v === true || v === "1" || v === "true";
    else if (t === "j") {
      try {
        out[k] = typeof v === "string" ? JSON.parse(v) : v;
      } catch {
        out[k] = v;
      }
    } else out[k] = v;
  }
  return out;
}

async function handleDb(request, env, session) {
  const q = await request.json();
  if (!q || typeof q.table !== "string" || !TABLES[q.table]) {
    throw new ApiError(`Unknown table: ${q?.table}`, "42P01");
  }
  checkAccess(q, session);
  let rows = await runQuery(env.DB, q);
  rows = rows.map((r) => decodeRow(q.table, r));
  if (q.table === "users") rows = rows.map(publicUser);
  if (q.single) {
    if (rows.length !== 1) {
      throw new ApiError(
        rows.length === 0 ? "JSON object requested, multiple (or no) rows returned" : "Multiple rows returned",
        "PGRST116"
      );
    }
    return json({ data: rows[0], error: null });
  }
  if (q.maybeSingle) {
    if (rows.length > 1) throw new ApiError("Multiple rows returned", "PGRST116");
    return json({ data: rows[0] ?? null, error: null });
  }
  return json({ data: rows, error: null });
}

// Anonymous uploads are limited to the IC test signature folder (the public
// QR test page); everything else needs a signed-in account.
function canUpload(session, bucket, path) {
  if (session) return true;
  return bucket === "employee-health-attachments" && path.startsWith("ic-test-signatures/");
}

const BUCKETS = new Set([
  "employee-health-attachments",
  "case-attachments",
  "ipc-calendar-attachments",
  "hh-attachments",
  "quality-round-attachments",
  "message-attachments",
  "nursing-round-attachments",
  "tracker-attachments",
  "ic-round-attachments",
]);

function splitStoragePath(pathname, prefix) {
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const bucket = decodeURIComponent(rest.slice(0, slash));
  const path = rest
    .slice(slash + 1)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
  if (!BUCKETS.has(bucket) || !path || path.includes("..")) return null;
  return { bucket, path, key: `${bucket}/${path}` };
}

async function handleUpload(request, env, session, url) {
  const loc = splitStoragePath(url.pathname, "/api/storage/");
  if (!loc) throw new ApiError("Bad storage path", "STORAGE");
  if (!canUpload(session, loc.bucket, loc.path)) throw new ApiError("Not signed in", "AUTH");
  const upsert = url.searchParams.get("upsert") === "true";
  if (!upsert) {
    const existing = await env.FILES.head(loc.key);
    if (existing) throw new ApiError("The resource already exists", "Duplicate");
  }
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  await env.FILES.put(loc.key, request.body, { httpMetadata: { contentType } });
  return json({ data: { path: loc.path, fullPath: loc.key }, error: null });
}

async function handleRemove(request, env, session) {
  if (!session) throw new ApiError("Not signed in", "AUTH");
  const { bucket, paths } = await request.json();
  if (!BUCKETS.has(bucket) || !Array.isArray(paths)) throw new ApiError("Bad request", "STORAGE");
  await env.FILES.delete(paths.filter((p) => typeof p === "string" && !p.includes("..")).map((p) => `${bucket}/${p}`));
  return json({ data: paths.map((p) => ({ name: p })), error: null });
}

async function handleFile(request, env, url) {
  const loc = splitStoragePath(url.pathname, "/files/");
  if (!loc) return new Response("Not found", { status: 404 });
  const obj = await env.FILES.get(loc.key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  if (url.searchParams.has("download")) {
    const name = url.searchParams.get("download") || loc.path.split("/").pop();
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  return new Response(obj.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname.startsWith("/files/") && request.method === "GET") return await handleFile(request, env, url);
      if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

      if (!env.SESSION_SECRET) throw new ApiError("Server not configured (SESSION_SECRET missing)", "CONFIG");
      const session = await getSession(request, env);

      if (pathname === "/api/auth/login" && request.method === "POST") return await handleLogin(request, env);
      if (pathname === "/api/auth/me" && request.method === "GET") return await handleMe(session, env);
      if (pathname === "/api/db" && request.method === "POST") return await handleDb(request, env, session);
      if (pathname.startsWith("/api/storage/") && request.method === "PUT") return await handleUpload(request, env, session, url);
      if (pathname === "/api/storage-remove" && request.method === "POST") return await handleRemove(request, env, session);
      if (pathname === "/api/health") return json({ ok: true });
      return apiError(new ApiError("Not found", "404"), 404);
    } catch (err) {
      const status = err.code === "AUTH" ? 401 : err.code === "FORBIDDEN" ? 403 : err instanceof ApiError ? 400 : 500;
      if (status === 500) console.error(err);
      return apiError(err, status);
    }
  },
};
