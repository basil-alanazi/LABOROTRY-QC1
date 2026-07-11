-- Run this in your Supabase project's SQL Editor.
alter table app_config add column if not exists notif_start_template text;
alter table app_config add column if not exists notif_end_template text;
