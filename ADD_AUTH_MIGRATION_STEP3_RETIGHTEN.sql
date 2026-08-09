-- STEP 3 — run this LAST, after ADD_LOGIN_LOOKUP_VIEWS.sql has been run
-- AND the updated Login.jsx has been deployed and confirmed working
-- (test a real login with a non-admin account).
--
-- app_config, staff_accounts, and portal_accounts were rolled back to
-- "allow all" during the first attempt at this, because Login.jsx used to
-- need to read them directly, before authenticating, to check passwords
-- client-side. Login.jsx no longer does that — it now authenticates via
-- supabase.auth.signInWithPassword() using login_lookup/public_branding
-- (see ADD_LOGIN_LOOKUP_VIEWS.sql), so these three tables can safely go
-- back to requiring a verified session, closing the hole for good.

drop policy if exists "allow all app_config" on app_config;
create policy "require auth app_config" on app_config for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all staff_accounts" on staff_accounts;
create policy "require auth staff_accounts" on staff_accounts for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all portal_accounts" on portal_accounts;
create policy "require auth portal_accounts" on portal_accounts for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ROLLBACK if needed:
-- drop policy if exists "require auth app_config" on app_config;
-- create policy "allow all app_config" on app_config for all using (true) with check (true);
-- drop policy if exists "require auth staff_accounts" on staff_accounts;
-- create policy "allow all staff_accounts" on staff_accounts for all using (true) with check (true);
-- drop policy if exists "require auth portal_accounts" on portal_accounts;
-- create policy "allow all portal_accounts" on portal_accounts for all using (true) with check (true);
