-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table schedule_entries add column if not exists is_late boolean not null default false;
alter table schedule_entries add column if not exists is_absent boolean not null default false;
alter table schedule_entries add column if not exists is_sick boolean not null default false;
