-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists module_custom_fields (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  field_key text not null,
  field_label text not null,
  created_at timestamptz default now()
);
alter table module_custom_fields enable row level security;
create policy "allow all module_custom_fields" on module_custom_fields for all using (true) with check (true);

alter table reject_samples add column if not exists extra_data jsonb not null default '{}'::jsonb;
alter table panic_values add column if not exists extra_data jsonb not null default '{}'::jsonb;
alter table corrective_actions add column if not exists extra_data jsonb not null default '{}'::jsonb;

create table if not exists infection_diseases (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  patient_id text not null default '',
  infection_type text not null default '',
  ward_department text not null default '',
  isolation_status text not null default '',
  reported_by text not null default '',
  action_taken text not null default '',
  status text not null default 'active',
  extra_data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz default now()
);
alter table infection_diseases enable row level security;
create policy "allow all infection_diseases" on infection_diseases for all using (true) with check (true);
