import { useEffect, useState } from "react";
import { api } from "./api";
import PatientForm from "./PatientForm";

// العائلة: المرضى، وأفراد العائلة، والحساب، ولوحة المدير
export default function Account({ me, currentPatient, onPatientsChanged, onSelectPatient, onLogout }) {
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

  const canRemove = (m) => m.id !== me.user.id && m.role !== "owner" && (me.user.role === "owner" || m.created_by === me.user.id);

  return (
    <section>
      {message && <div className="alert info">{message}</div>}

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
        </div>
      )}
    </section>
  );
}
