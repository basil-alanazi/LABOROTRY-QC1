-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists department_swap_requests (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  requester_staff_id uuid references staff_members(id),
  target_staff_id uuid references staff_members(id),
  requester_department text not null default '',
  target_department text not null default '',
  status text not null default 'pending',
  requested_by text not null default '',
  responded_by text,
  responded_at timestamptz,
  created_at timestamptz default now()
);
alter table department_swap_requests enable row level security;
create policy "allow all department_swap_requests" on department_swap_requests for all using (true) with check (true);
