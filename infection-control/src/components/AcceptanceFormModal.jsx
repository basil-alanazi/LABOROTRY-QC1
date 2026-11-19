import { useEffect, useRef, useState } from "react";
import { Eraser, Printer, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import rabiaLogo from "../assets/rabia-logo.jpg";
import PrintPortal from "./PrintPortal";

const ACCEPTANCE_BUCKET = "employee-health-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);

function signatureUrl(path) {
  if (!path) return null;
  return supabase.storage.from(ACCEPTANCE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// One signed acknowledgment per dose/test given — opened automatically the
// moment staff types a Batch/Lot No for a vaccine dose or a PPD test, so
// there's always a signed record tying the employee to that specific
// batch, mirroring the Refusal Form's print layout but for the opposite
// case (consent given, not refused).
export default function AcceptanceFormModal({ emp, item, batchNo: initialBatchNo, dateGiven: initialDateGiven, onClose, flash, onSaved }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [batchNo, setBatchNo] = useState(initialBatchNo || "");
  const [dateGiven, setDateGiven] = useState(initialDateGiven || todayStr());
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("employee_acceptance_forms")
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

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function handlePointerDown(e) {
    e.preventDefault();
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = canvasPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSignature(true);
  }
  function handlePointerUp(e) {
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSave() {
    if (!hasSignature) {
      flash({ type: "error", text: "Employee signature is required" });
      return;
    }
    setSaving(true);
    try {
      const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));
      const path = `acceptance-signatures/${emp.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(ACCEPTANCE_BUCKET).upload(path, blob);
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("employee_acceptance_forms")
        .insert({
          employee_id: emp.id,
          header: { name: emp.name, employee_no: emp.employee_no, department: emp.department },
          item,
          batch_no: batchNo,
          date_given: dateGiven,
          signature_path: path,
          created_by: session?.username,
        })
        .select()
        .single();
      if (error) throw error;

      flash({ type: "success", text: "Acceptance recorded" });
      clearSignature();
      await loadHistory();
      await onSaved?.();
      setPrinting(Array.isArray(data) ? data[0] : data);
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHistory(row) {
    if (!confirm(`Delete this acceptance record?`)) return;
    await supabase.from("employee_acceptance_forms").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", row.id);
    loadHistory();
  }

  const isPpd = item.startsWith("PPD Test");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t("Acceptance Form")}</h3>
            <p className="text-xs text-slate-500">
              {emp.name} · {emp.employee_no} · {t(item)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!loadingHistory && history.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-bold text-slate-600">{t("Past acceptances")}</p>
              <div className="flex flex-col gap-1">
                {history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
                    <span className="text-slate-600">
                      {row.date_given || row.created_at?.slice(0, 10)} — {t(row.item)}{row.batch_no ? ` (${row.batch_no})` : ""}
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

          <p className="mb-2 text-xs font-bold text-slate-600">{t("New acceptance")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Batch/Lot No")}
              <input className="input" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date")}
              <input type="date" className="input" value={dateGiven} onChange={(e) => setDateGiven(e.target.value)} />
            </label>
          </div>

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
              onPointerCancel={handlePointerUp}
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

      {printing &&
        (() => {
          const p = printing;
          const date = p.date_given || p.created_at?.slice(0, 10) || todayStr();
          const printBody = (
            <>
              <div className="flex flex-col items-center gap-1 border-b border-slate-300 pb-3 text-center">
                <img src={rabiaLogo} alt="Rabia Hospital" className="h-20 w-auto object-contain" />
                <p className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-800">
                  {isPpd ? "PPD (TUBERCULOSIS SKIN TEST) CONSENT AND ACKNOWLEDGMENT" : "VACCINATION CONSENT AND ACKNOWLEDGMENT"}
                </p>
              </div>

              <div className="text-sm">
                <p className="mb-1 font-semibold text-slate-700">Employee Information:</p>
                <ul className="flex flex-col gap-0.5 ps-4 text-slate-700">
                  <li>
                    <span className="text-slate-500">Employee Full Name: </span>
                    {p.header?.name}
                  </li>
                  <li>
                    <span className="text-slate-500">Employee ID Number: </span>
                    {p.header?.employee_no || "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Department: </span>
                    {p.header?.department}
                  </li>
                  <li>
                    <span className="text-slate-500">Date: </span>
                    {date}
                  </li>
                </ul>
              </div>

              <div className="text-sm leading-relaxed text-slate-700">
                <p className="mb-1 font-semibold text-slate-700">Statement of Consent:</p>
                <p>
                  I, <strong>{p.header?.name}</strong>, hereby acknowledge that on {date}, I received{isPpd ? " and underwent" : ""} {p.item}
                  {p.batch_no ? (
                    <>
                      {" "}
                      (Batch/Lot No: <strong>{p.batch_no}</strong>)
                    </>
                  ) : (
                    ""
                  )}
                  .
                </p>
                <p className="mt-2">
                  This{isPpd ? " test" : ""} was administered as part of Rabia hospital's employee health program
                  {isPpd ? ", to screen for potential TB infection." : "."}
                </p>
                <p className="mt-2">
                  I voluntarily consent to {isPpd ? "this test" : "receiving this vaccine"} and confirm that I have had the opportunity to ask questions regarding it.
                </p>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-4 border-t border-slate-300 pt-3">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Employee Signature</p>
                  {p.signature_path && <img src={signatureUrl(p.signature_path)} alt="" className="h-16" />}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Date</p>
                  <p className="text-sm text-slate-700">{date}</p>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-300 pt-2 text-center">
                <p className="text-xs text-slate-500">This letter format approved by</p>
                <div className="mt-3 flex justify-between px-4 text-xs font-semibold text-slate-600">
                  <span>IPC HEAD</span>
                  <span>Hospital Director</span>
                </div>
              </div>
            </>
          );
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={() => setPrinting(null)}>
              <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-800">{t("Acceptance Form")}</h3>
                  <button onClick={() => setPrinting(null)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-3">{printBody}</div>
                <button
                  onClick={() => window.print()}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  {t("Print")}
                </button>
                <PrintPortal>
                  <div className="flex flex-col gap-3 p-10">{printBody}</div>
                </PrintPortal>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
