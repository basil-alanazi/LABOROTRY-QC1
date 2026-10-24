import { useEffect, useState } from "react";
import { api } from "./api";
import { CONTEXTS, SLOTS, fmtSlot } from "./dose";
import { getDevice, isIos, isStandalone, pushSupported, subscribe, unsubscribe } from "./push";

const MODES = {
  all: "كل شي أول بأول (قراءات وجرعات وتنبيهات وتذكيرات)",
  alerts: "المهم بس (الخطر والتذكيرات)",
};

function reminderLabel(r) {
  if (r.type === "monthly") return "📅 تذكير شهري";
  return r.type === "sugar" ? `🩸 قياس السكر ${CONTEXTS[r.context]}` : `💉 جرعة ${SLOTS[r.slot].insulin} ${SLOTS[r.slot].label}`;
}

export default function Notifications({ settings, onChanged }) {
  const [device, setDevice] = useState(getDevice());
  const [name, setName] = useState(device?.name || "");
  const [mode, setMode] = useState(device?.mode || "all");
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reminders, setReminders] = useState(null);

  useEffect(() => { api.pushDevices().then(setDevices).catch(() => {}); }, [device]);
  useEffect(() => {
    if (settings && !reminders) setReminders(JSON.parse(settings.reminders || "[]"));
  }, [settings]);

  const needsHomeScreen = isIos() && !isStandalone();

  async function act(fn, ok) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      if (ok) setMessage(ok);
    } catch (e) {
      setMessage("⚠️ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const enable = () => act(async () => setDevice(await subscribe({ name: name.trim() || "جهاز", mode })), "تفعّلت الإشعارات على هالجوال ✓ — جرّب زر الاختبار");
  const disable = () => act(async () => { await unsubscribe(); setDevice(null); }, "انطفت الإشعارات على هالجوال");
  const test = () => act(() => api.pushTest(device.id), "انرسل إشعار تجريبي، المفروض يوصلك خلال ثواني");

  const setRem = (i, patch) => setReminders(reminders.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const saveReminders = () => act(async () => {
    await api.saveSettings({ reminders });
    onChanged();
  }, "انحفظت التذكيرات ✓");

  return (
    <section>
      <div className="card">
        <h3>🔔 إشعارات هالجوال</h3>
        {!pushSupported() && !needsHomeScreen && <p className="level-note veryhigh">هالمتصفح ما يدعم الإشعارات. جرّب Chrome أو Safari.</p>}
        {needsHomeScreen ? (
          <div className="ios-steps">
            <p><b>على الآيفون لازم تضيف الموقع للشاشة الرئيسية أول:</b></p>
            <ol>
              <li>افتح الموقع في <b>Safari</b></li>
              <li>اضغط زر المشاركة <b>⬆️</b> تحت</li>
              <li>اختر <b>Add to Home Screen</b> (إضافة إلى الشاشة الرئيسية)</li>
              <li>افتح <b>ود</b> من الأيقونة الجديدة، وارجع لهالصفحة</li>
            </ol>
          </div>
        ) : device ? (
          <>
            <p className="ok-line">✓ مفعّلة باسم <b>{device.name}</b> — {MODES[device.mode]}</p>
            <div className="row-gap">
              <button className="secondary" disabled={busy} onClick={test}>إشعار تجريبي</button>
              <button className="link danger-link" disabled={busy} onClick={disable}>إيقاف</button>
            </div>
          </>
        ) : (
          <>
            <label>اسم هالجهاز</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً باسل، أو جوال الوالد" />
            <label>وش يوصلك؟</label>
            <div className="radio-list">
              {Object.entries(MODES).map(([k, v]) => (
                <button key={k} className={mode === k ? "radio on" : "radio"} onClick={() => setMode(k)}>{v}</button>
              ))}
            </div>
            <button className="primary" disabled={busy || !pushSupported()} onClick={enable}>فعّل الإشعارات</button>
          </>
        )}
        {message && <p className="hint">{message}</p>}
      </div>

      <div className="card">
        <h3>وش يوصل؟</h3>
        <ul>
          <li><b>تنبيه فوري</b> إذا سكر تحت {settings?.low_threshold ?? 70} أو فوق 300، أو ضغط خطير، أو أكسجين تحت 90%.</li>
          <li><b>أول بأول:</b> أي قراءة أو جرعة أو وجبة يسجلها أحد من العائلة. ما يوصلك اللي تسجله أنت.</li>
          <li><b>تذكير بالقياس والجرعات</b> حسب الأوقات تحت. وإذا انسجل القياس أو الجرعة قبل وقتها، ما يذكّر.</li>
          <li>إذا الجرعة ما انسجلت بعد 45 دقيقة من وقتها، يوصل تنبيه ثاني.</li>
          <li>تذكير بالأدوية في مواعيدها، وبالمواعيد الطبية (الليلة اللي قبل، وقبل الموعد بساعتين).</li>
        </ul>
      </div>

      {reminders && (
        <div className="card">
          <h3>⏰ أوقات التذكير</h3>
          {reminders.map((r, i) => (
            <div key={i} className={`rem-row ${r.off ? "off" : ""}`}>
              <input type="time" value={r.time} onChange={(e) => setRem(i, { time: e.target.value })} />
              <span>{reminderLabel(r)}</span>
              <button className={`toggle ${r.off ? "" : "on"}`} onClick={() => setRem(i, { off: !r.off })} aria-label="تشغيل/إيقاف">
                {r.off ? "موقف" : "شغال"}
              </button>
              {r.type === "monthly" && (
                <div className="rem-monthly">
                  <label>يوم كم في الشهر؟</label>
                  <input type="number" min="1" max="28" inputMode="numeric" value={r.day} onChange={(e) => setRem(i, { day: Number(e.target.value) })} />
                  <label>وش التذكير؟</label>
                  <input value={r.text} maxLength={120} onChange={(e) => setRem(i, { text: e.target.value })} placeholder="مثلاً: احجزوا موعد إبرة العين" />
                  <button className="link danger-link" onClick={() => setReminders(reminders.filter((_, j) => j !== i))}>حذف التذكير</button>
                </div>
              )}
            </div>
          ))}
          <button className="secondary" onClick={() => setReminders([...reminders, { type: "monthly", day: 7, time: "10:00", text: "" }])}>+ تذكير شهري</button>
          <p className="hint">الأوقات بتوقيت السعودية. {reminders.filter((r) => !r.off).map((r) => fmtSlot(r.time)).join(" · ")}</p>
          <button className="primary" disabled={busy} onClick={saveReminders}>احفظ الأوقات</button>
        </div>
      )}

      {devices.length > 0 && (
        <div className="card">
          <h3>الأجهزة المفعّلة ({devices.length})</h3>
          {devices.map((d) => (
            <div key={d.id} className="row-between">
              <span>{d.name || "جهاز"} {device?.id === d.id && <small className="muted">(هذا الجهاز)</small>}</span>
              <small className="muted">{d.mode === "all" ? "كل شي" : "المهم بس"}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
