import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, KeyRound, Paperclip, Plus, Trash2, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import SignaturePad from "../../components/SignaturePad";

const SIGNATURES_BUCKET = "employee-health-attachments";

function signatureUrl(path) {
  if (!path) return null;
  return supabase.storage.from(SIGNATURES_BUCKET).getPublicUrl(path).data.publicUrl;
}

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const TABS = [
  { key: "results", label: "Results" },
  { key: "questions", label: "Question Bank" },
];

const emptyQuestionForm = { question_text: "", options: ["", "", "", ""], correct_index: 0 };
const emptySetForm = { title: "", policy_no: "", pass_score: 8 };

export default function IcKnowledgeTest() {
  const { session, config } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState("results");
  const [message, setMessage] = useState(null);

  const [attempts, setAttempts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [access, setAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [issuedCode, setIssuedCode] = useState(null); // { employeeId, code }

  const [testSets, setTestSets] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [setForm, setSetForm] = useState(emptySetForm);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);

  const departments = config?.employee_departments ?? [];

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function loadAll() {
    setLoading(true);
    const [{ data: att }, { data: emps }, { data: acc }, { data: sets }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("ic_test_attempts").select("*").order("created_at", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("employees").select("*").range(from, to)),
      fetchAllRows((from, to) => supabase.from("ic_test_access").select("*").range(from, to)),
      supabase.from("ic_test_sets").select("*").order("department"),
    ]);
    setAttempts(att ?? []);
    setEmployees(emps ?? []);
    setAccess(acc ?? []);
    setTestSets(sets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedDept) {
      setQuestions([]);
      setSetForm(emptySetForm);
      return;
    }
    const set = testSets.find((s) => s.department === selectedDept);
    setSetForm(set ? { title: set.title, policy_no: set.policy_no || "", pass_score: set.pass_score } : emptySetForm);
    supabase
      .from("ic_test_questions")
      .select("*")
      .eq("department", selectedDept)
      .order("sort_order")
      .then(({ data }) => setQuestions(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDept, testSets]);

  function employeeFor(id) {
    return employees.find((e) => e.id === id);
  }
  function accessFor(employeeId) {
    return access.find((a) => a.employee_id === employeeId);
  }

  const visibleAttempts = attempts.filter((a) => {
    if (filterDept && a.department !== filterDept) return false;
    if (filterResult === "pass" && !a.passed) return false;
    if (filterResult === "fail" && a.passed) return false;
    return true;
  });

  async function issueRetakeCode(employeeId) {
    const code = genCode();
    const existing = accessFor(employeeId);
    const { error } = await supabase
      .from("ic_test_access")
      .upsert({ employee_id: employeeId, max_attempts: existing?.max_attempts ?? 1, retake_code: code, retake_issued_by: session?.username, retake_issued_at: new Date().toISOString() }, { onConflict: "employee_id" });
    if (error) {
      flash({ type: "error", text: "Could not issue code: " + error.message });
      return;
    }
    setIssuedCode({ employeeId, code });
    loadAll();
  }

  async function saveSignOff(attempt, role, name, blob) {
    try {
      const path = `ic-test-signatures/signoff/${attempt.id}-${role}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(SIGNATURES_BUCKET).upload(path, blob);
      if (upErr) throw upErr;
      const patch =
        role === "supervisor"
          ? { supervisor_name: name, supervisor_signature_path: path, supervisor_signed_at: new Date().toISOString() }
          : { ic_officer_name: name, ic_officer_signature_path: path, ic_officer_signed_at: new Date().toISOString() };
      const { error } = await supabase.from("ic_test_attempts").update(patch).eq("id", attempt.id);
      if (error) throw error;
      flash({ type: "success", text: "Signed" });
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not save signature: " + err.message });
    }
  }

  async function saveSet(e) {
    e.preventDefault();
    if (!selectedDept) return;
    const title = setForm.title.trim() || `${selectedDept} Infection Control Test`;
    const { error } = await supabase
      .from("ic_test_sets")
      .upsert({ department: selectedDept, title, policy_no: setForm.policy_no.trim(), pass_score: Number(setForm.pass_score) || 8, active: true }, { onConflict: "department" });
    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
      return;
    }
    flash({ type: "success", text: "Test saved" });
    loadAll();
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!questionForm.question_text.trim() || questionForm.options.some((o) => !o.trim())) {
      flash({ type: "error", text: "Fill in the question and all 4 options" });
      return;
    }
    const { error } = await supabase.from("ic_test_questions").insert({
      department: selectedDept,
      question_text: questionForm.question_text.trim(),
      options: questionForm.options.map((o) => o.trim()),
      correct_index: questionForm.correct_index,
      sort_order: questions.length + 1,
      active: true,
    });
    if (error) {
      flash({ type: "error", text: "Could not add: " + error.message });
      return;
    }
    setQuestionForm(emptyQuestionForm);
    setShowQuestionForm(false);
    flash({ type: "success", text: "Question added" });
    const { data } = await supabase.from("ic_test_questions").select("*").eq("department", selectedDept).order("sort_order");
    setQuestions(data ?? []);
  }

  async function removeQuestion(q) {
    if (!confirm(`Delete this question?`)) return;
    await supabase.from("ic_test_questions").delete().eq("id", q.id);
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("IC Knowledge Test")}</h1>
        <p className="text-sm text-slate-500">{t("Department-specific infection control test — employees take it by scanning their QR badge.")}</p>
      </div>

      <div className="tab-bar flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((tabDef) => (
          <button key={tabDef.key} onClick={() => setTab(tabDef.key)} className={`rounded-md px-3 py-1 font-medium ${tab === tabDef.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t(tabDef.label)}
          </button>
        ))}
      </div>

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      {tab === "results" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-44" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">{t("All Departments")}</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {[
                { key: "", label: "All" },
                { key: "pass", label: "Pass" },
                { key: "fail", label: "Fail" },
              ].map((o) => (
                <button key={o.key} onClick={() => setFilterResult(o.key)} className={`rounded-md px-3 py-1 font-medium ${filterResult === o.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visibleAttempts.map((a) => {
              const emp = employeeFor(a.employee_id);
              const acc = accessFor(a.employee_id);
              const isExpanded = expandedId === a.id;
              return (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button onClick={() => setExpandedId(isExpanded ? null : a.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${a.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {a.score}/{a.total}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{emp?.name || t("Unknown employee")}</p>
                        <p className="text-xs text-slate-400">
                          {a.department} · {a.created_at?.slice(0, 10)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {a.passed ? t("Pass") : t("Fail")}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-4">
                      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                        {a.employee_signature_path && (
                          <a href={signatureUrl(a.employee_signature_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                            <Paperclip className="h-3.5 w-3.5" />
                            {t("View employee signature")}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => issueRetakeCode(a.employee_id)}
                          className="flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {t("Issue retake code")}
                        </button>
                        {acc?.max_attempts > 1 && (
                          <span className="text-slate-400">
                            {t("Attempts allowed")}: {acc.max_attempts}
                          </span>
                        )}
                        {issuedCode?.employeeId === a.employee_id && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono font-bold tracking-widest text-amber-700">{issuedCode.code}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SignOffBlock
                          label={t("Supervisor")}
                          existingName={a.supervisor_name}
                          signedAt={a.supervisor_signed_at}
                          signaturePath={a.supervisor_signature_path}
                          onSave={(name, blob) => saveSignOff(a, "supervisor", name, blob)}
                        />
                        <SignOffBlock
                          label={t("Infection Control Officer")}
                          existingName={a.ic_officer_name}
                          signedAt={a.ic_officer_signed_at}
                          signaturePath={a.ic_officer_signature_path}
                          onSave={(name, blob) => saveSignOff(a, "ic_officer", name, blob)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visibleAttempts.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No test attempts recorded yet.")}</p>}
          </div>
        </div>
      )}

      {tab === "questions" && (
        <div className="flex flex-col gap-4">
          <select className="input w-56" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
            <option value="">{t("Select department")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {selectedDept && (
            <>
              <form onSubmit={saveSet} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4 sm:items-end">
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-slate-600">{t("Test Title")}</span>
                  <input className="input" placeholder={`${selectedDept} Infection Control Test`} value={setForm.title} onChange={(e) => setSetForm({ ...setForm, title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-600">{t("Policy No")}</span>
                  <input className="input" value={setForm.policy_no} onChange={(e) => setSetForm({ ...setForm, policy_no: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-600">
                    {t("Pass score")} ({t("out of")} {questions.length || 10})
                  </span>
                  <input type="number" min={1} max={questions.length || 10} className="input" value={setForm.pass_score} onChange={(e) => setSetForm({ ...setForm, pass_score: e.target.value })} />
                </label>
                <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-4">
                  {t("Save Test Settings")}
                </button>
              </form>

              <div>
                <button
                  onClick={() => setShowQuestionForm((v) => !v)}
                  className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add Question")}
                </button>
              </div>

              {showQuestionForm && (
                <form onSubmit={addQuestion} className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                  <textarea
                    className="input min-h-[60px]"
                    placeholder={t("Question text")}
                    value={questionForm.question_text}
                    onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                  />
                  {questionForm.options.map((opt, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="correct_index"
                        checked={questionForm.correct_index === i}
                        onChange={() => setQuestionForm({ ...questionForm, correct_index: i })}
                      />
                      <input
                        className="input"
                        placeholder={`${t("Option")} ${String.fromCharCode(65 + i)}`}
                        value={opt}
                        onChange={(e) => setQuestionForm({ ...questionForm, options: questionForm.options.map((o, oi) => (oi === i ? e.target.value : o)) })}
                      />
                    </label>
                  ))}
                  <p className="text-xs text-slate-400">{t("Select the radio button next to the correct option.")}</p>
                  <button type="submit" className="self-start rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                    {t("Save Question")}
                  </button>
                </form>
              )}

              <div className="flex flex-col gap-2">
                {questions.map((q, qi) => (
                  <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {qi + 1}. {q.question_text}
                      </p>
                      <button onClick={() => removeQuestion(q)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {(q.options ?? []).map((opt, oi) => (
                        <li key={oi} className={`flex items-center gap-1.5 text-xs ${oi === q.correct_index ? "font-semibold text-emerald-700" : "text-slate-500"}`}>
                          {oi === q.correct_index ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                          {String.fromCharCode(65 + oi)}) {opt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {questions.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No questions yet for this department.")}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SignOffBlock({ label, existingName, signedAt, signaturePath, onSave }) {
  const { t } = useLanguage();
  const [name, setName] = useState(existingName || "");
  const signatureRef = useRef(null);
  const [saving, setSaving] = useState(false);

  if (signedAt) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
        <p className="mb-1 font-bold text-slate-600">{label}</p>
        <p className="text-slate-700">{existingName}</p>
        <p className="mt-0.5 text-slate-400">
          {t("Signed")} {signedAt.slice(0, 10)}
        </p>
        {signaturePath && (
          <img src={signatureUrl(signaturePath)} alt="" className="mt-1 h-10 rounded border border-slate-200 bg-white" />
        )}
      </div>
    );
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (!signatureRef.current?.hasSignature()) return;
    setSaving(true);
    const blob = await signatureRef.current.toBlob();
    await onSave(name.trim(), blob);
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="mb-1.5 text-xs font-bold text-slate-600">{label}</p>
      <input className="input-cell mb-1.5 w-full" placeholder={t("Name")} value={name} onChange={(e) => setName(e.target.value)} />
      <SignaturePad ref={signatureRef} className="h-20" />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-1.5 w-full rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {saving ? t("Saving...") : t("Sign")}
      </button>
    </div>
  );
}
