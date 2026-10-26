import { useEffect, useState } from "react";
import { api } from "./api";
import PatientForm from "./PatientForm";
import InstallCard from "./InstallCard";
import { SIZES, getFontSize, setFontSize } from "./fontSize";
import { THEMES, getTheme, setTheme } from "./theme";

// العائلة: المرضى، وأفراد العائلة، والحساب، ولوحة المدير
export default function Account({ me, currentPatient, onPatientsChanged, onSelectPatient, onLogout, onHelp }) {
  const [editing, setEditing] = useState(null); // مريض للتعديل، أو "new"
  const [members, setMembers] = useState([]);
  const [member, setMember] = useState({ display_name: "", username: "", password: "" });
  const [pw, setPw] = useState({ old: "", next: "" });
  const [families, setFamilies] = useState([]);
  const [fam, setFam] = useState({ name: "", username: "", password: "", display_name: "" });
  const [message, setMessage] = useState("");

  const loadMembers = () => api.members().then(setMembers).catch(() => {});
  const loadFamilies = () => me.user.is_admin && api.adminFamilies().then(setFamilies).catch(() => {});
  useEffect(() => { loadMembers(); loadFamilies(); }, []);

  async function act(fn, ok) {
    setMessage("");
    try {
      await fn();
      setMessage(ok);
    } catch (e) {
      setMessage("⚠️ " + e.message);
    }
  }

  if (editing) {
    return (
      <PatientForm
        patient={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async (p) => { setEditing(null); await onPatientsChanged(); onSelectPatient(p.id); }}
      />
    );
  }

  const doctor = me.user.is_doctor;
  const canRemove = (m) => m.id !== me.user.id && m.role !== "owner" && (me.user.role === "owner" || m.created_by === me.user.id);

  return (
    <section>
      {message && <div className="alert info">{message}</div>}

      {doctor && currentPatient && (
        <div className="card">
          <h3>🩺 المريض المفتوح</h3>
          <div className="patient-row current">
            <span className="patient-pick"><span className="avatar">{currentPatient.name.slice(0, 1)}</span><span>{currentPatient.name}</span><small className="muted">{currentPatient.family_name}</small></span>
            <button className="link small" onClick={() => setEditing(currentPatient)}>تعديل الملف</button>
          </div>
        </div>
      )}

      {!doctor && <>
      <div className="card">
        <h3>👨‍👩‍👧 المرضى في عائلة {me.family.name}</h3>
        {me.patients.map((p) => (
          <div key={p.id} className={`patient-row ${currentPatient?.id === p.id ? "current" : ""}`}>
            <button className="patient-pick" onClick={() => onSelectPatient(p.id)}>
              <span className="avatar">{p.name.slice(0, 1)}</span>
              <span>{p.name}</span>
              {currentPatient?.id === p.id && <small className="muted">(المفتوح الحين)</small>}
            </button>
            <button className="link small" onClick={() => setEditing(p)}>تعديل</button>
          </div>
        ))}
        <button className="secondary" onClick={() => setEditing("new")}>+ أضف مريض</button>
      </div>

      <div className="card">
        <h3>👥 أفراد العائلة</h3>
        {members.map((m) => (
          <div key={m.id} className="row-between member">
            <span>{m.display_name} <small className="muted" dir="ltr">@{m.username}</small> {m.role === "owner" && <span className="tag">صاحب الحساب</span>}</span>
            {canRemove(m) && <button className="link small danger-link" onClick={() => confirm(`تحذف ${m.display_name}؟`) && act(async () => { await api.removeMember(m.id); loadMembers(); }, "انحذف")}>حذف</button>}
          </div>
        ))}
        <details>
          <summary>+ أضف فرد</summary>
          <label>الاسم</label>
          <input value={member.display_name} onChange={(e) => setMember({ ...member, display_name: e.target.value })} placeholder="مثلاً أحمد" />
          <label>اليوزر (إنجليزي أو عربي، بدون مسافات)</label>
          <input dir="ltr" autoCapitalize="none" value={member.username} onChange={(e) => setMember({ ...member, username: e.target.value })} placeholder="ahmed" />
          <label>الباسوورد</label>
          <input dir="ltr" value={member.password} onChange={(e) => setMember({ ...member, password: e.target.value })} />
          <button className="primary" onClick={() => act(async () => { await api.addMember(member); setMember({ display_name: "", username: "", password: "" }); loadMembers(); }, "انضاف ✓ — عطه اليوزر والباسوورد")}>أضف</button>
        </details>
      </div>

      <ShareDoctorCard owner={me.user.role === "owner"} />
      </>}

      <FontSizeCard />
      <ThemeCard />

      <InstallCard />

      <button className="card help-link" onClick={onHelp}>🎬 طريقة الاستخدام <small>فيديو يشرح التطبيق</small></button>

      <div className="card">
        <h3>🔑 حسابي</h3>
        <p className="muted">{me.user.display_name} · <span dir="ltr">@{me.user.username}</span></p>
        <details>
          <summary>غيّر الباسوورد</summary>
          <label>الباسوورد الحالي</label>
          <input type="password" dir="ltr" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
          <label>الباسوورد الجديد</label>
          <input type="password" dir="ltr" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="primary" onClick={() => act(async () => { await api.changePassword(pw.old, pw.next); setPw({ old: "", next: "" }); }, "تغيّر الباسوورد ✓")}>احفظ</button>
        </details>
        <button className="link danger-link" onClick={onLogout}>تسجيل خروج</button>
      </div>

      {me.user.is_admin && (
        <div className="card admin">
          <h3>🛡️ لوحة المدير: حسابات العائلات</h3>
          {families.map((f) => (
            <div key={f.id} className="row-between member">
              <span><b>{f.name}</b> <small className="muted" dir="ltr">@{f.owner}</small></span>
              <small className="muted">{f.users} أفراد · {f.patients} مرضى</small>
            </div>
          ))}
          <details>
            <summary>+ حساب عائلة جديد</summary>
            <label>اسم العائلة</label>
            <input value={fam.name} onChange={(e) => setFam({ ...fam, name: e.target.value })} placeholder="مثلاً عائلة الشمري" />
            <label>اسم صاحب الحساب</label>
            <input value={fam.display_name} onChange={(e) => setFam({ ...fam, display_name: e.target.value })} />
            <label>يوزر صاحب الحساب</label>
            <input dir="ltr" autoCapitalize="none" value={fam.username} onChange={(e) => setFam({ ...fam, username: e.target.value })} />
            <label>الباسوورد</label>
            <input dir="ltr" value={fam.password} onChange={(e) => setFam({ ...fam, password: e.target.value })} />
            <button className="primary" onClick={() => act(async () => { const r = await api.adminAddFamily(fam); setFam({ name: "", username: "", password: "", display_name: "" }); loadFamilies(); return r; }, "انفتح حساب العائلة ✓ — عطهم اليوزر والباسوورد")}>افتح الحساب</button>
          </details>
          <DoctorsAdmin />
          <EduImagesCard />
        </div>
      )}
    </section>
  );
}

// مشاركة العائلة مع الدكتور: يشوف تقارير المرضى ويعدّل الجرعات
function ShareDoctorCard({ owner }) {
  const [list, setList] = useState([]);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api.familyDoctors().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const run = async (fn, ok) => { setMsg(""); try { await fn(); setMsg(ok); load(); } catch (e) { setMsg("⚠️ " + e.message); } };
  if (!owner && !list.length) return null;
  return (
    <div className="card">
      <h3>🩺 الدكتور المتابع</h3>
      <p className="muted">الدكتور اللي تشاركونه يشوف تقارير السكر والضغط والتزام الأدوية، ويقدر يعدّل جرعات الإنسولين، ويوصلكم إشعار إذا عدّلها.</p>
      {list.map((d) => (
        <div key={d.id} className="row-between member">
          <span>{d.display_name} <small className="muted" dir="ltr">@{d.username}</small></span>
          {owner && <button className="link small danger-link" onClick={() => confirm(`توقف المشاركة مع ${d.display_name}؟`) && run(() => api.unshareDoctor(d.id), "وقفت المشاركة")}>إيقاف</button>}
        </div>
      ))}
      {owner && (
        <details>
          <summary>+ شارك مع دكتور</summary>
          <label>يوزر الدكتور (يعطيك إياه الدكتور)</label>
          <input dir="ltr" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button className="primary" disabled={!username} onClick={() => run(async () => { await api.shareWithDoctor(username); setUsername(""); }, "تمت المشاركة ✓")}>شارك</button>
        </details>
      )}
      {msg && <div className={msg.startsWith("⚠️") ? "alert danger" : "alert info"}>{msg}</div>}
    </div>
  );
}

// المدير: حسابات الدكاترة
function DoctorsAdmin() {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ display_name: "", clinic: "", username: "", password: "" });
  const [msg, setMsg] = useState("");
  const load = () => api.adminDoctors().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add() {
    setMsg("");
    try { await api.adminAddDoctor(f); setF({ display_name: "", clinic: "", username: "", password: "" }); setMsg("انفتح حساب الدكتور ✓ — عطه اليوزر والباسوورد"); load(); } catch (e) { setMsg("⚠️ " + e.message); }
  }
  return (
    <details className="edu-gen">
      <summary>🩺 حسابات الدكاترة ({list.length})</summary>
      {list.map((d) => (
        <div key={d.id} className="row-between member">
          <span><b>{d.display_name}</b> <small className="muted" dir="ltr">@{d.username}</small></span>
          <small className="muted">{d.families} عائلة</small>
        </div>
      ))}
      <label>اسم الدكتور</label>
      <input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="مثلاً د. سارة" />
      <label>اسم العيادة (اختياري)</label>
      <input value={f.clinic} onChange={(e) => setF({ ...f, clinic: e.target.value })} />
      <label>اليوزر</label>
      <input dir="ltr" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      <label>الباسوورد (6 وفوق)</label>
      <input dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      {msg && <div className={msg.startsWith("⚠️") ? "alert danger" : "alert info"}>{msg}</div>}
      <button className="primary" onClick={add}>افتح حساب دكتور</button>
    </details>
  );
}

// صور الفيديوهات التعليمية: تنولد وحدة وحدة بذكاء الموقع (للمدير بس)
function EduImagesCard() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api.eduImages().then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (all) => {
    setBusy(true); setErr("");
    const todo = list.filter((x) => all || !x.done);
    for (const x of todo) {
      try {
        await api.eduImage(x.id);
        setList((l) => l.map((y) => (y.id === x.id ? { ...y, done: true } : y)));
      } catch (e) { setErr(`${x.id}: ${e.message}`); }
    }
    setBusy(false);
  };
  if (!list) return err ? <div className="alert danger">{err}</div> : null;
  const done = list.filter((x) => x.done).length;
  return (
    <details className="edu-gen">
      <summary>🎬 صور الفيديوهات التعليمية ({done}/{list.length})</summary>
      <p className="muted">صور واقعية بذكاء الموقع للفيديوهات التعليمية. ما تطلع لأحد في الموقع. خل الصفحة مفتوحة لين يخلص.</p>
      <div className="edu-bar"><span style={{ width: `${(done / list.length) * 100}%` }} /></div>
      {err && <div className="alert danger">{err}</div>}
      <button className="primary" disabled={busy || done === list.length} onClick={() => run(false)}>
        {busy ? `جاري التوليد… ${done}/${list.length}` : done === list.length ? "كل الصور جاهزة ✓" : "ولّد الصور"}
      </button>
    </details>
  );
}

// ألوان التطبيق: تنحفظ في هالجوال بس
function ThemeCard() {
  const [theme, set] = useState(getTheme);
  return (
    <div className="card">
      <h3>🎨 ألوان التطبيق</h3>
      <div className="theme-pick">
        {Object.entries(THEMES).map(([k, t]) => (
          <button key={k} className={theme === k ? "on" : ""} onClick={() => { setTheme(k); set(k); }}>
            <span style={{ background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})` }} />{t.name}
          </button>
        ))}
      </div>
      <p className="hint">تتغير في هالجوال بس، وكل واحد في العائلة يختار اللي يعجبه.</p>
    </div>
  );
}

// حجم الخط: ينحفظ في هالجوال بس
function FontSizeCard() {
  const [size, setSize] = useState(getFontSize);
  return (
    <div className="card">
      <h3>🔠 حجم الخط</h3>
      <div className="segmented">
        {SIZES.map(([k, label]) => (
          <button key={k} className={size === k ? "on" : ""} onClick={() => { setFontSize(k); setSize(k); }}>{label}</button>
        ))}
      </div>
      <p className="hint">يكبّر كل الموقع في هالجوال بس، ومناسب لكبار السن. في الكمبيوتر استخدم تكبير المتصفح (Ctrl و +).</p>
    </div>
  );
}
