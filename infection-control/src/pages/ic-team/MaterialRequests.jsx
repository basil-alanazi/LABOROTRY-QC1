import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { fmtDate } from "../../lib/dates";
import rabiaLogo from "../../assets/rabia-logo.jpg";

// Material requests (the hospital's "طلب مواد / Material Request" form) for
// the departments the IC team runs. Staff fill in the items; the saved
// request prints in the same layout as the paper form for signatures.
const DEPTS = ["CSSD", "IPC", "LAUNDRY"];
const FORM_ROWS = 22;
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ code_no: "", description: "", qty: "", unit: "", unit_price: "" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const lineTotal = (it) => (num(it.qty) != null && num(it.unit_price) != null ? num(it.qty) * num(it.unit_price) : null);
const money = (n) => (n == null ? "" : n.toFixed(2));

function printRequest(r) {
  const logo = new URL(rabiaLogo, window.location.origin).href;
  const items = (r.items || []).filter((it) => it.description || it.qty || it.code_no);
  const rows = Array.from({ length: Math.max(FORM_ROWS, items.length) }, (_, i) => {
    const it = items[i] || {};
    const tot = lineTotal(it);
    return `<tr><td>${i + 1}</td><td>${esc(it.code_no)}</td><td class="desc">${esc(it.description)}</td><td>${esc(it.qty)}</td><td>${esc(it.unit)}</td><td>${esc(it.unit_price)}</td><td>${money(tot)}</td></tr>`;
  }).join("");
  const total = items.reduce((s, it) => s + (lineTotal(it) || 0), 0);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.dept)} Material Request ${esc(r.request_no)}</title>
<style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
.form{border:2px solid #222}.logo{text-align:center;border-bottom:1.5px solid #222;padding:6px}.logo img{height:48px}
.title{text-align:center;font-size:18px;font-weight:bold;border-bottom:1.5px solid #222;padding:6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #222;font-size:11.5px;padding:2px 4px;text-align:center;height:19px}
th{background:#e7e7e7;font-weight:bold;font-size:11px}th small{display:block;font-weight:normal}
.meta td{background:#e7e7e7;font-weight:bold;height:24px}.meta td.v{background:#fff;font-weight:normal}
td.desc{text-align:center}.total td{background:#e7e7e7;font-weight:bold;text-align:start}
.bottom td{height:30px}.bottom td.lbl{text-align:start;font-weight:bold;font-size:12px}.ar{direction:rtl}</style></head><body>
<div class="form">
<div class="logo"><img src="${logo}" alt="Rabia Hospital"></div>
<div class="title"><span class="ar">طلب مواد</span> ${esc(r.dept)} Material Request</div>
<table class="meta"><tr><td style="width:12%">Date :</td><td class="v" style="width:18%">${esc(fmtDate(r.request_date))}</td>
<td class="v" style="width:36%">Request No.: ${esc(r.request_no)} : <span class="ar">رقم الطلب</span></td>
<td class="v" style="width:34%">Dept.: ${esc(r.dept)} : <span class="ar">القسم</span></td></tr></table>
<table><thead><tr><th style="width:7%">SL NO</th><th style="width:12%">Code No.<small class="ar">رقم الصنف</small></th><th>Description<small class="ar">الوصف</small></th>
<th style="width:8%">Qty<small class="ar">الكمية</small></th><th style="width:9%">Unit<small class="ar">الوحدة</small></th><th style="width:10%">Unit Price<small class="ar">سعر الوحدة</small></th><th style="width:11%">Total Price<small class="ar">إجمالي السعر</small></th></tr></thead>
<tbody>${rows}</tbody>
<tr class="total"><td colspan="3">Total Value <span class="ar">إجمالي القيمة</span></td><td colspan="4">${total ? money(total) : ""}</td></tr></table>
<table class="bottom"><tr><td rowspan="5" style="width:20%;vertical-align:top" class="ar"><b>أمين المستودع</b></td>
<td style="width:40%"><b>APPLICANT NAME</b></td><td style="width:18%"><b>EMP ID</b></td><td><b>DATE</b></td></tr>
<tr><td>${esc(r.applicant_name)}</td><td>${esc(r.emp_id)}</td><td>${esc(fmtDate(r.request_date))}</td></tr>
<tr><td colspan="3" class="lbl">HEAD OF THE DEPT;</td></tr>
<tr><td colspan="3" class="lbl">General Manger: <span class="ar">المدير العام</span></td></tr>
<tr><td colspan="3" class="lbl">Finance Manger: <span class="ar">المدير المالي</span></td></tr></table>
</div>${r.notes ? `<p style="font-size:11px;margin-top:6px">Notes: ${esc(r.notes)}</p>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}

export default function MaterialRequests() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // request being edited (object) or null
  const [error, setError] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("material_requests").select("*").eq("deleted", false).order("request_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
    );
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  // Next number per department and year: CSSD-2026-001
  function nextNo(dept, date) {
    const y = (date || todayStr()).slice(0, 4);
    const prefix = `${dept}-${y}-`;
    const max = rows.filter((r) => (r.request_no || "").startsWith(prefix)).reduce((m, r) => Math.max(m, parseInt(r.request_no.slice(prefix.length), 10) || 0), 0);
    return prefix + String(max + 1).padStart(3, "0");
  }

  function newRequest(dept = "CSSD") {
    setError("");
    setEditing({
      id: null,
      dept,
      request_no: nextNo(dept, todayStr()),
      request_date: todayStr(),
      items: Array.from({ length: FORM_ROWS }, emptyItem),
      applicant_name: "",
      emp_id: "",
      notes: "",
    });
  }

  async function save(printAfter) {
    const r = editing;
    const items = r.items.filter((it) => it.description.trim() || it.qty || it.code_no.trim());
    if (!items.length) return setError(t("Add at least one item."));
    if (!r.applicant_name.trim()) return setError(t("Enter the applicant name."));
    setError("");
    const payload = {
      dept: r.dept,
      request_no: r.request_no.trim(),
      request_date: r.request_date || null,
      items,
      applicant_name: r.applicant_name.trim(),
      emp_id: r.emp_id.trim(),
      notes: r.notes.trim(),
    };
    const res = r.id
      ? await supabase.from("material_requests").update({ ...payload, updated_by: session?.username, updated_at: new Date().toISOString() }).eq("id", r.id).select().single()
      : await supabase.from("material_requests").insert({ ...payload, created_by: session?.username }).select().single();
    if (res.error) return setError("Could not save: " + res.error.message);
    const saved = Array.isArray(res.data) ? res.data[0] : res.data;
    setRows((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
    setEditing(null);
    if (printAfter) printRequest(saved);
  }

  async function remove(r) {
    if (!confirm(`${t("Delete")} ${r.request_no}?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("material_requests").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
  }

  const suggestions = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => (r.items || []).forEach((it) => it.description && s.add(it.description)));
    return [...s].sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => deptFilter === "all" || r.dept === deptFilter)
      .filter((r) => !q || `${r.request_no} ${r.applicant_name} ${(r.items || []).map((i) => i.description).join(" ")}`.toLowerCase().includes(q));
  }, [rows, deptFilter, search]);

  const setItem = (i, patch) => setEditing((e) => ({ ...e, items: e.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) }));
  const total = editing ? editing.items.reduce((s, it) => s + (lineTotal(it) || 0), 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("Material Requests")}</h1>
          <p className="text-sm text-slate-500">{t("Request forms for CSSD, IPC and Laundry — saved here and printed in the hospital's Material Request layout.")}</p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            {DEPTS.map((d) => (
              <button key={d} onClick={() => newRequest(d)} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <FilePlus2 className="h-4 w-4" />
                {t("New")} {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {editing && (
        <div className="mx-auto w-full max-w-[900px]">
          {/* The form on screen is the paper form: same box, rows and signature block. */}
          <div className="border-2 border-slate-900 bg-white text-slate-900" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div className="flex justify-center border-b-2 border-slate-900 py-2">
              <img src={rabiaLogo} alt="Rabia Hospital" className="h-12 w-auto" />
            </div>
            <div className="border-b-2 border-slate-900 py-1.5 text-center text-lg font-bold">
              <span dir="rtl">طلب مواد</span>{" "}
              <select className="mx-1 border-none bg-transparent p-0 text-lg font-bold" value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value, request_no: editing.id ? editing.request_no : nextNo(e.target.value, editing.request_date) })}>
                {DEPTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>{" "}
              Material Request
            </div>
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <tr>
                  <td className="w-[12%] border border-slate-900 bg-slate-200 px-2 py-1.5 text-center font-bold">Date :</td>
                  <td className="w-[18%] border border-slate-900 px-1 text-center">
                    <input type="date" className="w-full border-none bg-transparent text-center text-[12px]" value={editing.request_date} onChange={(e) => setEditing({ ...editing, request_date: e.target.value })} />
                  </td>
                  <td className="w-[36%] border border-slate-900 px-2 text-center">
                    Request No.:{" "}
                    <input className="w-32 border-b border-dashed border-slate-400 bg-transparent text-center text-[12px]" value={editing.request_no} onChange={(e) => setEditing({ ...editing, request_no: e.target.value })} />{" "}
                    : <span dir="rtl">رقم الطلب</span>
                  </td>
                  <td className="border border-slate-900 px-2 text-center">
                    Dept.: {editing.dept} : <span dir="rtl">القسم</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <datalist id="mr-items">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr className="bg-slate-200 text-[11px]">
                    {[
                      ["SL NO", "", "w-[7%]"],
                      ["Code No.", "رقم الصنف", "w-[12%]"],
                      ["Description", "الوصف", ""],
                      ["Qty", "الكمية", "w-[8%]"],
                      ["Unit", "الوحدة", "w-[9%]"],
                      ["Unit Price", "سعر الوحدة", "w-[10%]"],
                      ["Total Price", "إجمالي السعر", "w-[11%]"],
                    ].map(([en, ar, w]) => (
                      <th key={en} className={`border border-slate-900 px-1 py-1 font-bold ${w}`}>
                        {en}
                        {ar && <div className="font-normal" dir="rtl">{ar}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editing.items.map((it, i) => (
                    <tr key={i}>
                      <td className="border border-slate-900 text-center">{i + 1}</td>
                      <td className="border border-slate-900 p-0"><input className="h-6 w-full border-none bg-transparent px-1 text-center text-[12px] focus:bg-teal-50" value={it.code_no} onChange={(e) => setItem(i, { code_no: e.target.value })} /></td>
                      <td className="border border-slate-900 p-0"><input className="h-6 w-full border-none bg-transparent px-1 text-center text-[12px] focus:bg-teal-50" list="mr-items" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                      <td className="border border-slate-900 p-0"><input className="h-6 w-full border-none bg-transparent text-center text-[12px] focus:bg-teal-50" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></td>
                      <td className="border border-slate-900 p-0"><input className="h-6 w-full border-none bg-transparent text-center text-[12px] focus:bg-teal-50" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                      <td className="border border-slate-900 p-0"><input className="h-6 w-full border-none bg-transparent text-center text-[12px] focus:bg-teal-50" inputMode="decimal" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} /></td>
                      <td className="border border-slate-900 text-center">{money(lineTotal(it))}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-200 font-bold">
                    <td colSpan={3} className="border border-slate-900 px-2 py-1">
                      Total Value <span dir="rtl">إجمالي القيمة</span>
                    </td>
                    <td colSpan={4} className="border border-slate-900 px-2 text-center">{total ? money(total) : ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <tr>
                  <td rowSpan={5} className="w-[20%] border border-slate-900 p-1 text-center align-top font-bold" dir="rtl">أمين المستودع</td>
                  <td className="w-[40%] border border-slate-900 py-1.5 text-center font-bold">APPLICANT NAME</td>
                  <td className="w-[18%] border border-slate-900 text-center font-bold">EMP ID</td>
                  <td className="border border-slate-900 text-center font-bold">DATE</td>
                </tr>
                <tr>
                  <td className="border border-slate-900 p-0"><input className="h-8 w-full border-none bg-transparent text-center text-[12px] focus:bg-teal-50" placeholder={t("Applicant name")} value={editing.applicant_name} onChange={(e) => setEditing({ ...editing, applicant_name: e.target.value })} /></td>
                  <td className="border border-slate-900 p-0"><input className="h-8 w-full border-none bg-transparent text-center text-[12px] focus:bg-teal-50" placeholder={t("Emp ID")} value={editing.emp_id} onChange={(e) => setEditing({ ...editing, emp_id: e.target.value })} /></td>
                  <td className="border border-slate-900 text-center">{fmtDate(editing.request_date)}</td>
                </tr>
                <tr><td colSpan={3} className="h-9 border border-slate-900 px-2 font-bold">HEAD OF THE DEPT;</td></tr>
                <tr><td colSpan={3} className="h-9 border border-slate-900 px-2 font-bold">General Manger: <span dir="rtl">المدير العام</span></td></tr>
                <tr><td colSpan={3} className="h-9 border border-slate-900 px-2 font-bold">Finance Manger: <span dir="rtl">المدير المالي</span></td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editing.items.length < 60 && (
              <button onClick={() => setEditing({ ...editing, items: [...editing.items, emptyItem()] })} className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                {t("Add row")}
              </button>
            )}
            <input className="input ms-2 w-64 text-xs" placeholder={t("Notes")} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="ms-auto flex gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("Cancel")}</button>
              <button onClick={() => save(false)} className="rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">{t("Save")}</button>
              <button onClick={() => save(true)} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Printer className="h-4 w-4" />
                {t("Save & print")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input ps-9" placeholder={t("Search...")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="tab-bar flex w-fit rounded-lg border border-slate-200 p-0.5 text-xs">
          {["all", ...DEPTS].map((d) => (
            <button key={d} onClick={() => setDeptFilter(d)} className={`rounded-md px-3 py-1 font-medium ${deptFilter === d ? "bg-teal-600 text-white" : "text-slate-500"}`}>
              {d === "all" ? t("All") : d}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("Request No.")}</th>
              <th className="px-3 py-2 font-medium">{t("Department")}</th>
              <th className="px-3 py-2 font-medium">{t("Date")}</th>
              <th className="px-3 py-2 font-medium">{t("Items")}</th>
              <th className="px-3 py-2 font-medium">{t("Applicant name")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-mono text-xs">{r.request_no}</td>
                <td className="px-3 py-2">{r.dept}</td>
                <td className="px-3 py-2">{fmtDate(r.request_date)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  <b>{(r.items || []).length}</b> — {(r.items || []).slice(0, 4).map((i) => `${i.description}${i.qty ? ` ×${i.qty}` : ""}`).join(", ")}
                  {(r.items || []).length > 4 ? "…" : ""}
                </td>
                <td className="px-3 py-2">{r.applicant_name}{r.emp_id ? <span className="text-xs text-slate-400"> · {r.emp_id}</span> : null}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => printRequest(r)} className="text-teal-700 hover:text-teal-900" title={t("Print")}>
                      <Printer className="h-4 w-4" />
                    </button>
                    <button onClick={() => {
                        const items = (r.items || []).map((it) => ({ ...emptyItem(), ...it }));
                        while (items.length < FORM_ROWS) items.push(emptyItem());
                        setEditing({ ...r, items, notes: r.notes || "", emp_id: r.emp_id || "" });
                      }} className="text-slate-500 hover:text-slate-800" title={t("Edit")}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No requests yet.")}</p>}
      </div>
    </div>
  );
}
