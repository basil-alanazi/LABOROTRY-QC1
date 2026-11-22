// Who may run which query.
//
// Signed-in accounts keep the same access they had on Supabase (the pages
// themselves decide what each role sees), with two server-side tightenings:
//   * password hashes are never readable or filterable, and
//   * only Owner/IC accounts can create, edit or delete user accounts —
//     everyone else may only change their own password.
// Without a session, only what the public QR pages need is allowed
// (employee profile + taking the IC knowledge test).
import { ApiError } from "./query.js";

const ADMIN_ROLES = new Set(["owner", "ic"]);
const SELF_EDITABLE_USER_COLS = new Set(["password_hash", "must_change_password"]);

// table -> filter column(s) that must be pinned with eq (null = any read
// allowed; an array means any one of them)
const ANON_READ = {
  app_config: null,
  health_item_types: null,
  baladiya_licenses: null,
  employees: ["id", "employee_no"],
  employee_health_records: "employee_id",
  employee_vaccine_requests: "employee_id",
  employee_clinic_status: "employee_id",
  employee_nsi_followups: "employee_id",
  employee_refusal_forms: "employee_id",
  employee_acceptance_forms: "employee_id",
  ic_test_sets: "department",
  ic_test_questions: "department",
  ic_test_access: "employee_id",
  ic_test_attempts: "employee_id",
};

function eqValue(q, col) {
  const f = (q.filters || []).find((f) => f[0] === "eq" && f[1] === col);
  return f ? f[2] : undefined;
}

function forbid(msg = "Not allowed") {
  throw new ApiError(msg, "FORBIDDEN");
}

export function checkAccess(q, session) {
  const op = q.op || "select";
  for (const f of q.filters || []) if (f[1] === "password_hash") forbid();
  for (const o of q.order || []) if (o[0] === "password_hash") forbid();

  if (!session) {
    if (op === "select") {
      if (!(q.table in ANON_READ)) throw new ApiError("Not signed in", "AUTH");
      const pins = ANON_READ[q.table] === null ? null : [].concat(ANON_READ[q.table]);
      const pinned = (c) => {
        const v = eqValue(q, c);
        return v !== undefined && v !== null && v !== "";
      };
      if (pins && !pins.some(pinned)) throw new ApiError("Not signed in", "AUTH");
      return;
    }
    // The public test page saves the attempt and can redeem a retake code.
    if (op === "insert" && q.table === "ic_test_attempts") return;
    // ...and attach the employee's signature to the attempt it just saved.
    if (op === "update" && q.table === "ic_test_attempts" && eqValue(q, "id")) {
      const keys = Object.keys(q.payload || {});
      if (keys.length && keys.every((k) => k === "employee_signature_path")) return;
    }
    if (op === "update" && q.table === "ic_test_access" && eqValue(q, "id")) {
      const keys = Object.keys(q.payload || {});
      if (keys.every((k) => k === "max_attempts" || k === "retake_code")) return;
    }
    throw new ApiError("Not signed in", "AUTH");
  }

  if (q.table === "users" && op !== "select") {
    if (ADMIN_ROLES.has(session.role)) return;
    if (op === "update" && eqValue(q, "id") === session.uid && (q.filters || []).length === 1) {
      const keys = Object.keys(q.payload || {});
      if (keys.length && keys.every((k) => SELF_EDITABLE_USER_COLS.has(k))) return;
    }
    forbid("Only Owner/IC accounts can manage users");
  }
}
