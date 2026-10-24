import { useState } from "react";
import { Activity, Droplet, Home as HomeIcon, LineChart, NotebookPen, Pill, Plus, Syringe, Users, Utensils, X } from "lucide-react";

const TABS = [
  ["home", "الرئيسية", HomeIcon],
  ["record", "التقارير", LineChart],
  null, // زر +
  ["diet", "الحمية", Utensils],
  ["account", "العائلة", Users],
];

// الشريط تحت + قائمة "وش تبي تسجل"
export default function BottomNav({ page, go, patient }) {
  const [sheet, setSheet] = useState(false);
  const options = [
    ["sugar", "قراءة سكر", Droplet],
    ["vitals", "ضغط ونبض", Activity],
    ...(patient?.uses_insulin ? [["sugar", "جرعة إنسولين", Syringe]] : []),
    ["meds", "دواء", Pill],
    ["diet", "وجبة", Utensils],
    ["notes", "ملاحظة", NotebookPen],
  ];

  return (
    <>
      <nav className="r-nav">
        {TABS.map((t) => t ? (
          <button key={t[0]} className={page === t[0] ? "on" : ""} onClick={() => page !== t[0] && go(t[0])}>
            {(() => { const Icon = t[2]; return <Icon size={22} />; })()}{t[1]}
          </button>
        ) : (
          <button key="plus" className="r-plus" onClick={() => setSheet(true)} aria-label="سجّل"><Plus size={26} strokeWidth={2.6} /></button>
        ))}
      </nav>
      {sheet && (
        <div className="r-sheet-bg" onClick={() => setSheet(false)}>
          <div className="r-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="r-sheet-head"><b>وش تبي تسجل لـ{patient?.name}؟</b><button onClick={() => setSheet(false)} aria-label="إغلاق"><X size={20} /></button></div>
            <div className="r-sheet-grid">
              {options.map(([to, label, Icon]) => (
                <button key={label} onClick={() => { setSheet(false); go(to); }}><span><Icon size={24} /></span>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
