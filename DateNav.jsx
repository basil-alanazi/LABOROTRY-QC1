import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDate } from "./scheduleUtils";

const btnStyle = { background: "#fff", border: "1px solid #C7D1CE", borderRadius: 7, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#516361" };
const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

export default function DateNav({ value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => onChange(shiftDate(value, -1))} style={btnStyle} title="Previous day"><ChevronLeft size={16} /></button>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      <button onClick={() => onChange(shiftDate(value, 1))} style={btnStyle} title="Next day"><ChevronRight size={16} /></button>
    </div>
  );
}
