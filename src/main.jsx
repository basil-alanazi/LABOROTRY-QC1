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

// حجم الخط المحفوظ في هالجوال
applyFontSize();
applyTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((e) => console.error("service worker:", e));
}
