import React from "react";
import RecordModule from "./RecordModule";

export default function InfectionDisease({ role, username }) {
  return (
    <RecordModule
      table="infection_diseases"
      moduleKey="infection"
      title="Infection Disease"
      description="Infection cases, isolation status, and follow-up. Add your own fields anytime with the + Field button."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "patient_id", label: "Patient ID", type: "text" },
        { key: "infection_type", label: "Infection Type", type: "text" },
        { key: "ward_department", label: "Ward/Department", type: "text" },
        { key: "isolation_status", label: "Isolation Status", type: "text" },
        { key: "reported_by", label: "Reported By", type: "text" },
        { key: "action_taken", label: "Action Taken", type: "text" },
        { key: "status", label: "Status", type: "select", options: ["active", "resolved"] },
      ]}
    />
  );
}
