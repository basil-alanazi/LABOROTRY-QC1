import { useEffect, useRef, useState } from "react";
import { Eraser, Printer, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import rabiaLogo from "../assets/rabia-logo.jpg";
import PrintPortal from "./PrintPortal";

const REFUSAL_BUCKET = "employee-health-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);

function signatureUrl(path) {
  if (!path) return null;
  return supabase.storage.from(REFUSAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Builds the natural-language "...the opportunity to undergo X" / "I
// voluntarily refuse X" phrase from whatever mix of PPD attempts and
// vaccines was refused in this one report, following the wording of the
// hospital's official PPD refusal letter.
function refusalPhrase(items) {
  const ppd = items.some((l) => l.startsWith("PPD Test"));
  const vaccines = items.filter((l) => !l.startsWith("PPD Test"));
  const parts = [];
  if (ppd) parts.push("a Purified Protein Derivative (PPD) skin test for tuberculosis screening");
  if (vaccines.length === 1) parts.push(`the ${vaccines[0]} vaccine`);
  else if (vaccines.length > 1) parts.push(`the ${vaccines.slice(0, -1).join(", ")} and ${vaccines[vaccines.length - 1]} vaccines`);
  if (parts.length <= 1) return parts[0] || "the above";
  return parts.join(" and ");
}

// The official letter's exact title is PPD-specific; a report that also
// (or only) covers a vaccine refusal uses the generic title instead.
function refusalTitle(items) {
  return items.length > 0 && items.every((l) => l.startsWith("PPD Test"))
    ? "PPD (TUBERCULOSIS SKIN TEST) REFUSAL OF CONSENT AND ACKNOWLEDGMENT"
    : "REFUSAL OF CONSENT AND ACKNOWLEDGMENT";
}

// One combined, signed refusal record per visit — the admin ticks every
// item the employee is refusing right now (PPD and/or specific vaccines),
// the employee signs once on screen, and it all saves as a single
// printable document instead of one form per refused item.
export default function RefusalFormModal({ emp, vaccineItems, onClose, flash, onSaved, preselect }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selected, setSelected] = useState(() => Object.fromEntries((preselect || []).map((k) => [k, true])));
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
    e.preventDefault();
    drawingRef.current = true;
    // Without this, the stroke stops the instant the pointer drifts past
    // the canvas edge (easy to do on a short signature box) because the
    // browser then stops sending pointermove to this element entirely —
    // capturing the pointer keeps every move/up event routed here until
    // the finger/mouse actually lifts, wherever on screen that happens.
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
        await onSaved?.ppdRefused?.(emp, chosenKeys);
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
          const refusalItems = printing.items ?? [];
          const refusalDate = printing.created_at?.slice(0, 10) || todayStr();
          const phrase = refusalPhrase(refusalItems);
          const hasPpd = refusalItems.some((l) => l.startsWith("PPD Test"));
          const printBody = (
            <>
              <div className="flex flex-col items-center gap-1 border-b border-slate-300 pb-3 text-center">
                <img src={rabiaLogo} alt="Rabia Hospital" className="h-20 w-auto object-contain" />
                <p className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-800">{refusalTitle(refusalItems)}</p>
              </div>

              <div className="text-sm">
                <p className="mb-1 font-semibold text-slate-700">Employee Information:</p>
                <ul className="flex flex-col gap-0.5 ps-4 text-slate-700">
                  <li>
                    <span className="text-slate-500">Employee Full Name: </span>
                    {printing.header?.name}
                  </li>
                  <li>
                    <span className="text-slate-500">Employee ID Number: </span>
                    {printing.header?.employee_no || "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Department: </span>
                    {printing.header?.department}
                  </li>
                  <li>
                    <span className="text-slate-500">Date: </span>
                    {refusalDate}
                  </li>
                </ul>
              </div>

              <div className="text-sm leading-relaxed text-slate-700">
                <p className="mb-1 font-semibold text-slate-700">Statement of Refusal:</p>
                <p>
                  I, <strong>{printing.header?.name}</strong>, hereby acknowledge that on {refusalDate}, I was offered and provided with the opportunity to undergo {phrase}.
                </p>
                <p className="mt-2">
                  This{hasPpd ? " test" : ""} is a requirement of Rabia hospital policy and is conducted to help ensure a safe working environment for all employees
                  {hasPpd ? " and to identify potential TB infection for early treatment." : "."}
                </p>
                <p className="mt-2">
                  Despite understanding this purpose, I voluntarily refuse {phrase} at this time. I understand that my refusal may have consequences, which have been
                  explained to me and I confirm that I have had the opportunity to ask questions regarding this and the implications of my refusal.
                </p>
                {printing.reason && (
                  <p className="mt-2">
                    <span className="font-semibold">Reason: </span>
                    {printing.reason}
                  </p>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-4 border-t border-slate-300 pt-3">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Employee Signature</p>
                  {printing.signature_path && <img src={signatureUrl(printing.signature_path)} alt="" className="h-16" />}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Date</p>
                  <p className="text-sm text-slate-700">{refusalDate}</p>
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
                  <h3 className="text-base font-semibold text-slate-800">{t("Refusal Form")}</h3>
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
