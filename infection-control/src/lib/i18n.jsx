import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ar } from "./translations/ar.js";

const LanguageContext = createContext(null);

function readStoredLang() {
  try {
    return localStorage.getItem("ic_lang") === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("ic_lang", lang);
    } catch {
      // localStorage unavailable (private mode, etc.) — language just won't persist
    }
  }, [lang]);

  const value = useMemo(() => {
    const dict = lang === "ar" ? ar : null;
    return {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      toggleLang: () => setLang((l) => (l === "ar" ? "en" : "ar")),
      t: dict ? (str) => dict[str] ?? str : (str) => str,
    };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
