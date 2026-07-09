-- Run this in your existing QC Log Supabase project's SQL Editor.

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
