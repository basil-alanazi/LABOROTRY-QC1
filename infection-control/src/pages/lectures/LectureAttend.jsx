import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/dates";
import { useEnglishOnlyPage } from "../ic-test/englishOnly";
import SignaturePad from "../../components/SignaturePad";
import rabiaLogo from "../../assets/rabia-logo.jpg";

const BUCKET = "tracker-attachments";

// Public — opened by scanning a lecture's attendance QR. The staff member
// enters their employee number (their name and department fill in from the
// employee list), signs, and their attendance is saved for that lecture.
export default function LectureAttend() {
  const { lectureId } = useParams();
  useEnglishOnlyPage();
  const signatureRef = useRef(null);
  const [lecture, setLecture] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase
      .from("lectures")
      .select("id, title, presenter, lecture_date, location, deleted")
      .eq("id", lectureId)
      .then(({ data, error: err }) => {
        const l = (data ?? [])[0];
        if (err || !l || l.deleted) setLoadError("This attendance link is not valid. Please ask Infection Control for the current QR code.");
        else setLecture(l);
      });
  }, [lectureId]);

  async function lookUp() {
    const no = employeeNo.trim();
    setFound(false);
    if (!no) return;
    const { data } = await supabase.from("employees").select("name, department, active").eq("employee_no", no);
    const emp = (data ?? []).find((r) => r.active !== false) || (data ?? [])[0];
    if (emp) {
      setName(emp.name || "");
      setDepartment(emp.department || "");
      setFound(true);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const no = employeeNo.trim();
    if (!no) return setError("Enter your employee number.");
    if (!name.trim()) return setError("Enter your name.");
    if (!signatureRef.current?.hasSignature()) return setError("Please sign in the box.");
    setBusy(true);
    try {
      const blob = await signatureRef.current.toBlob();
      const path = `lecture-signatures/${lectureId}/${no.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("lecture_attendance").insert({
        lecture_id: lectureId,
        employee_no: no,
        employee_name: name.trim(),
        department: department.trim(),
        signature_path: path,
      });
      if (insErr) {
        if (/unique|duplicate|23505/i.test(insErr.message || insErr.code || "")) {
          setError("Your attendance for this lecture is already recorded.");
          return;
        }
        throw insErr;
      }
      setDone(true);
    } catch (err) {
      setError("Could not save your attendance: " + (err.message || "please try again"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <img src={rabiaLogo} alt="Rabia Hospital" className="h-16 w-auto object-contain" />
          <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Lecture Attendance</p>
          {lecture && (
            <>
              <h1 className="text-lg font-bold text-slate-800">{lecture.title}</h1>
              <p className="text-sm text-slate-500">
                {fmtDate(lecture.lecture_date)}
                {lecture.presenter ? ` · ${lecture.presenter}` : ""}
                {lecture.location ? ` · ${lecture.location}` : ""}
              </p>
            </>
          )}
        </div>

        {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

        {done && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="text-lg font-semibold text-slate-800">Attendance recorded</p>
            <p className="text-sm text-slate-500">Thank you, {name}.</p>
          </div>
        )}

        {lecture && !done && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Employee No.</span>
              <input
                className="input"
                inputMode="numeric"
                autoFocus
                value={employeeNo}
                onChange={(e) => {
                  setEmployeeNo(e.target.value);
                  setFound(false);
                }}
                onBlur={lookUp}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} readOnly={found} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Department</span>
              <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} readOnly={found} />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Signature</span>
                <button type="button" onClick={() => signatureRef.current?.clear()} className="text-xs text-slate-400 hover:text-red-500">
                  Clear
                </button>
              </div>
              <SignaturePad ref={signatureRef} />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
              {busy ? "Saving..." : "Sign attendance"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
