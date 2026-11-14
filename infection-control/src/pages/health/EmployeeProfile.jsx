import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Languages, LogIn, Paperclip, Printer } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import rabiaLogo from "../../assets/rabia-logo.jpg";

const EMP_HEALTH_ATTACHMENTS_BUCKET = "employee-health-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(EMP_HEALTH_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const INVESTIGATION_LABELS = {
  review_due: "Doctor review due",
  sample_not_given: "Sample not given",
  review_done: "Review done",
};

// Public — reachable by anyone who scans the employee's QR badge, no login
// required, so it's not wrapped in <ProtectedRoute>/<Layout> (that sidebar
// and nav are for signed-in staff). Read-only: no edit actions live here. A
// "Doctor Login" button sends a doctor to sign in and land straight on
// their Doctor Review queues (see EmployeeHealth.jsx's doctor-review tab).
export default function EmployeeProfile() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { t, lang, toggleLang } = useLanguage();
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [itemTypes, setItemTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [nsiCases, setNsiCases] = useState([]);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: emp }, { data: types }, { data: recs }, { data: reqs }, { data: statuses }, { data: nsi }, { data: licenses }] = await Promise.all([
        supabase.from("employees").select("*").eq("id", employeeId).single(),
        supabase.from("health_item_types").select("*").order("sort_order"),
        fetchAllRows((from, to) => supabase.from("employee_health_records").select("*").eq("employee_id", employeeId).range(from, to)),
        fetchAllRows((from, to) => supabase.from("employee_vaccine_requests").select("*").eq("employee_id", employeeId).range(from, to)),
        supabase.from("employee_clinic_status").select("*").eq("employee_id", employeeId),
        fetchAllRows((from, to) => supabase.from("employee_nsi_followups").select("*").eq("employee_id", employeeId).range(from, to)),
        fetchAllRows((from, to) => supabase.from("baladiya_licenses").select("*").eq("deleted", false).range(from, to)),
      ]);
      if (cancelled) return;
      if (!emp) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setEmployee(emp);
      setItemTypes((types ?? []).map((ty) => ({ ...ty, dose_schedule: ty.dose_schedule?.length ? ty.dose_schedule : [0] })));
      setRecords(recs ?? []);
      setRequests(reqs ?? []);
      setStatus((statuses ?? [])[0] || null);
      setNsiCases((nsi ?? []).filter((c) => !c.deleted));
      const lic = (licenses ?? []).find((l) => (emp.employee_no && l.employee_no === emp.employee_no) || l.name === emp.name);
      setLicense(lic || null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  function doseState(item) {
    const recs = records.filter((r) => r.item_type_id === item.id).sort((a, b) => a.dose_number - b.dose_number);
    const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
    const dose1 = recs.find((r) => r.dose_number === 1);
    const highestGiven = recs.length ? Math.max(...recs.map((r) => r.dose_number)) : 0;
    const complete = highestGiven >= schedule.length;
    let nextDueDate = null;
    if (!complete) {
      const nextDoseNumber = highestGiven + 1;
      if (nextDoseNumber > 1 && dose1) nextDueDate = addMonths(dose1.date_given, schedule[nextDoseNumber - 1]);
    } else if (item.recurrence_months) {
      const last = recs[recs.length - 1];
      nextDueDate = last.next_due_date || addMonths(last.date_given, item.recurrence_months);
    }
    return { recs, complete, nextDueDate };
  }

  const visibleVaccines = useMemo(() => {
    if (!employee) return [];
    return itemTypes.filter((ty) => ty.active && (!ty.kitchen_only || employee.is_kitchen_staff));
  }, [itemTypes, employee]);

  function goToDoctorLogin() {
    const next = encodeURIComponent("/employee-health?tab=doctor-review");
    navigate(`/login?next=${next}`);
  }

  const header = (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <div className="flex items-center gap-2 text-teal-700">
        <img src={rabiaLogo} alt="Rabia Hospital" className="h-9 w-9 rounded-md object-contain" />
        <span className="text-lg font-bold">{t("Infection Control")}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title={lang === "ar" ? "English" : "العربية"}
        >
          <Languages className="h-4 w-4" />
          {lang === "ar" ? "EN" : "AR"}
        </button>
        <button
          onClick={goToDoctorLogin}
          className="flex items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
        >
          <LogIn className="h-4 w-4" />
          {t("Doctor Login")}
        </button>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        {header}
        <div className="p-10 text-center text-sm text-slate-400">{t("Loading...")}</div>
      </div>
    );
  }
  if (notFound || !employee) {
    return (
      <div className="min-h-screen bg-slate-50">
        {header}
        <div className="p-10 text-center text-sm text-slate-400">{t("Employee not found.")}</div>
      </div>
    );
  }

  const ppdOverdue = status?.ppd_status === "done" && status.ppd_next_due_date && status.ppd_next_due_date < todayStr();
  const stoolOverdue = status?.stool_urine_status === "done" && status.stool_urine_next_due_date && status.stool_urine_next_due_date < todayStr();
  const licenseExpired = license && license.expiry_date && license.expiry_date < todayStr();

  return (
    <div className="min-h-screen bg-slate-50">
      {header}
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("Employee Health Profile")}</h1>
          <p className="text-sm text-slate-500">{t("Read-only summary — for identity verification and clinic status.")}</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
          <Printer className="h-4 w-4" />
          {t("Print / Save PDF")}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{employee.name}</h2>
            <p className="text-sm text-slate-500">
              {employee.job_title} — {employee.department}
            </p>
          </div>
          {employee.is_kitchen_staff && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{t("Kitchen Staff")}</span>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Employee #" value={employee.employee_no} />
          <Field label="File #" value={employee.file_no} />
          <Field label="Iqama #" value={employee.iqama_no} />
          <Field label="Date of birth" value={employee.date_of_birth} />
          <Field label="Phone" value={employee.phone} />
        </dl>
      </div>

      <Section title={t("Pre-employment Clearance")}>
        <StatusLine
          label={t("Doctor Review")}
          ok={status?.investigation_status === "review_done"}
          detail={t(INVESTIGATION_LABELS[status?.investigation_status || "review_due"])}
        />
      </Section>

      <Section title={t("Vaccinations")}>
        <div className="flex flex-col gap-2">
          {visibleVaccines.map((item) => {
            const state = doseState(item);
            const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
            const requested = requests.some((r) => r.item_type_id === item.id);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
                {!requested ? (
                  <span className="text-xs text-slate-400">{t("Not requested")}</span>
                ) : state.complete ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("Complete")}</span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {t("Dose")} {state.recs.length + 1}/{schedule.length}
                    {state.nextDueDate ? ` — ${t("due")} ${state.nextDueDate}` : ""}
                  </span>
                )}
              </div>
            );
          })}
          {visibleVaccines.length === 0 && <p className="text-sm text-slate-400">{t("No vaccination items configured.")}</p>}
        </div>
      </Section>

      {(employee.sehha_reports ?? []).length > 0 && (
        <Section title={t("Sehha Platform Report")}>
          <div className="flex flex-wrap gap-2">
            {employee.sehha_reports.map((a, i) => (
              <a
                key={i}
                href={attachmentUrl(a.path)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-slate-100 px-3 py-2 text-sm font-medium text-teal-700 hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {a.name || t("View")}
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section title={t("PPD (Tuberculin Skin Test)")}>
        <StatusLine
          label={t("PPD")}
          ok={status?.ppd_status === "done" && !ppdOverdue}
          detail={!status?.ppd_status ? t("Not done") : ppdOverdue ? `${t("Overdue since")} ${status.ppd_next_due_date}` : `${t("Done")} — ${status.ppd_test_date || ""}`}
        />
      </Section>

      {employee.is_kitchen_staff && (
        <Section title={t("Stool & Urine Test (Kitchen Staff)")}>
          <StatusLine
            label={t("Stool & Urine Test")}
            ok={status?.stool_urine_status === "done" && !stoolOverdue}
            detail={
              !status?.stool_urine_status
                ? t("Not done")
                : stoolOverdue
                ? `${t("Overdue since")} ${status.stool_urine_next_due_date}`
                : `${t("Done")} — ${status.stool_urine_test_date || ""}`
            }
          />
        </Section>
      )}

      <Section title={t("Needle-Stick Injury Follow-up")}>
        {nsiCases.length === 0 ? (
          <p className="text-sm text-slate-400">{t("No needle-stick injury cases on record.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {nsiCases.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {t("Incident")}: {c.incident_date || "—"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.doctor_reviewed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {c.doctor_reviewed ? t("Reviewed") : t("Pending review")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("Follow-up reports")}: {[c.report_1_date, c.report_2_date, c.report_3_date].filter(Boolean).join(", ") || t("None yet")}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("Baladiya Health License")}>
        {license ? (
          <StatusLine
            label={t("Baladiya License")}
            ok={!licenseExpired}
            detail={!licenseExpired ? `${t("Valid until")} ${license.expiry_date}` : `${t("Expired on")} ${license.expiry_date}`}
          />
        ) : (
          <p className="text-sm text-slate-400">{t("No Baladiya license on record.")}</p>
        )}
      </Section>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  const { t } = useLanguage();
  return (
    <div>
      <dt className="text-xs text-slate-400">{t(label)}</dt>
      <dd className="font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function StatusLine({ label, ok, detail }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      <span className="text-sm text-slate-700">
        <span className="font-medium">{label}:</span> {detail}
      </span>
    </div>
  );
}
