-- Run this in your Supabase project's SQL Editor.
-- Lets you grant individual staff logins extra page access beyond the
-- default staff view, the same way Custom Accounts already work.

alter table staff_accounts add column if not exists permissions jsonb default '[]'::jsonb;
