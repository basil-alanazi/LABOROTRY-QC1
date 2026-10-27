// الدخول بالبصمة أو الوجه (Passkeys): البصمة تبقى في الجوال، والموقع يحفظ المفتاح العام بس
import { api } from "./api";

const OFFER_KEY = "wad_passkey_offer"; // "done" = فعّلها، "no" = ما يبي

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const passkeySupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

// هل الجوال فيه بصمة أو وجه؟
export async function hasBiometrics() {
  if (!passkeySupported()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const biometricName = () => (isIos() ? "Face ID" : "البصمة");

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "آيفون";
  if (/ipad/i.test(ua)) return "آيباد";
  if (/android/i.test(ua)) return "أندرويد";
  if (/mac/i.test(ua)) return "ماك";
  if (/windows/i.test(ua)) return "ويندوز";
  return "جهاز";
}

export async function registerPasskey() {
  const o = await api.passkeyRegisterOptions();
  const cred = await navigator.credentials.create({
    publicKey: {
      ...o,
      challenge: fromB64(o.challenge),
      user: { ...o.user, id: fromB64(o.user.id) },
      excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: fromB64(c.id) })),
    },
  });
  const r = cred.response;
  await api.passkeyRegister({
    id: cred.id,
    name: deviceName(),
    response: { clientDataJSON: toB64(r.clientDataJSON), attestationObject: toB64(r.attestationObject) },
  });
  setOffer("done");
}

export async function loginWithPasskey() {
  const o = await api.passkeyLoginOptions();
  const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: fromB64(o.challenge), allowCredentials: [] } });
  const r = cred.response;
  await api.passkeyLogin({
    id: cred.id,
    response: { clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature) },
  });
  setOffer("done");
}

export function getOffer() { try { return localStorage.getItem(OFFER_KEY); } catch { return "no"; } }
export function setOffer(v) { try { localStorage.setItem(OFFER_KEY, v); } catch { /* التخزين مقفل */ } }

// المستخدم ألغى أو الوقت خلص: ما نعرض خطأ
export const cancelled = (e) => e?.name === "NotAllowedError" || e?.name === "AbortError";
