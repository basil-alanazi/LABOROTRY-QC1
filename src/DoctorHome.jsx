import { dateLocale } from "./i18n";
import { useEffect, useState } from "react";
import { api } from "./api";
import { CONDITIONS } from "./PatientForm";
import { fmtDate, fmtTime } from "./dose";

const SLOT = { breakfast: "فطور", lunch: "غداء", dinner: "عشاء", bedtime: "تريسيبا" };
const NEW = { name: "", sex: "", birth_year: "", conditions: ["diabetes2"], uses_insulin: false, humalog_breakfast: "", humalog_lunch: "", humalog_dinner: "", tresiba_dose: "", username: "", password: "" };
const short = (d) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "numeric" });
// لون النسبة: أخضر 80 وفوق، برتقالي 60–79، أحمر أقل
const tone = (n) => (n === null || n === undefined ? "" : n >= 80 ? "ok" : n >= 60 ? "warn" : "bad");

// الرئيسية للدكتور: مرضاه، الأحوج للمتابعة أول
export default function DoctorHome({ me, open, go, onPatientsChanged }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(NEW);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => api.doctorPatients().then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const set = (k, v) => setForm({ ...form, [k]: v });
  const toggle = (c) => set("conditions", form.conditions.includes(c) ? form.conditions.filter((x) => x !== c) : [...form.conditions, c]);

  async function add() {
    setBusy(true); setMessage("");
    try {
      const r = await api.doctorAddPatient({ ...form, birth_year: form.birth_year ? Number(form.birth_year) : null });
      setForm(NEW);
      setMessage(`انفتح الحساب ✓ — عطه اليوزر ${r.username} والباسوورد`);
      await onPatientsChanged();
      load();
    } catch (e) { setMessage(e.message); }
    setBusy(false);
  }

  const shown = (list || []).filter((p) => !q || p.name.includes(q) || p.family_name?.includes(q) || p.owner?.includes(q));
  const attention = (list || []).filter((p) => p.summary.flags.some((f) => f.level === "danger")).length;

  return (
    <section className="doc-home">
      <header className="dh-head">
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <div>
          <h1>أهلًا {me.user.display_name}</h1>
          <span>{me.family.name} · {list ? `${list.length} مريض` : "..."}{attention ? ` · ${attention} يحتاجون انتباه` : ""}</span>
        </div>
        <button className="secondary dh-acc" onClick={() => go("account")}>الحساب</button>
      </header>

      {error && <div className="alert danger">{error}</div>}
      {list && list.length > 3 && <input className="dh-search" placeholder="ابحث باسم المريض" value={q} onChange={(e) => setQ(e.target.value)} />}
      {list && !list.length && <div className="card"><p>ما عندك مرضى للحين. افتح حساب لأول مريض من تحت، أو خل العائلة تشاركك من صفحة العائلة عندهم.</p></div>}

      {shown.map((p) => {
        const s = p.summary;
        const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
        const conds = JSON.parse(p.conditions || "[]").map((c) => CONDITIONS[c] || c);
        return (
          <article key={p.id} className="card dh-card">
            <div className="dh-top">
              <div>
                <h3>{p.name}{age ? <small> · {age} سنة</small> : null}</h3>
                <small className="muted">{conds.slice(0, 3).join("، ")}{conds.length > 3 ? "…" : ""} · <span dir="ltr">@{p.owner}</span></small>
              </div>
              <small className="muted dh-last">{s.last ? `آخر تسجيل ${fmtDate(new Date(s.last))} ${fmtTime(s.last)}` : "ما سجّل"}</small>
            </div>

            {s.flags.length > 0 && <div className="dh-flags">{s.flags.map((f) => <span key={f.text} className={`dh-flag ${f.level}`}>{f.text}</span>)}</div>}

            <div className="dh-stats">
              <div><b>{s.glucoseAvg ?? "—"}</b><span>متوسط السكر</span></div>
              <div><b className={tone(s.inTarget)}>{s.inTarget ?? "—"}{s.inTarget !== null ? "%" : ""}</b><span>ضمن الهدف</span></div>
              <div><b>{s.fastingAvg ?? "—"}</b><span>متوسط الصيام</span></div>
              <div><b>{s.bpAvg ?? "—"}</b><span>الضغط</span></div>
              {s.insulin && <div><b className={tone(s.insulin.pct)}>{s.insulin.pct}%</b><span>الإنسولين {s.insulin.taken}/{s.insulin.expected}</span></div>}
              {s.meds && <div><b className={tone(s.meds.pct)}>{s.meds.pct}%</b><span>الأدوية {s.meds.taken}/{s.meds.expected}</span></div>}
            </div>

            {p.uses_insulin ? (
              <p className="dh-plan">الجرعات: Humalog {p.plan.humalog_breakfast} / {p.plan.humalog_lunch} / {p.plan.humalog_dinner} · Tresiba {p.plan.tresiba_dose}</p>
            ) : null}
            {s.insulin?.missed.length > 0 && (
              <p className="dh-missed">جرعات ما انسجلت: {s.insulin.missed.map((m) => `${short(m.day)} ${SLOT[m.slot]}`).join("، ")}</p>
            )}

            {s.familyNote && <p className="dh-note-snip">💬 {s.familyNote.text.slice(0, 140)}</p>}

            <div className="dh-actions">
              <button className="primary" onClick={() => open(p.id, "record")}>📊 التقارير</button>
              <button className="secondary" onClick={() => open(p.id, "doctor")}>💬 ملاحظات</button>
              {p.uses_insulin ? <button className="secondary" onClick={() => open(p.id, "settings")}>💉 الجرعات</button> : null}
              <button className="secondary" onClick={() => open(p.id, "patient")}>الملف</button>
            </div>
          </article>
        );
      })}
      <p className="muted dh-note">الأرقام لآخر {list?.[0]?.summary.days ?? 14} يوم. الالتزام = الجرعات المسجّلة من المطلوب في الأيام الكاملة.</p>

      <details className="card dh-new">
        <summary>+ حساب مريض جديد</summary>
        <label>اسم المريض</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        <label>الجنس</label>
        <div className="chips">
          <button className={form.sex === "male" ? "chip on" : "chip"} onClick={() => set("sex", "male")}>ذكر</button>
          <button className={form.sex === "female" ? "chip on" : "chip"} onClick={() => set("sex", "female")}>أنثى</button>
        </div>
        <label>سنة الميلاد</label>
        <input type="number" inputMode="numeric" dir="ltr" value={form.birth_year} onChange={(e) => set("birth_year", e.target.value)} placeholder="مثلاً 1958" />
        <label>الأمراض</label>
        <div className="chips">
          {["diabetes2", "diabetes1", "prediabetes", "hypertension", "cholesterol", "kidney"].map((c) => (
            <button key={c} className={form.conditions.includes(c) ? "chip on" : "chip"} onClick={() => toggle(c)}>{CONDITIONS[c]}</button>
          ))}
        </div>
        <button className={`toggle-row ${form.uses_insulin ? "on" : ""}`} onClick={() => set("uses_insulin", !form.uses_insulin)}>
          <span>ياخذ إنسولين؟</span><b>{form.uses_insulin ? "إي" : "لا"}</b>
        </button>
        {form.uses_insulin && (
          <div className="dh-grid">
            <div><label>Humalog الفطور</label><input type="number" inputMode="decimal" value={form.humalog_breakfast} onChange={(e) => set("humalog_breakfast", e.target.value)} /></div>
            <div><label>Humalog الغداء</label><input type="number" inputMode="decimal" value={form.humalog_lunch} onChange={(e) => set("humalog_lunch", e.target.value)} /></div>
            <div><label>Humalog العشاء</label><input type="number" inputMode="decimal" value={form.humalog_dinner} onChange={(e) => set("humalog_dinner", e.target.value)} /></div>
            <div><label>Tresiba الليل</label><input type="number" inputMode="decimal" value={form.tresiba_dose} onChange={(e) => set("tresiba_dose", e.target.value)} /></div>
          </div>
        )}
        <label>يوزر المريض (يدخل فيه هو وأهله)</label>
        <input dir="ltr" autoCapitalize="none" value={form.username} onChange={(e) => set("username", e.target.value)} />
        <label>الباسوورد</label>
        <input dir="ltr" value={form.password} onChange={(e) => set("password", e.target.value)} />
        {message && <div className={message.includes("✓") ? "alert info" : "alert danger"}>{message}</div>}
        <button className="primary" disabled={busy || !form.name || !form.sex || !form.username || !form.password} onClick={add}>{busy ? "جاري الفتح..." : "افتح الحساب"}</button>
      </details>
    </section>
  );
}
