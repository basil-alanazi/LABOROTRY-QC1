import React, { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, UserPlus } from "lucide-react";
import { supabase } from "./supabaseClient";
import { isWithinShift, todayISO, yesterdayISO } from "./scheduleUtils";
import StaffImport from "./StaffImport";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

const STATUS_META = {
  on_duty: { emoji: "🟢", label: "On Duty", bg: "#E8F2EC", fg: "#2F6B4F" },
  on_break: { emoji: "🟡", label: "On Break", bg: "#FBF3DF", fg: "#B8860B" },
  covering: { emoji: "🟣", label: "Covering", bg: "#F1E9F8", fg: "#7A4FA3" },
  off_duty: { emoji: "⚫", label: "Off Duty", bg: "#F0F3F2", fg: "#516361" },
};

export default function StaffMembers({ departments, role }) {
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState({ full_name: "", job_number: "", department: departments?.[0] || "" });
  const [shifts, setShifts] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [now, setNow] = useState(new Date());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const canEdit = role === "admin" || role === "super";

  async function loadAll() {
    const { data } = await supabase.from("staff_members").select("*").eq("deleted", false).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false);
    const { data: se } = await supabase.from("schedule_entries").select("*").in("date", [todayISO(), yesterdayISO()]);
    const { data: br } = await supabase.from("break_sessions").select("*").in("date", [todayISO(), yesterdayISO()]);
    setStaff(data || []);
    setShifts(sh || []);
    setScheduleEntries(se || []);
    setBreaks(br || []);
  }
  useEffect(() => {
    loadAll();
    const t = setInterval(() => { setNow(new Date()); loadAll(); }, 60000);
    return () => clearInterval(t);
  }, []);

  function nextSortOrder() {
    const max = (staff || []).reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    return max;
  }

  async function addStaff() {
    if (!form.full_name) return;
    await supabase.from("staff_members").insert({ ...form, sort_order: nextSortOrder() + 1 });
    setForm({ full_name: "", job_number: "", department: departments?.[0] || "" });
    loadAll();
  }
  async function addStaffBulk(rows) {
    if (!rows.length) return;
    const start = nextSortOrder();
    const withOrder = rows.map((r, i) => ({ ...r, sort_order: start + i + 1 }));
    await supabase.from("staff_members").insert(withOrder);
    loadAll();
  }
  async function removeStaff(id) {
    if (!confirm("Remove this employee from the roster? Their past schedule history stays.")) return;
    await supabase.from("staff_members").update({ deleted: true }).eq("id", id);
    loadAll();
  }
  async function moveStaff(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= staff.length) return;
    const a = staff[index], b = staff[target];
    const aOrder = a.sort_order ?? index + 1;
    const bOrder = b.sort_order ?? target + 1;
    await supabase.from("staff_members").update({ sort_order: bOrder }).eq("id", a.id);
    await supabase.from("staff_members").update({ sort_order: aOrder }).eq("id", b.id);
    loadAll();
  }

  async function createLoginsForEveryone() {
    if (!confirm("For every employee with a job number, this creates a login (username = job number, password = job number, must change on first sign-in) and fills in their profile. Existing logins are left untouched. Continue?")) return;
    setBulkBusy(true);
    const { data: existingAccounts } = await supabase.from("staff_accounts").select("username");
    const existingUsernames = new Set((existingAccounts || []).map((a) => a.username));
    const { data: existingProfiles } = await supabase.from("user_profiles").select("*");
    const profileByUsername = {};
    (existingProfiles || []).forEach((p) => { profileByUsername[p.username] = p; });

    let created = 0, alreadyHadLogin = 0, profilesFilled = 0, noJobNumber = 0;
    for (const m of staff) {
      const jobNumber = (m.job_number || "").trim();
      if (!jobNumber) { noJobNumber++; continue; }

      if (!existingUsernames.has(jobNumber)) {
        await supabase.from("staff_accounts").insert({ username: jobNumber, password: jobNumber, must_change_password: true });
        created++;
      } else {
        alreadyHadLogin++;
      }

      const existingProfile = profileByUsername[jobNumber];
      if (!existingProfile || !existingProfile.full_name) {
        await supabase.from("user_profiles").upsert({ username: jobNumber, full_name: m.full_name, employee_id: jobNumber, updated_at: new Date().toISOString() });
        profilesFilled++;
      }
    }
    setBulkBusy(false);
    setBulkResult({ created, alreadyHadLogin, profilesFilled, noJobNumber });
  }

  function liveStatusFor(member) {
    const activeBreak = breaks.find((b) => b.staff_id === member.id && ["approved", "active"].includes(b.status) && !b.ended_at);
    if (activeBreak) return "on_break";
    const coveringSession = breaks.find((b) => b.covering_staff_id === member.id && ["approved", "active"].includes(b.status) && !b.ended_at);
    if (coveringSession) return "covering";

    const shiftByCode = {};
    shifts.forEach((s) => { shiftByCode[s.code] = s; });
    const today = todayISO(), yesterday = yesterdayISO();
    const tEntry = scheduleEntries.find((e) => e.staff_id === member.id && e.date === today);
    const tShift = tEntry ? shiftByCode[tEntry.shift_code] : null;
    if (tShift && isWithinShift(tShift, today, now)) return "on_duty";
    const yEntry = scheduleEntries.find((e) => e.staff_id === member.id && e.date === yesterday);
    const yShift = yEntry ? shiftByCode[yEntry.shift_code] : null;
    if (yShift?.night_shift && isWithinShift(yShift, yesterday, now)) return "on_duty";
    return "off_duty";
  }

  // Who's about to start their shift today, soonest first.
  function comingUp() {
    const shiftByCode = {};
    shifts.forEach((s) => { shiftByCode[s.code] = s; });
    const today = todayISO();
    const list = [];
    (staff || []).forEach((m) => {
      if (liveStatusFor(m) === "on_duty") return; // already here
      const entry = scheduleEntries.find((e) => e.staff_id === m.id && e.date === today);
      const shift = entry ? shiftByCode[entry.shift_code] : null;
      if (!shift || shift.is_off || !shift.start_time) return;
      const [h, min] = shift.start_time.split(":").map(Number);
      const startsAt = new Date(now);
      startsAt.setHours(h, min, 0, 0);
      if (startsAt <= now) return; // already started or passed
      list.push({ name: m.full_name, code: shift.code, startsAt });
    });
    return list.sort((a, b) => a.startsAt - b.startsAt);
  }

  if (staff === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const upcoming = comingUp();

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Staff</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>The employee roster, who's here right now, and who's coming up next.</div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>LIVE STATUS — {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {staff.map((m) => {
          const status = liveStatusFor(m);
          const meta = STATUS_META[status];
          return (
            <span key={m.id} style={{ fontSize: 12.5, fontWeight: 600, background: meta.bg, color: meta.fg, padding: "5px 10px", borderRadius: 6 }}>{meta.emoji} {m.full_name}</span>
          );
        })}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>COMING UP NEXT</div>
      {upcoming.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A9694", marginBottom: 20 }}>Nobody has an upcoming shift starting later today.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {upcoming.map((u, i) => {
            const mins = Math.round((u.startsAt - now) / 60000);
            const inLabel = mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                <div style={{ flex: 1, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: "#8A9694" }}>{u.code}</div>
                <div style={{ fontSize: 12, color: "#0F7173", fontWeight: 700 }}>{u.startsAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ({inLabel})</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>ROSTER</div>
      {canEdit && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={createLoginsForEveryone} disabled={bulkBusy} style={{ background: "none", border: "1px dashed #0F7173", color: "#0F7173", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, opacity: bulkBusy ? 0.6 : 1 }}>
            <UserPlus size={14} /> {bulkBusy ? "Creating…" : "Create logins for everyone"}
          </button>
          {bulkResult && (
            <div style={{ marginTop: 8, background: "#E8F2EC", border: "1px solid #2F6B4F33", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#2F6B4F" }}>
              ✅ {bulkResult.created} new login{bulkResult.created === 1 ? "" : "s"} created · {bulkResult.profilesFilled} profile{bulkResult.profilesFilled === 1 ? "" : "s"} filled in
              {bulkResult.alreadyHadLogin > 0 && ` · ${bulkResult.alreadyHadLogin} already had a login`}
              {bulkResult.noJobNumber > 0 && <div style={{ color: "#B8860B", marginTop: 4 }}>⚠ {bulkResult.noJobNumber} employee{bulkResult.noJobNumber === 1 ? "" : "s"} skipped — no job number on the roster yet.</div>}
            </div>
          )}
        </div>
      )}
      {canEdit && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} style={{ ...inputStyle, flex: 2, minWidth: 140 }} />
            <input placeholder="Job number" value={form.job_number} onChange={(e) => setForm((f) => ({ ...f, job_number: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
            <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
              {(departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={addStaff} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
          </div>
          <div style={{ marginTop: 10, borderTop: "1px solid #EEF2F0", paddingTop: 10 }}>
            <StaffImport departments={departments} onApply={addStaffBulk} />
          </div>
        </div>
      )}

      {staff.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No employees added yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {staff.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
              {canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <button onClick={() => moveStaff(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? "#D6DEDB" : "#516361", padding: 0, cursor: i === 0 ? "default" : "pointer" }}><ChevronUp size={14} /></button>
                  <button onClick={() => moveStaff(i, 1)} disabled={i === staff.length - 1} style={{ background: "none", border: "none", color: i === staff.length - 1 ? "#D6DEDB" : "#516361", padding: 0, cursor: i === staff.length - 1 ? "default" : "pointer" }}><ChevronDown size={14} /></button>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.full_name}</div>
                <div style={{ fontSize: 11.5, color: "#8A9694" }}>{s.job_number ? `#${s.job_number} · ` : ""}{s.department}</div>
              </div>
              {canEdit && <button onClick={() => removeStaff(s.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
