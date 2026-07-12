import React from "react";
import RecordModule from "./RecordModule";

export default function CAPA({ role, username }) {
  return (
    <RecordModule
      table="capa_records"
      moduleKey="capa"
      title="CAPA"
      description="Corrective & Preventive Actions — root cause, what fixed it, and what stops it happening again."
      role={role} username={username}
      fields={[
        { key: "date_opened", label: "Date Opened", type: "date" },
        { key: "source", label: "Source", type: "select", options: ["audit", "incident", "QC failure", "complaint", "other"] },
        { key: "issue_description", label: "Issue", type: "text" },
        { key: "root_cause", label: "Root Cause", type: "text" },
        { key: "corrective_action", label: "Corrective Action", type: "text" },
        { key: "preventive_action", label: "Preventive Action", type: "text" },
        { key: "responsible_person", label: "Responsible", type: "text" },
        { key: "due_date", label: "Due Date", type: "date" },
        { key: "verification_method", label: "How it was verified", type: "text" },
        { key: "status", label: "Status", type: "select", options: ["open", "in progress", "verified", "closed"] },
        { key: "closed_date", label: "Closed Date", type: "date" },
      ]}
    />
  );
}
