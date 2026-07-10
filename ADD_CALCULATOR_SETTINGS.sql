-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table app_config add column if not exists calculator_settings jsonb not null default '{}'::jsonb;
