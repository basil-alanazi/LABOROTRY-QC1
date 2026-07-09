import React from "react";
import RecordModule from "./RecordModule";

export default function PanicValue({ role, username }) {
  return (
    <RecordModule
      table="panic_values"
      moduleKey="panic"
      title="Panic Value"
      description="Critical results and physician notification tracking."
      role={role} username={username}
      fields={[
        { key: "date", label: "Date", type: "date" },
        { key: "patient_id", label: "Patient ID", type: "text" },
        { key: "test_name", label: "Test", type: "text" },
        { key: "result", label: "Result", type: "text" },
        { key: "panic_range", label: "Panic Range", type: "text" },
        { key: "physician_notified", label: "Physician Notified", type: "text" },
        { key: "notified_by", label: "Notified By", type: "text" },
        { key: "time_notified", label: "Time Notified", type: "text" },
        { key: "notes", label: "Notes", type: "text" },
      ]}
    />
  );
}
