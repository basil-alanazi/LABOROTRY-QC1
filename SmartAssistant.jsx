import React, { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";
import { supabase } from "./supabaseClient";
import { isWithinShift, todayISO, yesterdayISO } from "./scheduleUtils";

export default function SmartAssistant({ panels, entries }) {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! Ask me things like \"last QC for glucose\", \"who's working today\", or \"equipment faults\"." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function answer(question) {
    const q = question.toLowerCase();

    // Who's working / on duty today
    if (/(who'?s working|who is working|on duty|working today|staffed today)/.test(q)) {
      const { data: staff } = await supabase.from("staff_members").select("*").eq("deleted", false);
      const { data: shifts } = await supabase.from("shift_templates").select("*").eq("deleted", false);
      const { data: sched } = await supabase.from("schedule_entries").select("*").in("date", [todayISO(), yesterdayISO()]);
      const shiftByCode = {};
      (shifts || []).forEach((s) => { shiftByCode[s.code] = s; });
      const now = new Date();
      const onDuty = [];
      (staff || []).forEach((m) => {
        const tEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === todayISO());
        const tShift = tEntry ? shiftByCode[tEntry.shift_code] : null;
        if (tShift && isWithinShift(tShift, todayISO(), now)) { onDuty.push(`${m.full_name} (${tShift.code})`); return; }
        const yEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === yesterdayISO());
        const yShift = yEntry ? shiftByCode[yEntry.shift_code] : null;
        if (yShift?.night_shift && isWithinShift(yShift, yesterdayISO(), now)) onDuty.push(`${m.full_name} (${yShift.code})`);
      });
      return onDuty.length ? `On duty right now: ${onDuty.join(", ")}.` : "Nobody is showing as on duty right now — check the Schedule page.";
    }

    // Equipment faults
    if (/(fault|broken|equipment issue|maintenance due)/.test(q)) {
      const { data: ev } = await supabase.from("equipment_events").select("*, equipment(name)").eq("deleted", false).eq("event_type", "fault").eq("resolved", false);
      if (!ev || ev.length === 0) return "No open equipment faults right now. ✅";
      return `Open faults: ${ev.map((e) => `${e.equipment?.name || "device"} — ${e.description}`).join("; ")}.`;
    }

    // Last QC for an analyte
    const analyteMatch = findAnalyteMention(q, panels);
    if (analyteMatch) {
      const { panel, analyteName } = analyteMatch;
      const withValue = entries
        .filter((e) => e.panel_id === panel.id && e.values?.[analyteName] !== undefined)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (!withValue) return `No QC results logged yet for ${analyteName} on ${panel.name}.`;
      const color = withValue.colors?.[analyteName] || "pending";
      return `Last QC for ${analyteName} (${panel.name}): ${withValue.values[analyteName]} on ${withValue.date}, status ${color.toUpperCase()}.`;
    }

    return "I couldn't quite match that. Try: \"last QC for [analyte]\", \"who's working today\", or \"equipment faults\".";
  }

  function findAnalyteMention(q, panels) {
    const candidates = [];
    for (const p of panels) {
      for (const a of p.analytes || []) {
        const name = a.name.toLowerCase().trim();
        if (!name) continue;
        // Whole-word match only — "troponin" must not match inside "uric acid",
        // and short names (like "na", "k") must not match random letters in other words.
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
        if (re.test(q)) candidates.push({ panel: p, analyteName: a.name, matchLength: name.length });
      }
    }
    if (candidates.length === 0) return null;
    // If several analyte names appear in the question, trust the longest/most specific one.
    candidates.sort((x, y) => y.matchLength - x.matchLength);
    return candidates[0];
  }

  async function send() {
    if (!input.trim() || busy) return;
    const question = input.trim();
    setMessages((m) => [...m, { from: "user", text: question }]);
    setInput("");
    setBusy(true);
    const reply = await answer(question);
    setMessages((m) => [...m, { from: "bot", text: reply }]);
    setBusy(false);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Assistant</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Ask about recent QC results, who's on duty, or equipment status. No internet AI involved — this reads live data straight from your system.</div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, display: "flex", flexDirection: "column", height: 440 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", maxWidth: "80%", display: "flex", gap: 6, alignItems: "flex-start" }}>
              {m.from === "bot" && <Bot size={16} color="#0F7173" style={{ marginTop: 4, flexShrink: 0 }} />}
              <div style={{ background: m.from === "user" ? "#0F7173" : "#F0F3F2", color: m.from === "user" ? "#fff" : "#1B2B2E", padding: "8px 12px", borderRadius: 10, fontSize: 13 }}>{m.text}</div>
            </div>
          ))}
          {busy && <div style={{ fontSize: 12, color: "#8A9694" }}>thinking…</div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #EEF2F0" }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="e.g. last QC for glucose"
            style={{ flex: 1, border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14 }}
          />
          <button onClick={send} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px" }}><Send size={15} /></button>
        </div>
      </div>
    </div>
  );
}
