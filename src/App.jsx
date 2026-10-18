import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Calculator from "./Calculator";
import Readings from "./Readings";
import Settings from "./Settings";

const TABS = [
  { key: "calc", label: "الحاسبة" },
  { key: "readings", label: "القراءات" },
  { key: "settings", label: "الإعدادات" },
];

export default function App() {
  const [tab, setTab] = useState("calc");
  const [settings, setSettings] = useState(null);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState("");

  async function loadSettings() {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (error) setError("ما قدرنا نوصل لقاعدة البيانات: " + error.message);
    else setSettings(data);
  }

  async function loadReadings() {
    const { data, error } = await supabase
      .from("readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) setError("ما قدرنا نجيب القراءات: " + error.message);
    else setReadings(data);
  }

  useEffect(() => {
    loadSettings();
    loadReadings();
    // أي قراءة يسجلها أحد من العائلة تظهر عند الكل مباشرة
    const channel = supabase
      .channel("readings")
      .on("postgres_changes", { event: "*", schema: "public", table: "readings" }, loadReadings)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="app">
      <header className="top">
        <h1>صحة {settings?.patient_name || "الوالد"}</h1>
      </header>

      {error && <div className="alert danger">{error}</div>}

      <main>
        {tab === "calc" && <Calculator settings={settings} readings={readings} onSaved={loadReadings} />}
        {tab === "readings" && <Readings settings={settings} readings={readings} onChanged={loadReadings} />}
        {tab === "settings" && <Settings settings={settings} onSaved={setSettings} />}
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
