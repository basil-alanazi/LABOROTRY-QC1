import { useEffect, useState } from "react";
import { ArrowRight, Bell, Settings as SettingsIcon } from "lucide-react";
import { api } from "./api";
import Home from "./Home";
import Today from "./Today";
import Vitals from "./Vitals";
import Meds from "./Meds";
import Appointments from "./Appointments";
import Notes from "./Notes";
import Diet from "./Diet";
import Labs from "./Labs";
import Readings from "./Readings";
import Settings from "./Settings";
import Notifications from "./Notifications";
import { getDevice } from "./push";

export const PAGES = {
  sugar: "السكر والإنسولين",
  vitals: "القياسات الحيوية",
  meds: "الأدوية",
  appointments: "المواعيد الطبية",
  notes: "الملاحظات اليومية",
  diet: "الخطة الغذائية",
  labs: "نتائج التحاليل",
  record: "السجل الصحي",
  settings: "الإعدادات",
  notifications: "الإشعارات والتذكيرات",
};

// الصفحة من الرابط (مثل /#sugar لما تضغط على إشعار)
const pageFromHash = () => {
  const h = location.hash.replace("#", "");
  return PAGES[h] ? h : "home";
};

const REFRESH_MS = 20000;
const EMPTY = { settings: null, readings: [], doses: [], changes: [], bp: [], medications: [], medDoses: [], appointments: [], notes: [], labs: [], meals: [] };

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const [data, setData] = useState(EMPTY);
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

  // زر الرجوع في الجوال يرجع للرئيسية بدل ما يطلع من الموقع
  useEffect(() => {
    if (location.hash) history.replaceState({ page: "home" }, "", location.pathname);
    if (pageFromHash() !== "home") history.pushState({ page }, "");
    const onPop = () => setPage(history.state?.page || "home");
    window.addEventListener("popstate", onPop);
    // الضغط على إشعار والموقع مفتوح
    const onMessage = (e) => {
      if (e.data?.type !== "open") return;
      const p = new URL(e.data.url).hash.replace("#", "");
      if (PAGES[p]) go(p);
      reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("popstate", onPop);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  function go(p) {
    history.pushState({ page: p }, "");
    setPage(p);
    window.scrollTo(0, 0);
  }
  const back = () => history.back();

  const props = { ...data, onChanged: reload };

  return (
    <div className="app">
      {page === "home" ? (
        <header className="top">
          <div>
            <h1>ود</h1>
            <span className="subtitle">متابعة صحة {data.settings?.patient_name || "الوالد"}</span>
          </div>
          <div className="top-actions">
            <button className={`icon-btn ${getDevice() ? "" : "dot"}`} onClick={() => go("notifications")} aria-label="الإشعارات"><Bell size={22} /></button>
            <button className="icon-btn" onClick={() => go("settings")} aria-label="الإعدادات"><SettingsIcon size={22} /></button>
          </div>
        </header>
      ) : (
        <header className="top page-top">
          <button className="icon-btn" onClick={back} aria-label="رجوع"><ArrowRight size={22} /></button>
          <h2>{PAGES[page]}</h2>
        </header>
      )}

      {error && <div className="alert danger">{error}</div>}

      <main>
        {page === "home" && <Home {...data} go={go} />}
        {page === "sugar" && <Today {...props} />}
        {page === "vitals" && <Vitals {...props} />}
        {page === "meds" && <Meds {...props} />}
        {page === "appointments" && <Appointments {...props} />}
        {page === "notes" && <Notes {...props} />}
        {page === "diet" && <Diet {...props} />}
        {page === "labs" && <Labs {...props} />}
        {page === "record" && <Readings {...props} />}
        {page === "notifications" && <Notifications settings={data.settings} onChanged={reload} />}
        {page === "settings" && <Settings settings={data.settings} onSaved={reload} />}
      </main>
    </div>
  );
}
