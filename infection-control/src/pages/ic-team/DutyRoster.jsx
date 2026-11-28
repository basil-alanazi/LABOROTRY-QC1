import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Plus, Printer, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import rabiaLogo from "../../assets/rabia-logo.jpg";

// Monthly duty schedules for the departments the IC team runs: one grid per
// department and month (staff × days, a shift code per cell), its shift-code
// legend and the signature block — printed in the same layout as the paper
// schedules. Stored in duty_rosters (dept + month unique).
export const ROSTER_DEPTS = {
  ipc: {
    label: "Infection Control",
    title: "IPC DEPARTMENT",
    suffix: "SCHEDULE",
    shifts: [
      { code: "M", label: "08:00 AM - 4:00 PM" },
      { code: "O", label: "Not on duty" },
      { code: "OFF", label: "Day off" },
    ],
    footer: [
      { label: "Prepared by", name: "BASIL ALANAZI", role: "IPC Specialist" },
      { label: "Reviewed by", name: "Mr. Abdullah Alrasheed", role: "Administrative Director" },
      { label: "", name: "DR. MOHAMED YAMANI", role: "Executive Director" },
    ],
  },
  cssd: {
    label: "CSSD (Sterilization)",
    title: "CSSD DEPARTMENT",
    suffix: "SCHEDULE",
    shifts: [
      { code: "M", label: "08:00 AM - 04:00 PM" },
      { code: "D", label: "12:00 PM - 08:00 PM" },
      { code: "E", label: "04:00 PM - 12:00 AM" },
      { code: "O", label: "Off" },
      { code: "V", label: "Vacation" },
    ],
    footer: [
      { label: "", name: "", role: "HEAD OF DEPARTMENT" },
      { label: "", name: "", role: "IPC DIRECTOR" },
    ],
  },
  laundry: {
    label: "Laundry",
    title: "LAUNDRY DEPARTMENT",
    suffix: "DUTY SCHEDULE",
    shifts: [
      { code: "M", label: "07:00 AM – 07:00 PM" },
      { code: "A", label: "08:00 AM – 08:00 PM" },
      { code: "E", label: "12:00 PM – 12:00 AM" },
      { code: "B", label: "10:00 AM – 10:00 PM" },
      { code: "C", label: "01:00 PM – 01:00 AM" },
      { code: "-", label: "Not on duty" },
    ],
    footer: [
      { label: "", name: "", role: "IPC Head" },
      { label: "", name: "", role: "Administrative Director" },
      { label: "", name: "", role: "Medical Director" },
      { label: "", name: "", role: "Executive Director" },
    ],
  },
};

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const CODE_CLS = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-orange-100 text-orange-800", "bg-lime-100 text-lime-800"];
const OFF_CODES = /^(O|OFF|-|V)$/i;
const thisMonth = () => new Date().toISOString().slice(0, 7);

function daysIn(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function isFriday(month, d) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
}
function blankRoster(dept, from) {
  const cfg = ROSTER_DEPTS[dept];
  return {
    title: from?.title || cfg.title,
    suffix: from?.suffix || cfg.suffix,
    shifts: from?.shifts || cfg.shifts,
    footer: from?.footer || cfg.footer,
    staff: (from?.staff || []).map((s) => ({ name: s.name, emp_no: s.emp_no, days: {} })),
  };
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default function DutyRoster() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [dept, setDept] = useState("ipc");
  const [month, setMonth] = useState(thisMonth());
  const [row, setRow] = useState(null); // saved duty_rosters row for dept+month
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paint, setPaint] = useState("");
  const [status, setStatus] = useState("");
  const [newStaff, setNewStaff] = useState({ name: "", emp_no: "" });
  const saveTimer = useRef(null);

  async function load() {
    setLoading(true);
    setStatus("");
    const { data: rows } = await supabase.from("duty_rosters").select("*").eq("dept", dept).eq("month", month);
    const r = (rows ?? [])[0] || null;
    setRow(r);
    setData(r ? r.data : null);
    setPaint(r?.data?.shifts?.[0]?.code || "");
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, month]);

  async function create(copyShifts) {
    const { data: prev } = await supabase.from("duty_rosters").select("*").eq("dept", dept).lt("month", month).order("month", { ascending: false }).limit(1);
    const from = (prev ?? [])[0]?.data;
    const fresh = blankRoster(dept, from);
    if (copyShifts && from) {
      // same pattern as last month, day for day
      fresh.staff = from.staff.map((s) => ({ ...s, days: { ...s.days } }));
    }
    const { data: ins, error } = await supabase.from("duty_rosters").insert({ dept, month, data: fresh, created_by: session?.username }).select().single();
    if (error) return setStatus("Could not create: " + error.message);
    setRow(ins);
    setData(ins.data);
    setPaint(fresh.shifts[0]?.code || "");
  }

  function update(next) {
    setData(next);
    setStatus(t("Saving..."));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("duty_rosters").update({ data: next, updated_by: session?.username, updated_at: new Date().toISOString() }).eq("id", row.id);
      setStatus(error ? "Could not save: " + error.message : t("Saved"));
    }, 600);
  }

  const days = useMemo(() => Array.from({ length: daysIn(month) }, (_, i) => i + 1), [month]);
  const codeCls = useMemo(() => {
    const m = {};
    (data?.shifts || []).forEach((s, i) => (m[s.code] = OFF_CODES.test(s.code) ? "bg-slate-200 text-slate-600" : CODE_CLS[i % CODE_CLS.length]));
    return m;
  }, [data]);

  function setCell(si, d) {
    const staff = data.staff.map((s, i) => {
      if (i !== si) return s;
      const daysMap = { ...s.days };
      if (!paint || daysMap[d] === paint) delete daysMap[d];
      else daysMap[d] = paint;
      return { ...s, days: daysMap };
    });
    update({ ...data, staff });
  }
  function fillRow(si) {
    if (!paint) return;
    const staff = data.staff.map((s, i) => {
      if (i !== si) return s;
      const daysMap = { ...s.days };
      days.forEach((d) => {
        if (!daysMap[d]) daysMap[d] = paint;
      });
      return { ...s, days: daysMap };
    });
    update({ ...data, staff });
  }

  function printRoster() {
    const [y, m] = month.split("-").map(Number);
    const logo = new URL(rabiaLogo, window.location.origin).href;
    const head = days.map((d) => `<th class="${isFriday(month, d) ? "fri" : ""}">${d}</th>`).join("");
    const body = data.staff
      .map(
        (s) =>
          `<tr><td class="name">${esc(s.name)}${s.emp_no ? `<br><small>${esc(s.emp_no)}</small>` : ""}</td>${days
            .map((d) => `<td class="${isFriday(month, d) ? "fri" : ""}">${esc(s.days[d] || "")}</td>`)
            .join("")}</tr>`
      )
      .join("");
    const legend = data.shifts.map((s) => `<span><b>${esc(s.code)}</b> = ${esc(s.label)}</span>`).join(" &nbsp;/&nbsp; ");
    const ids = data.staff.filter((s) => s.emp_no).map((s) => `${esc(s.name)}: ${esc(s.emp_no)}`).join(" &nbsp;/&nbsp; ");
    const sig = data.footer
      .map((f) => `<div class="sig"><div class="lbl">${f.label ? esc(f.label) + ":" : "&nbsp;"}</div><div class="line"></div><div class="nm">${esc(f.name)}</div><div class="role">${esc(f.role)}</div></div>`)
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)} ${MONTHS[m - 1]} ${y}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
.top{text-align:center}.top img{height:56px}.top h1{font-size:18px;margin:6px 0 2px}.top h2{font-size:16px;margin:0 0 10px;font-weight:bold}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #333;text-align:center;font-size:11px;padding:3px 0;height:26px}
td.name{text-align:left;padding-left:5px;font-weight:bold;width:120px;font-size:11px}th.corner{width:120px;text-align:left;padding-left:5px}
.fri{background:#d9d9d9}small{font-weight:normal}.legend{margin-top:10px;font-size:12px}.ids{margin-top:6px;font-size:12px}
.sigs{display:flex;justify-content:space-between;gap:20px;margin-top:34px}.sig{flex:1;font-size:12px}.sig .lbl{font-weight:bold;margin-bottom:22px}.sig .line{border-top:1px solid #333;margin-bottom:4px;width:85%}.sig .nm{font-weight:bold}.sig .role{color:#333}</style></head>
<body><div class="top"><img src="${logo}" alt=""><h1>${esc(data.title)}</h1><h2>${MONTHS[m - 1]} ${y} ${esc(data.suffix || "SCHEDULE")}</h2></div>
<table><thead><tr><th class="corner">Staff \\ Date</th>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="legend">${legend}</div>${ids ? `<div class="ids">${ids}</div>` : ""}<div class="sigs">${sig}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  }

  const totalBy = (s) => {
    const c = {};
    Object.values(s.days || {}).forEach((v) => {
      if (!OFF_CODES.test(v)) c.work = (c.work || 0) + 1;
    });
    return c.work || 0;
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Staff Schedule")}</h1>
        <p className="text-sm text-slate-500">{t("Monthly duty schedules for Infection Control, CSSD and Laundry — printed in the hospital's schedule layout.")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="tab-bar flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
          {Object.entries(ROSTER_DEPTS).map(([k, c]) => (
            <button key={k} onClick={() => setDept(k)} className={`rounded-md px-3 py-1.5 font-medium ${dept === k ? "bg-teal-600 text-white" : "text-slate-500"}`}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Month")}</span>
          <input type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        {data && (
          <button onClick={printRoster} className="ms-auto flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Printer className="h-4 w-4" />
            {t("Print")}
          </button>
        )}
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      {!loading && !data && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">{t("No schedule for this month yet.")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => create(false)} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              <Plus className="h-4 w-4" />
              {t("New schedule (same staff, empty days)")}
            </button>
            <button onClick={() => create(true)} className="flex items-center gap-1 rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">
              <Copy className="h-4 w-4" />
              {t("Copy last month's shifts")}
            </button>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-xs font-medium text-slate-500">{t("Click a code, then click the days:")}</span>
            {data.shifts.map((s) => (
              <button
                key={s.code}
                onClick={() => setPaint(s.code)}
                title={s.label}
                className={`min-w-[2.5rem] rounded-md px-2 py-1 text-sm font-bold ${codeCls[s.code]} ${paint === s.code ? "ring-2 ring-teal-700 ring-offset-1" : ""}`}
              >
                {s.code}
              </button>
            ))}
            <button onClick={() => setPaint("")} className={`rounded-md border border-slate-200 px-2 py-1 text-xs ${paint === "" ? "ring-2 ring-teal-700 ring-offset-1" : ""}`}>
              {t("Eraser")}
            </button>
            <span className={`ms-auto text-xs ${status.startsWith("Could") ? "text-red-600" : "text-slate-400"}`}>{status}</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-center text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[11rem] border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-start font-medium">{t("Staff")}</th>
                  {days.map((d) => (
                    <th key={d} className={`min-w-[2.1rem] border-b border-s border-slate-200 py-1.5 font-medium ${isFriday(month, d) ? "bg-slate-200 text-slate-700" : ""}`}>{d}</th>
                  ))}
                  <th className="border-b border-s border-slate-200 px-2 font-medium">{t("Days")}</th>
                  <th className="border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s, si) => (
                  <tr key={si} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 text-start">
                      <input className="input-cell w-full font-semibold" value={s.name} onChange={(e) => update({ ...data, staff: data.staff.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} />
                      <input className="input-cell mt-0.5 w-24 text-[11px]" placeholder={t("Emp. No.")} value={s.emp_no || ""} onChange={(e) => update({ ...data, staff: data.staff.map((x, i) => (i === si ? { ...x, emp_no: e.target.value } : x)) })} />
                    </td>
                    {days.map((d) => {
                      const v = s.days[d] || "";
                      return (
                        <td key={d} className={`border-s border-slate-100 p-0.5 ${isFriday(month, d) ? "bg-slate-100" : ""}`}>
                          <button onClick={() => setCell(si, d)} className={`h-8 w-full rounded text-[11px] font-bold ${v ? codeCls[v] || "bg-slate-100" : "hover:bg-slate-50"}`}>
                            {v}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-s border-slate-100 px-2 font-medium text-slate-600">{totalBy(s)}</td>
                    <td className="px-1">
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => fillRow(si)} disabled={!paint} title={t("Fill the empty days with the selected code")} className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          {t("Fill")}
                        </button>
                        <button onClick={() => confirm(`${t("Remove")} ${s.name}?`) && update({ ...data, staff: data.staff.filter((_, i) => i !== si) })} className="text-slate-400 hover:text-red-500" title={t("Remove")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newStaff.name.trim()) return;
                update({ ...data, staff: [...data.staff, { name: newStaff.name.trim().toUpperCase(), emp_no: newStaff.emp_no.trim(), days: {} }] });
                setNewStaff({ name: "", emp_no: "" });
              }}
              className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3"
            >
              <input className="input w-56" placeholder={t("Staff name")} value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
              <input className="input w-32" placeholder={t("Emp. No.")} value={newStaff.emp_no} onChange={(e) => setNewStaff({ ...newStaff, emp_no: e.target.value })} />
              <button type="submit" className="flex items-center gap-1 rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50">
                <UserPlus className="h-4 w-4" />
                {t("Add staff")}
              </button>
            </form>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-slate-700">{t("Shift codes")}</p>
              {data.shifts.map((s, i) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <input className="input-cell w-16 text-center font-bold" value={s.code} onChange={(e) => update({ ...data, shifts: data.shifts.map((x, k) => (k === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} />
                  <input className="input-cell flex-1" value={s.label} onChange={(e) => update({ ...data, shifts: data.shifts.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                  <button onClick={() => update({ ...data, shifts: data.shifts.filter((_, k) => k !== i) })} className="text-slate-400 hover:text-red-500" title={t("Remove")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => update({ ...data, shifts: [...data.shifts, { code: "", label: "" }] })} className="mt-1 text-xs font-medium text-teal-700 hover:underline">
                + {t("Add shift code")}
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-slate-700">{t("Title and signatures (printed)")}</p>
              <div className="mb-2 flex gap-2">
                <input className="input-cell flex-1 font-semibold" value={data.title} onChange={(e) => update({ ...data, title: e.target.value })} />
                <input className="input-cell w-40" value={data.suffix || ""} onChange={(e) => update({ ...data, suffix: e.target.value })} />
              </div>
              {data.footer.map((f, i) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <input className="input-cell w-28" placeholder={t("Label")} value={f.label} onChange={(e) => update({ ...data, footer: data.footer.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                  <input className="input-cell flex-1" placeholder={t("Name")} value={f.name} onChange={(e) => update({ ...data, footer: data.footer.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                  <input className="input-cell flex-1" placeholder={t("Position")} value={f.role} onChange={(e) => update({ ...data, footer: data.footer.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)) })} />
                  <button onClick={() => update({ ...data, footer: data.footer.filter((_, k) => k !== i) })} className="text-slate-400 hover:text-red-500" title={t("Remove")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => update({ ...data, footer: [...data.footer, { label: "", name: "", role: "" }] })} className="mt-1 text-xs font-medium text-teal-700 hover:underline">
                + {t("Add signature")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
