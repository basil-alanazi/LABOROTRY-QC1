import React, { useState, useEffect, useMemo } from "react";
import { Download, Coffee, Check, X } from "lucide-react";
import { supabase } from "./supabaseClient";
import { shiftDurationHours, isWithinShift, todayISO, yesterdayISO, formatTime12, classifyShift } from "./scheduleUtils";
import DateNav from "./DateNav";
import ScheduleImport from "./ScheduleImport";
import { loadProfilesMap } from "./userProfiles";
import { downloadTableAsWord } from "./exportWord";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function weekdayShort(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

const STATUS_META = {
  on_duty: { emoji: "🟢", label: "On Duty", bg: "#E8F2EC", fg: "#2F6B4F" },
  on_break: { emoji: "🟡", label: "On Break", bg: "#FBF3DF", fg: "#B8860B" },
  covering: { emoji: "🟣", label: "Covering", bg: "#F1E9F8", fg: "#7A4FA3" },
  vacation: { emoji: "🔵", label: "Vacation", bg: "#E7F0FB", fg: "#3E6ACF" },
  off_duty: { emoji: "⚫", label: "Off Duty", bg: "#F0F3F2", fg: "#516361" },
};

export default function Schedule({ departments, role, username }) {
  const [myStaffId, setMyStaffId] = useState(null);
  const [staff, setStaff] = useState(null);
  const [shifts, setShifts] = useState(null);
  const [entries, setEntries] = useState(null);
  const [breaks, setBreaks] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [now, setNow] = useState(new Date());
  const canEdit = role === "admin" || role === "super";

  async function loadAll() {
    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false).order("code");
    const { data: e } = await supabase.from("schedule_entries").select("*");
    const { data: b } = await supabase.from("break_sessions").select("*").in("date", [todayISO(), yesterdayISO()]);
    setStaff(s || []);
    setShifts(sh || []);
    setEntries(e || []);
    setBreaks(b || []);

    const profiles = await loadProfilesMap();
    const myProfile = profiles[username];
    if (myProfile?.employee_id) {
      const mine = (s || []).find((m) => m.job_number && m.job_number === myProfile.employee_id);
      setMyStaffId(mine ? mine.id : null);
    } else {
      setMyStaffId(null);
    }
  }
  useEffect(() => { loadAll(); }, []);

  // Polling: refresh live data + clock every 60s.
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); loadAll(); }, 60000);
    return () => clearInterval(t);
  }, []);

  const shiftByCode = useMemo(() => {
    const map = {};
    (shifts || []).forEach((s) => { map[s.code] = s; });
    return map;
  }, [shifts]);

  function entryFor(staffId, date) {
    return (entries || []).find((e) => e.staff_id === staffId && e.date === date);
  }

  async function setCell(staffId, date, code) {
    const existing = entryFor(staffId, date);
    if (existing) {
      await supabase.from("schedule_entries").update({ shift_code: code }).eq("id", existing.id);
    } else if (code) {
      await supabase.from("schedule_entries").insert({ staff_id: staffId, date, shift_code: code });
    }
    loadAll();
  }

  async function importScheduleEntries(parsedEntries) {
    const [year, mo] = month.split("-");
    const rows = parsedEntries.map((e) => ({
      staff_id: e.staffId,
      date: `${year}-${mo}-${String(e.day).padStart(2, "0")}`,
      shift_code: e.shift_code || "",
    }));
    await supabase.from("schedule_entries").upsert(rows, { onConflict: "staff_id,date" });
    loadAll();
  }

  // ---------- Live status + break management ----------

  function liveStatusFor(member) {
    const activeBreak = (breaks || []).find((b) => b.staff_id === member.id && ["approved", "active"].includes(b.status) && !b.ended_at);
    if (activeBreak) return { key: "on_break", session: activeBreak };
    const coveringSession = (breaks || []).find((b) => b.covering_staff_id === member.id && ["approved", "active"].includes(b.status) && !b.ended_at);
    if (coveringSession) return { key: "covering", session: coveringSession };

    const today = todayISO();
    const yesterday = yesterdayISO();
    const todayEntry = entryFor(member.id, today);
    const todayShift = todayEntry ? shiftByCode[todayEntry.shift_code] : null;
    if (todayShift?.code === "V.C") return { key: "vacation" };
    if (todayShift && isWithinShift(todayShift, today, now)) return { key: "on_duty", shift: todayShift };

    const yEntry = entryFor(member.id, yesterday);
    const yShift = yEntry ? shiftByCode[yEntry.shift_code] : null;
    if (yShift?.night_shift && isWithinShift(yShift, yesterday, now)) return { key: "on_duty", shift: yShift };

    return { key: "off_duty" };
  }

  async function requestBreak(staffId, coveringStaffId, durationMinutes) {
    await supabase.from("break_sessions").insert({
      staff_id: staffId, covering_staff_id: coveringStaffId, duration_minutes: durationMinutes,
      status: "pending", requested_by: username, date: todayISO(),
    });
    loadAll();
  }
  async function approveBreak(session) {
    await supabase.from("break_sessions").update({ status: "approved", approved_by: username, approved_at: new Date().toISOString(), started_at: new Date().toISOString() }).eq("id", session.id);
    loadAll();
  }
  async function declineBreak(session) {
    await supabase.from("break_sessions").update({ status: "declined" }).eq("id", session.id);
    loadAll();
  }
  async function endBreak(session) {
    await supabase.from("break_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session.id);
    loadAll();
  }

  // ---------- Monthly summary ----------

  function summaryFor(member) {
    const monthEntries = (entries || []).filter((e) => e.staff_id === member.id && e.date.startsWith(month));
    let working = 0, off = 0, vacation = 0, totalHours = 0, nightShifts = 0;
    monthEntries.forEach((e) => {
      const s = shiftByCode[e.shift_code];
      if (!s) return;
      if (s.code === "OFF") off++;
      else if (s.code === "V.C") vacation++;
      else {
        working++;
        totalHours += s.total_hours || 0;
        if (s.night_shift) nightShifts++;
      }
    });
    return { working, off, vacation, totalHours: Math.round(totalHours * 100) / 100, nightShifts };
  }

  function exportPDF() { window.print(); }

  function exportWord() {
    const headers = ["Day", ...staff.map((m) => m.full_name)];
    const rows = dayList.map((day) => {
      const dateStr = `${year}-${mo}-${String(day).padStart(2, "0")}`;
      return [day, ...staff.map((m) => entryFor(m.id, dateStr)?.shift_code || "")];
    });
    downloadTableAsWord(`Schedule — ${month}`, headers, rows, `schedule-${month}`);
  }

  if (staff === null || shifts === null || entries === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const days = daysInMonth(month);
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const [year, mo] = month.split("-");
  const pendingForMe = (breaks || []).filter((b) => b.status === "pending");

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Schedule</h2>
        <button onClick={exportPDF} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Save as PDF</button>
        <button onClick={exportWord} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>📄 Download Word</button>
      </div>

      {/* Live status */}
      <div className="no-print" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>LIVE STATUS — {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {staff.map((m) => {
            const live = liveStatusFor(m);
            const meta = STATUS_META[live.key];
            return (
              <div key={m.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "8px 12px", minWidth: 150 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{m.full_name}</div>
                <div style={{ fontSize: 11, color: meta.fg, background: meta.bg, display: "inline-block", padding: "2px 7px", borderRadius: 5, marginTop: 3, fontWeight: 700 }}>{meta.emoji} {meta.label}</div>
                {live.key === "on_duty" && (role === "admin" || role === "super" || m.id === myStaffId) && (
                  <StartBreakButton member={m} staff={staff} liveStatusFor={liveStatusFor} onRequest={requestBreak} />
                )}
                {live.key === "on_break" && live.session.requested_by === username && (
                  <button onClick={() => endBreak(live.session)} style={{ display: "block", marginTop: 6, background: "none", border: "1px solid #C7D1CE", borderRadius: 5, padding: "4px 8px", fontSize: 11 }}>End break</button>
                )}
              </div>
            );
          })}
        </div>

        {pendingForMe.filter((b) => role === "admin" || role === "super" || b.covering_staff_id === myStaffId).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#B8860B", marginBottom: 6 }}>PENDING BREAK REQUESTS</div>
            {pendingForMe.filter((b) => role === "admin" || role === "super" || b.covering_staff_id === myStaffId).map((b) => {
              const person = staff.find((s) => s.id === b.staff_id);
              const cover = staff.find((s) => s.id === b.covering_staff_id);
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF3DF", borderRadius: 7, padding: "8px 12px", marginBottom: 6, fontSize: 12.5 }}>
                  <div style={{ flex: 1 }}>{person?.full_name} wants a {b.duration_minutes}min break — {cover?.full_name} to cover</div>
                  <button onClick={() => approveBreak(b)} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px" }}><Check size={12} /></button>
                  <button onClick={() => declineBreak(b)} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px" }}><X size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shift headcount — pick any date + period, see who's in it and when they leave */}
      <ShiftHeadcount staff={staff} shifts={shifts} entries={entries} />

      <div className="no-print" style={{ marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
        {canEdit && staff.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <ScheduleImport staff={staff} month={month} onApply={importScheduleEntries} />
          </div>
        )}
      </div>

      {staff.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>Add employees on the Staff page first.</div>
      ) : (
        <div className="print-area" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#1B4F72", color: "#fff", padding: "8px 10px", minWidth: 80, borderBottom: "1px solid #E1E8E5", borderRight: "2px solid #0F3A57" }}>Day</th>
                {staff.map((m) => (
                  <th key={m.id} style={{ padding: "8px 6px", background: "#1B4F72", color: "#fff", borderBottom: "1px solid #E1E8E5", borderRight: "2px solid #0F3A57", minWidth: 78, fontSize: 10.5 }}>
                    <div style={{ fontWeight: 700 }}>{m.full_name}</div>
                    {m.job_number && <div style={{ fontWeight: 400, color: "#C9D9E8", fontSize: 9.5 }}>#{m.job_number}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayList.map((d) => {
                const dateStr = `${year}-${mo}-${String(d).padStart(2, "0")}`;
                const weekday = weekdayShort(dateStr);
                const isFriday = weekday === "Fri";
                return (
                  <tr key={d} style={{ background: isFriday ? "#F3ECE0" : "transparent" }}>
                    <td style={{ position: "sticky", left: 0, background: isFriday ? "#F3ECE0" : "#fff", padding: "3px 8px", fontWeight: 600, borderBottom: "1px solid #9CA8AC", borderRight: "2px solid #516361" }}>{d} {weekday}</td>
                    {staff.map((m) => {
                      const entry = entryFor(m.id, dateStr);
                      const shift = entry ? shiftByCode[entry.shift_code] : null;
                      const hasShift = !!(entry?.shift_code && shift);
                      return (
                        <td key={m.id} style={{ padding: 2, textAlign: "center", borderBottom: "1px solid #9CA8AC", borderRight: "1px solid #C7D1CE", background: hasShift ? shift.color : "transparent" }}>
                          {canEdit ? (
                            <input
                              list="shift-code-suggestions"
                              defaultValue={entry?.shift_code || ""}
                              onBlur={(ev) => ev.target.value !== (entry?.shift_code || "") && setCell(m.id, dateStr, ev.target.value.toUpperCase())}
                              className="no-print"
                              style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 10.5, color: hasShift ? "#fff" : "#1B2B2E", width: "100%", textAlign: "center", padding: "4px 2px" }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: 10.5, color: hasShift ? "#fff" : "#1B2B2E" }}>{entry?.shift_code || ""}</span>
                          )}
                          <span className="print-only" style={{ display: "none", fontWeight: 700, fontSize: 10.5, color: hasShift ? "#fff" : "#1B2B2E" }}>{entry?.shift_code || ""}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot />
          </table>
        </div>
      )}

      <datalist id="shift-code-suggestions">
        {shifts.map((s) => <option key={s.code} value={s.code} />)}
      </datalist>

      {/* Shift key */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>SHIFT KEY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shifts.map((s) => (
            <span key={s.id} style={{ fontSize: 11, fontWeight: 700, background: s.color, color: "#fff", padding: "4px 9px", borderRadius: 6 }}>
              {s.code} — {s.is_off ? s.name : `${formatTime12(s.start_time)}–${formatTime12(s.end_time)}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StartBreakButton({ member, staff, liveStatusFor, onRequest }) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(15);
  const [coverId, setCoverId] = useState("");

  const candidates = staff.filter((s) => s.id !== member.id && liveStatusFor(s).key === "on_duty");

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, background: "none", border: "1px solid #C7D1CE", borderRadius: 5, padding: "4px 8px", fontSize: 11 }}><Coffee size={11} /> Start break</button>;
  }
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ ...inputStyle, padding: "4px 6px", fontSize: 11 }}>
        <option value={15}>15 min</option>
        <option value={30}>30 min</option>
        <option value={45}>45 min</option>
        <option value={60}>60 min</option>
      </select>
      <select value={coverId} onChange={(e) => setCoverId(e.target.value)} style={{ ...inputStyle, padding: "4px 6px", fontSize: 11 }}>
        <option value="">Who covers?</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </select>
      <div style={{ display: "flex", gap: 4 }}>
        <button disabled={!coverId} onClick={() => { onRequest(member.id, coverId, duration); setOpen(false); }} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, opacity: coverId ? 1 : 0.5 }}>Request</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#8A9694", fontSize: 11 }}>Cancel</button>
      </div>
    </div>
  );
}

// Pick any date + period, see the headcount and who's in it — including future
// dates already filled in on the schedule, and each person's shift end time.
function ShiftHeadcount({ staff, shifts, entries }) {
  const [date, setDate] = useState(todayISO());
  const [period, setPeriod] = useState("morning");

  const shiftByCode = {};
  (shifts || []).forEach((s) => { shiftByCode[s.code] = s; });

  const inPeriod = (staff || []).map((m) => {
    const entry = (entries || []).find((e) => e.staff_id === m.id && e.date === date);
    const shift = entry ? shiftByCode[entry.shift_code] : null;
    return { member: m, shift, matches: shift && classifyShift(shift) === period };
  }).filter((x) => x.matches)
    .sort((a, b) => (a.shift.start_time || "").localeCompare(b.shift.start_time || ""));

  return (
    <div className="no-print" style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>SHIFT HEADCOUNT</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <DateNav value={date} onChange={setDate} />
        <div style={{ display: "flex", gap: 4 }}>
          {["morning", "evening", "night"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{ border: "1px solid " + (period === p ? "#0F7173" : "#C7D1CE"), background: period === p ? "#0F7173" : "#fff", color: period === p ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, textTransform: "capitalize" }}
            >
              {p === "morning" ? "☀️" : p === "evening" ? "🌙" : "🌃"} {p}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F7173" }}>{inPeriod.length} people</div>
      </div>

      {inPeriod.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A9694" }}>Nobody scheduled for {period} on {date}.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {inPeriod.map(({ member, shift }) => (
            <div key={member.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "8px 12px", minWidth: 160 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{member.full_name}</div>
              <div style={{ fontSize: 11, color: "#8A9694" }}>{shift.code} · leaves {formatTime12(shift.end_time)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
