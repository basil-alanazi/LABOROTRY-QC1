-- Personal profile (full name + employee ID) per username, independent of
-- which login table that username lives in (fixed accounts in app_config,
-- staff_accounts, or portal_accounts). This becomes the "signature" shown
-- everywhere a username currently appears (done_by, reviewed_by, edited_by,
-- entered by, sidebar, audit trail...).
create table if not exists user_profiles (
  username text primary key,
  full_name text not null default '',
  employee_id text not null default '',
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;
create policy "allow all user_profiles" on user_profiles for all using (true) with check (true);
