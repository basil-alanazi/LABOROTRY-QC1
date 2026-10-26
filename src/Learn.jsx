import { useEffect, useState } from "react";
import { api } from "./api";

// أقسام الفيديوهات التعليمية
const TOPICS = [
  ["insulin", "💉", "إبرة الإنسولين"],
  ["sugar", "🩸", "قياس السكر"],
  ["bp", "🩺", "قياس الضغط"],
  ["temp", "🌡️", "قياس الحرارة"],
  ["eye", "👁️", "قطرة العين"],
  ["meds", "💊", "الأدوية"],
];

// فيديوهات يوتيوب من جهات موثوقة: الصورة أول، والفيديو يشتغل لما تضغط
export default function Learn({ me }) {
  const [list, setList] = useState(null);
  const [topic, setTopic] = useState("insulin");
  const [playing, setPlaying] = useState(null);
  const [form, setForm] = useState({ url: "", title: "" });
  const [msg, setMsg] = useState("");
  const admin = me.user.is_admin;

  useEffect(() => { api.eduVideos().then(setList).catch((e) => setMsg("⚠️ " + e.message)); }, []);
  const shown = (list || []).filter((v) => v.topic === topic);

  async function add() {
    setMsg("");
    try { setList(await api.addEduVideo({ ...form, topic })); setForm({ url: "", title: "" }); setMsg("انضاف ✓"); } catch (e) { setMsg("⚠️ " + e.message); }
  }

  return (
    <section>
      <div className="learn-tabs">
        {TOPICS.map(([k, icon, name]) => {
          const n = (list || []).filter((v) => v.topic === k).length;
          return (
            <button key={k} className={topic === k ? "on" : ""} onClick={() => { setTopic(k); setPlaying(null); }}>
              <span>{icon}</span>{name}{n ? <small>{n}</small> : null}
            </button>
          );
        })}
      </div>

      {list && !shown.length && <p className="empty">ما فيه فيديوهات في هالقسم للحين.</p>}
      {shown.map((v) => (
        <article key={v.id} className="card learn-video">
          {playing === v.id ? (
            <iframe src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1`} title={v.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          ) : (
            <button className="learn-thumb" onClick={() => setPlaying(v.id)} aria-label={`شغّل ${v.title}`}>
              <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
              <span className="learn-play">▶</span>
            </button>
          )}
          <div className="row-between">
            <b>{v.title}</b>
            {admin && <button className="link small danger-link" onClick={() => confirm("تشيل الفيديو؟") && api.removeEduVideo(v).then(setList)}>شيل</button>}
          </div>
        </article>
      ))}
      <p className="hint">الفيديوهات من يوتيوب للتوعية. اتبع دايمًا تعليمات طبيبك أو ممرض السكري.</p>

      {admin && (
        <details className="card">
          <summary>+ أضف فيديو لقسم {TOPICS.find((t) => t[0] === topic)[2]}</summary>
          <label>رابط يوتيوب</label>
          <input dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://youtu.be/..." />
          <label>العنوان</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثلاً طريقة استخدام قلم الإنسولين" />
          <button className="primary" disabled={!form.url} onClick={add}>أضف</button>
        </details>
      )}
      {msg && <div className={msg.startsWith("⚠️") ? "alert danger" : "alert info"}>{msg}</div>}
    </section>
  );
}
