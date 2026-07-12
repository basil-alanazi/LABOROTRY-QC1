-- Run this in your Supabase project's SQL Editor.
create table if not exists employee_of_month (
  id uuid primary key default gen_random_uuid(),
  month text not null,              -- '2026-07'
  staff_id uuid references staff_members(id) on delete cascade,
  score integer not null default 0, -- 0-100
  notes text not null default '',
  is_winner boolean not null default false,
  created_by text,
  created_at timestamptz default now(),
  unique (month, staff_id)
);
alter table employee_of_month enable row level security;
create policy "allow all employee_of_month" on employee_of_month for all using (true) with check (true);
