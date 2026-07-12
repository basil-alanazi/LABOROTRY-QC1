-- Run this in your Supabase project's SQL Editor.
alter table user_profiles add column if not exists custom_welcome_message text;
alter table staff_members add column if not exists role_type text; -- 'Lab Specialist' | 'Staff Supervisor' | 'Controls Supervisor'
