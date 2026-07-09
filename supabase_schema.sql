-- QC Log — panel/grid schema (matches the paper QC sheet: one device+level panel,
-- one shared control lot, many analytes as rows, days as columns).
-- Run this once in a NEW Supabase project's SQL Editor.

-- A panel = one device + control level, e.g. "Beckman DXC700 Serum 1 QC".
-- One lot number covers every analyte inside it.
create table if not exists qc_panels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  device text not null default '',
  lot_number text not null default '',
  -- e.g. [{"name":"Glu","unit":"mg/dL"}, {"name":"UA","unit":"mg/dL"}, ...]
  analytes jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

-- One active baseline (mean/SD) per panel + analyte + control lot.
-- Built automatically from the first 20 accepted results for that lot.
create table if not exists qc_baselines (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references qc_panels(id) on delete cascade,
  analyte_name text not null,
  lot_number text not null,
  mean numeric not null,
  sd numeric not null,
  target_mean numeric,
  point_count int not null,
  established_at timestamptz not null default now(),
  active boolean not null default true
);

-- One entry per panel per day — the whole day's results for every analyte,
-- entered and approved as a single record (matching one "Done by / Reviewed by"
-- pair per day on the paper form).
create table if not exists qc_entries (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references qc_panels(id) on delete cascade,
  date date not null default current_date,
  lot_number text not null default '',
  values jsonb not null default '{}'::jsonb,  -- {"Glu": 92, "UA": 5.6, ...}
  colors jsonb not null default '{}'::jsonb,  -- {"Glu": "green", "UA": "orange", ...}
  flags jsonb not null default '{}'::jsonb,   -- {"Glu": ["1-2s (warning)"], ...}
  reviews jsonb not null default '{}'::jsonb, -- {"Glu": {"status":"approved","note":"","by":"basil","at":"..."}}
  done_by text not null,           -- auto-filled from the logged-in user who submitted
  review_status text not null default 'pending', -- pending | approved | declined
  review_note text not null default '',
  reviewed_by text,                -- auto-filled from the logged-in admin who reviewed
  reviewed_at timestamptz,
  note text not null default '',
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists app_config (
  id int primary key default 1,
  lab_username text not null default 'lab',
  lab_password text not null default 'lab',
  admin_username text not null default 'basil',
  admin_password text not null default 'admin123',
  admin2_username text not null default 'mahmoud',
  admin2_password text not null default 'mahmoud123',
  super_username text not null default 'owner',
  super_password text not null default 'owner123',
  departments jsonb not null default '["Chemistry","Hematology","Blood Bank","Microbiology"]'::jsonb
);

insert into app_config (id) values (1) on conflict (id) do nothing;

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  description text not null,
  performed_by text not null,
  performed_at timestamptz not null default now()
);

alter table qc_panels enable row level security;
alter table qc_baselines enable row level security;
alter table qc_entries enable row level security;
alter table app_config enable row level security;
alter table audit_log enable row level security;

create policy "allow all qc_panels" on qc_panels for all using (true) with check (true);
create policy "allow all qc_baselines" on qc_baselines for all using (true) with check (true);
create policy "allow all qc_entries" on qc_entries for all using (true) with check (true);
create policy "allow all app_config" on app_config for all using (true) with check (true);
create policy "allow all audit_log" on audit_log for all using (true) with check (true);

-- Free-form custom tables (any columns you like) with the same review workflow.
create table if not exists custom_tables (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  columns jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists custom_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid references custom_tables(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'normal',
  note text not null default '',
  entered_by text not null,
  date date not null default current_date,
  review_status text not null default 'pending',
  review_note text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists files_library (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  description text not null default '',
  uploaded_by text not null,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table custom_tables enable row level security;
alter table custom_rows enable row level security;
alter table files_library enable row level security;

create policy "allow all custom_tables" on custom_tables for all using (true) with check (true);
create policy "allow all custom_rows" on custom_rows for all using (true) with check (true);
create policy "allow all files_library" on files_library for all using (true) with check (true);

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict (id) do nothing;

create policy "attachments read" on storage.objects for select using (bucket_id = 'attachments');
create policy "attachments insert" on storage.objects for insert with check (bucket_id = 'attachments');
create policy "attachments delete" on storage.objects for delete using (bucket_id = 'attachments');

-- Individual employee logins (all get "staff" permissions, same as the shared account).
create table if not exists staff_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  created_at timestamptz default now()
);

alter table staff_accounts enable row level security;
create policy "allow all staff_accounts" on staff_accounts for all using (true) with check (true);
alter table staff_accounts add column if not exists must_change_password boolean not null default true;
alter table portal_accounts add column if not exists must_change_password boolean not null default true;

-- Free-text daily department assignment per employee (independent of the
-- fixed department list in Settings — type anything here).
create table if not exists department_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  date date not null,
  department_name text not null default '',
  created_at timestamptz default now(),
  unique(staff_id, date)
);
alter table department_assignments enable row level security;
create policy "allow all department_assignments" on department_assignments for all using (true) with check (true);

-- History of every control lot ever used on a panel, with its expiry date.
create table if not exists qc_control_lots (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references qc_panels(id) on delete cascade,
  lot_number text not null,
  expiry_date date,
  received_date date not null default current_date,
  received_by text not null,
  created_at timestamptz default now()
);

alter table qc_control_lots enable row level security;
create policy "allow all qc_control_lots" on qc_control_lots for all using (true) with check (true);

-- RIQAS / external quality assessment tracking.
create table if not exists riqas_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists riqas_cycles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references riqas_programs(id) on delete cascade,
  lot_number text not null default '',
  received_date date not null default current_date,
  expiry_date date,
  submission_deadline date,
  submitted boolean not null default false,
  submitted_date date,
  submitted_by text,
  score_status text not null default 'pending', -- pending | satisfactory | unsatisfactory
  score_summary text not null default '',
  note text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table riqas_programs enable row level security;
alter table riqas_cycles enable row level security;
create policy "allow all riqas_programs" on riqas_programs for all using (true) with check (true);
create policy "allow all riqas_cycles" on riqas_cycles for all using (true) with check (true);

-- Owner branding
alter table app_config add column if not exists app_title text not null default 'QC Log';
alter table app_config add column if not exists app_subtitle text not null default 'Rabia Hospital · Quality Control';
alter table app_config add column if not exists theme_color text not null default '#0F7173';

-- Custom tables can be pinned to the main navigation as their own page.
alter table custom_tables add column if not exists pinned boolean not null default false;
alter table custom_tables add column if not exists nav_icon text not null default 'Table2';

-- Fully custom accounts with per-page permissions, created only by the owner.
create table if not exists portal_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  -- [{"page":"qc","level":"admin"}, {"page":"table:<uuid>","level":"staff"}, ...]
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table portal_accounts enable row level security;
create policy "allow all portal_accounts" on portal_accounts for all using (true) with check (true);

-- ===== Laboratory Schedule module =====

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  job_number text not null default '',
  department text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists shift_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  start_time text not null default '',  -- 'HH:MM' 24h, or blank for OFF/Vacation
  end_time text not null default '',
  total_hours numeric not null default 0,
  color text not null default '#0F7173',
  night_shift boolean not null default false,
  is_off boolean not null default false,     -- OFF / Vacation style (no real hours)
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists schedule_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  date date not null,
  shift_code text not null default '',
  note text not null default '',
  created_at timestamptz default now(),
  unique(staff_id, date)
);

create table if not exists break_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  covering_staff_id uuid references staff_members(id),
  date date not null default current_date,
  duration_minutes int not null default 15,
  status text not null default 'pending', -- pending | approved | declined | ended
  requested_by text not null default '',
  approved_by text,
  requested_at timestamptz default now(),
  approved_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);

alter table staff_members enable row level security;
alter table shift_templates enable row level security;
alter table schedule_entries enable row level security;
alter table break_sessions enable row level security;
create policy "allow all staff_members" on staff_members for all using (true) with check (true);
create policy "allow all shift_templates" on shift_templates for all using (true) with check (true);
create policy "allow all schedule_entries" on schedule_entries for all using (true) with check (true);
create policy "allow all break_sessions" on break_sessions for all using (true) with check (true);

-- Note: this is an open (RLS "allow all") setup — fine for an internal lab tool
-- with no patient data. Anyone with the app link and Supabase keys can read/write.
