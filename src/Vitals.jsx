import { api } from "./api";
import BpForm from "./BpForm";
import { bpLevel, fmtShortDate, fmtTime, spo2Level } from "./dose";

export default function Vitals({ settings, bp, onChanged }) {
  async function remove(r) {
    if (!confirm(`تحذف القراءة (${fmtShortDate(r.created_at)} ${fmtTime(r.created_at)})؟`)) return;
    await api.deleteBp(r.id).catch((e) => alert("ما انحذفت: " + e.message));
    onChanged();
  }

  return (
    <section>
      <BpForm settings={settings} onChanged={onChanged} />

      {bp.length > 0 ? (
        <div className="card">
          <h3>آخر القراءات</h3>
          <table>
            <thead><tr><th>التاريخ</th><th>الضغط</th><th>النبض</th><th>الأكسجين</th><th></th></tr></thead>
            <tbody>
              {bp.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td>{fmtShortDate(r.created_at)}<div className="muted">{fmtTime(r.created_at)}</div></td>
                  <td>{r.systolic ? <span className={`badge ${bpLevel(r, settings)}`}>{r.systolic}/{r.diastolic}</span> : "—"}</td>
                  <td>{r.pulse ?? "—"}</td>
                  <td>{r.spo2 ? <span className={`badge ${spo2Level(r.spo2)}`}>{r.spo2}%</span> : "—"}</td>
                  <td><button className="x" onClick={() => remove(r)} aria-label="حذف">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">ما فيه قراءات للحين.</p>
      )}
    </section>
  );
}
