import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Today from "./Today";
import Readings from "./Readings";
import Settings from "./Settings";

const TABS = [
  { key: "today", label: "اليوم" },
  { key: "readings", label: "الجدول" },
  { key: "settings", label: "الإعدادات" },
];

export default function App() {
  const [tab, setTab] = useState("today");
  const [settings, setSettings] = useState(null);
  const [readings, setReadings] = useState([]);
  const [doses, setDoses] = useState([]);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState("");

  async function load(table, setter, limit = 1000) {
    const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) setError("ما قدرنا نوصل لقاعدة البيانات: " + error.message);
    else setter(data);
  }

  async function loadSettings() {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (error) setError("ما قدرنا نوصل لقاعدة البيانات: " + error.message);
    else setSettings(data);
  }

  const loadReadings = () => load("readings", setReadings);
  const loadDoses = () => load("doses", setDoses);
  const loadChanges = () => load("tresiba_changes", setChanges, 100);

  useEffect(() => {
    loadSettings();
    loadReadings();
    loadDoses();
    loadChanges();
    // أي شي يسجله أحد من العائلة يظهر عند الكل مباشرة
    const channel = supabase
      .channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "readings" }, loadReadings)
      .on("postgres_changes", { event: "*", schema: "public", table: "doses" }, loadDoses)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const data = { settings, readings, doses, changes };

  return (
    <div className="app">
      <header className="top">
        <h1>صحة {settings?.patient_name || "الوالد"}</h1>
      </header>

      {error && <div className="alert danger">{error}</div>}

      <main>
        {tab === "today" && (
          <Today
            {...data}
            onReading={loadReadings}
            onDose={loadDoses}
            onTresibaChanged={() => { loadSettings(); loadChanges(); }}
          />
        )}
        {tab === "readings" && <Readings {...data} onChanged={() => { loadReadings(); loadDoses(); }} />}
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
