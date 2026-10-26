// ترجمة نصوص السيرفر (الإشعارات) حسب لغة كل جهاز، من نفس قواميس الواجهة
import en from "../src/locales/en.json";
import ur from "../src/locales/ur.json";
import bn from "../src/locales/bn.json";

const DICTS = { en, ur, bn };
export const LANGS = ["ar", "en", "ur", "bn"];

// t("⚠️ هبوط سكر {0}", 55) ← النص بلغة الجهاز، والعربي إذا ما فيه ترجمة
export const tFor = (lang) => (ar, ...vals) => {
  const tpl = DICTS[lang]?.[ar] ?? ar;
  return tpl.replace(/\{(\d)\}/g, (_, n) => vals[n] ?? "");
};
