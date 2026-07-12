import React, { useState, useEffect } from "react";
import { Award, Star } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

export default function EmployeeOfMonth({ role }) {
  const canEdit = role === "admin" || role === "super";
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staff, setStaff] = useState([]);
  const [scores, setScores] = useState([]);
  const [localScores, setLocalScores] = useState({}); // staffId -> string being typed, before it's saved

  async function load() {
    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("full_name");
    const { data: sc } = await supabase.from("employee_of_month").select("*").eq("month", month);
    setStaff(s || []);
    setScores(sc || []);
    setLocalScores({});
  }
  useEffect(() => { load(); }, [month]);

  function scoreFor(staffId) {
    if (localScores[staffId] !== undefined) return localScores[staffId];
    return scores.find((s) => s.staff_id === staffId)?.score ?? "";
  }

  function typeScore(staffId, value) {
    setLocalScores((s) => ({ ...s, [staffId]: value }));
  }

  async function saveScore(staffId) {
    const raw = localScores[staffId];
    if (raw === undefined) return;
    const score = Math.max(0, Math.min(100, Number(raw) || 0));
    await supabase.from("employee_of_month").upsert({ month, staff_id: staffId, score }, { onConflict: "month,staff_id" });
    load();
  }

  async function markWinner(staffId) {
    await supabase.from("employee_of_month").update({ is_winner: false }).eq("month", month);
    await supabase.from("employee_of_month").upsert({ month, staff_id: staffId, is_winner: true, score: scoreFor(staffId) || 0 }, { onConflict: "month,staff_id" });
    load();
  }

  const winner = scores.find((s) => s.is_winner);
  const winnerStaff = winner ? staff.find((s) => s.id === winner.staff_id) : null;
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topScorerId = sorted[0]?.staff_id;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Employee of the Month</h2>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 16 }}>Score each employee out of 100, then mark a winner for the month.</div>

      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto", marginBottom: 18 }} />

      {winnerStaff && (
        <div style={{ background: "linear-gradient(135deg, #FBF3DF, #F8E9C8)", border: "1px solid #D8862B33", borderRadius: 14, padding: 20, marginBottom: 20, textAlign: "center" }}>
          <Award size={32} color="#B8860B" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 12, color: "#8A6D2F", fontWeight: 700, letterSpacing: 0.5 }}>EMPLOYEE OF THE MONTH</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#5A4A1F", marginTop: 4 }}>{winnerStaff.full_name}</div>
          <div style={{ fontSize: 13, color: "#8A6D2F" }}>Score: {winner.score}/100</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {staff.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 9, padding: "10px 14px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.full_name}</div>
              <div style={{ fontSize: 11, color: "#8A9694" }}>{m.department}</div>
            </div>
            {m.id === topScorerId && scoreFor(m.id) !== "" && <Star size={15} color="#D8862B" fill="#D8862B" />}
            {canEdit ? (
              <input type="number" min="0" max="100" value={scoreFor(m.id)} onChange={(e) => typeScore(m.id, e.target.value)} onBlur={() => saveScore(m.id)} style={{ width: 60, border: "1px solid #C7D1CE", borderRadius: 6, padding: "6px 8px", fontSize: 13, textAlign: "center" }} />
            ) : (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#516361", width: 40, textAlign: "center" }}>{scoreFor(m.id) || "—"}</div>
            )}
            {canEdit && (
              <button onClick={() => markWinner(m.id)} style={{ background: winner?.staff_id === m.id ? "#0F7173" : "none", color: winner?.staff_id === m.id ? "#fff" : "#516361", border: "1px solid " + (winner?.staff_id === m.id ? "#0F7173" : "#C7D1CE"), borderRadius: 6, padding: "6px 10px", fontSize: 11.5, fontWeight: 600 }}>
                {winner?.staff_id === m.id ? "★ Winner" : "Set as winner"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
