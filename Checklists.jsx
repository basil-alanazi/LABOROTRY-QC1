import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isoWeekKey() {
  const d = new Date();
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Monday=0
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNr = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(weekNr).padStart(2, "0")}`;
}
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

const TABS = [
  { key: "daily", label: "Daily", periodKey: todayISO, hint: "Resets every day" },
  { key: "weekly", label: "Weekly", periodKey: isoWeekKey, hint: "Resets every week" },
  { key: "monthly", label: "Monthly", periodKey: monthKey, hint: "Resets every month" },
];

export default function Checklists({ role, username }) {
  const canEdit = role === "admin" || role === "super";
  const [tab, setTab] = useState("daily");
  const [items, setItems] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDept, setNewDept] = useState("");

  const activeTab = TABS.find((t) => t.key === tab);
  const periodKey = activeTab.periodKey();

  async function loadAll() {
    const { data: i } = await supabase.from("checklist_items").select("*").eq("deleted", false).eq("frequency", tab).order("sort_order").order("title");
    const { data: c } = await supabase.from("checklist_completions").select("*").eq("period_key", periodKey);
    setItems(i || []);
    setCompletions(c || []);
  }
  useEffect(() => { loadAll(); }, [tab]);

  function completionFor(itemId) {
    return completions.find((c) => c.item_id === itemId);
  }

  async function toggle(item) {
    const existing = completionFor(item.id);
    if (existing) {
      await supabase.from("checklist_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("checklist_completions").insert({ item_id: item.id, period_key: periodKey, completed_by: username });
    }
    loadAll();
  }

  async function addItem() {
    if (!newTitle.trim()) return;
    await supabase.from("checklist_items").insert({ title: newTitle.trim(), frequency: tab, department: newDept.trim() || null });
    setNewTitle("");
    setNewDept("");
    loadAll();
  }

  async function removeItem(id) {
    if (!confirm("Remove this checklist item?")) return;
    await supabase.from("checklist_items").update({ deleted: true }).eq("id", id);
    loadAll();
  }

  const doneCount = items ? items.filter((i) => completionFor(i.id)).length : 0;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Checklists</h2>
        <button onClick={() => window.print()} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#516361" }}>🖨️ Print</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 16 }}>Routine tasks — maintenance, lab prep, waste disposal, and anything else that repeats on a schedule.</div>

      <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ border: "1px solid " + (tab === t.key ? "#0F7173" : "#C7D1CE"), background: tab === t.key ? "#0F7173" : "#fff", color: tab === t.key ? "#fff" : "#516361", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>{t.label}</button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "#8A9694", marginBottom: 10 }}>{activeTab.hint} · {doneCount}/{items?.length || 0} done this {tab === "daily" ? "day" : tab === "weekly" ? "week" : "month"}</div>

      {items === null ? (
        <div style={{ padding: 30, textAlign: "center", color: "#8A9694" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#8A9694" }}>No {tab} tasks yet.</div>
      ) : (
        <div className="print-area" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {items.map((item) => {
            const done = completionFor(item.id);
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 9, padding: "10px 14px" }}>
                <button onClick={() => toggle(item)} style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid " + (done ? "#0F7173" : "#C7D1CE"), background: done ? "#0F7173" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done && <Check size={16} color="#fff" />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2B2E", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "#8A9694" }}>
                    {item.department && `${item.department} · `}
                    {done ? `done by ${done.completed_by}` : "not done yet"}
                  </div>
                </div>
                {canEdit && <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={14} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Add a {tab} task</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="e.g. Empty the waste bin" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
            <input placeholder="Department (optional)" value={newDept} onChange={(e) => setNewDept(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
            <button onClick={addItem} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
