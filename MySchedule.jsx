import React, { useState, useEffect } from "react";
import { Check, X, ArrowLeftRight } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";
import { loadProfilesMap } from "./userProfiles";

export default function MySchedule({ username }) {
  const [staff, setStaff] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [myStaffId, setMyStaffId] = useState(null);
  const [showSwapFor, setShowSwapFor] = useState(null);
  const today = todayISO();

  async function loadAll() {
    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("full_name");
    const { data: a } = await supabase.from("department_assignments").select("*").eq("date", today);
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false);
    const { data: se } = await supabase.from("schedule_entries").select("*").eq("date", today);
    const { data: sw } = await supabase.from("department_swap_requests").select("*").eq("status", "pending");
    setStaff(s || []);
    setAssignments(a || []);
    setShifts(sh || []);
    setScheduleEntries(se || []);
    setSwaps(sw || []);

    const profiles = await loadProfilesMap();
    const myProfile = profiles[username];
    if (myProfile?.employee_id) {
      const mine = (s || []).find((m) => m.job_number && m.job_number === myProfile.employee_id);
      setMyStaffId(mine ? mine.id : null);
    }
  }
  useEffect(() => { loadAll(); }, []);

  function deptFor(staffId) {
    return assignments.find((a) => a.staff_id === staffId)?.department_name || "";
  }
  function shiftFor(staffId) {
    const code = scheduleEntries.find((e) => e.staff_id === staffId)?.shift_code;
    return shifts.find((s) => s.code === code) || null;
  }

  async function requestSwap(targetId) {
    if (!myStaffId) { alert("Set your Job Number on My Profile first so we know who you are."); return; }
    await supabase.from("department_swap_requests").insert({
      date: today, requester_staff_id: myStaffId, target_staff_id: targetId,
      requester_department: deptFor(myStaffId), target_department: deptFor(targetId),
      requested_by: username,
    });
    setShowSwapFor(null);
    loadAll();
  }

  async function respondSwap(swap, decision) {
    if (decision === "approved") {
      const reqA = assignments.find((a) => a.staff_id === swap.requester_staff_id);
      const reqB = assignments.find((a) => a.staff_id === swap.target_staff_id);
      if (reqA) await supabase.from("department_assignments").update({ department_name: swap.target_department }).eq("id", reqA.id);
      else await supabase.from("department_assignments").insert({ staff_id: swap.requester_staff_id, date: today, department_name: swap.target_department });
      if (reqB) await supabase.from("department_assignments").update({ department_name: swap.requester_department }).eq("id", reqB.id);
      else await supabase.from("department_assignments").insert({ staff_id: swap.target_staff_id, date: today, department_name: swap.requester_department });
    }
    await supabase.from("department_swap_requests").update({ status: decision, responded_by: username, responded_at: new Date().toISOString() }).eq("id", swap.id);
    loadAll();
  }

  if (staff === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const me = staff.find((s) => s.id === myStaffId);
  const swapsForMe = swaps.filter((s) => s.target_staff_id === myStaffId);
  const mySentSwaps = swaps.filter((s) => s.requester_staff_id === myStaffId);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>My Schedule</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>{today} — your shift and department for today.</div>

      {!myStaffId && (
        <div style={{ background: "#FBF3DF", border: "1px solid #E9CE8A", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12.5, color: "#8A6416" }}>
          We couldn't match your login to a staff record. Go to My Profile and make sure your Job Number matches your entry on the Staff roster.
        </div>
      )}

      {me && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "16px 18px", marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{me.full_name}</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div><span style={{ fontSize: 11.5, color: "#8A9694" }}>Department today</span><div style={{ fontSize: 14, fontWeight: 600 }}>{deptFor(me.id) || "not set"}</div></div>
            <div><span style={{ fontSize: 11.5, color: "#8A9694" }}>Shift</span><div style={{ fontSize: 14, fontWeight: 600 }}>{shiftFor(me.id)?.code || "not set"}</div></div>
          </div>
        </div>
      )}

      {swapsForMe.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#B8860B", marginBottom: 8 }}>SWAP REQUESTS FOR YOU</div>
          {swapsForMe.map((s) => {
            const requester = staff.find((m) => m.id === s.requester_staff_id);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF3DF", borderRadius: 7, padding: "8px 12px", marginBottom: 6, fontSize: 12.5 }}>
                <div style={{ flex: 1 }}>{requester?.full_name} wants to swap: they take "{s.target_department}", you take "{s.requester_department}"</div>
                <button onClick={() => respondSwap(s, "approved")} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px" }}><Check size={12} /></button>
                <button onClick={() => respondSwap(s, "declined")} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px" }}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>EVERYONE TODAY</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {staff.map((m) => {
          const isMe = m.id === myStaffId;
          const alreadySent = mySentSwaps.find((s) => s.target_staff_id === m.id);
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 14px" }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 700 : 500 }}>{m.full_name}{isMe ? " (you)" : ""}</div>
              <div style={{ fontSize: 12, color: "#8A9694" }}>{deptFor(m.id) || "—"}</div>
              <div style={{ fontSize: 11.5, color: "#8A9694" }}>{shiftFor(m.id)?.code || ""}</div>
              {!isMe && myStaffId && (
                showSwapFor === m.id ? (
                  <button onClick={() => requestSwap(m.id)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11 }}>Confirm request</button>
                ) : alreadySent ? (
                  <span style={{ fontSize: 10.5, color: "#B8860B", fontWeight: 700 }}>requested ({alreadySent.status})</span>
                ) : (
                  <button onClick={() => setShowSwapFor(m.id)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><ArrowLeftRight size={11} /> Swap</button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
