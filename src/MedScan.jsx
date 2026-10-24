import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api } from "./api";
import { shrink } from "./photo";

// "Finascar (فيناسكار) · فيناسترايد · 5 mg"
export const medLabel = (m) => [
  m.name && m.name_ar && m.name !== m.name_ar ? `${m.name_ar} (${m.name})` : m.name_ar || m.name,
  m.generic,
  m.strength,
].filter(Boolean).join(" · ");

// زر يصوّر علبة الدواء، والذكاء يقرا الاسم والتركيز
export default function MedScan({ onResult, label = "صوّر العلبة" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      // دقة أعلى من صور الأكل عشان الكتابة الصغيرة على العلبة
      const m = await api.scanMedicine(await shrink(file, 1280));
      onResult(m);
      // الجرعة ما نخمّنها: لو مو مكتوبة يكتبها هو
      if (!m.strength) setNote("الجرعة مو واضحة في الصورة: اكتبها بنفسك، أو صوّر جهة ثانية من العلبة أو الشريط.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link med-scan" disabled={busy} onClick={() => ref.current.click()}>
        <Camera size={16} /> {busy ? "جاري قراءة العلبة..." : label}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      {error && <p className="level-note veryhigh">{error}</p>}
      {note && <p className="hint">⚠️ {note}</p>}
    </>
  );
}
