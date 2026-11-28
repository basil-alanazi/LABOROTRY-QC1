import { useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useLanguage } from "../../lib/i18n.jsx";
import { fmtDate } from "../../lib/dates";

const GOOD = 90; // ≥90% susceptible: suitable for empirical use
const POOR = 70; // <70%: not reliable empirically
const SPECIMENS = ["all", "urine", "blood", "pus", "urethral", "sputum", "csf", "stool", "other"];
const SPEC_LABEL = { all: "All specimens", urine: "Urine", blood: "Blood", pus: "Pus / wound", urethral: "Urethral", sputum: "Sputum / respiratory", csf: "CSF", stool: "Stool", other: "Other" };
const LOC_LABEL = { unknown: "Not specified", inpatient: "Inpatient", icu: "ICU", outpatient: "Outpatient", er: "ER" };

function count(list, key) {
  const m = {};
  for (const x of list) {
    const k = key(x);
    if (k) m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

// A report built on demand from whatever isolates are saved, for the chosen
// period and specimen: counts, MDRO list (for HESN+ entry), and for each
// organism the antibiotics that are reliable (≥90% S) or not (<70% S).
export default function AntibiogramReport({ frameRef }) {
  const { t } = useLanguage();
  const printRef = useRef(null);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [specimen, setSpecimen] = useState("all");
  const [stamp, setStamp] = useState(0); // bump to re-read the module's data

  const report = useMemo(() => {
    const win = frameRef.current?.contentWindow;
    const E = win?.AntibiogramEngine;
    const all = win?.AntibiogramApp?.getIsolates?.();
    if (!E || !all) return null;
    const inPeriod = all.filter((x) => (!from || x.collectedAt >= from) && (!to || x.collectedAt <= to) && (specimen === "all" || x.specimen === specimen));
    const res = E.compute(inPeriod, { from: null, to: null, location: "all", specimen: "all", firstIsolateOnly: true, excludeContaminants: true });
    const included = res.included;
    const groups = res.groups;
    const mdroOf = (x) => {
      const tags = new Set(E.classifyMdro ? E.classifyMdro(x.organism, x.results) : []);
      for (const m of String(x.mdro || "").match(/\b(ESBL|CRE|VRE|MRSA)\b/gi) || []) tags.add(m.toUpperCase());
      return [...tags];
    };
    const mdroList = included.map((x) => ({ x, tags: mdroOf(x) })).filter((r) => r.tags.length).sort((a, b) => String(a.x.collectedAt).localeCompare(String(b.x.collectedAt)));
    const rows = [];
    for (const g of groups) {
      for (const r of g.rows) {
        const cells = Object.entries(r.cells).map(([name, c]) => ({ name, pct: c.pctS, n: c.tested }));
        rows.push({
          group: g.title,
          organism: r.organism,
          n: r.n,
          lowN: r.lowN,
          good: cells.filter((c) => c.pct >= GOOD).sort((a, b) => b.pct - a.pct),
          poor: cells.filter((c) => c.pct < POOR).sort((a, b) => a.pct - b.pct),
        });
      }
    }
    rows.sort((a, b) => b.n - a.n);
    return {
      total: inPeriod.length,
      included: included.length,
      excluded: inPeriod.length - included.length,
      bySpecimen: count(inPeriod, (x) => x.specimen),
      byMonth: count(inPeriod, (x) => (x.collectedAt || "").slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])),
      byLocation: count(inPeriod, (x) => x.location || "unknown"),
      mdroCounts: count(mdroList.flatMap((r) => r.tags.map((tag) => ({ tag }))), (o) => o.tag),
      mdroList,
      rows,
      minIsolates: res.minIsolates,
      unknownLocation: inPeriod.filter((x) => !x.location || x.location === "unknown").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, specimen, stamp]);

  function printReport() {
    const w = window.open("", "_blank");
    if (!w || !printRef.current) return;
    const dir = document.documentElement.dir || "ltr";
    w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>Antibiogram report</title>
      <style>body{font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#222;padding:24px;font-size:13px}h2{font-size:18px;margin:0 0 4px}h3{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
      table{border-collapse:collapse;width:100%;margin:4px 0}td,th{border:1px solid #ddd;padding:4px 6px;text-align:start;vertical-align:top}th{background:#f4f1ec}
      .muted{color:#777}.chip{display:inline-block;border-radius:10px;padding:1px 7px;margin:1px;font-size:12px}.g{background:#dcf2e2;color:#14532d}.p{background:#fbdcdc;color:#8a1c1c}.w{color:#b45309}
      .no-print{display:none!important}.cards{display:flex;gap:8px;flex-wrap:wrap}.card{border:1px solid #ddd;border-radius:8px;padding:6px 10px}</style></head>
      <body>${printRef.current.innerHTML}<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  if (!report) return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>;

  const chip = (c, cls) => (
    <span key={c.name} className={`chip ${cls} m-0.5 inline-block rounded-full px-2 py-0.5 text-xs ${cls === "g" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {c.name} {c.pct}%<span className="opacity-60"> ({c.n})</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("From")}</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("To")}</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Specimen")}</span>
          <select className="input" value={specimen} onChange={(e) => setSpecimen(e.target.value)}>
            {SPECIMENS.map((s) => (
              <option key={s} value={s}>{t(SPEC_LABEL[s])}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setStamp((s) => s + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">{t("Refresh")}</button>
        <button onClick={printReport} className="ms-auto flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          <Printer className="h-4 w-4" />
          {t("Print report")}
        </button>
      </div>

      <div ref={printRef} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t("Antibiogram report")} — Rabia Hospital</h2>
          <p className="muted text-sm text-slate-500">
            {t("Period")}: {fmtDate(from) || "—"} → {fmtDate(to) || "—"} · {t(SPEC_LABEL[specimen])} · {t("Generated")} {fmtDate(new Date().toISOString().slice(0, 10))}
          </p>
        </div>

        <div className="cards flex flex-wrap gap-2 text-sm">
          <div className="card rounded-lg border border-slate-200 px-3 py-2">{t("Isolates in period")}: <b>{report.total}</b></div>
          <div className="card rounded-lg border border-slate-200 px-3 py-2">{t("Included (first isolate, no contaminants)")}: <b>{report.included}</b></div>
          <div className="card rounded-lg border border-slate-200 px-3 py-2">{t("Excluded")}: <b>{report.excluded}</b></div>
          <div className="card rounded-lg border border-slate-200 px-3 py-2">{t("MDRO isolates")}: <b>{report.mdroList.length}</b></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["By specimen", report.bySpecimen, (k) => t(SPEC_LABEL[k] || k)],
            ["By month", report.byMonth, (k) => k],
            ["By location", report.byLocation, (k) => t(LOC_LABEL[k] || k)],
          ].map(([title, list, label]) => (
            <div key={title}>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">{t(title)}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {list.map(([k, n]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1">{label(k)}</td>
                      <td className="py-1 text-end font-medium">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-800">{t("Organisms — reliable and unreliable antibiotics")}</h3>
          <p className="muted mb-2 text-xs text-slate-500">
            {t("Green: ≥90% susceptible (suitable for empirical use). Red: <70% susceptible (avoid empirically). Number in brackets = isolates tested.")}
          </p>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-start font-medium">{t("Organism")}</th>
                <th className="px-2 py-1.5 text-start font-medium">N</th>
                <th className="px-2 py-1.5 text-start font-medium">{t("Reliable (≥90%)")}</th>
                <th className="px-2 py-1.5 text-start font-medium">{t("Avoid (<70%)")}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.organism} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5">
                    <i>{r.organism}</i>
                    {r.lowN && <div className="w text-[11px] text-amber-700">⚠ N&lt;{report.minIsolates} — {t("interpret with caution")}</div>}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{r.n}</td>
                  <td className="px-2 py-1.5">{r.good.length ? r.good.map((c) => chip(c, "g")) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-2 py-1.5">{r.poor.length ? r.poor.map((c) => chip(c, "p")) : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.rows.length === 0 && <p className="p-4 text-center text-sm text-slate-400">{t("No isolates in this period.")}</p>}
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-800">{t("MDRO isolates (for HESN+ entry)")}</h3>
          <p className="mb-2 text-sm">
            {report.mdroCounts.length ? report.mdroCounts.map(([k, n]) => <span key={k} className="chip p me-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">{k}: {n}</span>) : <span className="text-slate-400">{t("None")}</span>}
          </p>
          {report.mdroList.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-start font-medium">{t("Date")}</th>
                  <th className="px-2 py-1.5 text-start font-medium">MRN</th>
                  <th className="px-2 py-1.5 text-start font-medium">{t("Specimen")}</th>
                  <th className="px-2 py-1.5 text-start font-medium">{t("Location")}</th>
                  <th className="px-2 py-1.5 text-start font-medium">{t("Organism")}</th>
                  <th className="px-2 py-1.5 text-start font-medium">MDRO</th>
                </tr>
              </thead>
              <tbody>
                {report.mdroList.map(({ x, tags }) => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="px-2 py-1">{fmtDate(x.collectedAt)}</td>
                    <td className="px-2 py-1 font-mono text-xs">{x.mrn}</td>
                    <td className="px-2 py-1">{t(SPEC_LABEL[x.specimen] || x.specimen)}</td>
                    <td className="px-2 py-1">{t(LOC_LABEL[x.location] || x.location || "Not specified")}</td>
                    <td className="px-2 py-1"><i>{x.organism}</i></td>
                    <td className="px-2 py-1 font-medium text-red-700">{tags.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-800">{t("Notes")}</h3>
          <ul className="list-disc ps-5 text-sm text-slate-600">
            <li>{t("Calculated per CLSI M39: first isolate per patient per organism; screening specimens and possible contaminants excluded; intermediate counts as non-susceptible.")}</li>
            {report.rows.some((r) => r.lowN) && <li>{t("Organisms with fewer than 30 isolates are not statistically reliable — percentages are preliminary.")}</li>}
            {report.unknownLocation > 0 && (
              <li>
                {report.unknownLocation} {t("isolates have no location (inpatient / ICU / outpatient / ER), so the report cannot separate hospital-onset from community-onset.")}
              </li>
            )}
            <li>{t("The antibiogram guides empirical therapy only; it does not replace the patient's own culture result.")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
