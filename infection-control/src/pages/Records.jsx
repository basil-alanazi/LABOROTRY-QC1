import { useState } from "react";
import WardRoundRecords from "./ward-round/WardRoundRecords.jsx";
import HandHygieneRecords from "./hand-hygiene/HandHygieneRecords.jsx";

const TABS = [
  { key: "ward-round", label: "Ward Round" },
  { key: "hand-hygiene", label: "Hand Hygiene" },
];

export default function Records() {
  const [tab, setTab] = useState("ward-round");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ward-round" ? <WardRoundRecords /> : <HandHygieneRecords />}
    </div>
  );
}
