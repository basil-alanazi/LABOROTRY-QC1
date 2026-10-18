import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  CONTEXTS, SLOTS, TITRATION_DAYS, dayKey, fmtDate, fmtShortDate, fmtTime,
  glucoseLevel, recentLow, riyadhHour, tresibaSuggestion,
} from "./dose";

function guessContext() {
  const h = riyadhHour();
  if (h >= 4 && h < 10) return "fasting";
  if (h >= 10 && h < 13) return "after_breakfast";
  if (h >= 15 && h < 19) return "after_lunch";
  if (h >= 21 || h < 4) return "after_dinner";
  return "random";
}

export default function Today({ settings, readings, doses, changes, onReading, onDose, onTresibaChanged }) {
  const [now, setNow] = useState(new Date());
  const [glucose, setGlucose] = useState("");
  const [context, setContext] = useState(guessContext());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // اليوم يبدأ 4 الفجر، عشان جرعة Tresiba بعد 12 الليل تنحسب لليلة نفسها
  const doseDay = (d) => dayKey(new Date(d).getTime() - 4 * 36e5);
  const today = doseDay(now);
  const todayDoses = doses.filter((d) => doseDay(d.created_at) === today);
  const low = recentLow(readings, settings);
  const tresiba = tresibaSuggestion(readings, settings, changes[0]);

  async function saveReading() {
    const g = Number(glucose);
    if (!g || g < 10 || g > 700) return setMessage("اكتب قراءة سكر صحيحة");
    setBusy(true);
    const { error } = await supabase.from("readings").insert({ glucose: g, context, note: note.trim() || null });
    setBusy(false);
    if (error) return setMessage("ما انحفظت: " + error.message);
    setMessage(`انحفظت القراءة ✓ — ${fmtTime(new Date())}`);
    setGlucose("");
    setNote("");
    onReading();
  }

  async function takeDose(slot) {
    const s = SLOTS[slot];
    const units = Number(settings[s.key]);
    if (low) return setMessage(`آخر قراءة ${low.glucose} (هبوط) — لا تاخذ إنسولين قبل ما يرتفع السكر.`);
    if (!confirm(`تأكيد: أخذ ${units} وحدة ${s.insulin} ${s.label}؟`)) return;
    setBusy(true);
    const { error } = await supabase.from("doses").insert({ insulin: s.insulin, slot, units });
    setBusy(false);
    if (error) return setMessage("ما انحفظت: " + error.message);
    setMessage(`انسجلت الجرعة ✓ — ${fmtTime(new Date())}`);
    onDose();
  }

  async function undoDose(d) {
    if (!confirm(`تلغي تسجيل جرعة ${d.units} وحدة (${fmtTime(d.created_at)})؟`)) return;
    await supabase.from("doses").delete().eq("id", d.id);
    onDose();
  }

  async function applyTresiba() {
    if (!confirm(`تعتمد جرعة Tresiba الجديدة ${tresiba.next} وحدة بدل ${tresiba.current}؟`)) return;
    setBusy(true);
    const { error } = await supabase.from("tresiba_changes").insert({
      old_dose: tresiba.current, new_dose: tresiba.next, reason: tresiba.message,
    });
    if (!error) await supabase.from("settings").update({ tresiba_dose: tresiba.next, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) return setMessage("ما انحفظت: " + error.message);
    setMessage(`صارت جرعة Tresiba ${tresiba.next} وحدة ✓`);
    onTresibaChanged();
  }

  const level = glucose ? glucoseLevel(Number(glucose), context, settings) : null;

  return (
    <section>
      <div className="card clock">
        <div className="time">{fmtTime(now)}</div>
        <div className="date">{fmtDate(now)}</div>
      </div>

      {low && (
        <div className="card result danger">
          <p className="warn-line">⚠️ آخر قراءة {low.glucose} — هبوط. لا تاخذ إنسولين.</p>
          <p>خذ 15 جرام سكر سريع (نص كوب عصير أو 3 حبات تمر)، وأعد القياس بعد 15 دقيقة.</p>
        </div>
      )}

      {/* تسجيل قراءة */}
      <div className="card">
        <h3>سجّل قراءة سكر</h3>
        <input
          className="big" type="number" inputMode="numeric" value={glucose}
          onChange={(e) => { setGlucose(e.target.value); setMessage(""); }} placeholder="مثلاً 140"
        />
        <label>وقت القراءة</label>
        <div className="chips">
          {Object.entries(CONTEXTS).map(([k, v]) => (
            <button key={k} className={context === k ? "chip on" : "chip"} onClick={() => setContext(k)}>{v}</button>
          ))}
        </div>
        {level && level !== "ok" && (
          <p className={`level-note ${level}`}>
            {level === "low" && "هبوط — لا تاخذ إنسولين، وعالج الهبوط."}
            {level === "below" && "أقل من الهدف — انتبه."}
            {level === "high" && "أعلى من الهدف."}
            {level === "veryhigh" && "مرتفع جدًا — إذا تكرر كلّم الدكتور."}
          </p>
        )}
        {glucose && (
          <>
            <label>ملاحظة (اختياري)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: أكل كبسة" />
            <button className="primary" disabled={busy} onClick={saveReading}>احفظ القراءة</button>
            <p className="hint">التاريخ والساعة يتسجلون تلقائيًا لحظة الحفظ.</p>
          </>
        )}
      </div>

      {message && <div className="alert info">{message}</div>}

      {/* جرعات اليوم */}
      {settings && (
        <div className="card">
          <h3>جرعات اليوم</h3>
          <div className="doses">
            {Object.entries(SLOTS).map(([slot, s]) => {
              const taken = todayDoses.find((d) => d.slot === slot);
              return (
                <div key={slot} className={`dose-row ${taken ? "taken" : ""}`}>
                  <div>
                    <strong>{s.label}</strong>
                    <span>{s.insulin} — {settings[s.key]} وحدة</span>
                  </div>
                  {taken ? (
                    <button className="done" onClick={() => undoDose(taken)} title="إلغاء">✓ {fmtTime(taken.created_at)}</button>
                  ) : (
                    <button className="take" disabled={busy || !!low} onClick={() => takeDose(slot)}>أخذها</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* تعديل Tresiba */}
      {tresiba && (
        <div className={`card result ${tresiba.status === "increase" ? "warn" : tresiba.status === "low" ? "danger" : "ok"}`}>
          <h3>تعديل Tresiba — الجرعة الحالية {tresiba.current} وحدة</h3>
          <p className="hint">حسب قراءات الصيام لـ{TITRATION_DAYS} أيام{changes[0] ? ` بعد آخر تعديل (${fmtShortDate(changes[0].created_at)})` : ""}.</p>
          <div className="fasting-days">
            {Array.from({ length: TITRATION_DAYS }, (_, i) => tresiba.days[i]).map((r, i) => (
              <div key={i} className="fday">
                {r ? (
                  <>
                    <span className={`badge ${glucoseLevel(r.glucose, "fasting", settings)}`}>{r.glucose}</span>
                    <small>{fmtShortDate(r.created_at)}</small>
                  </>
                ) : (
                  <><span className="badge empty">—</span><small>يوم {i + 1}</small></>
                )}
              </div>
            ))}
          </div>
          {tresiba.status === "waiting" && <p>باقي {tresiba.remaining} {tresiba.remaining === 1 ? "يوم" : "أيام"} من قراءات الصيام.</p>}
          {tresiba.status === "keep" && <p>✓ {tresiba.message}</p>}
          {tresiba.status === "low" && <p className="warn-line">⚠️ {tresiba.message}</p>}
          {tresiba.status === "increase" && (
            <>
              <p className="warn-line">{tresiba.message} → زيد الجرعة +{tresiba.step}</p>
              <div className="dose big-dose"><span>الجرعة الجديدة</span><strong>{tresiba.next} وحدة</strong></div>
              <button className="primary" disabled={busy} onClick={applyTresiba}>اعتمد الجرعة الجديدة</button>
            </>
          )}
        </div>
      )}

      <p className="disclaimer">الموقع يطبّق خطة الدكتور المحفوظة في الإعدادات فقط، وما يغني عن مراجعته.</p>
    </section>
  );
}
