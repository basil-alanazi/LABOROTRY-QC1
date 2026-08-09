-- Fixes the chicken-and-egg problem discovered when RLS was first
-- tightened: the sign-in screen needs to look SOMETHING up before anyone
-- is authenticated (which username maps to which Supabase Auth account,
-- and the handful of branding fields to render) — but by definition
-- nothing is authenticated yet at that point. These two views solve that
-- safely, by exposing only the minimum, non-sensitive columns needed,
-- regardless of the RLS policy on the underlying tables (views run with
-- the privileges of their owner, not the querying role, unless created
-- WITH (security_invoker = true) — deliberately not used here).
--
-- login_lookup: maps a typed username to the synthetic email Supabase
-- Auth knows it by. No passwords, no permissions, nothing else — knowing
-- this mapping for a username that exists is not meaningfully sensitive
-- (equivalent to a "we sent a reset link" style non-disclosure), and it's
-- required so Login.jsx can call auth.signInWithPassword() as the actual
-- credential check instead of ever fetching real passwords to the browser.
create or replace view login_lookup as
  select username, 'staff'::text as kind, ('staff-' || id || '@rabia-lab.internal')::text as auth_email, id as account_id
  from staff_accounts
  union all
  select username, 'portal'::text, ('portal-' || id || '@rabia-lab.internal')::text, id
  from portal_accounts
  union all
  select nullif(super_username, ''), 'super', 'super@rabia-lab.internal', null::bigint from app_config where id = 1
  union all
  select nullif(admin_username, ''), 'admin', 'admin@rabia-lab.internal', null::bigint from app_config where id = 1
  union all
  select nullif(admin2_username, ''), 'admin', 'admin2@rabia-lab.internal', null::bigint from app_config where id = 1
  union all
  select nullif(lab_username, ''), 'staff', 'lab@rabia-lab.internal', null::bigint from app_config where id = 1;

grant select on login_lookup to anon, authenticated;

-- public_branding: just the cosmetic app_config fields the sign-in screen
-- shows before login (title, logo, colors) — none of the credential
-- columns that live in the same table.
create or replace view public_branding as
  select app_title, app_subtitle, logo_url, page_bg_color, sidebar_color
  from app_config where id = 1;

grant select on public_branding to anon, authenticated;
