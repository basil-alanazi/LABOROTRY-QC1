// ألوان التطبيق لكل جوال: الأزرق الطبي هو الأساسي، والباقي يختاره كل واحد
export const THEMES = {
  navy: { name: "أزرق طبي", meta: "#1F5A8C", bg: "#F6F8FB", card: "#FFFFFF", text: "#1B2733", muted: "#64748B", line: "#DDE4EC",
    brand: "#1F5A8C", brand2: "#153F63", gold: "#4A90C8", soft: "#E8EFF7", cream: "#F5F9FD", olive: "#2E7D5B", star: "#E3EAF3", deep: "#173F61", tint: "#EAF1F8" },
  warm: { name: "دفء", meta: "#8C6136", brand: "#A0703E", brand2: "#74502B" },
  green: { name: "أخضر صحي", meta: "#0E6B57", bg: "#F3F7F5", card: "#FFFFFF", text: "#17302A", muted: "#5D6F69", line: "#DCE6E1",
    brand: "#0E6B57", brand2: "#0A4E40", gold: "#B4975A", soft: "#E5F0EB", cream: "#F4FAF7", olive: "#2E7D5B", star: "#E2ECE7", deep: "#0C4A3D", tint: "#E7F2ED" },
  royal: { name: "كحلي وذهبي", meta: "#1F2D4D", bg: "#F5F5F2", card: "#FFFFFF", text: "#1E2430", muted: "#6B7280", line: "#E4E2DA",
    brand: "#1F2D4D", brand2: "#141D33", gold: "#B8975A", soft: "#EEEFF3", cream: "#FAF8F2", olive: "#3F7A55", star: "#E9E6DC", deep: "#1F2D4D", tint: "#EFF0F4" },
  slate: { name: "رمادي وتركوازي", meta: "#2B6777", bg: "#F2F4F5", card: "#FFFFFF", text: "#1F2933", muted: "#66737F", line: "#DFE4E8",
    brand: "#2B6777", brand2: "#1D4A56", gold: "#52AB98", soft: "#E6EEF0", cream: "#F6FAFA", olive: "#3B8A6E", star: "#E4E9EC", deep: "#1D4A56", tint: "#E8F0F1" },
};
const KEY = "wad_theme";

export function getTheme() {
  try { return THEMES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "navy"; } catch { return "navy"; }
}

// لون الإنسولين والرسوم البيانية (الرسوم ما تقرأ متغيرات CSS)
export const brandColor = () => THEMES[getTheme()].brand;

// الألوان فوق طبقة "دفء" في styles.css: نغيّر المتغيرات، والألوان الثابتة القليلة
function css(t) {
  const enc = (c) => c.replace("#", "%23");
  const star = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpath d='M30 4 L36 24 L56 30 L36 36 L30 56 L24 36 L4 30 L24 24Z' fill='none' stroke='${enc(t.star)}'/%3E%3C/svg%3E")`;
  return `:root{--bg:${t.bg};--card:${t.card};--text:${t.text};--muted:${t.muted};--line:${t.line};--brand:${t.brand};--brand-2:${t.brand2};--gold:${t.gold};--soft:${t.soft};--cream:${t.cream};--olive:${t.olive};--star:${star};--star-light:${star}}
.page-top,.doc-toolbar{background:${t.bg}eb}
.page-patient,.secondary,.tag,.target-chips span,.appt-when{color:${t.deep}}
.info-card,.welcome,.alert.info{color:${t.deep};border-color:${t.line}}
.primary{box-shadow:0 10px 20px -12px ${t.brand}a6}
.radio.on,.toggle-row.on,.today-row td{background:${t.tint}}
input:focus,textarea:focus{box-shadow:0 0 0 3px ${t.brand}33}
.login-hero,.hn-hero{background:linear-gradient(150deg,${t.brand},${t.brand2})}
.hn-hero .badge{background:${t.tint};color:${t.deep}}
.doc-overlay{background:${t.line}}
.doc h2{border-bottom-color:${t.brand};color:${t.deep}}
.doc-table thead th,.doc-sugar thead .doc-ins{background:${t.tint}}
.doc-meds th,.doc-sugar .doc-ins{background:${t.cream}}`;
}

export function applyTheme(key = getTheme()) {
  const t = THEMES[key] || THEMES.navy;
  let el = document.getElementById("wad-theme");
  if (!el) { el = document.createElement("style"); el.id = "wad-theme"; document.head.appendChild(el); }
  el.textContent = t.bg ? css(t) : "";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.meta);
}

export function setTheme(key) {
  try { localStorage.setItem(KEY, key); } catch { /* التخزين مقفل */ }
  applyTheme(key);
}
