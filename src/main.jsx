import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource/amiri-quran/arabic-400.css";
import "./styles.css";
import { applyFontSize } from "./fontSize";
import { applyTheme } from "./theme";
import { startI18n } from "./i18n";

// حجم الخط المحفوظ في هالجوال
applyFontSize();
applyTheme();

// اللغة أول (القاموس ينحمّل لو مو عربي)، بعدين التطبيق
startI18n().catch((e) => console.error("i18n:", e)).finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((e) => console.error("service worker:", e));
}
