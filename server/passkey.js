// الدخول بالبصمة أو الوجه (WebAuthn / Passkeys) بدون مكتبات: نتحقق من التوقيع بـ crypto.subtle
import { b64url } from "./push.js";

const enc = new TextEncoder();
const CHALLENGE_MIN = 5;
export const ALGS = [-7, -257]; // ES256، RS256

const sha256 = async (buf) => new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ===== CBOR (بس اللي نحتاجه من attestationObject ومفتاح COSE) =====
function cbor(buf) {
  let i = 0;
  const len = (info) => {
    if (info < 24) return info;
    const n = 1 << (info - 24);
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + buf[i++];
    return v;
  };
  const item = () => {
    const b = buf[i++];
    const type = b >> 5, info = b & 31;
    switch (type) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); const v = buf.slice(i, i + n); i += n; return v; }
      case 3: { const n = len(info); const v = new TextDecoder().decode(buf.slice(i, i + n)); i += n; return v; }
      case 4: { const n = len(info); return Array.from({ length: n }, item); }
      case 5: { const n = len(info); const m = new Map(); for (let k = 0; k < n; k++) m.set(item(), item()); return m; }
      case 7: return info === 20 ? false : info === 21 ? true : null;
      default: throw new Error("CBOR غير مدعوم");
    }
  };
  const value = item();
  return { value, end: i };
}

// بيانات المصادقة: rpIdHash (32) + flags (1) + counter (4) [+ المفتاح الجديد]
function parseAuthData(a) {
  const flags = a[32];
  const counter = ((a[33] << 24) >>> 0) + (a[34] << 16) + (a[35] << 8) + a[36];
  const out = { rpIdHash: a.slice(0, 32), up: !!(flags & 1), uv: !!(flags & 4), counter };
  if (flags & 0x40) {
    const idLen = (a[53] << 8) + a[54];
    out.credId = a.slice(55, 55 + idLen);
    out.cose = cbor(a.slice(55 + idLen)).value;
  }
  return out;
}

// مفتاح COSE ← JWK
function coseToJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7) return { alg, jwk: { kty: "EC", crv: "P-256", x: b64url.encode(m.get(-2)), y: b64url.encode(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg, jwk: { kty: "RSA", n: b64url.encode(m.get(-1)), e: b64url.encode(m.get(-2)), alg: "RS256" } };
  throw new Error("نوع المفتاح مو مدعوم");
}

// توقيع ES256 يجي DER، و crypto.subtle يبي r||s (64 بايت)
function derToRaw(der) {
  let i = 2;
  const int = () => { i++; const n = der[i++]; let v = der.slice(i, i + n); i += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = int(), s = int();
  const raw = new Uint8Array(64); raw.set(r); raw.set(s, 32);
  return raw;
}

async function newChallenge(db, kind, userId = null) {
  const challenge = b64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + CHALLENGE_MIN * 6e4).toISOString();
  await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(new Date().toISOString()),
    db.prepare("INSERT INTO auth_challenges (challenge, kind, user_id, expires_at) VALUES (?, ?, ?, ?)").bind(challenge, kind, userId, expires),
  ]);
  return challenge;
}

// يستهلك التحدّي (مرة وحدة بس)
async function useChallenge(db, challenge, kind, userId = null) {
  const row = await db.prepare("DELETE FROM auth_challenges WHERE challenge = ? AND kind = ? AND expires_at > ? RETURNING user_id")
    .bind(challenge, kind, new Date().toISOString()).first();
  if (!row || (kind === "register" && row.user_id !== userId)) throw new Error("انتهت المحاولة، جرّب مرة ثانية");
}

function checkClient(clientDataB64, type, origin) {
  const raw = b64url.decode(clientDataB64);
  const c = JSON.parse(new TextDecoder().decode(raw));
  if (c.type !== type) throw new Error("طلب غير صحيح");
  if (c.origin !== origin) throw new Error("الموقع غير مطابق");
  return { c, raw };
}

async function checkAuthData(a, rpId) {
  if (!same(a.rpIdHash, await sha256(enc.encode(rpId)))) throw new Error("الموقع غير مطابق");
  if (!a.up || !a.uv) throw new Error("لازم تتأكد بالبصمة أو الوجه");
}

// ===== التسجيل (المستخدم داخل) =====
export async function registerOptions(db, user, rpId) {
  const existing = (await db.prepare("SELECT id FROM passkeys WHERE user_id = ?").bind(user.id).all()).results;
  return {
    challenge: await newChallenge(db, "register", user.id),
    rp: { name: "ود", id: rpId },
    user: { id: b64url.encode(enc.encode(String(user.id))), name: user.username, displayName: user.display_name || user.username },
    pubKeyCredParams: ALGS.map((alg) => ({ type: "public-key", alg })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
    excludeCredentials: existing.map((k) => ({ type: "public-key", id: k.id })),
    attestation: "none",
    timeout: CHALLENGE_MIN * 6e4,
  };
}

export async function register(db, user, body, rpId, origin, name) {
  const { c } = checkClient(body?.response?.clientDataJSON || "", "webauthn.create", origin);
  await useChallenge(db, c.challenge, "register", user.id);
  const att = cbor(b64url.decode(body.response.attestationObject)).value;
  const a = parseAuthData(att.get("authData"));
  await checkAuthData(a, rpId);
  if (!a.credId || !a.cose) throw new Error("ما وصل المفتاح");
  const { alg, jwk } = coseToJwk(a.cose);
  const id = b64url.encode(a.credId);
  await db.prepare("INSERT INTO passkeys (id, user_id, public_key, alg, counter, name) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, JSON.stringify(jwk), alg, a.counter, name).run();
  return { id, name };
}

// ===== الدخول (بدون يوزر: الجوال يختار المفتاح) =====
export async function loginOptions(db, rpId) {
  return { challenge: await newChallenge(db, "login"), rpId, userVerification: "required", allowCredentials: [], timeout: CHALLENGE_MIN * 6e4 };
}

export async function login(db, body, rpId, origin) {
  const { c, raw } = checkClient(body?.response?.clientDataJSON || "", "webauthn.get", origin);
  await useChallenge(db, c.challenge, "login");
  const key = await db.prepare("SELECT * FROM passkeys WHERE id = ?").bind(String(body.id || "")).first();
  if (!key) throw new Error("هالبصمة مو مسجلة في ود. ادخل باليوزر والباسوورد وفعّلها من جديد.");
  const authData = b64url.decode(body.response.authenticatorData);
  const a = parseAuthData(authData);
  await checkAuthData(a, rpId);
  const signed = new Uint8Array([...authData, ...(await sha256(raw))]);
  let sig = b64url.decode(body.response.signature);
  const jwk = JSON.parse(key.public_key);
  const params = key.alg === -7 ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const pub = await crypto.subtle.importKey("jwk", jwk, params, false, ["verify"]);
  if (key.alg === -7) sig = derToRaw(sig);
  const ok = await crypto.subtle.verify(key.alg === -7 ? { name: "ECDSA", hash: "SHA-256" } : "RSASSA-PKCS1-v1_5", pub, sig, signed);
  if (!ok) throw new Error("ما تطابقت البصمة");
  // عدّاد الاستخدام: لو رجع لورا يعني المفتاح منسوخ
  if (a.counter && key.counter && a.counter <= key.counter) throw new Error("ما تطابقت البصمة");
  await db.prepare("UPDATE passkeys SET counter = ?, last_used = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(a.counter, key.id).run();
  return key.user_id;
}
