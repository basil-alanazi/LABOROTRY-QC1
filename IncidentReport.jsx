import React from "react";
import RecordModule from "./RecordModule";

export default function IncidentReport({ role, username }) {
  return (
    <RecordModule
      table="incident_reports"
      moduleKey="incident"
      title="Incident Report"
      description="Anything unusual that happened in the lab — equipment issue, safety concern, sample mix-up, near-miss, etc."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "time", label: "Time", type: "text" },
        { key: "shift", label: "Shift", type: "select", options: ["morning", "evening", "night"] },
        { key: "department", label: "Department", type: "text" },
        { key: "incident_type", label: "Incident Type", type: "select", options: ["equipment", "safety", "sample", "documentation", "near-miss", "other"] },
        { key: "description", label: "What happened", type: "text" },
        { key: "immediate_action", label: "Immediate action taken", type: "text" },
        { key: "reported_by", label: "Reported by", type: "text" },
        { key: "severity", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"] },
        { key: "status", label: "Status", type: "select", options: ["open", "under review", "closed"] },
      ]}
    />
  );
}
