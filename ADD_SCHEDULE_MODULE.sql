-- Run this in your existing QC Log Supabase project's SQL Editor.

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
  start_time text not null default '',
  end_time text not null default '',
  total_hours numeric not null default 0,
  color text not null default '#0F7173',
  night_shift boolean not null default false,
  is_off boolean not null default false,
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
  status text not null default 'pending',
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
