// حجم الخط لكل جوال (لكبار السن): نخلي عرض الصفحة أضيق، والجوال يكبّرها لعرض الشاشة.
// كذا كل شي يكبر بنفس النسبة ويترتب صح (أحسن من zoom).
export const SIZES = [
  ["normal", "عادي", 1],
  ["large", "كبير", 1.15],
  ["xlarge", "كبير جدًا", 1.3],
];
const KEY = "wad_font_size";
const NORMAL = "width=device-width, initial-scale=1.0, viewport-fit=cover";

export function getFontSize() {
  try { return localStorage.getItem(KEY) || "normal"; } catch { return "normal"; }
}

export function applyFontSize(size = getFontSize()) {
  const scale = (SIZES.find(([k]) => k === size) || SIZES[0])[2];
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const width = Math.min(screen.width, screen.height); // عرض الجوال بالطول
  meta.setAttribute("content", scale === 1 ? NORMAL : `width=${Math.round(width / scale)}, viewport-fit=cover`);
}

export function setFontSize(size) {
  try { localStorage.setItem(KEY, size); } catch { /* التخزين مقفل */ }
  applyFontSize(size);
}
