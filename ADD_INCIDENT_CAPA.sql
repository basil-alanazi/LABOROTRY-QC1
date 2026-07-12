-- Run this in your Supabase project's SQL Editor.

create table if not exists shift_handovers (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  shift text not null default '',
  department text not null default '',
  handover_by text not null default '',
  received_by text not null default '',
  time text not null default '',
  pending_work text not null default '',
  equipment_notes text not null default '',
  incidents text not null default '',
  other_notes text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);
alter table shift_handovers enable row level security;
create policy "allow all shift_handovers" on shift_handovers for all using (true) with check (true);

create table if not exists incident_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  time text not null default '',
  shift text not null default '',
  department text not null default '',
  incident_type text not null default '',
  description text not null default '',
  immediate_action text not null default '',
  reported_by text not null default '',
  severity text not null default '',
  status text not null default 'open',
  extra_data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);
alter table incident_reports enable row level security;
create policy "allow all incident_reports" on incident_reports for all using (true) with check (true);

create table if not exists capa_records (
  id uuid primary key default gen_random_uuid(),
  date_opened date not null default current_date,
  source text not null default '',
  issue_description text not null default '',
  root_cause text not null default '',
  corrective_action text not null default '',
  preventive_action text not null default '',
  responsible_person text not null default '',
  due_date date,
  verification_method text not null default '',
  status text not null default 'open',
  closed_date date,
  extra_data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);
alter table capa_records enable row level security;
create policy "allow all capa_records" on capa_records for all using (true) with check (true);
