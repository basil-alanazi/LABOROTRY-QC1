-- Infection Control — Daily Ward Round & Surveillance schema.
-- Run this once in a NEW Supabase project's SQL Editor.

create extension if not exists pgcrypto;

-- Shared settings (simple username/password login lives in the users table).
create table if not exists app_config (
  id int primary key default 1,
  departments jsonb not null default '["ICU","NICU","Surgery","OB/GYN"]'::jsonb,
  hh_departments jsonb not null default '["ICU","Medical Ward","Surgical Ward","Emergency","Pediatric","NICU","OPD","OT","Labor & Delivery","Dialysis","Other"]'::jsonb,
  hh_observer_roles jsonb not null default '["Doctor","Nurse","Housekeeping","Lab Staff","Radiology"]'::jsonb,
  hh_department_observers jsonb not null default '{}'::jsonb, -- { "Lab": ["Lab Staff"], ... } — which roles show for each HH department; unlisted departments show all roles
  stock_departments jsonb not null default '["Cath Lab","OR Anesthesia","OR Nursing","DR","ICU","NICU","FW","MW","Endoscopy","IM 1 & 2","Cardiology","Pulmo","ENT 1 & 2","Dental 1 & 2","Ophthalmology","Neurology","Pedia OPD","Derma","OB & GYN","Ortho","Urology & ESWL","Surgery","Emergency Room"]'::jsonb,
  employee_departments jsonb not null default '["Nurse","Doctor","house keeping","Reception","INSURANCE","others","Security and Safety","Lab","pharmacy","radiology","Maintenance and laborers","HUMAN RESORCE","Medical maintenance","MEDICAL REPORTS","CSSD","IT","physiotherapy","store","Quality Head","Quality CO-ORDINATOR","Infection Control Head","infection control practitioner","HOSPITAL DIRECTOR","Medical Director","ROOM 44","ROOM 45","Social Specialist","Patient relation","PURCHASE Manager","store MANAGER","MARKETING MANAGER","CSSD HEAD","Dietary","Administration","Finance"]'::jsonb
);
insert into app_config (id) values (1) on conflict (id) do nothing;

-- Real per-person accounts, created by the owner from Settings. Every audit
-- action (created/resolved/deleted) is attributed to the account that did it.
-- Passwords are stored as a SHA-256 hash — nobody, not even the owner, can
-- read a password back; the owner can only reset it to the default (123456).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text not null default '',
  role text not null default 'staff', -- 'owner' | 'ic' | 'staff'
  department text,                    -- optional home department for staff users
  can_manage_stock boolean not null default false, -- staff dept "in-charge": can add/remove items in their own department's stock catalog
  can_view_employee_health boolean not null default false, -- staff account granted access to only the Employee Health page (e.g. a doctor account), instead of the usual stock-only staff view
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
insert into users (username, password_hash, display_name, role, must_change_password)
values ('owner', encode(digest('owner123', 'sha256'), 'hex'), 'Owner', 'owner', true)
on conflict (username) do nothing;

-- One checklist type = one bundle (SSI / CAUTI / VAE / CLABSI), with its list of
-- bundle components and which departments audit against it.
create table if not exists checklist_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  items jsonb not null default '[]'::jsonb,        -- ["component 1", "component 2", ...]
  departments jsonb not null default '[]'::jsonb,   -- ["ICU","NICU",...] which wards use it
  fields jsonb not null default '["patient_name","mrn","age","diagnosis"]'::jsonb, -- which patient fields the entry form shows
  baseline text not null default '',                -- free-text reference field, reserved for future use
  active boolean not null default true,
  sort_order int not null default 0
);

-- One row = one patient audited on one date against one checklist.
create table if not exists ward_round_audits (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null,
  checklist_type_id uuid references checklist_types(id),
  checklist_code text not null,
  checklist_name_ar text not null default '',
  patient_name text not null default '',
  mrn text not null default '',
  age text not null default '',
  diagnosis text not null default '',
  items jsonb not null default '[]'::jsonb,   -- [{"item":"...", "status":"MET|NOT MET|NA"}]
  met_count int not null default 0,
  applicable_count int not null default 0,
  not_met_count int not null default 0,
  compliance_pct numeric,
  comments text not null default '',
  action_status text not null default 'none',  -- none | open | resolved
  attachment_path text,               -- path inside the "ward-round-attachments" storage bucket
  attachment_name text,
  done_by text not null default '',
  resolved_by text,
  resolved_at timestamptz,
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  description text not null,
  performed_by text not null,
  created_at timestamptz not null default now()
);

-- Hand Hygiene daily monitoring — a separate module from the Ward Round
-- audits above. One row = one observation of one observer's hand-hygiene
-- moments on one date/department (WHO 5-moments + glove use).
create table if not exists hh_observations (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null,
  observer text not null default '',
  time_from time,                     -- visit start/end, expected 10-20 minutes
  time_to time,
  attachment_path text,               -- path inside the "hh-attachments" storage bucket
  attachment_name text,
  before_touching_patient smallint,   -- 1 = compliant, 0 = missed, null = not applicable
  before_clean_procedure smallint,
  after_body_fluid_risk smallint,
  after_touching_patient smallint,
  after_touching_surroundings smallint,
  wearing_glove smallint,
  missed smallint,                    -- opportunity occurred but no category above applies
  hand_wash smallint,
  hand_rub smallint,
  total_opportunities int not null default 0,
  compliant int not null default 0,
  compliance_pct numeric,
  done_by text not null default '',
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table app_config enable row level security;
alter table users enable row level security;
alter table checklist_types enable row level security;
alter table ward_round_audits enable row level security;
alter table audit_log enable row level security;
alter table hh_observations enable row level security;

create policy "allow all app_config" on app_config for all using (true) with check (true);
create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all checklist_types" on checklist_types for all using (true) with check (true);
create policy "allow all ward_round_audits" on ward_round_audits for all using (true) with check (true);
create policy "allow all audit_log" on audit_log for all using (true) with check (true);
create policy "allow all hh_observations" on hh_observations for all using (true) with check (true);

-- Public storage bucket for Hand Hygiene attachments (a photo or file
-- attached to an observation). Open access, matching this app's policy
-- convention everywhere else.
insert into storage.buckets (id, name, public)
values ('hh-attachments', 'hh-attachments', true)
on conflict (id) do nothing;

create policy "allow all read hh-attachments" on storage.objects for select using (bucket_id = 'hh-attachments');
create policy "allow all insert hh-attachments" on storage.objects for insert with check (bucket_id = 'hh-attachments');
create policy "allow all update hh-attachments" on storage.objects for update using (bucket_id = 'hh-attachments') with check (bucket_id = 'hh-attachments');
create policy "allow all delete hh-attachments" on storage.objects for delete using (bucket_id = 'hh-attachments');

-- Same, for Ward Round audit attachments.
insert into storage.buckets (id, name, public)
values ('ward-round-attachments', 'ward-round-attachments', true)
on conflict (id) do nothing;

create policy "allow all read ward-round-attachments" on storage.objects for select using (bucket_id = 'ward-round-attachments');
create policy "allow all insert ward-round-attachments" on storage.objects for insert with check (bucket_id = 'ward-round-attachments');
create policy "allow all update ward-round-attachments" on storage.objects for update using (bucket_id = 'ward-round-attachments') with check (bucket_id = 'ward-round-attachments');
create policy "allow all delete ward-round-attachments" on storage.objects for delete using (bucket_id = 'ward-round-attachments');

-- Seed the six checklist types from the hospital's paper/Excel Daily Ward Round
-- form. NOTE: a few bundle-component texts were cut off in the source file
-- (the sheet itself truncates around 60 characters) — finish the exact
-- official wording for those from Settings → checklist items before go-live.
insert into checklist_types (code, name_ar, name_en, items, departments, sort_order) values
('SSI', 'Surgical Site Infection (SSI)', 'Surgical Site Infection', '[
  "1. Antibiotic(s) was (were) given within one (1) hour before incision",
  "2. Prophylactic antibiotic(s) is (are) consistent with our guidelines",
  "3. Discontinuation of prophylactic antibiotic(s) within 24 hours",
  "4. Appropriate hair removal — Was hair at the incisional site removed appropriately",
  "5. Maintenance of pre/postoperative glucose control — Serum glucose target met",
  "6. Maintenance of pre/postoperative normothermia (for applicable procedures)",
  "7. Use appropriate antiseptic solution"
]'::jsonb, '["Surgery","OB/GYN"]'::jsonb, 1),

('CAUTI', 'Catheter-Associated UTI (CAUTI)', 'Catheter-Associated UTI', '[
  "1. Avoid unnecessary urinary catheters",
  "2. Insert using aseptic technique",
  "3. Hand hygiene before insertion of urinary catheter",
  "4. Use sterile equipment (gloves, drape, sponges, sterile solution)",
  "5. Use of smallest catheter size as possible",
  "6. Maintain catheters based on recommended guidelines",
  "7. Maintain a sterile, continuously closed drainage system",
  "8. Keep catheter properly secured to prevent movement",
  "9. Keep collection bag below the level of the bladder at all times",
  "10. Maintain unobstructed urine flow",
  "11. Empty collection bag regularly",
  "12. Routine hygiene (cleansing of the meatal surface)",
  "13. Collection of urine samples should follow aseptic technique",
  "14. Review urinary catheter necessity daily and remove promptly when no longer indicated"
]'::jsonb, '["ICU","Surgery","OB/GYN"]'::jsonb, 2),

('VAE_ICU', 'Ventilator-Associated Event — ICU (VAE)', 'Ventilator-Associated Event — ICU', '[
  "1. Elevation of the head of the bed to between 30 and 45 degrees",
  "2. Daily sedative interruption & daily assessment of readiness to extubate",
  "3. Peptic ulcer disease (PUD) prophylaxis",
  "4. Deep venous thrombosis (DVT) prophylaxis (unless contraindicated)",
  "5. Daily oral care with appropriate antiseptic solution"
]'::jsonb, '["ICU"]'::jsonb, 3),

('VAE_NICU', 'Ventilator-Associated Event — NICU (VAE)', 'Ventilator-Associated Event — NICU', '[
  "1. Hand hygiene",
  "2. Semi-recumbent position",
  "3. Mouth rinse with an appropriate solution",
  "4. Appropriate ventilator circuit care",
  "5. Daily assessment of readiness to extubate"
]'::jsonb, '["NICU"]'::jsonb, 4),

('CLABSI_ICU', 'Central Line-Associated Bloodstream Infection — ICU (CLABSI)', 'Central Line-Associated Bloodstream Infection — ICU', '[
  "1. Hand hygiene",
  "2. Maximal barrier precautions",
  "3. Cap",
  "4. Mask",
  "5. Sterile gloves",
  "6. Sterile gown",
  "7. Large sterile drape",
  "8. 2% chlorhexidine in alcohol for adults, pediatrics & neonates ≥2 months",
  "9. 2% aqueous chlorhexidine for neonates <2 weeks or <1500 g",
  "10. Subclavian vein for adults, femoral for pediatrics, and appropriate site for neonates",
  "11. Insertion compliance: compliant for the above (insertion bundle)",
  "12. Hand hygiene (maintenance)",
  "13. Daily assessment of catheter necessity with prompt removal",
  "14. Proper dressing choice (transparent semipermeable dressing)",
  "15. Proper frequency of dressing change",
  "16. Proper replacement of administration sets"
]'::jsonb, '["ICU"]'::jsonb, 5),

('CLABSI_NICU', 'Central Line-Associated Bloodstream Infection — NICU (CLABSI)', 'Central Line-Associated Bloodstream Infection — NICU', '[
  "1. Hand hygiene",
  "2. Maximal barrier precautions",
  "3. Cap",
  "4. Mask",
  "5. Sterile gloves",
  "6. Sterile gown",
  "7. Large sterile drape",
  "8. 2% chlorhexidine in alcohol for adults, pediatrics & neonates ≥2 months",
  "9. 2% aqueous chlorhexidine for neonates <2 weeks or <1500 g",
  "10. Subclavian vein for adults, femoral for pediatrics, and appropriate site for neonates",
  "11. Insertion compliance: compliant for the above (insertion bundle)",
  "12. Hand hygiene (maintenance)",
  "13. Daily assessment of catheter necessity with prompt removal",
  "14. Proper dressing choice (transparent semipermeable dressing)",
  "15. Proper frequency of dressing change",
  "16. Proper replacement of administration sets"
]'::jsonb, '["NICU"]'::jsonb, 6)
on conflict (code) do nothing;

-- Stock Requests — a separate module: other departments/clinics request
-- supplies (PPE, disinfectants, etc.) from Infection Control's own stock.
-- Ward Staff accounts are scoped to a single department here (their
-- users.department), so they only ever see/submit requests for their own
-- department; Owner/IC see and fulfill requests across all departments.
create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  department text not null default '',
  name text not null,
  unit text not null default 'unit',
  min_qty numeric not null default 0,
  max_qty numeric not null default 0,
  current_qty numeric not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists stock_requests (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null,
  item_id uuid references stock_items(id),
  item_name text not null default '',
  unit text not null default '',
  quantity_requested numeric not null,
  quantity_issued numeric,
  status text not null default 'pending', -- pending | issued | partial | cancelled
  notes text not null default '',
  requested_by text not null default '',
  issued_by text,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

alter table stock_items enable row level security;
alter table stock_requests enable row level security;
create policy "allow all stock_items" on stock_items for all using (true) with check (true);
create policy "allow all stock_requests" on stock_requests for all using (true) with check (true);

-- Employee Health / Clinic — mirrors the hospital's real Employee Clinic
-- tracking sheet: staff roster (incl. Kitchen Staff, who need extra
-- investigations/vaccines), an investigation + PPD (+ stool/urine for
-- kitchen staff) workflow status per employee, doctor-requested vaccines,
-- and per-dose vaccination logging with batch numbers. Owner/IC only; not
-- tied to login accounts since most staff being tracked won't have one.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null default '',
  name text not null,
  department text not null,
  job_title text not null default '',
  file_no text not null default '',
  iqama_no text not null default '',
  date_of_birth date,
  phone text not null default '',
  is_kitchen_staff boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists health_item_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'vaccine', -- vaccine | screening
  recurrence_months int, -- null = one-time, otherwise repeats every N months
  dose_schedule jsonb not null default '[0]'::jsonb, -- month offsets from the 1st dose date, one per dose (e.g. [0,1,6])
  kitchen_only boolean not null default false, -- only offered/shown for employees marked Kitchen Staff
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists employee_health_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  item_type_id uuid references health_item_types(id),
  item_name text not null default '',
  dose_number int not null default 1,
  batch_no text not null default '',
  date_given date not null default current_date,
  result text not null default '',
  next_due_date date,
  notes text not null default '',
  recorded_by text not null default '',
  created_at timestamptz not null default now(),
  unique (employee_id, item_type_id, dose_number) -- one editable cell per employee+vaccine+dose, mirroring the source sheet
);

-- Doctor's request that an employee receive a given vaccine (a checkbox
-- in the source sheet) — separate from actually logging doses given.
create table if not exists employee_vaccine_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  item_type_id uuid not null references health_item_types(id) on delete cascade,
  requested_at timestamptz not null default now(),
  requested_by text not null default '',
  unique(employee_id, item_type_id)
);

-- One row per employee: investigation workflow status, PPD, and (kitchen
-- only) stool/urine test tracking.
create table if not exists employee_clinic_status (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references employees(id) on delete cascade,
  investigation_status text not null default 'review_due', -- review_due | sample_not_given | review_done
  ppd_status text, -- done | refused
  ppd_result text not null default '', -- e.g. Negative / Positive, only meaningful when ppd_status = 'done'
  ppd_test_date date,
  ppd_next_due_date date,
  stool_urine_status text, -- done | refused
  stool_urine_test_date date,
  stool_urine_next_due_date date,
  icn_remarks text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table employees enable row level security;
alter table health_item_types enable row level security;
alter table employee_health_records enable row level security;
alter table employee_vaccine_requests enable row level security;
alter table employee_clinic_status enable row level security;
create policy "allow all employees" on employees for all using (true) with check (true);
create policy "allow all health_item_types" on health_item_types for all using (true) with check (true);
create policy "allow all employee_health_records" on employee_health_records for all using (true) with check (true);
create policy "allow all employee_vaccine_requests" on employee_vaccine_requests for all using (true) with check (true);
create policy "allow all employee_clinic_status" on employee_clinic_status for all using (true) with check (true);

insert into health_item_types (name, category, recurrence_months, dose_schedule, kitchen_only, sort_order) values
('Hepatitis B (series)', 'vaccine', null, '[0,1,6]', false, 1),
('MMR (Measles, Mumps, Rubella)', 'vaccine', null, '[0,1]', false, 2),
('Varicella (Chickenpox)', 'vaccine', null, '[0,1]', false, 3),
('Influenza (Annual)', 'vaccine', 12, '[0]', false, 4),
('Tetanus toxoid', 'vaccine', null, '[0]', false, 5),
('Meningococcal (Kitchen Staff)', 'vaccine', null, '[0]', true, 6),
('Typhoid (Kitchen Staff)', 'vaccine', null, '[0]', true, 7),
('Hepatitis A (Kitchen Staff)', 'vaccine', null, '[0,1,6]', true, 8)
on conflict do nothing;

-- Communicable / Suspected-Confirmed Cases — Owner/IC track patients
-- suspected or confirmed to have a reportable communicable disease,
-- with supporting attachments (a case normally needs 2; a case can be
-- flagged so the 2nd isn't required, and it still shows complete) and
-- the date it was reported to the health authority.
create table if not exists disease_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists communicable_cases (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  patient_name text not null,
  rh_no text not null default '',
  status text not null default 'suspected', -- suspected | confirmed
  disease_type_id uuid references disease_types(id),
  disease_name text not null default '',
  disease_other text not null default '',
  reported_at date,
  attachment1_path text,
  attachment1_name text,
  attachment2_path text,
  attachment2_name text,
  attachment2_not_required boolean not null default false,
  ipc_note text not null default '',
  done_by text not null default '',
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

alter table disease_types enable row level security;
alter table communicable_cases enable row level security;
create policy "allow all disease_types" on disease_types for all using (true) with check (true);
create policy "allow all communicable_cases" on communicable_cases for all using (true) with check (true);

insert into disease_types (name, sort_order) values
('Tuberculosis (TB)', 1),
('Measles', 2),
('Meningitis', 3),
('COVID-19', 4),
('Influenza', 5),
('Chickenpox (Varicella)', 6),
('Mumps', 7),
('Pertussis (Whooping Cough)', 8),
('Hepatitis A', 9),
('Hepatitis B', 10),
('Other', 99)
on conflict do nothing;

-- Public storage bucket for case attachments.
insert into storage.buckets (id, name, public)
values ('case-attachments', 'case-attachments', true)
on conflict (id) do nothing;

create policy "allow all read case-attachments" on storage.objects for select using (bucket_id = 'case-attachments');
create policy "allow all insert case-attachments" on storage.objects for insert with check (bucket_id = 'case-attachments');
create policy "allow all update case-attachments" on storage.objects for update using (bucket_id = 'case-attachments') with check (bucket_id = 'case-attachments');
create policy "allow all delete case-attachments" on storage.objects for delete using (bucket_id = 'case-attachments');

-- Internal messaging: any account can message any other account (a simple
-- one-on-one chat, not tied to departments/roles like the rest of the app).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_username text not null,
  recipient_username text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_recipient_idx on messages (recipient_username, read_at);
create index if not exists messages_sender_idx on messages (sender_username);

alter table messages enable row level security;
create policy "allow all messages" on messages for all using (true) with check (true);

-- Powers live delivery on the Messages page (new messages/read receipts
-- appear without a manual refresh).
alter publication supabase_realtime add table messages;

-- Daily IC Rounds: a simple daily MET/NOT MET check per department/unit
-- (separate from — and simpler than — the detailed per-patient Ward Round
-- bundles). A NOT MET round carries its own finding/corrective-action
-- tracking fields, mirroring the clinic's paper "Daily Infection Control
-- Rounds" sheet (round block + finding/attachment/corrective action/date
-- of discussion/open-close status).
alter table app_config add column if not exists ic_round_departments jsonb not null default '["Male Ward","Female Ward","ICU","NICU","Surgery","OB/GYN","Emergency","OPD"]'::jsonb;

create table if not exists ic_rounds (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  department text not null,
  result text not null default 'met', -- 'met' | 'not_met'
  finding text not null default '',
  attachment_path text,
  attachment_name text,
  corrective_action text not null default '',
  date_of_discussion date,
  status text not null default 'open', -- 'open' | 'closed' — only meaningful when result = 'not_met'
  done_by text not null default '',
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ic_rounds enable row level security;
create policy "allow all ic_rounds" on ic_rounds for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('ic-round-attachments', 'ic-round-attachments', true)
on conflict (id) do nothing;

create policy "allow all read ic-round-attachments" on storage.objects for select using (bucket_id = 'ic-round-attachments');
create policy "allow all insert ic-round-attachments" on storage.objects for insert with check (bucket_id = 'ic-round-attachments');
create policy "allow all update ic-round-attachments" on storage.objects for update using (bucket_id = 'ic-round-attachments') with check (bucket_id = 'ic-round-attachments');
create policy "allow all delete ic-round-attachments" on storage.objects for delete using (bucket_id = 'ic-round-attachments');
