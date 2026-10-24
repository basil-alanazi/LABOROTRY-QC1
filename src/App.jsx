import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, setPatient, setUnauthorizedHandler } from "./api";
import HomeNew from "./HomeNew";
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
import Login from "./Login";
import Account from "./Account";
import PatientForm from "./PatientForm";
import { VerseBackground } from "./Verse";

export const PAGES = {
  sugar: "السكر والإنسولين",
  vitals: "القياسات الحيوية",
  meds: "الأدوية",
  appointments: "المواعيد الطبية",
  notes: "الملاحظات اليومية",
  diet: "الخطة الغذائية",
  labs: "نتائج التحاليل",
  record: "السجل الصحي",
  settings: "خطة العلاج والأهداف",
  notifications: "الإشعارات والتذكيرات",
  account: "العائلة والحساب",
};

// الصفحة من الرابط (مثل /#sugar لما تضغط على إشعار)
const pageFromHash = () => {
  const h = location.hash.replace("#", "");
  return PAGES[h] ? h : "home";
};

const REFRESH_MS = 20000;
const EMPTY = { settings: null, readings: [], doses: [], changes: [], bp: [], medications: [], medDoses: [], appointments: [], notes: [], labs: [], meals: [], diet: null };
const PATIENT_KEY = "wad_patient";

const savedPatient = () => { try { return Number(localStorage.getItem(PATIENT_KEY)) || null; } catch { return null; } };
const rememberPatient = (id) => { try { localStorage.setItem(PATIENT_KEY, String(id)); } catch { /* التخزين مقفل */ } };

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = جاري التحميل، null = مو مسجل
  const [patientId, setPatientId] = useState(null);
  const [page, setPage] = useState(pageFromHash);
  const [data, setData] = useState(EMPTY);
  const [error, setError] = useState("");
  const patientRef = useRef(null);

  async function loadMe() {
    try {
      const m = await api.me();
      setMe(m);
      const ids = m.patients.map((p) => p.id);
      const pick = ids.includes(patientRef.current) ? patientRef.current : ids.includes(savedPatient()) ? savedPatient() : ids[0] ?? null;
      selectPatient(pick);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }

  function selectPatient(id) {
    patientRef.current = id;
    setPatient(id);
    setPatientId(id);
    setData(EMPTY);
    if (id) {
      rememberPatient(id);
      reload();
    }
  }

  async function reload() {
    if (!patientRef.current) return;
    const id = patientRef.current;
    try {
      const d = await api.all();
      if (patientRef.current === id) setData(d);
      setError("");
    } catch (e) {
      setError("ما قدرنا نوصل لقاعدة البيانات: " + e.message);
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    loadMe();
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

  async function logout() {
    await api.logout().catch(() => {});
    setMe(null);
    setPage("home");
  }

  if (me === undefined) return <div className="app"><VerseBackground /><p className="empty">جاري التحميل...</p></div>;
  if (me === null) return <><VerseBackground /><Login onDone={loadMe} /></>;

  const patient = me.patients.find((p) => p.id === patientId);

  // أول مرة: ما فيه مرضى
  if (!patient) {
    return (
      <div className="app">
        <VerseBackground />
        <header className="top"><div><h1>ود</h1><span className="subtitle">حياكم يا {me.family.name}</span></div></header>
        <div className="card welcome">
          <h3>أهلًا {me.user.display_name} 🤍</h3>
          <p>خلنا نبدأ بإضافة أول شخص تتابعون صحته. جاوبوا على الأسئلة، وود يسوي له حمية ويتابع علاجه.</p>
        </div>
        <PatientForm onSaved={async (p) => { await loadMe(); selectPatient(p.id); }} />
      </div>
    );
  }

  const props = { ...data, onChanged: reload };

  return (
    <div className="app">
      <VerseBackground />
      {page !== "home" && (
        <header className="top page-top">
          <button className="icon-btn" onClick={back} aria-label="رجوع"><ArrowRight size={22} /></button>
          <h2>{PAGES[page]}</h2>
          {page !== "account" && <span className="page-patient">{patient.name}</span>}
        </header>
      )}

      {error && <div className="alert danger">{error}</div>}

      <main>
        {page === "home" && <HomeNew {...data} me={me} patient={patient} go={go} />}
        {page === "sugar" && <Today {...props} />}
        {page === "vitals" && <Vitals {...props} />}
        {page === "meds" && <Meds {...props} />}
        {page === "appointments" && <Appointments {...props} />}
        {page === "notes" && <Notes {...props} />}
        {page === "diet" && <Diet {...props} patient={patient} />}
        {page === "labs" && <Labs {...props} />}
        {page === "record" && <Readings {...props} />}
        {page === "notifications" && <Notifications settings={data.settings} onChanged={reload} />}
        {page === "settings" && <Settings settings={data.settings} onSaved={async () => { await reload(); await loadMe(); }} />}
        {page === "account" && (
          <Account
            me={me}
            currentPatient={patient}
            onPatientsChanged={loadMe}
            onSelectPatient={(id) => { selectPatient(id); go("home"); }}
            onLogout={logout}
          />
        )}
      </main>
    </div>
  );
}
