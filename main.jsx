import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => {
      localStorage.removeItem("qc_sw_error");
    }).catch((err) => {
      console.error("Service worker registration failed:", err);
      localStorage.setItem("qc_sw_error", `${err.name}: ${err.message}`);
    });
  });
}
