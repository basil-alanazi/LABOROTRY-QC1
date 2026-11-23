import { supabase } from "./supabaseClient";

export const VACCINATION_STOCK_DEPARTMENT = "EMPLOYEE HEALTH CLINIC VACCINATION STOCK";

// Barcode codes printed on vaccine labels look like "V" + 7 letters/digits.
export const LOT_CODE_RE = /^V[A-HJ-NP-Z2-9]{7}$/;
export const looksLikeLotCode = (s) => LOT_CODE_RE.test(String(s || "").trim().toUpperCase());

// Finds the batch behind a scanned label. Returns { lot, item } or { error }.
export async function findLot(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  const { data: lots } = await supabase.from("vaccine_lots").select("*").eq("code", code).eq("department", VACCINATION_STOCK_DEPARTMENT);
  const lot = (lots ?? [])[0];
  if (!lot) return { error: `Unknown barcode: ${code}` };
  const { data: items } = await supabase.from("stock_items").select("*").eq("id", lot.item_id);
  const item = (items ?? [])[0];
  if (!item) return { error: "This vaccine was removed from the stock list" };
  return { lot, item };
}

// Uses one dose of a batch: batch and vaccine stock go down by one and the
// use is logged in stock_requests (shown on the Vaccination Stock page).
// `note` says who it was given to. Returns { lot, item, lotLeft, itemLeft } or { error }.
export async function takeOneDose({ lot, item }, { by, note = "" }) {
  if ((lot.qty_remaining ?? 0) <= 0) return { error: `${lot.item_name} · batch ${lot.batch_no}: no doses left in this batch` };
  const lotLeft = lot.qty_remaining - 1;
  const itemLeft = Math.max(0, (item.current_qty ?? 0) - 1);
  const { error } = await supabase.from("stock_requests").insert({
    department: VACCINATION_STOCK_DEPARTMENT,
    item_id: item.id,
    item_name: item.name,
    unit: item.unit,
    quantity_requested: 1,
    quantity_issued: 1,
    status: "issued",
    notes: `Batch ${lot.batch_no} (${lot.code}) — scanned${note ? ` — ${note}` : ""}`,
    requested_by: by,
    issued_by: by,
    issued_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not save: " + error.message };
  await supabase.from("vaccine_lots").update({ qty_remaining: lotLeft }).eq("id", lot.id);
  await supabase.from("stock_items").update({ current_qty: itemLeft }).eq("id", item.id);
  return { lot, item, lotLeft, itemLeft };
}
