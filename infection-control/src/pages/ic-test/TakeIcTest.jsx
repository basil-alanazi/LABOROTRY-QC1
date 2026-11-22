import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, Languages, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/i18n.jsx";
import SignaturePad from "../../components/SignaturePad";
import rabiaLogo from "../../assets/rabia-logo.jpg";

const SIGNATURES_BUCKET = "employee-health-attachments";
const TEST_SECONDS = 10 * 60;

function signatureUrl(path) {
  if (!path) return null;
  return supabase.storage.from(SIGNATURES_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Public — reached by scanning the employee's own QR badge (same one used
// for the read-only EmployeeProfile), no login required. The test shown is
// whichever one is configured for the employee's own department.
export default function TakeIcTest() {
  const { employeeId } = useParams();
  const { t, lang, toggleLang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [testSet, setTestSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [access, setAccess] = useState(null);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [phase, setPhase] = useState("intro"); // intro | running | result
  const [answers, setAnswers] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(TEST_SECONDS);
  const [result, setResult] = useState(null); // { score, total, passed, perQuestion }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [retakeCodeInput, setRetakeCodeInput] = useState("");
  const [retakeError, setRetakeError] = useState("");
  const signatureRef = useRef(null);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    const { data: emp } = await supabase.from("employees").select("*").eq("id", employeeId).single();
    if (!emp) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setEmployee(emp);
    const [{ data: sets }, { data: qs }, { data: acc }, { data: attempts }] = await Promise.all([
      supabase.from("ic_test_sets").select("*").eq("department", emp.department).eq("active", true),
      supabase.from("ic_test_questions").select("*").eq("department", emp.department).eq("active", true).order("sort_order"),
      supabase.from("ic_test_access").select("*").eq("employee_id", employeeId),
      supabase.from("ic_test_attempts").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
    ]);
    setTestSet((sets ?? [])[0] || null);
    setQuestions(qs ?? []);
    setAccess((acc ?? [])[0] || null);
    setAttemptsUsed((attempts ?? []).length);
    setLastAttempt((attempts ?? [])[0] || null);
    setAnswers(new Array((qs ?? []).length).fill(null));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const maxAttempts = access?.max_attempts ?? 1;
  const locked = attemptsUsed >= maxAttempts;

  function startTest() {
    setAnswers(new Array(questions.length).fill(null));
    setSecondsLeft(TEST_SECONDS);
    setPhase("running");
  }

  useEffect(() => {
    if (phase !== "running") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          finishTest();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function selectAnswer(qIndex, optionIndex) {
    setAnswers((prev) => prev.map((a, i) => (i === qIndex ? optionIndex : a)));
  }

  function finishTest() {
    clearInterval(timerRef.current);
    let score = 0;
    const perQuestion = questions.map((q, i) => {
      const correct = answers[i] === q.correct_index;
      if (correct) score += 1;
      return { question: q, chosen: answers[i], correct };
    });
    const total = questions.length;
    const passed = score >= (testSet?.pass_score ?? 8);
    setResult({ score, total, passed, perQuestion });
    setPhase("result");
  }

  async function handleSaveAttempt() {
    if (!signatureRef.current?.hasSignature()) {
      setError("Your signature is required to save the result");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const blob = await signatureRef.current.toBlob();
      const path = `ic-test-signatures/${employee.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(SIGNATURES_BUCKET).upload(path, blob);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("ic_test_attempts").insert({
        employee_id: employee.id,
        department: employee.department,
        answers,
        score: result.score,
        total: result.total,
        passed: result.passed,
        employee_signature_path: path,
      });
      if (insErr) throw insErr;
      setSaved(true);
    } catch (err) {
      setError("Could not save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlockWithCode(e) {
    e.preventDefault();
    setRetakeError("");
    if (!access?.retake_code || retakeCodeInput.trim().toUpperCase() !== access.retake_code.toUpperCase()) {
      setRetakeError("Incorrect code");
      return;
    }
    const { error: updErr } = await supabase
      .from("ic_test_access")
      .update({ max_attempts: (access.max_attempts ?? 1) + 1, retake_code: null })
      .eq("id", access.id);
    if (updErr) {
      setRetakeError(updErr.message);
      return;
    }
    setAccess({ ...access, max_attempts: (access.max_attempts ?? 1) + 1, retake_code: null });
    setRetakeCodeInput("");
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const header = (
    <div className="relative flex flex-col items-center gap-1 border-b border-slate-200 pb-4 text-center">
      <button
        onClick={toggleLang}
        className="absolute end-0 top-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <Languages className="h-3.5 w-3.5" />
        {lang === "ar" ? "EN" : "AR"}
      </button>
      <img src={rabiaLogo} alt="Rabia Hospital" className="h-16 w-auto object-contain" />
      {testSet && <p className="mt-1 text-sm font-bold text-slate-800">{testSet.title}</p>}
      {testSet?.policy_no && <p className="text-xs text-slate-400">{testSet.policy_no}</p>}
    </div>
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">{t("Loading...")}</div>;
  }
  if (notFound || !employee) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">{t("Employee not found.")}</div>;
  }
  if (!testSet || questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {header}
          <p className="mt-4 text-center text-sm text-slate-500">{t("No test is configured yet for your department.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {header}
        <div className="mt-3 text-center text-sm text-slate-600">
          {employee.name} · {employee.department}
        </div>

        {locked && phase === "intro" && (
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm font-semibold text-slate-700">{t("You have already completed this test.")}</p>
              {lastAttempt && (
                <p className="mt-1 text-sm text-slate-600">
                  {t("Your score")}: {lastAttempt.score}/{lastAttempt.total} —{" "}
                  <span className={lastAttempt.passed ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                    {lastAttempt.passed ? t("Pass") : t("Fail")}
                  </span>
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">{t("Ask the Infection Control department for a retake code if you need to test again.")}</p>
            </div>
            <form onSubmit={handleUnlockWithCode} className="flex flex-col gap-2">
              <input
                className="input text-center uppercase tracking-widest"
                placeholder={t("Retake code")}
                value={retakeCodeInput}
                onChange={(e) => setRetakeCodeInput(e.target.value)}
              />
              {retakeError && <p className="text-center text-xs text-red-600">{retakeError}</p>}
              <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                {t("Unlock retake")}
              </button>
            </form>
          </div>
        )}

        {!locked && phase === "intro" && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <p className="text-center text-sm text-slate-600">
              {t("This test has")} {questions.length} {t("questions")}. {t("You will have 10 minutes to finish.")}
            </p>
            <button onClick={startTest} className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              {t("Start Test")}
            </button>
          </div>
        )}

        {phase === "running" && (
          <div className="mt-5 flex flex-col gap-5">
            <div className="sticky top-0 z-10 flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 py-2 text-sm font-bold text-amber-700">
              <Clock className="h-4 w-4" />
              {mm}:{ss}
            </div>
            {questions.map((q, qi) => (
              <div key={q.id} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium text-slate-800">
                  {qi + 1}. {q.question_text}
                </p>
                <div className="flex flex-col gap-1.5">
                  {(q.options ?? []).map((opt, oi) => (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                        answers[qi] === oi ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input type="radio" className="mt-0.5" name={`q-${qi}`} checked={answers[qi] === oi} onChange={() => selectAnswer(qi, oi)} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={finishTest} className="self-center rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              {t("Submit")}
            </button>
          </div>
        )}

        {phase === "result" && result && (
          <div className="mt-5 flex flex-col gap-4">
            <div className={`rounded-xl p-4 text-center ${result.passed ? "bg-emerald-50" : "bg-red-50"}`}>
              <p className={`text-2xl font-bold ${result.passed ? "text-emerald-700" : "text-red-700"}`}>
                {result.score}/{result.total}
              </p>
              <p className={`text-sm font-semibold ${result.passed ? "text-emerald-700" : "text-red-700"}`}>{result.passed ? t("Pass") : t("Fail")}</p>
            </div>

            <div className="flex flex-col gap-2">
              {result.perQuestion.map((pq, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${pq.correct ? "border-emerald-100 bg-emerald-50/40" : "border-red-100 bg-red-50/40"}`}>
                  <div className="flex items-start gap-2">
                    {pq.correct ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium text-slate-700">
                        {i + 1}. {pq.question.question_text}
                      </p>
                      {!pq.correct && (
                        <p className="mt-1 text-xs text-slate-500">
                          {t("Correct answer")}: <span className="font-medium text-emerald-700">{pq.question.options[pq.question.correct_index]}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!saved ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-600">{t("Employee signature")}</p>
                  <button type="button" onClick={() => signatureRef.current?.clear()} className="text-xs text-slate-400 hover:text-red-500">
                    {t("Clear")}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t("I completed this test myself and will comply with the hospital infection prevention policies.")}</p>
                <SignaturePad ref={signatureRef} />
                {error && <p className="text-center text-xs text-red-600">{error}</p>}
                <button
                  onClick={handleSaveAttempt}
                  disabled={saving}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? t("Saving...") : t("Confirm & Save")}
                </button>
              </div>
            ) : (
              <p className="text-center text-sm font-medium text-emerald-700">{t("Saved. Thank you.")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
