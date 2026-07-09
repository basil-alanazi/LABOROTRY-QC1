import React from "react";
import RecordModule from "./RecordModule";

export default function RejectSample({ role, username }) {
  return (
    <RecordModule
      table="reject_samples"
      moduleKey="reject"
      title="Reject Sample"
      description="Every rejected sample — reason, who rejected it, and what was done."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "sample_id", label: "Sample ID", type: "text" },
        { key: "test_name", label: "Test", type: "text" },
        { key: "department", label: "Department", type: "text" },
        { key: "reason", label: "Reason", type: "text" },
        { key: "rejected_by", label: "Rejected By", type: "text" },
        { key: "action_taken", label: "Action Taken", type: "text" },
      ]}
    />
  );
}
