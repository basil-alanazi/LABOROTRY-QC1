import { useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n.jsx";

const SPECIMENS = ["urine", "blood", "pus", "urethral", "sputum", "csf", "stool", "other"];
const LOCATIONS = ["unknown", "inpatient", "icu", "outpatient", "er"];
const LABEL = {
  urine: "Urine", blood: "Blood", pus: "Pus / wound", urethral: "Urethral", sputum: "Sputum / respiratory", csf: "CSF", stool: "Stool", other: "Other",
  unknown: "Not specified", inpatient: "Inpatient", icu: "ICU", outpatient: "Outpatient", er: "ER",
};

// "Import lab reports": pick one or more culture PDFs, review what was read,
// then add the checked isolates to the antibiogram in one save.
export default function LabReportImport({ frameRef }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(null); // [{key, file, isolate, notes, include, duplicate}]
  const [fileNotes, setFileNotes] = useState([]);

  function app() {
    return frameRef.current?.contentWindow;
  }

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    const win = app();
    if (!files.length || !win?.AntibiogramEngine) return;
    setBusy(true);
    const { parseLabReport } = await import("../../lib/labReportParser");
    const existing = win.AntibiogramApp.getIsolates();
    const seen = new Set(existing.map((x) => [x.mrn, x.orderId, x.organism].join("|")));
    const out = [];
    const notes = [];
    for (const f of files) {
      try {
        const res = await parseLabReport(f, win.AntibiogramEngine);
        res.notes.forEach((n) => notes.push(`${f.name}: ${n}`));
        res.isolates.forEach((r, i) => {
          const k = [r.isolate.mrn, r.isolate.orderId, r.isolate.organism].join("|");
          const duplicate = seen.has(k);
          seen.add(k);
          out.push({
            key: `${f.name}-${i}`,
            file: f.name,
            isolate: r.isolate,
            notes: r.notes,
            duplicate,
            include: !duplicate && !!r.isolate.mrn && !!r.isolate.collectedAt && Object.keys(r.isolate.results).length > 0,
          });
        });
      } catch (err) {
        notes.push(`${f.name}: ${t("Could not read this file")} (${err.message})`);
      }
    }
    setRows(out);
    setFileNotes(notes);
    setBusy(false);
  }

  function update(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, isolate: { ...r.isolate, ...(patch.isolate || {}) } } : r)));
  }

  function addSelected() {
    const win = app();
    const chosen = rows.filter((r) => r.include);
    if (!win || !chosen.length) return;
    const stamp = Date.now().toString(36);
    const added = chosen.map((r, i) => ({ ...r.isolate, id: `I${stamp}${i.toString(36)}` }));
    win.AntibiogramApp.setIsolates([...win.AntibiogramApp.getIsolates(), ...added]);
    setRows(null);
    setFileNotes([]);
  }

  const count = rows ? rows.filter((r) => r.include).length : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
      >
        {busy ? t("Reading...") : t("Import lab reports (PDF)")}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={onFiles} />

      {rows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-800">{t("Review lab reports before adding")}</h2>
              <button type="button" aria-label="Close" onClick={() => setRows(null)} className="rounded px-2 text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <div className="overflow-auto px-4 py-3">
              {fileNotes.length > 0 && (
                <ul className="mb-3 list-disc rounded-lg bg-amber-50 px-6 py-2 text-xs text-amber-800">
                  {fileNotes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">{t("No isolates found in these files.")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="p-2">{t("Add")}</th>
                      <th className="p-2">MRN</th>
                      <th className="p-2">{t("Collected")}</th>
                      <th className="p-2">{t("Specimen")}</th>
                      <th className="p-2">{t("Location")}</th>
                      <th className="p-2">{t("Organism")}</th>
                      <th className="p-2">{t("Results")}</th>
                      <th className="p-2">{t("Notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const res = r.isolate.results;
                      const n = (v) => Object.values(res).filter((x) => x === v).length;
                      return (
                        <tr key={r.key} className={`border-b border-slate-100 align-top ${r.include ? "" : "opacity-60"}`}>
                          <td className="p-2"><input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} /></td>
                          <td className="p-2 font-mono text-xs">{r.isolate.mrn || "—"}<div className="text-[11px] text-slate-400">{r.isolate.orderId}</div></td>
                          <td className="p-2 whitespace-nowrap">
                            <input type="date" value={r.isolate.collectedAt} onChange={(e) => update(r.key, { isolate: { collectedAt: e.target.value } })} className="rounded border border-slate-200 px-1 py-0.5 text-xs" />
                          </td>
                          <td className="p-2">
                            <select value={r.isolate.specimen} onChange={(e) => update(r.key, { isolate: { specimen: e.target.value } })} className="rounded border border-slate-200 px-1 py-0.5 text-xs">
                              {SPECIMENS.map((s) => <option key={s} value={s}>{t(LABEL[s])}</option>)}
                            </select>
                          </td>
                          <td className="p-2">
                            <select value={r.isolate.location} onChange={(e) => update(r.key, { isolate: { location: e.target.value } })} className="rounded border border-slate-200 px-1 py-0.5 text-xs">
                              {LOCATIONS.map((s) => <option key={s} value={s}>{t(LABEL[s])}</option>)}
                            </select>
                          </td>
                          <td className="p-2">
                            <i>{r.isolate.organism}</i>
                            {r.isolate.mdro && <span className="ml-1 rounded bg-red-100 px-1 text-[11px] text-red-700">{r.isolate.mdro}</span>}
                            <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                              <input type="checkbox" checked={r.isolate.contaminant} onChange={(e) => update(r.key, { isolate: { contaminant: e.target.checked } })} />
                              {t("Possible contaminant")}
                            </label>
                          </td>
                          <td className="p-2 whitespace-nowrap text-xs">
                            <span className="text-emerald-700">S {n("S")}</span> · <span className="text-amber-700">I {n("I")}</span> · <span className="text-red-700">R {n("R")}</span>
                            <div className="max-w-[16rem] whitespace-normal text-[11px] text-slate-400">
                              {Object.entries(res).map(([k, v]) => `${k} ${v}`).join(", ")}
                            </div>
                          </td>
                          <td className="p-2 text-[11px] text-amber-700">
                            {r.duplicate && <div className="text-red-700">{t("Already in the antibiogram")}</div>}
                            {r.notes.map((x) => <div key={x}>{x}</div>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button type="button" onClick={() => setRows(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">{t("Cancel")}</button>
              <button type="button" onClick={addSelected} disabled={!count} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {t("Add selected")} ({count})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
