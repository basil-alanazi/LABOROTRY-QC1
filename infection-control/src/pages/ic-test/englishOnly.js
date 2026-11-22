import { useEffect } from "react";

// Public test pages are always English and must not be machine-translated by
// the phone's browser (Chrome/Safari offer to translate English pages on
// Arabic phones, which changes the questions). Restores the portal's own
// language settings when the page is left.
export function useEnglishOnlyPage() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = { lang: html.lang, dir: html.dir, translate: html.getAttribute("translate") };
    html.lang = "en";
    html.dir = "ltr";
    html.setAttribute("translate", "no");
    html.classList.add("notranslate");
    const meta = document.createElement("meta");
    meta.name = "google";
    meta.content = "notranslate";
    document.head.appendChild(meta);
    return () => {
      html.lang = prev.lang;
      html.dir = prev.dir;
      if (prev.translate === null) html.removeAttribute("translate");
      else html.setAttribute("translate", prev.translate);
      html.classList.remove("notranslate");
      meta.remove();
    };
  }, []);
}
