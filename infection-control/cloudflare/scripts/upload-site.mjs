// Uploads the built site (../dist) to R2 under "_site/", where the Worker
// serves it from. Run after `VITE_BACKEND=cloudflare npm run build`.
//   node cloudflare/scripts/upload-site.mjs --remote | --local
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "..", "dist");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".mp3": "audio/mpeg",
};
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// index.html last, so it never points at assets that aren't uploaded yet.
const files = walk(dist).sort((a, b) => (a.endsWith("index.html") ? 1 : b.endsWith("index.html") ? -1 : 0));
// Files under assets/ have a content hash in their name, so one that's
// already in R2 is identical — skip it (saves time and R2's write rate limit).
async function existingRemoteKeys() {
  if (target !== "--remote") return new Set();
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const keys = new Set();
  let cursor = "";
  do {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/infection-control-files/objects?prefix=_site/assets/&per_page=1000${cursor ? `&cursor=${cursor}` : ""}`,
      { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } }
    );
    const body = await res.json();
    if (!body.success) throw new Error("Could not list R2 objects: " + JSON.stringify(body.errors));
    for (const o of body.result) keys.add(o.key);
    cursor = body.result_info?.is_truncated ? body.result_info.cursor : "";
  } while (cursor);
  return keys;
}
const existing = await existingRemoteKeys();
let uploaded = 0;
for (const f of files) {
  const key = "_site/" + relative(dist, f).split("\\").join("/");
  if (existing.has(key)) continue;
  uploaded++;
  const type = TYPES[extname(f).toLowerCase()] || "application/octet-stream";
  // Cloudflare rate-limits R2 writes (429); back off and retry.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("npx", ["wrangler", "r2", "object", "put", `infection-control-files/${key}`, "--file", f, "--content-type", type, target], { cwd: root, stdio: "pipe" });
      break;
    } catch (err) {
      if (attempt >= 6) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * attempt);
    }
  }
}
console.log(`uploaded ${uploaded} of ${files.length} site files (${target}; ${files.length - uploaded} unchanged)`);
