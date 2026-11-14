import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Circle, Pen, Type, Undo2 } from "lucide-react";
import { useLanguage } from "../lib/i18n.jsx";

const COLORS = ["#ef4444", "#eab308", "#2563eb", "#16a34a"];
const MAX_DIM = 1400;

// Lets a doctor draw or write directly on an attached image (blood test
// result, NSI form, etc.) — pen, text, arrow, circle — and save the
// annotated version as a brand-new attachment alongside the original
// (the original is never modified or replaced).
export default function AttachmentMarkupModal({ imageUrl, fileName, onCancel, onSave }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const draggingRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = canvasRef.current;
      canvas.width = w;
      canvas.height = h;
      imgRef.current = img;
      setReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function redraw(liveStroke) {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    for (const s of [...strokes, liveStroke].filter(Boolean)) drawStroke(ctx, s);
  }

  useEffect(() => {
    if (ready) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, strokes]);

  function drawStroke(ctx, s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.type === "pen") {
      if (s.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (s.type === "circle") {
      const x = Math.min(s.x1, s.x2);
      const y = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === "arrow") {
      const { x1, y1, x2, y2 } = s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 16;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "text") {
      ctx.font = "bold 22px Tahoma, Arial, sans-serif";
      const metrics = ctx.measureText(s.text);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(s.x - 4, s.y - 22, metrics.width + 8, 28);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
  }

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e) {
    if (!ready) return;
    const p = canvasPoint(e);
    if (tool === "text") {
      const text = prompt(t("Enter the note text"));
      if (text && text.trim()) setStrokes((prev) => [...prev, { type: "text", color, x: p.x, y: p.y, text: text.trim() }]);
      return;
    }
    if (tool === "pen") {
      draggingRef.current = { type: "pen", color, points: [p] };
    } else {
      draggingRef.current = { type: tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }
    redraw(draggingRef.current);
  }

  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    const p = canvasPoint(e);
    if (draggingRef.current.type === "pen") draggingRef.current.points.push(p);
    else {
      draggingRef.current.x2 = p.x;
      draggingRef.current.y2 = p.y;
    }
    redraw(draggingRef.current);
  }

  function handlePointerUp() {
    const finished = draggingRef.current;
    if (!finished) return;
    draggingRef.current = null;
    setStrokes((prev) => [...prev, finished]);
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  async function handleSave() {
    setSaving(true);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        setSaving(false);
        return;
      }
      const base = (fileName || "attachment").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}-marked-up.png`, { type: "image/png" });
      await onSave(file);
      setSaving(false);
    }, "image/png");
  }

  const TOOLS = [
    { key: "pen", icon: Pen, label: "Pen" },
    { key: "text", icon: Type, label: "Text" },
    { key: "arrow", icon: ArrowUpRight, label: "Arrow" },
    { key: "circle", icon: Circle, label: "Circle" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{t("Markup Attachment")}</h3>
            <p className="text-xs text-slate-500">{fileName}</p>
          </div>
          <button onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5">
          {TOOLS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              title={t(label)}
              onClick={() => setTool(key)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                tool === key ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-teal-50"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <div className="mx-1 h-6 w-px bg-slate-200" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setColor(c)}
              className="h-5 w-5 rounded-full ring-2"
              style={{ backgroundColor: c, ringColor: color === c ? "#0f172a" : "transparent" }}
            />
          ))}
          <div className="flex-1" />
          <button type="button" onClick={undo} title={t("Undo")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100">
            <Undo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-900/5 p-4">
          {!ready && <p className="text-sm text-slate-400">{t("Loading...")}</p>}
          <canvas
            ref={canvasRef}
            className="max-h-[55vh] max-w-full touch-none rounded-lg shadow-sm"
            style={{ display: ready ? "block" : "none", cursor: tool === "text" ? "text" : "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {t("Cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!ready || saving}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? t("Saving...") : t("Save Markup")}
          </button>
        </div>
      </div>
    </div>
  );
}
