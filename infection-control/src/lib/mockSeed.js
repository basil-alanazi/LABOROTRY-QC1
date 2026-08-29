// Same default rows as supabase_schema.sql, used to power preview mode.
const HH_DEPARTMENTS = [
  "ICU",
  "Medical Ward",
  "Surgical Ward",
  "Emergency",
  "Pediatric",
  "NICU",
  "OPD",
  "OT",
  "Labor & Delivery",
  "Dialysis",
  "Other",
];

const today = new Date().toISOString().slice(0, 10);

const STOCK_DEPARTMENTS = [
  "Cath Lab",
  "OR Anesthesia",
  "OR Nursing",
  "DR",
  "ICU",
  "NICU",
  "FW",
  "MW",
  "Endoscopy",
  "IM 1 & 2",
  "Cardiology",
  "Pulmo",
  "ENT 1 & 2",
  "Dental 1 & 2",
  "Ophthalmology",
  "Neurology",
  "Pedia OPD",
  "Derma",
  "OB & GYN",
  "Ortho",
  "Urology & ESWL",
  "Surgery",
  "Emergency Room",
];

const EMPLOYEE_DEPARTMENTS = [
  "Nursing",
  "Physicians",
  "Laboratory",
  "Radiology",
  "Housekeeping",
  "Dietary",
  "Pharmacy",
  "Administration",
  "Maintenance",
  "Other",
];

const IC_ROUND_DEPARTMENTS = ["Male Ward", "Female Ward", "ICU", "NICU", "Surgery", "OB/GYN", "Emergency", "OPD"];
const CULTURE_TRACKER_ITEMS = ["Dental 1", "Dental 2", "Hospital 6 Month CS", "Hospital 12 Month CS"];
const AGREEMENT_TRACKER_ENTITIES = ["SEPCO", "Pest Control", "Intra Department"];

export const app_config = {
  id: 1,
  hh_departments: HH_DEPARTMENTS,
  hh_observer_roles: ["Doctor", "Nurse", "Housekeeping", "Lab Staff", "Radiology"],
  hh_department_observers: {},
  stock_departments: STOCK_DEPARTMENTS,
  employee_departments: EMPLOYEE_DEPARTMENTS,
  ic_round_departments: IC_ROUND_DEPARTMENTS,
  culture_tracker_items: CULTURE_TRACKER_ITEMS,
  agreement_tracker_entities: AGREEMENT_TRACKER_ENTITIES,
};

export const ic_rounds = [
  {
    id: "icr-1",
    date: today,
    department: "Male Ward",
    result: "met",
    finding: "",
    attachment_path: null,
    attachment_name: null,
    corrective_action: "",
    date_of_discussion: null,
    status: "open",
    done_by: "ic",
    deleted: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "icr-2",
    date: today,
    department: "Female Ward",
    result: "not_met",
    finding: "Staff failed to discard waste after procedure",
    attachment_path: null,
    attachment_name: null,
    corrective_action: "Discussed on area manager meeting, needed training and close observation; comments closed after 1 week.",
    date_of_discussion: today,
    status: "open",
    done_by: "ic",
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const baladiya_licenses = [
  {
    id: "lic-1",
    employee_no: "E-1001",
    name: "Amal Al-Harbi",
    file_no: "F-201",
    department: "Nursing",
    issue_date: "2024-01-15",
    expiry_date: "2026-01-15",
    attachment_path: null,
    attachment_name: null,
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const policy_tracker = [
  {
    id: "pol-1",
    policy_name: "Hand Hygiene Policy",
    policy_no: "POL-014",
    issue_date: "2023-06-01",
    revision_date: "2023-06-01",
    expiry_date: "2026-06-01",
    attachment_path: null,
    attachment_name: null,
    renewed: false,
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const culture_tracker = [
  {
    id: "cul-1",
    item: "Dental 1",
    sent_on: today,
    next_due: null,
    attachment_path: null,
    attachment_name: null,
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const agreement_tracker = [
  {
    id: "agr-1",
    entity: "SEPCO",
    renewed_on: today,
    next_due: null,
    attachment_path: null,
    attachment_name: null,
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const hh_observations = [
  {
    id: "hh-1",
    date: today,
    department: "ICU",
    observer: "Nurse",
    time_from: "09:00",
    time_to: "09:15",
    before_touching_patient: 1,
    before_clean_procedure: 1,
    after_body_fluid_risk: 1,
    after_touching_patient: 0,
    after_touching_surroundings: 1,
    wearing_glove: 1,
    missed: null,
    hand_wash: 1,
    hand_rub: 0,
    total_opportunities: 6,
    compliant: 5,
    compliance_pct: 83.3,
    done_by: "ic",
    deleted: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "hh-2",
    date: today,
    department: "NICU",
    observer: "Doctor",
    time_from: "10:30",
    time_to: "10:42",
    before_touching_patient: 1,
    before_clean_procedure: 1,
    after_body_fluid_risk: null,
    after_touching_patient: 1,
    after_touching_surroundings: 1,
    wearing_glove: 1,
    missed: null,
    hand_wash: 0,
    hand_rub: 1,
    total_opportunities: 5,
    compliant: 5,
    compliance_pct: 100,
    done_by: "ic",
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const stock_items = [
  { id: "item-1", department: "ICU", name: "SHARP CONTAINER", unit: "unit", min_qty: 5, max_qty: 10, current_qty: 0, active: true, sort_order: 1 },
  { id: "item-2", department: "Emergency Room", name: "NORMAL SALINE 500ML", unit: "unit", min_qty: 20, max_qty: 30, current_qty: 30, active: true, sort_order: 2 },
  { id: "item-3", department: "OR Nursing", name: "SURGICAL GOWN", unit: "unit", min_qty: 100, max_qty: 200, current_qty: 172, active: true, sort_order: 3 },
];

export const stock_requests = [
  {
    id: "req-1",
    date: today,
    department: "Emergency Room",
    item_id: "item-2",
    item_name: "NORMAL SALINE 500ML",
    unit: "unit",
    quantity_requested: 3,
    quantity_issued: 3,
    status: "issued",
    notes: "",
    requested_by: "ward",
    issued_by: "ward",
    issued_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

export const health_item_types = [
  { id: "hit-1", name: "Hepatitis B (series)", category: "vaccine", recurrence_months: null, dose_schedule: [0, 1, 6], kitchen_only: false, active: true, sort_order: 1 },
  { id: "hit-2", name: "MMR (Measles, Mumps, Rubella)", category: "vaccine", recurrence_months: null, dose_schedule: [0, 1], kitchen_only: false, active: true, sort_order: 2 },
  { id: "hit-3", name: "Varicella (Chickenpox)", category: "vaccine", recurrence_months: null, dose_schedule: [0, 1], kitchen_only: false, active: true, sort_order: 3 },
  { id: "hit-4", name: "Influenza (Annual)", category: "vaccine", recurrence_months: 12, dose_schedule: [0], kitchen_only: false, active: true, sort_order: 4 },
  { id: "hit-5", name: "Tetanus toxoid", category: "vaccine", recurrence_months: null, dose_schedule: [0], kitchen_only: false, active: true, sort_order: 5 },
  { id: "hit-6", name: "Meningococcal (Kitchen Staff)", category: "vaccine", recurrence_months: null, dose_schedule: [0], kitchen_only: true, active: true, sort_order: 6 },
  { id: "hit-7", name: "Typhoid (Kitchen Staff)", category: "vaccine", recurrence_months: null, dose_schedule: [0], kitchen_only: true, active: true, sort_order: 7 },
  { id: "hit-8", name: "Hepatitis A (Kitchen Staff)", category: "vaccine", recurrence_months: null, dose_schedule: [0, 1, 6], kitchen_only: true, active: true, sort_order: 8 },
];

export const employees = [
  {
    id: "emp-1",
    employee_no: "E-1001",
    name: "Amal Al-Harbi",
    department: "Nursing",
    job_title: "Staff Nurse",
    file_no: "F-201",
    iqama_no: "2xxxxxxxx1",
    date_of_birth: "1990-04-12",
    phone: "05xxxxxxx1",
    is_kitchen_staff: false,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "emp-2",
    employee_no: "E-1002",
    name: "Yousef Al-Qahtani",
    department: "Dietary",
    job_title: "Cook",
    file_no: "F-202",
    iqama_no: "2xxxxxxxx2",
    date_of_birth: "1988-09-03",
    phone: "05xxxxxxx2",
    is_kitchen_staff: true,
    active: true,
    created_at: new Date().toISOString(),
  },
];

export const employee_health_records = [
  {
    id: "ehr-1",
    employee_id: "emp-1",
    item_type_id: "hit-4",
    item_name: "Influenza (Annual)",
    dose_number: 1,
    batch_no: "INF-0026",
    date_given: today,
    result: "",
    next_due_date: null,
    notes: "",
    recorded_by: "ic",
    created_at: new Date().toISOString(),
  },
];

export const employee_vaccine_requests = [
  { id: "evr-1", employee_id: "emp-1", item_type_id: "hit-4", requested_at: new Date().toISOString(), requested_by: "ic" },
];

export const employee_clinic_status = [
  {
    id: "ecs-1",
    employee_id: "emp-1",
    investigation_status: "review_done",
    ppd_status: "done",
    ppd_test_date: today,
    ppd_next_due_date: null,
    stool_urine_status: null,
    stool_urine_test_date: null,
    stool_urine_next_due_date: null,
    icn_remarks: "",
    updated_by: "ic",
    updated_at: new Date().toISOString(),
  },
];

export const disease_types = [
  { id: "dt-1", name: "Tuberculosis (TB)", active: true, sort_order: 1 },
  { id: "dt-2", name: "Measles", active: true, sort_order: 2 },
  { id: "dt-3", name: "COVID-19", active: true, sort_order: 4 },
  { id: "dt-99", name: "Other", active: true, sort_order: 99 },
];

export const communicable_cases = [
  {
    id: "case-1",
    date: today,
    patient_name: "Sample Patient",
    rh_no: "RH-2001",
    status: "suspected",
    disease_type_id: "dt-1",
    disease_name: "Tuberculosis (TB)",
    disease_other: "",
    reported_at: null,
    attachment1_path: null,
    attachment1_name: null,
    attachment2_path: null,
    attachment2_name: null,
    attachment2_not_required: false,
    ipc_note: "",
    done_by: "ic",
    deleted: false,
    created_at: new Date().toISOString(),
  },
];

export const users = [
  {
    id: "user-owner",
    username: "owner",
    password: "owner123",
    display_name: "Owner",
    role: "owner",
    department: null,
    active: true,
    must_change_password: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-ic",
    username: "ic",
    password: "ic123",
    display_name: "Infection Control",
    role: "ic",
    department: null,
    active: true,
    must_change_password: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-ward",
    username: "ward",
    password: "ward123",
    display_name: "Ward Staff",
    role: "staff",
    department: "ICU",
    active: true,
    must_change_password: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-doctor",
    username: "doctor",
    password: "doctor123",
    display_name: "Dr. Sample",
    role: "staff",
    department: null,
    can_view_employee_health: true,
    active: true,
    must_change_password: false,
    created_at: new Date().toISOString(),
  },
];

export const messages = [
  {
    id: "msg-1",
    sender_username: "ic",
    recipient_username: "ward",
    body: "Please double check the hand hygiene log for ICU today.",
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "msg-2",
    sender_username: "ward",
    recipient_username: "ic",
    body: "Done, uploaded just now.",
    read_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
];
