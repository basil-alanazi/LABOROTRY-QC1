import React from "react";
import RecordModule from "./RecordModule";

export default function CorrectiveAction({ role, username }) {
  return (
    <RecordModule
      table="corrective_actions"
      title="Corrective Action"
      description="Issues found, root cause, and what was done to fix them."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "issue_description", label: "Issue", type: "text" },
        { key: "root_cause", label: "Root Cause", type: "text" },
        { key: "corrective_action", label: "Corrective Action", type: "text" },
        { key: "responsible_person", label: "Responsible", type: "text" },
        { key: "status", label: "Status", type: "select", options: ["open", "closed"] },
        { key: "follow_up_date", label: "Follow-up Date", type: "date" },
      ]}
    />
  );
}
