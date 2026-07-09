-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table staff_accounts add column if not exists must_change_password boolean not null default true;
alter table portal_accounts add column if not exists must_change_password boolean not null default true;
