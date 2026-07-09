-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table app_config add column if not exists logo_url text not null default '';
alter table app_config add column if not exists sidebar_color text not null default '#1B2B2E';
alter table app_config add column if not exists page_bg_color text not null default '#F0F3F2';
