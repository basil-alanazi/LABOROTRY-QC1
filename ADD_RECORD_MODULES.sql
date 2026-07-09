-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists reject_samples (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  sample_id text not null default '',
  test_name text not null default '',
  department text not null default '',
  reason text not null default '',
  rejected_by text not null default '',
  action_taken text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists panic_values (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  patient_id text not null default '',
  test_name text not null default '',
  result text not null default '',
  panic_range text not null default '',
  physician_notified text not null default '',
  notified_by text not null default '',
  time_notified text not null default '',
  notes text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists corrective_actions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  issue_description text not null default '',
  root_cause text not null default '',
  corrective_action text not null default '',
  responsible_person text not null default '',
  status text not null default 'open',
  follow_up_date date,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table reject_samples enable row level security;
alter table panic_values enable row level security;
alter table corrective_actions enable row level security;
create policy "allow all reject_samples" on reject_samples for all using (true) with check (true);
create policy "allow all panic_values" on panic_values for all using (true) with check (true);
create policy "allow all corrective_actions" on corrective_actions for all using (true) with check (true);

alter table app_config add column if not exists hidden_pages jsonb not null default '[]'::jsonb;
