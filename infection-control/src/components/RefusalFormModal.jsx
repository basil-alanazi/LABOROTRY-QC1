import { useEffect, useRef, useState } from "react";
import { Eraser, Printer, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import rabiaLogo from "../assets/rabia-logo.jpg";

const REFUSAL_BUCKET = "employee-health-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);

function signatureUrl(path) {
  if (!path) return null;
  return supabase.storage.from(REFUSAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

// One combined, signed refusal record per visit — the admin ticks every
// item the employee is refusing right now (PPD and/or specific vaccines),
// the employee signs once on screen, and it all saves as a single
// printable document instead of one form per refused item.
export default function RefusalFormModal({ emp, vaccineItems, onClose, flash, onSaved }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const ITEMS = [
    { key: "ppd_1", label: "PPD Test — 1st attempt" },
    { key: "ppd_2", label: "PPD Test — 2nd attempt" },
    ...vaccineItems.map((v) => ({ key: `vaccine:${v.id}`, label: v.name })),
  ];

  async function loadHistory() {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("employee_refusal_forms")
      .select("*")
      .eq("employee_id", emp.id)
      .eq("deleted", false)
      .order("created_at", { ascending: false });
    setHistory(data ?? []);
    setLoadingHistory(false);
  }
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp.id]);

  function toggleItem(key) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function handlePointerDown(e) {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSignature(true);
  }
  function handlePointerUp() {
    drawingRef.current = false;
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSave() {
    const chosenKeys = Object.keys(selected).filter((k) => selected[k]);
    if (chosenKeys.length === 0) {
      flash({ type: "error", text: "Select at least one refused item" });
      return;
    }
    if (!hasSignature) {
      flash({ type: "error", text: "Employee signature is required" });
      return;
    }
    setSaving(true);
    try {
      const items = chosenKeys.map((k) => ITEMS.find((i) => i.key === k)?.label).filter(Boolean);
      const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));
      const path = `refusal-signatures/${emp.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(REFUSAL_BUCKET).upload(path, blob);
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("employee_refusal_forms")
        .insert({
          employee_id: emp.id,
          header: { name: emp.name, employee_no: emp.employee_no, department: emp.department },
          items,
          reason,
          signature_path: path,
          created_by: session?.username,
        })
        .select()
        .single();
      if (error) throw error;

      if (selected.ppd_1 || selected.ppd_2) {
        await onSaved?.ppdRefused?.(emp);
      }
      for (const key of chosenKeys) {
        if (key.startsWith("vaccine:")) {
          const itemTypeId = key.slice("vaccine:".length);
          await supabase
            .from("employee_vaccine_requests")
            .upsert({ employee_id: emp.id, item_type_id: itemTypeId, requested_by: session?.username, refused: true }, { onConflict: "employee_id,item_type_id" });
        }
      }

      flash({ type: "success", text: "Refusal recorded" });
      setSelected({});
      setReason("");
      clearSignature();
      await loadHistory();
      setPrinting(Array.isArray(data) ? data[0] : data);
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHistory(row) {
    if (!confirm(`Delete this refusal record?`)) return;
    await supabase.from("employee_refusal_forms").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", row.id);
    loadHistory();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #refusal-print-area, #refusal-print-area * { visibility: visible; }
          #refusal-print-area { position: fixed; inset: 0; margin: auto; }
        }
      `}</style>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t("Refusal Form")}</h3>
            <p className="text-xs text-slate-500">
              {emp.name} · {emp.employee_no}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!loadingHistory && history.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-bold text-slate-600">{t("Past refusals")}</p>
              <div className="flex flex-col gap-1">
                {history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
                    <span className="text-slate-600">
                      {row.created_at?.slice(0, 10)} — {(row.items ?? []).join(", ")}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setPrinting(row)} className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-teal-600">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDeleteHistory(row)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mb-2 text-xs font-bold text-slate-600">{t("Report a new refusal")}</p>
          <p className="mb-2 text-xs text-slate-500">{t("Select everything the employee is refusing right now")}</p>
          <div className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2">
            {ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={!!selected[item.key]} onChange={() => toggleItem(item.key)} />
                {t(item.label)}
              </label>
            ))}
          </div>

          <label className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
            {t("Reason (optional)")}
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t("Employee signature")}</p>
              <button type="button" onClick={clearSignature} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
                <Eraser className="h-3.5 w-3.5" />
                {t("Clear")}
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={560}
              height={160}
              className="w-full touch-none rounded-lg border border-dashed border-slate-300 bg-slate-50"
              style={{ cursor: "crosshair" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
            {t("Cancel")}
          </button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
            {saving ? t("Saving...") : t("Save & Print")}
          </button>
        </div>
      </div>

      {printing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={() => setPrinting(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 print:hidden">
              <h3 className="text-base font-semibold text-slate-800">{t("Refusal Form")}</h3>
              <button onClick={() => setPrinting(null)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                ✕
              </button>
            </div>
            <div id="refusal-print-area" className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col items-center gap-1 border-b border-slate-200 pb-3 text-center">
                <img src={rabiaLogo} alt="Rabia Hospital" className="h-14 w-14 object-contain" />
                <p className="text-sm font-bold text-slate-800">{t("Rabia Hospital — Infection Control Department")}</p>
                <p className="text-xs text-slate-500">{t("Refusal of Investigation/Vaccination")}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">{t("Name")}</dt>
                  <dd className="font-medium text-slate-800">{printing.header?.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">{t("Employee #")}</dt>
                  <dd className="font-medium text-slate-800">{printing.header?.employee_no || "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-slate-400">{t("Department")}</dt>
                  <dd className="font-medium text-slate-800">{printing.header?.department}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1 text-xs font-bold text-slate-600">{t("Refused")}</p>
                <ul className="rounded-lg border border-slate-200 p-2">
                  {(printing.items ?? []).map((label, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      • {label}
                    </li>
                  ))}
                </ul>
              </div>
              {printing.reason && (
                <div>
                  <p className="text-xs font-bold text-slate-600">{t("Reason")}</p>
                  <p className="text-sm text-slate-700">{printing.reason}</p>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-bold text-slate-600">{t("Employee signature")}</p>
                {printing.signature_path && <img src={signatureUrl(printing.signature_path)} alt="" className="h-20 rounded border border-slate-200 bg-white" />}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
                <span>
                  {t("Date")}: {printing.created_at?.slice(0, 10) || todayStr()}
                </span>
                <span>{t("Signed: Infection Control Department")}</span>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 print:hidden"
            >
              <Printer className="h-4 w-4" />
              {t("Print")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
