import React from "react";
import RecordModule from "./RecordModule";

export default function ShiftHandover({ role, username }) {
  return (
    <RecordModule
      table="shift_handovers"
      moduleKey="handover"
      title="Daily Shift Handover"
      description="What the outgoing shift needs the incoming shift to know — pending samples, equipment issues, anything unfinished."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "shift", label: "Shift", type: "select", options: ["morning", "evening", "night"] },
        { key: "department", label: "Department", type: "text" },
        { key: "handover_by", label: "Handover By", type: "text" },
        { key: "received_by", label: "Received By", type: "text" },
        { key: "time", label: "Time", type: "text" },
        { key: "pending_work", label: "Pending / unfinished work", type: "text" },
        { key: "equipment_notes", label: "Equipment notes", type: "text" },
        { key: "incidents", label: "Incidents to flag", type: "text" },
        { key: "other_notes", label: "Other notes", type: "text" },
      ]}
    />
  );
}
