import React, { useState } from "react";
import { Trash2, Plus, Save } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, marginTop: 4, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

function emptyAnalyte() {
  return { name: "", unit: "", mean: "", sd: "", rangeLow: "", rangeHigh: "" };
}

// Accepts either Mean+SD directly, or a Normal Range (Low-High) which is
// converted assuming the range represents roughly ±2 SD around the mean.
function resolveMeanSd(a) {
  const mean = a.mean ?? "", sd = a.sd ?? "", rangeLow = a.rangeLow ?? "", rangeHigh = a.rangeHigh ?? "";
  if (mean !== "" && sd !== "") return { mean: Number(mean), sd: Number(sd) };
  if (rangeLow !== "" && rangeHigh !== "") {
    const low = Number(rangeLow), high = Number(rangeHigh);
    const computedMean = (low + high) / 2;
    const computedSd = (high - low) / 4;
    return { mean: computedMean, sd: computedSd || 0.0001 };
  }
  return { mean: null, sd: null };
}

export default function Settings({ config, panels, role, staffAccounts, username, baselines, reload }) {
  const departments = config.departments || [];
  const [form, setForm] = useState({ name: "", department: departments[0] || "", device: "", lot_number: "", lot_expiry: "" });
  const [analytes, setAnalytes] = useState([emptyAnalyte()]);
  const [bulkText, setBulkText] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newStaff, setNewStaff] = useState({ username: "", password: "" });
  const [staffMsg, setStaffMsg] = useState("");
  const [creds, setCreds] = useState({
    lab_username: config.lab_username,
    lab_password: config.lab_password,
    admin_username: config.admin_username,
    admin_password: config.admin_password,
    admin2_username: config.admin2_username,
    admin2_password: config.admin2_password,
    super_username: config.super_username,
    super_password: config.super_password,
  });
  const [msg, setMsg] = useState("");
  const [editingLotId, setEditingLotId] = useState(null);
  const [editLot, setEditLot] = useState("");
  const [editLotExpiry, setEditLotExpiry] = useState("");
  const [baselineEditId, setBaselineEditId] = useState(null);
  const [baselineValues, setBaselineValues] = useState({});
  const [editPanelId, setEditPanelId] = useState(null);
  const [editPanelForm, setEditPanelForm] = useState({ name: "", department: "", device: "" });
  const [editPanelAnalytes, setEditPanelAnalytes] = useState([]);

  function startEditPanel(p) {
    setEditPanelId(p.id);
    setEditPanelForm({ name: p.name, department: p.department, device: p.device || "" });
    setEditPanelAnalytes((p.analytes || []).map((a) => ({ ...a })));
  }
  function updateEditAnalyte(i, key, value) {
    setEditPanelAnalytes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }
  function addEditAnalyteRow() {
    setEditPanelAnalytes((ls) => [...ls, { name: "", unit: "" }]);
  }
  function removeEditAnalyteRow(i) {
    setEditPanelAnalytes((ls) => ls.filter((_, idx) => idx !== i));
  }
  async function savePanelEdit() {
    const cleanAnalytes = editPanelAnalytes.map((a) => ({ name: a.name, unit: a.unit })).filter((a) => a.name);
    await supabase.from("qc_panels").update({ ...editPanelForm, analytes: cleanAnalytes }).eq("id", editPanelId);
    setEditPanelId(null);
    reload();
  }

  async function saveManualBaselines(panel) {
    for (const [analyteName, v] of Object.entries(baselineValues)) {
      const { mean, sd } = resolveMeanSd(v);
      if (mean === null) continue;
      const target_mean = v.target !== "" && v.target !== undefined ? Number(v.target) : null;
      await supabase.from("qc_baselines").update({ active: false }).eq("panel_id", panel.id).eq("analyte_name", analyteName).eq("lot_number", panel.lot_number).eq("active", true);
      await supabase.from("qc_baselines").insert({
        panel_id: panel.id, analyte_name: analyteName, lot_number: panel.lot_number,
        mean, sd, target_mean, point_count: 0,
      });
    }
    setBaselineEditId(null);
    setBaselineValues({});
    reload();
  }

  async function addStaffAccount() {
    if (!newStaff.username || !newStaff.password) return;
    const { error } = await supabase.from("staff_accounts").insert(newStaff);
    setStaffMsg(error ? "That username may already exist." : "Account created.");
    setNewStaff({ username: "", password: "" });
    reload();
    setTimeout(() => setStaffMsg(""), 2500);
  }

  async function removeStaffAccount(id) {
    if (!confirm("Remove this employee's account? They will no longer be able to sign in.")) return;
    await supabase.from("staff_accounts").delete().eq("id", id);
    reload();
  }

  function updateAnalyte(i, key, value) {
    setAnalytes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }
  function addAnalyteRow() {
    setAnalytes((ls) => [...ls, emptyAnalyte()]);
  }
  function removeAnalyteRow(i) {
    setAnalytes((ls) => ls.filter((_, idx) => idx !== i));
  }
  function applyBulk() {
    // Paste names one per line, optionally "Name, Unit"
    const rows = bulkText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, unit] = line.split(",").map((s) => s.trim());
      return { name, unit: unit || "" };
    });
    if (rows.length) setAnalytes(rows);
    setBulkText("");
  }

  async function addPanel() {
    if (!form.name || analytes.some((l) => !l.name)) return;
    const { lot_expiry, ...panelFields } = form;
    const cleanAnalytes = analytes.map(({ name, unit }) => ({ name, unit }));
    const { data: newPanel } = await supabase.from("qc_panels").insert({ ...panelFields, analytes: cleanAnalytes }).select().single();
    if (newPanel) {
      if (form.lot_number) {
        await supabase.from("qc_control_lots").insert({
          panel_id: newPanel.id, lot_number: form.lot_number, expiry_date: lot_expiry || null, received_by: username,
        });
      }
      for (const a of analytes) {
        const { mean, sd } = resolveMeanSd(a);
        if (mean !== null && sd !== null && form.lot_number) {
          await supabase.from("qc_baselines").insert({
            panel_id: newPanel.id, analyte_name: a.name, lot_number: form.lot_number,
            mean, sd, point_count: 0,
          });
        }
      }
    }
    setForm({ name: "", department: departments[0] || "", device: "", lot_number: "", lot_expiry: "" });
    setAnalytes([emptyAnalyte()]);
    reload();
  }

  async function deletePanel(id) {
    if (!confirm("Remove this QC panel? Its history stays in Reports.")) return;
    await supabase.from("qc_panels").update({ deleted: true }).eq("id", id);
    reload();
  }

  async function saveLot(id) {
    await supabase.from("qc_panels").update({ lot_number: editLot }).eq("id", id);
    await supabase.from("qc_control_lots").insert({
      panel_id: id, lot_number: editLot, expiry_date: editLotExpiry || null, received_by: username,
    });
    setEditingLotId(null);
    setEditLotExpiry("");
    reload();
  }

  async function addDepartment() {
    const name = newDept.trim();
    if (!name || departments.includes(name)) return;
    await supabase.from("app_config").update({ departments: [...departments, name] }).eq("id", 1);
    setNewDept("");
    reload();
  }

  async function removeDepartment(name) {
    if (!confirm(`Remove "${name}"?`)) return;
    await supabase.from("app_config").update({ departments: departments.filter((d) => d !== name) }).eq("id", 1);
    reload();
  }

  async function saveCreds() {
    const { error } = await supabase.from("app_config").update(creds).eq("id", 1);
    setMsg(error ? "Could not save." : "Saved.");
    reload();
    setTimeout(() => setMsg(""), 2500);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 24 }}>Only visible to admin and owner accounts.</div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>DEPARTMENTS</div>
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="e.g. Molecular Biology" value={newDept} onChange={(e) => setNewDept(e.target.value)} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
          <button onClick={addDepartment} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
        {departments.map((d) => (
          <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 20, padding: "6px 8px 6px 14px" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{d}</span>
            <button onClick={() => removeDepartment(d)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>QC PANELS</div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>
        One panel = one device + control level (e.g. "Beckman DXC700 Serum 1 QC"), covering all its analytes under a single shared lot number.
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 30 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input placeholder="Panel name, e.g. Beckman DXC700 Serum 1 QC" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, flex: 2, minWidth: 180, marginTop: 0 }} />
          <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120, marginTop: 0 }}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input placeholder="Device" value={form.device} onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120, marginTop: 0 }} />
          <input placeholder="Lot number" value={form.lot_number} onChange={(e) => setForm((f) => ({ ...f, lot_number: e.target.value }))} style={{ ...inputStyle, width: 120, marginTop: 0 }} />
          <input type="date" placeholder="Lot expiry" value={form.lot_expiry} onChange={(e) => setForm((f) => ({ ...f, lot_expiry: e.target.value }))} style={{ ...inputStyle, width: 140, marginTop: 0 }} />
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 6 }}>ANALYTES (rows in the grid)</div>
        <div style={{ fontSize: 11, color: "#8A9694", marginBottom: 6 }}>
          Fill in EITHER "Normal Range (Low–High)" OR "Mean/SD" — whichever you have. Leave both blank to let Westgard build the baseline automatically from the first 20 results.
        </div>
        {analytes.map((l, i) => (
          <div key={i} style={{ border: "1px solid #E1E8E5", borderRadius: 7, padding: 8, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input placeholder="Name, e.g. Glu" value={l.name} onChange={(e) => updateAnalyte(i, "name", e.target.value)} style={{ ...inputStyle, flex: 2, marginTop: 0 }} />
              <input placeholder="Unit" value={l.unit} onChange={(e) => updateAnalyte(i, "unit", e.target.value)} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
              {analytes.length > 1 && (
                <button onClick={() => removeAnalyteRow(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, color: "#8A9694", width: 95 }}>Normal Range</span>
              <input placeholder="Low" type="number" value={l.rangeLow} onChange={(e) => updateAnalyte(i, "rangeLow", e.target.value)} style={{ ...inputStyle, width: 80, marginTop: 0 }} />
              <span style={{ fontSize: 12, color: "#8A9694" }}>–</span>
              <input placeholder="High" type="number" value={l.rangeHigh} onChange={(e) => updateAnalyte(i, "rangeHigh", e.target.value)} style={{ ...inputStyle, width: 80, marginTop: 0 }} />
              <span style={{ fontSize: 11, color: "#C7D1CE" }}>or</span>
              <input placeholder="Mean" type="number" value={l.mean} onChange={(e) => updateAnalyte(i, "mean", e.target.value)} style={{ ...inputStyle, width: 80, marginTop: 0 }} />
              <input placeholder="SD" type="number" value={l.sd} onChange={(e) => updateAnalyte(i, "sd", e.target.value)} style={{ ...inputStyle, width: 70, marginTop: 0 }} />
            </div>
          </div>
        ))}
        <button onClick={addAnalyteRow} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginTop: 4, marginBottom: 10 }}>+ Add another analyte</button>

        <div style={{ fontSize: 11, color: "#8A9694", marginBottom: 4 }}>Or paste a list (one per line, "Name, Unit" or just "Name") to replace the rows above:</div>
        <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"Glu, mg/dL\nUA, mg/dL\nCreat, mg/dL"} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} />
        <button onClick={applyBulk} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "6px 12px", fontSize: 12, marginTop: 6 }}>Apply pasted list</button>

        <button onClick={addPanel} style={{ marginTop: 14, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13.5, width: "100%" }}>Save QC panel</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 30 }}>
        {panels.length === 0 && <div style={{ fontSize: 13, color: "#8A9694" }}>No QC panels yet — add your first one above.</div>}
        {panels.map((p) => (
          <div key={p.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#7B8E8A" }}>{p.department}</div>
              <button onClick={() => startEditPanel(p)} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 12, fontWeight: 600 }}>Edit panel</button>
              <button onClick={() => deletePanel(p.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
            </div>
            <div style={{ fontSize: 11.5, color: "#8A9694", marginTop: 4 }}>
              {(p.analytes || []).map((a) => a.name).join(", ")}
            </div>

            {editPanelId === p.id && (
              <div style={{ marginTop: 10, background: "#F7F9F8", borderRadius: 7, padding: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <input placeholder="Panel name" value={editPanelForm.name} onChange={(e) => setEditPanelForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, flex: 2, minWidth: 160, marginTop: 0 }} />
                  <select value={editPanelForm.department} onChange={(e) => setEditPanelForm((f) => ({ ...f, department: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 110, marginTop: 0 }}>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input placeholder="Device" value={editPanelForm.device} onChange={(e) => setEditPanelForm((f) => ({ ...f, device: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 110, marginTop: 0 }} />
                </div>
                <div style={{ fontSize: 11, color: "#8A9694", marginBottom: 6 }}>Add, rename, or remove analytes. Renaming an analyte starts a fresh Westgard baseline for it.</div>
                {editPanelAnalytes.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input placeholder="Name" value={a.name} onChange={(e) => updateEditAnalyte(i, "name", e.target.value)} style={{ ...inputStyle, flex: 2, marginTop: 0 }} />
                    <input placeholder="Unit" value={a.unit} onChange={(e) => updateEditAnalyte(i, "unit", e.target.value)} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
                    <button onClick={() => removeEditAnalyteRow(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={addEditAnalyteRow} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>+ Add analyte</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={savePanelEdit} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12 }}>Save changes</button>
                  <button onClick={() => setEditPanelId(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "6px 14px", fontSize: 12 }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              {editingLotId === p.id ? (
                <>
                  <input placeholder="New lot number" value={editLot} onChange={(e) => setEditLot(e.target.value)} style={{ ...inputStyle, width: 140, marginTop: 0 }} />
                  <input type="date" placeholder="Expiry date" value={editLotExpiry} onChange={(e) => setEditLotExpiry(e.target.value)} style={{ ...inputStyle, width: 150, marginTop: 0 }} />
                  <button onClick={() => saveLot(p.id)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>Save</button>
                  <button onClick={() => setEditingLotId(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#516361" }}>Current lot: <b>{p.lot_number || "—"}</b></div>
                  <button onClick={() => { setEditingLotId(p.id); setEditLot(p.lot_number || ""); setEditLotExpiry(""); }} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 12, fontWeight: 600 }}>Change lot (new baseline)</button>
                  <button
                    onClick={() => {
                      setBaselineEditId(p.id);
                      const prefill = {};
                      (p.analytes || []).forEach((a) => {
                        const b = (baselines || []).find((x) => x.panel_id === p.id && x.analyte_name === a.name && x.lot_number === p.lot_number);
                        if (b) prefill[a.name] = { mean: String(b.mean), sd: String(b.sd), rangeLow: "", rangeHigh: "", target: b.target_mean !== null && b.target_mean !== undefined ? String(b.target_mean) : "" };
                      });
                      setBaselineValues(prefill);
                    }}
                    style={{ background: "none", border: "none", color: "#0F7173", fontSize: 12, fontWeight: 600 }}
                  >Edit normal range</button>
                </>
              )}
            </div>
            {baselineEditId === p.id && (
              <div style={{ marginTop: 10, background: "#F7F9F8", borderRadius: 7, padding: 10 }}>
                <div style={{ fontSize: 11, color: "#8A9694", marginBottom: 6 }}>Applies to lot <b>{p.lot_number || "—"}</b>. Already-set analytes are pre-filled — just edit the numbers and save.</div>
                {(p.analytes || []).map((a) => (
                  <div key={a.name} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <div style={{ width: 70, fontSize: 12.5, fontWeight: 600 }}>{a.name}</div>
                    <input placeholder="Low" type="number" value={baselineValues[a.name]?.rangeLow ?? ""} onChange={(e) => setBaselineValues((b) => ({ ...b, [a.name]: { mean: "", sd: "", rangeLow: "", rangeHigh: "", ...b[a.name], rangeLow: e.target.value } }))} style={{ ...inputStyle, width: 70, marginTop: 0 }} />
                    <input placeholder="High" type="number" value={baselineValues[a.name]?.rangeHigh ?? ""} onChange={(e) => setBaselineValues((b) => ({ ...b, [a.name]: { mean: "", sd: "", rangeLow: "", rangeHigh: "", ...b[a.name], rangeHigh: e.target.value } }))} style={{ ...inputStyle, width: 70, marginTop: 0 }} />
                    <span style={{ fontSize: 10, color: "#C7D1CE" }}>or</span>
                    <input placeholder="Mean" type="number" value={baselineValues[a.name]?.mean ?? ""} onChange={(e) => setBaselineValues((b) => ({ ...b, [a.name]: { mean: "", sd: "", rangeLow: "", rangeHigh: "", ...b[a.name], mean: e.target.value } }))} style={{ ...inputStyle, width: 80, marginTop: 0 }} />
                    <input placeholder="SD" type="number" value={baselineValues[a.name]?.sd ?? ""} onChange={(e) => setBaselineValues((b) => ({ ...b, [a.name]: { mean: "", sd: "", rangeLow: "", rangeHigh: "", target: "", ...b[a.name], sd: e.target.value } }))} style={{ ...inputStyle, width: 70, marginTop: 0 }} />
                    <span style={{ fontSize: 10, color: "#C7D1CE" }}>·</span>
                    <input placeholder="Target (optional)" type="number" value={baselineValues[a.name]?.target ?? ""} onChange={(e) => setBaselineValues((b) => ({ ...b, [a.name]: { mean: "", sd: "", rangeLow: "", rangeHigh: "", target: "", ...b[a.name], target: e.target.value } }))} style={{ ...inputStyle, width: 90, marginTop: 0 }} />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => saveManualBaselines(p)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12 }}>Save baselines</button>
                  <button onClick={() => setBaselineEditId(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "6px 14px", fontSize: 12 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>EMPLOYEE ACCOUNTS</div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>
        Give each employee their own login. They get regular staff permissions (enter results, no delete, no settings).
      </div>
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Username" value={newStaff.username} onChange={(e) => setNewStaff((s) => ({ ...s, username: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 140, marginTop: 0 }} />
          <input placeholder="Password" value={newStaff.password} onChange={(e) => setNewStaff((s) => ({ ...s, password: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 140, marginTop: 0 }} />
          <button onClick={addStaffAccount} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
        </div>
        {staffMsg && <div style={{ fontSize: 12, color: "#516361", marginTop: 8 }}>{staffMsg}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 30 }}>
        {(staffAccounts || []).length === 0 && <div style={{ fontSize: 13, color: "#8A9694" }}>No individual employee accounts yet — everyone shares the staff username/password below.</div>}
        {(staffAccounts || []).map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 14px" }}>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{s.username}</div>
            <button onClick={() => removeStaffAccount(s.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>LOGIN & ACCOUNTS</div>
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>Shared staff username<input style={inputStyle} value={creds.lab_username} onChange={(e) => setCreds((c) => ({ ...c, lab_username: e.target.value }))} /></label>
          <label style={{ ...labelStyle, flex: 1 }}>Shared staff password<input style={inputStyle} value={creds.lab_password} onChange={(e) => setCreds((c) => ({ ...c, lab_password: e.target.value }))} /></label>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>Admin 1 username (Basil)<input style={inputStyle} value={creds.admin_username} onChange={(e) => setCreds((c) => ({ ...c, admin_username: e.target.value }))} /></label>
          <label style={{ ...labelStyle, flex: 1 }}>Admin 1 password<input style={inputStyle} value={creds.admin_password} onChange={(e) => setCreds((c) => ({ ...c, admin_password: e.target.value }))} /></label>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>Admin 2 username (Mahmoud)<input style={inputStyle} value={creds.admin2_username} onChange={(e) => setCreds((c) => ({ ...c, admin2_username: e.target.value }))} /></label>
          <label style={{ ...labelStyle, flex: 1 }}>Admin 2 password<input style={inputStyle} value={creds.admin2_password} onChange={(e) => setCreds((c) => ({ ...c, admin2_password: e.target.value }))} /></label>
        </div>
        {role === "super" && (
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...labelStyle, flex: 1 }}>Your (owner) username<input style={inputStyle} value={creds.super_username} onChange={(e) => setCreds((c) => ({ ...c, super_username: e.target.value }))} /></label>
            <label style={{ ...labelStyle, flex: 1 }}>Your (owner) password<input style={inputStyle} value={creds.super_password} onChange={(e) => setCreds((c) => ({ ...c, super_password: e.target.value }))} /></label>
          </div>
        )}
        <button onClick={saveCreds} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Save size={14} /> Save settings
        </button>
        {msg && <div style={{ fontSize: 12.5, color: "#2F6B4F" }}>{msg}</div>}
      </div>

      <div style={{ fontSize: 11.5, color: "#8A9694", marginTop: 14 }}>
        Note: credentials are stored as plain text, visible to anyone with the app link — fine for internal use, not for sensitive data.
      </div>
    </div>
  );
}
