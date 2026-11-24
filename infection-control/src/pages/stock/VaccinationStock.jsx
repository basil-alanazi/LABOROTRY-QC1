import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, PackagePlus, Plus, Printer, ScanLine, Trash2 } from "lucide-react";
import JsBarcode from "jsbarcode";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { fmtDate } from "../../lib/dates";

export const VACCINATION_STOCK_DEPARTMENT = "EMPLOYEE HEALTH CLINIC VACCINATION STOCK";
const DEPT = VACCINATION_STOCK_DEPARTMENT;
const todayStr = () => new Date().toISOString().slice(0, 10);
const MAX_LABELS = 300;

// Short, unambiguous code printed in each batch's barcode (no 0/O, 1/I).
function newLotCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return "V" + Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Opens a print sheet with `copies` identical barcode labels for one batch.
function printLabels(lot, copies) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, lot.code, { format: "CODE128", width: 2, height: 46, fontSize: 13, margin: 4 });
  const label = `<div class="label"><div class="name">${esc(lot.item_name)}</div>${svg.outerHTML}<div class="meta">Batch: ${esc(lot.batch_no)}${
    lot.expiry_date ? ` · Exp: ${esc(fmtDate(lot.expiry_date))}` : ""
  }</div></div>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(lot.item_name)} — ${esc(lot.batch_no)}</title>
<style>body{font-family:Arial,sans-serif;margin:6mm}.label{display:inline-block;width:60mm;padding:2.5mm;margin:0 3mm 3mm 0;border:1px dashed #999;text-align:center;page-break-inside:avoid}
.name{font-weight:bold;font-size:12px;margin-bottom:1px}.meta{font-size:10px;color:#222}svg{max-width:100%;height:auto}@media print{.label{border:none}}</style></head>
<body>${label.repeat(copies)}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
  return true;
}

// Employee Health Clinic vaccine stock, run by barcode:
//  * Receive: pick the vaccine, type the batch no (+ expiry) and quantity —
//    stock goes up and one barcode label per dose is printed.
//  * Use: scan a label — that batch and the vaccine's stock go down by one
//    and the use is logged (same stock_requests log as the Stock page).
export default function VaccinationStock() {
  const { session, isAdmin, canAdminStock } = useAuth();
  const { t } = useLanguage();
  const canManage = isAdmin || canAdminStock || !!session?.canManageStock;
  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [uses, setUses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [scan, setScan] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [recv, setRecv] = useState({ item_id: "", batch_no: "", expiry_date: "", qty: "", print: true });
  const [recvBusy, setRecvBusy] = useState(false);
  const [newVaccine, setNewVaccine] = useState("");
  const scanRef = useRef(null);
  const msgTimer = useRef(null);

  function flash(m) {
    setMsg(m);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 6000);
  }

  async function loadAll() {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const [{ data: it }, { data: lt }, { data: us }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("stock_items").select("*").eq("department", DEPT).eq("active", true).order("sort_order").range(from, to)),
      fetchAllRows((from, to) => supabase.from("vaccine_lots").select("*").eq("department", DEPT).order("created_at", { ascending: false }).range(from, to)),
      supabase.from("stock_requests").select("*").eq("department", DEPT).gte("date", since).order("created_at", { ascending: false }).limit(50),
    ]);
    setItems(it ?? []);
    setLots(lt ?? []);
    setUses(us ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const lotsByItem = useMemo(() => {
    const m = {};
    for (const l of lots) (m[l.item_id] ||= []).push(l);
    return m;
  }, [lots]);

  // --- Scan to use -------------------------------------------------------
  async function handleScan(e) {
    e.preventDefault();
    const code = scan.trim().toUpperCase();
    setScan("");
    if (!code || scanBusy) return;
    setScanBusy(true);
    try {
      const { data: found } = await supabase.from("vaccine_lots").select("*").eq("code", code).eq("department", DEPT);
      const lot = (found ?? [])[0];
      if (!lot) {
        flash({ type: "error", text: `${t("Unknown barcode")}: ${code}` });
        return;
      }
      const { data: itemRows } = await supabase.from("stock_items").select("*").eq("id", lot.item_id);
      const item = (itemRows ?? [])[0];
      if (!item) {
        flash({ type: "error", text: t("This vaccine was removed from the stock list") });
        return;
      }
      if ((lot.qty_remaining ?? 0) <= 0) {
        flash({ type: "error", text: `${lot.item_name} · ${t("Batch")} ${lot.batch_no}: ${t("no doses left in this batch")}` });
        return;
      }
      if (lot.expiry_date && lot.expiry_date < todayStr()) {
        if (!confirm(`${lot.item_name} — batch ${lot.batch_no} expired on ${fmtDate(lot.expiry_date)}. Use anyway?`)) return;
      }
      const lotLeft = lot.qty_remaining - 1;
      const itemLeft = Math.max(0, (item.current_qty ?? 0) - 1);
      const { error: logErr } = await supabase.from("stock_requests").insert({
        department: DEPT,
        item_id: item.id,
        item_name: item.name,
        unit: item.unit,
        quantity_requested: 1,
        quantity_issued: 1,
        status: "issued",
        notes: `Batch ${lot.batch_no} (${lot.code}) — scanned`,
        requested_by: session?.username,
        issued_by: session?.username,
        issued_at: new Date().toISOString(),
      });
      if (logErr) throw logErr;
      await supabase.from("vaccine_lots").update({ qty_remaining: lotLeft }).eq("id", lot.id);
      await supabase.from("stock_items").update({ current_qty: itemLeft }).eq("id", item.id);
      flash({ type: "success", text: `${item.name} · ${t("Batch")} ${lot.batch_no} — ${t("1 dose used")}. ${t("Left in batch")}: ${lotLeft}, ${t("total stock")}: ${itemLeft}` });
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    } finally {
      setScanBusy(false);
      scanRef.current?.focus();
    }
  }

  // --- Receive new stock -------------------------------------------------
  async function handleReceive(e) {
    e.preventDefault();
    const item = items.find((i) => i.id === recv.item_id);
    const qty = parseInt(recv.qty, 10);
    const batch = recv.batch_no.trim();
    if (!item || !batch || !qty || qty <= 0) {
      flash({ type: "error", text: t("Choose the vaccine and enter the batch no and quantity") });
      return;
    }
    setRecvBusy(true);
    try {
      // Same vaccine + same batch received again → top up that batch (same barcode).
      const existing = (lotsByItem[item.id] ?? []).find((l) => l.batch_no.toUpperCase() === batch.toUpperCase());
      let lot;
      if (existing) {
        const patch = { qty_received: (existing.qty_received ?? 0) + qty, qty_remaining: (existing.qty_remaining ?? 0) + qty };
        if (recv.expiry_date) patch.expiry_date = recv.expiry_date;
        const { error } = await supabase.from("vaccine_lots").update(patch).eq("id", existing.id);
        if (error) throw error;
        lot = { ...existing, ...patch };
      } else {
        const { data, error } = await supabase
          .from("vaccine_lots")
          .insert({
            code: newLotCode(),
            item_id: item.id,
            item_name: item.name,
            batch_no: batch,
            expiry_date: recv.expiry_date || null,
            qty_received: qty,
            qty_remaining: qty,
            department: DEPT,
            created_by: session?.username,
          })
          .select()
          .single();
        if (error) throw error;
        lot = data;
      }
      await supabase.from("stock_items").update({ current_qty: (item.current_qty ?? 0) + qty }).eq("id", item.id);
      flash({ type: "success", text: `${t("Received")} ${qty} × ${item.name} (${t("Batch")} ${batch})` });
      if (recv.print) printLabels(lot, Math.min(qty, MAX_LABELS));
      setRecv({ item_id: recv.item_id, batch_no: "", expiry_date: "", qty: "", print: recv.print });
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    } finally {
      setRecvBusy(false);
    }
  }

  // Deleting a use (e.g. a wrong scan) puts the dose back in its batch and stock.
  async function deleteUse(u) {
    const qty = Number(u.quantity_issued ?? u.quantity_requested) || 0;
    if (!confirm(`Delete this use of ${u.item_name}? ${qty} dose(s) will be returned to stock.`)) return;
    try {
      const code = (u.notes || "").match(/\((V[A-Z0-9]{7})\)/)?.[1];
      if (code) {
        const { data: found } = await supabase.from("vaccine_lots").select("*").eq("code", code).eq("department", DEPT);
        const lot = (found ?? [])[0];
        if (lot) await supabase.from("vaccine_lots").update({ qty_remaining: (lot.qty_remaining ?? 0) + qty }).eq("id", lot.id);
      }
      const item = items.find((i) => i.id === u.item_id);
      if (item) await supabase.from("stock_items").update({ current_qty: (item.current_qty ?? 0) + qty }).eq("id", item.id);
      const { error } = await supabase.from("stock_requests").delete().eq("id", u.id);
      if (error) throw error;
      flash({ type: "success", text: `${t("Deleted")} — ${qty} × ${u.item_name} ${t("returned to stock")}` });
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not delete: " + err.message });
    }
  }

  // Deleting a batch removes its remaining doses from stock; its labels stop working.
  async function deleteLot(lot) {
    const left = Number(lot.qty_remaining) || 0;
    if (!confirm(`Delete batch ${lot.batch_no} of ${lot.item_name}? Its ${left} remaining dose(s) will be removed from stock and its labels will stop working.`)) return;
    try {
      const item = items.find((i) => i.id === lot.item_id);
      if (item && left) await supabase.from("stock_items").update({ current_qty: Math.max(0, (item.current_qty ?? 0) - left) }).eq("id", item.id);
      const { error } = await supabase.from("vaccine_lots").delete().eq("id", lot.id);
      if (error) throw error;
      flash({ type: "success", text: `${t("Deleted")} — ${t("Batch")} ${lot.batch_no}` });
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not delete: " + err.message });
    }
  }

  function reprint(lot) {
    const n = parseInt(prompt(t("How many labels?"), String(Math.max(1, lot.qty_remaining ?? 1))) || "0", 10);
    if (n > 0) printLabels(lot, Math.min(n, MAX_LABELS));
  }

  // --- Catalog -------------------------------------------------------------
  async function addVaccine(e) {
    e.preventDefault();
    const name = newVaccine.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("stock_items")
      .insert({ name, department: DEPT, unit: "dose", min_qty: 0, max_qty: 0, current_qty: 0, sort_order: items.length + 1 })
      .select()
      .single();
    if (error) {
      flash({ type: "error", text: "Could not add: " + error.message });
      return;
    }
    setItems((prev) => [...prev, data]);
    setNewVaccine("");
  }

  async function saveMinMax(item, patch) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    await supabase.from("stock_items").update(patch).eq("id", item.id);
  }

  async function removeVaccine(item) {
    if (!confirm(`Remove "${item.name}" from the vaccine list?`)) return;
    await supabase.from("stock_items").update({ active: false }).eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const stockClass = (i) => (i.current_qty <= 0 ? "text-red-600" : i.min_qty && i.current_qty <= i.min_qty ? "text-amber-600" : "text-emerald-700");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Employee Vaccination Stock")}</h1>
        <p className="text-sm text-slate-500">{t("Receive vaccines with their batch no and print barcode labels; scan a label to use a dose.")}</p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {msg.type === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Scan to use */}
      <form onSubmit={handleScan} className="flex flex-col gap-2 rounded-2xl border-2 border-teal-200 bg-white p-5 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ScanLine className="h-5 w-5 text-teal-600" />
          {t("Scan to use a dose")}
        </label>
        <input
          ref={scanRef}
          autoFocus
          className="input text-lg tracking-widest"
          placeholder={t("Click here and scan the barcode")}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          disabled={scanBusy}
          autoComplete="off"
        />
        <p className="text-xs text-slate-400">{t("Each scan uses 1 dose from that batch and lowers the stock.")}</p>
      </form>

      {/* Receive */}
      {canManage && (
        <form onSubmit={handleReceive} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-6 sm:items-end">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-6">
            <PackagePlus className="h-4 w-4 text-emerald-600" />
            {t("Receive new stock")}
          </p>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-medium text-slate-600">{t("Name of vaccine")}</span>
            <select className="input" value={recv.item_id} onChange={(e) => setRecv({ ...recv, item_id: e.target.value })}>
              <option value="">{t("Select")}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-600">{t("Batch No")}</span>
            <input className="input" value={recv.batch_no} onChange={(e) => setRecv({ ...recv, batch_no: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-600">{t("Expiry date")}</span>
            <input type="date" className="input" value={recv.expiry_date} onChange={(e) => setRecv({ ...recv, expiry_date: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-600">{t("Quantity to be Added")}</span>
            <input type="number" min="1" className="input" value={recv.qty} onChange={(e) => setRecv({ ...recv, qty: e.target.value })} />
          </label>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={recv.print} onChange={(e) => setRecv({ ...recv, print: e.target.checked })} />
              {t("Print labels")}
            </label>
            <button type="submit" disabled={recvBusy} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              <Plus className="h-4 w-4" />
              {t("Receive")}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      {/* Stock */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("Name of vaccine")}</th>
              <th className="px-4 py-2 font-medium">{t("Current Stock")}</th>
              <th className="px-4 py-2 font-medium">{t("Min")}</th>
              <th className="px-4 py-2 font-medium">{t("Max")}</th>
              <th className="px-4 py-2 font-medium">{t("Batches (left) — barcode")}</th>
              {canManage && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const itemLots = (lotsByItem[i.id] ?? []).filter((l) => (l.qty_remaining ?? 0) > 0);
              const tracked = itemLots.reduce((a, l) => a + (l.qty_remaining ?? 0), 0);
              const untracked = Math.max(0, (i.current_qty ?? 0) - tracked);
              return (
                <tr key={i.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 font-medium text-slate-700">{i.name}</td>
                  <td className={`px-4 py-2 font-semibold ${stockClass(i)}`}>{i.current_qty}</td>
                  <td className="px-4 py-2">
                    <input type="number" className="input w-16" disabled={!canManage} value={i.min_qty} onChange={(e) => setItems((p) => p.map((x) => (x.id === i.id ? { ...x, min_qty: e.target.value } : x)))} onBlur={(e) => saveMinMax(i, { min_qty: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" className="input w-16" disabled={!canManage} value={i.max_qty} onChange={(e) => setItems((p) => p.map((x) => (x.id === i.id ? { ...x, max_qty: e.target.value } : x)))} onBlur={(e) => saveMinMax(i, { max_qty: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="flex flex-col gap-1">
                      {itemLots.map((l) => (
                        <span key={l.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{l.batch_no}</span>
                          <span className="text-slate-500">
                            {l.qty_remaining} {t("left")}
                            {l.expiry_date && ` · exp ${fmtDate(l.expiry_date)}`}
                          </span>
                          {l.expiry_date && l.expiry_date < todayStr() && <span className="rounded bg-red-50 px-1.5 text-red-700">{t("Expired")}</span>}
                          <button type="button" onClick={() => reprint(l)} className="flex items-center gap-0.5 font-medium text-teal-700 hover:underline" title={t("Print labels")}>
                            <Printer className="h-3.5 w-3.5" />
                            {t("Print")}
                          </button>
                          {canManage && (
                            <button type="button" onClick={() => deleteLot(l)} className="text-slate-400 hover:text-red-600" title={t("Delete batch")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                      {untracked > 0 && <span className="text-amber-700">{untracked} {t("without barcode (old stock)")}</span>}
                      {itemLots.length === 0 && untracked === 0 && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <button onClick={() => removeVaccine(i)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {canManage && (
          <form onSubmit={addVaccine} className="flex gap-2 border-t border-slate-100 p-3">
            <input className="input" placeholder={t("New vaccine name")} value={newVaccine} onChange={(e) => setNewVaccine(e.target.value)} />
            <button type="submit" className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
              <Plus className="h-3.5 w-3.5" />
              {t("Add vaccine")}
            </button>
          </form>
        )}
      </div>

      {/* Recent use */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <p className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">{t("Recent use (last 30 days)")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("Date")}</th>
                <th className="px-4 py-2 font-medium">{t("Name of vaccine")}</th>
                <th className="px-4 py-2 font-medium">{t("Qty")}</th>
                <th className="px-4 py-2 font-medium">{t("Details")}</th>
                <th className="px-4 py-2 font-medium">{t("By")}</th>
                {canManage && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 text-slate-500">
                    {fmtDate(u.date)} {u.created_at ? new Date(u.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </td>
                  <td className="px-4 py-1.5">{u.item_name}</td>
                  <td className="px-4 py-1.5">{u.quantity_issued ?? u.quantity_requested}</td>
                  <td className="px-4 py-1.5 text-xs text-slate-500">{u.notes}</td>
                  <td className="px-4 py-1.5 text-xs text-slate-500">{u.issued_by || u.requested_by}</td>
                  {canManage && (
                    <td className="px-4 py-1.5">
                      <button onClick={() => deleteUse(u)} className="text-slate-400 hover:text-red-600" title={t("Delete")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && uses.length === 0 && <p className="p-4 text-center text-sm text-slate-400">{t("No use recorded yet.")}</p>}
        </div>
      </div>
    </div>
  );
}
