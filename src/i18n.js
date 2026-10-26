// لغة التطبيق لكل جوال: النصوص مكتوبة بالعربي في الكود، والترجمة تبدّلها وهي تطلع على الشاشة.
// القاموس: النص العربي ← الترجمة، و{0} {1} مكان الأرقام والأسماء اللي تتغير.
export const LANGS = {
  ar: { name: "العربية", dir: "rtl", locale: "ar-SA-u-ca-gregory-nu-latn" },
  en: { name: "English", dir: "ltr", locale: "en-GB" },
  ur: { name: "اردو", dir: "rtl", locale: "ur-PK-u-nu-latn" },
  bn: { name: "বাংলা", dir: "ltr", locale: "bn-BD-u-nu-latn" },
};
const KEY = "wad_lang";

export function getLang() {
  try { return LANGS[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "ar"; } catch { return "ar"; }
}

// تغيير اللغة يعيد تحميل الصفحة عشان كل النصوص تنبني من جديد
export function setLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* التخزين مقفل */ }
  location.reload();
}

export const dateLocale = () => LANGS[getLang()].locale;

let exact = new Map();
let patterns = [];
const LETTER = /[\p{L}\p{N}]/u;

function build(dict) {
  exact = new Map();
  patterns = [];
  for (const [ar, tr] of Object.entries(dict)) {
    if (!tr) continue;
    if (/\{\d\}/.test(ar)) {
      const re = new RegExp("^" + ar.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\d)\\?\}/g, "(.+?)") + "$", "s");
      const order = [...ar.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
      patterns.push({ re, tr, order, len: ar.length });
    } else exact.set(ar, tr);
  }
  patterns.sort((a, b) => b.len - a.len);
}

function core(s) {
  if (exact.has(s)) return exact.get(s);
  for (const p of patterns) {
    const m = s.match(p.re);
    if (!m) continue;
    const vals = {};
    p.order.forEach((n, i) => { vals[n] = core(m[i + 1]) ?? m[i + 1]; });
    return p.tr.replace(/\{(\d)\}/g, (_, n) => vals[n] ?? "");
  }
  return null;
}

// ترجمة نص: كامل، وإلا قطعه (رسالة + خطأ من السيرفر، أو رمز قبل النص)
export function tr(text) {
  if (!text || !/[؀-ۿ]/.test(text)) return null;
  const [, lead, body, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  let out = core(body);
  if (out == null) {
    const sym = body.match(/^([^\p{L}\p{N}]+)([\s\S]+)$/u);
    if (sym && !LETTER.test(sym[1])) { const r = core(sym[2]); if (r != null) out = sym[1] + r; }
  }
  if (out == null) {
    const parts = body.split(/(: | — | · |\n|، )/);
    if (parts.length > 1) {
      let hit = false;
      const done = parts.map((x) => { const r = x.trim() && core(x.trim()); if (r) { hit = true; return x.replace(x.trim(), r); } return x; });
      if (hit) out = done.join("").replace(/، /g, ", ");
    }
  }
  return out == null ? null : lead + out + trail;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];

function walk(root) {
  if (root.nodeType === 3) { const t = tr(root.nodeValue); if (t != null && t !== root.nodeValue) root.nodeValue = t; return; }
  if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE" || root.isContentEditable) return;
  for (const a of ATTRS) {
    const v = root.getAttribute?.(a);
    if (v) { const t = tr(v); if (t != null && t !== v) root.setAttribute(a, t); }
  }
  for (const c of root.childNodes) walk(c);
}

export async function startI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].dir;
  if (lang === "ar") return;
  const dict = (await import(`./locales/${lang}.json`)).default;
  build(dict);
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // رسائل التأكيد
  const confirm0 = window.confirm.bind(window), alert0 = window.alert.bind(window);
  window.confirm = (m) => confirm0(tr(String(m)) ?? m);
  window.alert = (m) => alert0(tr(String(m)) ?? m);
}
