import { useState } from "react";
import WardRoundEntry from "./ward-round/WardRoundEntry.jsx";
import HandHygieneEntry from "./hand-hygiene/HandHygieneEntry.jsx";

const TABS = [
  { key: "ward-round", label: "Ward Round", title: "Daily Ward Round", desc: "Record one patient audit against one checklist on one date." },
  { key: "hand-hygiene", label: "Hand Hygiene", title: "Daily Hand Hygiene", desc: "Record hand hygiene observations by department and observer." },
];

export default function DailyEntry() {
  const [tab, setTab] = useState("ward-round");
  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{active.title}</h1>
          <p className="text-sm text-slate-500">{active.desc}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
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
      </div>

      {tab === "ward-round" ? <WardRoundEntry /> : <HandHygieneEntry />}
    </div>
  );
}
