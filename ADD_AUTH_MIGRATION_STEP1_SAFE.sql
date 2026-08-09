-- STEP 1 of the real-authentication migration. Safe to run any time —
-- purely additive, changes no existing behavior, and login keeps working
-- exactly as it does today after this runs.
--
-- Purpose: give every login account (the 4 fixed roles in app_config, plus
-- every staff_accounts / portal_accounts row) a matching Supabase Auth user,
-- so the app can start getting a real, verified session (auth.uid()) at
-- login instead of trusting whatever the browser claims. That verified
-- session is what api/migrate-auth-users.js and Login.jsx use, and it's
-- the prerequisite for ADD_AUTH_MIGRATION_STEP2_TIGHTEN_RLS.sql (run that
-- one LAST, only after this step + the app deploy are confirmed working).

alter table staff_accounts add column if not exists auth_user_id uuid;
alter table portal_accounts add column if not exists auth_user_id uuid;

create table if not exists fixed_account_auth (
  slot text primary key, -- 'super' | 'admin' | 'admin2' | 'lab' — matches app_config's *_username/*_password columns
  auth_user_id uuid,
  email text not null
);
insert into fixed_account_auth (slot, email) values
  ('super', 'super@rabia-lab.internal'),
  ('admin', 'admin@rabia-lab.internal'),
  ('admin2', 'admin2@rabia-lab.internal'),
  ('lab', 'lab@rabia-lab.internal')
on conflict (slot) do nothing;

alter table fixed_account_auth enable row level security;
-- No policies on purpose — like otp_codes, this is only ever read/written
-- server-side with the service role key (api/migrate-auth-users.js,
-- api/set-password.js), never by the browser's anon key.
