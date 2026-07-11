-- Run this in your Supabase project's SQL Editor.
create table if not exists backup_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  created_by text,
  row_count integer
);
alter table backup_log enable row level security;
create policy "allow all backup_log" on backup_log for all using (true) with check (true);
