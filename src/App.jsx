import { useEffect, useState } from "react";
import { api } from "./api";
import Today from "./Today";
import Readings from "./Readings";
import Settings from "./Settings";

const TABS = [
  { key: "today", label: "اليوم" },
  { key: "readings", label: "الجدول" },
  { key: "settings", label: "الإعدادات" },
];

const REFRESH_MS = 20000;

export default function App() {
  const [tab, setTab] = useState("today");
  const [data, setData] = useState({ settings: null, readings: [], doses: [], changes: [], bp: [] });
  const [error, setError] = useState("");

  async function reload() {
    try {
      setData(await api.all());
      setError("");
    } catch (e) {
      setError("ما قدرنا نوصل لقاعدة البيانات: " + e.message);
    }
  }

  useEffect(() => {
    reload();
    // أي شي يسجله أحد من العائلة يظهر عند الباقين خلال ثواني
    const t = setInterval(reload, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return (
    <div className="app">
      <header className="top">
        <h1>ود</h1>
        <span className="subtitle">متابعة صحة {data.settings?.patient_name || "الوالد"}</span>
      </header>

      {error && <div className="alert danger">{error}</div>}

      <main>
        {tab === "today" && <Today {...data} onChanged={reload} />}
        {tab === "readings" && <Readings {...data} onChanged={reload} />}
        {tab === "settings" && <Settings settings={data.settings} onSaved={reload} />}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
