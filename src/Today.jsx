import { useEffect, useState } from "react";
import { api } from "./api";
import {
  CONTEXTS, SLOTS, TITRATION_DAYS, dayKey, fmtDate, fmtShortDate, fmtTime,
  glucoseLevel, nowRiyadhLocal, recentLow, riyadhHour, riyadhLocalToIso, tresibaSuggestion,
} from "./dose";

const HUMALOG_GAP_HOURS = 3;

// اختيار وقت التسجيل: الحين، أو وقت ثاني إذا انسجل متأخر
function WhenPicker({ value, onChange, label }) {
  return (
    <div className="when">
      <label>{label}</label>
      <div className="chips">
        <button className={!value ? "chip on" : "chip"} onClick={() => onChange("")}>الحين</button>
        <button className={value ? "chip on" : "chip"} onClick={() => onChange(value || nowRiyadhLocal())}>وقت ثاني</button>
      </div>
      {value && <input type="datetime-local" value={value} max={nowRiyadhLocal()} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function guessContext() {
  const h = riyadhHour();
  if (h >= 4 && h < 10) return "fasting";
  if (h >= 10 && h < 13) return "after_breakfast";
  if (h >= 15 && h < 19) return "after_lunch";
  if (h >= 21 || h < 4) return "after_dinner";
  return "random";
}

export default function Today({ settings, readings, doses, changes, onChanged }) {
  const [now, setNow] = useState(new Date());
  const [glucose, setGlucose] = useState("");
  const [context, setContext] = useState(guessContext());
  const [note, setNote] = useState("");
  const [readingAt, setReadingAt] = useState(""); // فاضي = الحين
  const [lastMeal, setLastMeal] = useState("");
  const [doseAt, setDoseAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [custom, setCustom] = useState(null); // الجرعة اللي يكتب لها كمية مختلفة
  const [customUnits, setCustomUnits] = useState("");

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

  async function run(action, ok) {
    setBusy(true);
    try {
      await action();
      if (ok) setMessage(ok);
      onChanged();
      return true;
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveReading() {
    const g = Number(glucose);
    if (!g || g < 10 || g > 700) return setMessage("اكتب قراءة سكر صحيحة");
    const at = riyadhLocalToIso(readingAt);
    const saved = await run(
      () => api.addReading({ glucose: g, context, note: note.trim() || null, at, last_meal_at: context === "random" ? lastMeal || null : null }),
      `انحفظت القراءة ✓ — ${fmtTime(at || new Date())}`,
    );
    if (saved) {
      setGlucose("");
      setNote("");
      setReadingAt("");
      setLastMeal("");
    }
  }

  async function takeDose(slot, units = null) {
    const s = SLOTS[slot];
    if (low) return setMessage(`آخر قراءة ${low.glucose} (هبوط) — لا تاخذ إنسولين قبل ما يرتفع السكر.`);
    const amount = units ?? settings[s.key];
    if (!(amount >= 0.5 && amount <= 100)) return setMessage("اكتب كمية صحيحة");
    const differs = units !== null && amount !== Number(settings[s.key]);
    const at = riyadhLocalToIso(doseAt);
    const when = new Date(at || Date.now());
    let question = `تأكيد: أخذ ${amount} وحدة ${s.insulin} ${s.label}؟` + (differs ? `\n(الخطة ${settings[s.key]} وحدة)` : "");
    if (at) question += `\nالوقت: ${fmtTime(at)}`;
    // تحذير إذا فيه جرعة Humalog ثانية قريبة
    if (s.insulin === "Humalog") {
      const near = doses.find((d) => d.insulin === "Humalog" && Math.abs(new Date(d.created_at) - when) < HUMALOG_GAP_HOURS * 36e5);
      if (near) question = `⚠️ فيه جرعة Humalog ${near.units} وحدة انسجلت ${fmtTime(near.created_at)}، يعني قبل أقل من ${HUMALOG_GAP_HOURS} ساعات.\nإذا كانت انسجلت متأخر، اضغط إلغاء واختر "وقت ثاني" وحط وقتها الصحيح.\n\n` + question;
    }
    if (!confirm(question)) return;
    const saved = await run(() => api.addDose(slot, units, at), `انسجلت الجرعة ✓ — ${fmtTime(when)}`);
    if (saved) { setCustom(null); setCustomUnits(""); setDoseAt(""); }
  }

  async function undoDose(d) {
    if (!confirm(`تلغي تسجيل جرعة ${d.units} وحدة (${fmtTime(d.created_at)})؟`)) return;
    await run(() => api.deleteDose(d.id));
  }

  async function applyTresiba() {
    if (!confirm(`تعتمد جرعة Tresiba الجديدة ${tresiba.next} وحدة بدل ${tresiba.current}؟`)) return;
    await run(() => api.saveSettings({ tresiba_dose: tresiba.next, reason: tresiba.message }), `صارت جرعة Tresiba ${tresiba.next} وحدة ✓`);
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
        {context === "random" && (
          <>
            <label>آخر وجبة أكلها الساعة (اختياري)</label>
            <input type="time" value={lastMeal} onChange={(e) => setLastMeal(e.target.value)} />
          </>
        )}
        {glucose && (
          <>
            <WhenPicker label="وقت القياس" value={readingAt} onChange={setReadingAt} />
            <label>ملاحظة (اختياري)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: أكل كبسة" />
            <button className="primary" disabled={busy} onClick={saveReading}>احفظ القراءة</button>
            <p className="hint">إذا قسته الحين خلّه "الحين". وإذا تسجله متأخر اختر "وقت ثاني" وحط الوقت الصحيح.</p>
          </>
        )}
      </div>

      {message && <div className="alert info">{message}</div>}

      {/* جرعات اليوم */}
      {settings && (
        <div className="card">
          <h3>جرعات اليوم</h3>
          <WhenPicker label="وقت الجرعة" value={doseAt} onChange={setDoseAt} />
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
                    <button className="done" onClick={() => undoDose(taken)} title="إلغاء">
                      ✓ {Number(taken.units) !== Number(settings[s.key]) && `${taken.units} وحدة · `}{fmtTime(taken.created_at)}
                    </button>
                  ) : custom === slot ? null : (
                    <div className="dose-actions">
                      <button className="take" disabled={busy || !!low} onClick={() => takeDose(slot)}>أخذها</button>
                      <button className="link small" disabled={busy || !!low} onClick={() => { setCustom(slot); setCustomUnits(""); }}>كمية ثانية</button>
                    </div>
                  )}
                  {!taken && custom === slot && (
                    <div className="custom-dose">
                      <input type="number" inputMode="decimal" step="0.5" autoFocus value={customUnits}
                        onChange={(e) => setCustomUnits(e.target.value)} placeholder="كم وحدة؟" />
                      <button className="take" disabled={busy || !customUnits} onClick={() => takeDose(slot, Number(customUnits))}>حفظ</button>
                      <button className="link small" onClick={() => setCustom(null)}>إلغاء</button>
                    </div>
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
