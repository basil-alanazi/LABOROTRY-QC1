// تسجيل الدخول: الباسوورد ينحفظ PBKDF2 مع salt، والجلسة توكن عشوائي في كوكي HttpOnly
import { b64url } from "./push.js";

const enc = new TextEncoder();
// عدد التكرارات قليل نسبيًا عشان يمشي ضمن حد المعالجة في خطة Cloudflare المجانية
const PBKDF2_ITERATIONS = 10000;
const SESSION_DAYS = 60;
const COOKIE = "wad_session";
const MAX_FAILED = 10; // محاولات غلط خلال 15 دقيقة
const FAILED_WINDOW_MIN = 15;

export async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? b64url.decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { salt: b64url.encode(salt), hash: b64url.encode(bits) };
}

// مقارنة بوقت ثابت
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.pass_salt);
  return same(hash, user.pass_hash);
}

const sha256 = async (s) => b64url.encode(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export async function createSession(db, userId) {
  const token = b64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, expires).run();
  return { token, expires };
}

export const sessionCookie = (token, expires, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}${secure ? "; Secure" : ""}`;
export const clearCookie = (secure) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

function readToken(request) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

// يرجع المستخدم مع عائلته، أو null
export async function currentUser(db, request) {
  const token = readToken(request);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.id, u.family_id, u.username, u.display_name, u.role, u.is_admin, f.name AS family_name
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN families f ON f.id = u.family_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}

export async function endSession(db, request) {
  const token = readToken(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function tooManyAttempts(db, key) {
  const since = new Date(Date.now() - FAILED_WINDOW_MIN * 6e4).toISOString();
  const r = await db.prepare("SELECT count(*) AS n FROM login_attempts WHERE k = ? AND created_at > ?").bind(key, since).first();
  return r.n >= MAX_FAILED;
}

export async function recordFailure(db, key) {
  await db.prepare("INSERT INTO login_attempts (k) VALUES (?)").bind(key).run();
}

export const USERNAME_RE = /^[a-zA-Z0-9_.؀-ۿ]{3,30}$/;
