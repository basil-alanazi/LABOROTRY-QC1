import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Languages } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/i18n.jsx";
import rabiaLogo from "../../assets/rabia-logo.jpg";

// Public — reached by scanning a department's test QR (printed from the IC
// Knowledge Test page). The employee types their employee number and is
// sent to their own test page, the same one their badge QR opens.
export default function StartIcTest() {
  const { department } = useParams();
  const navigate = useNavigate();
  const { t, toggleLang, lang } = useLanguage();
  const [employeeNo, setEmployeeNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const no = employeeNo.trim();
    if (!no) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase
      .from("employees")
      .select("id, department, active")
      .eq("employee_no", no)
      .eq("department", department);
    setBusy(false);
    const emp = (data ?? []).find((r) => r.active !== false);
    if (err || !emp) {
      setError(t("Employee number not found in this department. Check the number or contact Infection Control."));
      return;
    }
    navigate(`/employee-test/${emp.id}`, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-end">
          <button onClick={toggleLang} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <Languages className="h-4 w-4" />
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <img src={rabiaLogo} alt="Rabia Hospital" className="h-16 w-auto object-contain" />
          <h1 className="text-lg font-bold text-slate-800">{t("IC Knowledge Test")}</h1>
          <p className="text-sm capitalize text-slate-500">{department}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">{t("Employee No.")}</span>
            <input className="input" inputMode="numeric" autoFocus value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !employeeNo.trim()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {busy ? t("Checking...") : t("Start")}
          </button>
        </form>
      </div>
    </div>
  );
}
