import HandHygieneEntry from "./hand-hygiene/HandHygieneEntry.jsx";

export default function DailyEntry() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Daily Hand Hygiene</h1>
        <p className="text-sm text-slate-500">Record hand hygiene observations by department and observer.</p>
      </div>

      <HandHygieneEntry />
    </div>
  );
}
