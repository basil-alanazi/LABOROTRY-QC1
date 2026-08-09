-- STEP 2 of the real-authentication migration — RUN THIS LAST.
--
-- Do NOT run this until, in order:
--   1. ADD_AUTH_MIGRATION_STEP1_SAFE.sql has been run.
--   2. api/migrate-auth-users.js has been called once successfully (check
--      its JSON response: every account should say "created" or "already
--      migrated", none should say "error").
--   3. The app has been redeployed with the updated Login.jsx / api/*.js,
--      and at least a few different people (super/admin/staff/portal) have
--      logged in successfully since that deploy.
--
-- What this does: every table currently has an "allow all" policy, which
-- means the public anon key (embedded in the browser bundle — anyone can
-- read it from devtools) can read and write EVERY row of EVERY table
-- directly, completely bypassing the app's login screen. This closes that
-- hole by requiring a verified Supabase Auth session (auth.uid() is not
-- null) for any table access at all. It does NOT yet restrict who can see
-- what once logged in (e.g. a portal account can still read staff_accounts)
-- — that finer-grained, per-role separation is a separate follow-up; this
-- step's job is just to stop completely anonymous access.
--
-- If something goes wrong after running this (e.g. you missed an account
-- in the migration and someone can log in via the UI but every page shows
-- empty data), the rollback block at the very bottom restores the old
-- "allow all" behavior — uncomment it and run it to instantly undo this
-- entire file.

drop policy if exists "allow all app_config" on app_config;
create policy "require auth app_config" on app_config for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all audit_log" on audit_log;
create policy "require auth audit_log" on audit_log for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all backup_log" on backup_log;
create policy "require auth backup_log" on backup_log for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all break_sessions" on break_sessions;
create policy "require auth break_sessions" on break_sessions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all capa_records" on capa_records;
create policy "require auth capa_records" on capa_records for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all chat_messages" on chat_messages;
create policy "require auth chat_messages" on chat_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all checklist_completions" on checklist_completions;
create policy "require auth checklist_completions" on checklist_completions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all checklist_items" on checklist_items;
create policy "require auth checklist_items" on checklist_items for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all corrective_actions" on corrective_actions;
create policy "require auth corrective_actions" on corrective_actions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all custom_rows" on custom_rows;
create policy "require auth custom_rows" on custom_rows for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all custom_tables" on custom_tables;
create policy "require auth custom_tables" on custom_tables for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all department_assignments" on department_assignments;
create policy "require auth department_assignments" on department_assignments for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all department_swap_requests" on department_swap_requests;
create policy "require auth department_swap_requests" on department_swap_requests for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all employee_of_month" on employee_of_month;
create policy "require auth employee_of_month" on employee_of_month for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all equipment" on equipment;
create policy "require auth equipment" on equipment for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all equipment_events" on equipment_events;
create policy "require auth equipment_events" on equipment_events for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all equipment_files" on equipment_files;
create policy "require auth equipment_files" on equipment_files for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all files_library" on files_library;
create policy "require auth files_library" on files_library for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all incident_reports" on incident_reports;
create policy "require auth incident_reports" on incident_reports for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all infection_diseases" on infection_diseases;
create policy "require auth infection_diseases" on infection_diseases for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all knowledge_base" on knowledge_base;
create policy "require auth knowledge_base" on knowledge_base for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all module_custom_fields" on module_custom_fields;
create policy "require auth module_custom_fields" on module_custom_fields for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all module_field_options" on module_field_options;
create policy "require auth module_field_options" on module_field_options for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all notification_log" on notification_log;
create policy "require auth notification_log" on notification_log for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all panic_values" on panic_values;
create policy "require auth panic_values" on panic_values for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all portal_accounts" on portal_accounts;
create policy "require auth portal_accounts" on portal_accounts for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all push_subscriptions" on push_subscriptions;
create policy "require auth push_subscriptions" on push_subscriptions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all qc_baselines" on qc_baselines;
create policy "require auth qc_baselines" on qc_baselines for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all qc_control_lots" on qc_control_lots;
create policy "require auth qc_control_lots" on qc_control_lots for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all qc_entries" on qc_entries;
create policy "require auth qc_entries" on qc_entries for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all qc_panels" on qc_panels;
create policy "require auth qc_panels" on qc_panels for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all reject_samples" on reject_samples;
create policy "require auth reject_samples" on reject_samples for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all riqas_cycles" on riqas_cycles;
create policy "require auth riqas_cycles" on riqas_cycles for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all riqas_programs" on riqas_programs;
create policy "require auth riqas_programs" on riqas_programs for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all riqas_results" on riqas_results;
create policy "require auth riqas_results" on riqas_results for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all schedule_entries" on schedule_entries;
create policy "require auth schedule_entries" on schedule_entries for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all shift_handovers" on shift_handovers;
create policy "require auth shift_handovers" on shift_handovers for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all shift_templates" on shift_templates;
create policy "require auth shift_templates" on shift_templates for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all staff_accounts" on staff_accounts;
create policy "require auth staff_accounts" on staff_accounts for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all staff_members" on staff_members;
create policy "require auth staff_members" on staff_members for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "allow all user_profiles" on user_profiles;
create policy "require auth user_profiles" on user_profiles for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage bucket (file attachments — KB files, equipment docs, chat
-- uploads, etc.) — same tightening, still scoped to the "attachments"
-- bucket only.
drop policy if exists "attachments read" on storage.objects;
create policy "attachments read" on storage.objects for select using (bucket_id = 'attachments' and auth.uid() is not null);
drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert with check (bucket_id = 'attachments' and auth.uid() is not null);
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments delete" on storage.objects for delete using (bucket_id = 'attachments' and auth.uid() is not null);

-- ============================================================
-- ROLLBACK — only run this if something above needs undoing.
-- Uncomment the block below (remove the /* and */) and run it.
-- ============================================================
/*
drop policy if exists "require auth app_config" on app_config;
create policy "allow all app_config" on app_config for all using (true) with check (true);
drop policy if exists "require auth audit_log" on audit_log;
create policy "allow all audit_log" on audit_log for all using (true) with check (true);
drop policy if exists "require auth backup_log" on backup_log;
create policy "allow all backup_log" on backup_log for all using (true) with check (true);
drop policy if exists "require auth break_sessions" on break_sessions;
create policy "allow all break_sessions" on break_sessions for all using (true) with check (true);
drop policy if exists "require auth capa_records" on capa_records;
create policy "allow all capa_records" on capa_records for all using (true) with check (true);
drop policy if exists "require auth chat_messages" on chat_messages;
create policy "allow all chat_messages" on chat_messages for all using (true) with check (true);
drop policy if exists "require auth checklist_completions" on checklist_completions;
create policy "allow all checklist_completions" on checklist_completions for all using (true) with check (true);
drop policy if exists "require auth checklist_items" on checklist_items;
create policy "allow all checklist_items" on checklist_items for all using (true) with check (true);
drop policy if exists "require auth corrective_actions" on corrective_actions;
create policy "allow all corrective_actions" on corrective_actions for all using (true) with check (true);
drop policy if exists "require auth custom_rows" on custom_rows;
create policy "allow all custom_rows" on custom_rows for all using (true) with check (true);
drop policy if exists "require auth custom_tables" on custom_tables;
create policy "allow all custom_tables" on custom_tables for all using (true) with check (true);
drop policy if exists "require auth department_assignments" on department_assignments;
create policy "allow all department_assignments" on department_assignments for all using (true) with check (true);
drop policy if exists "require auth department_swap_requests" on department_swap_requests;
create policy "allow all department_swap_requests" on department_swap_requests for all using (true) with check (true);
drop policy if exists "require auth employee_of_month" on employee_of_month;
create policy "allow all employee_of_month" on employee_of_month for all using (true) with check (true);
drop policy if exists "require auth equipment" on equipment;
create policy "allow all equipment" on equipment for all using (true) with check (true);
drop policy if exists "require auth equipment_events" on equipment_events;
create policy "allow all equipment_events" on equipment_events for all using (true) with check (true);
drop policy if exists "require auth equipment_files" on equipment_files;
create policy "allow all equipment_files" on equipment_files for all using (true) with check (true);
drop policy if exists "require auth files_library" on files_library;
create policy "allow all files_library" on files_library for all using (true) with check (true);
drop policy if exists "require auth incident_reports" on incident_reports;
create policy "allow all incident_reports" on incident_reports for all using (true) with check (true);
drop policy if exists "require auth infection_diseases" on infection_diseases;
create policy "allow all infection_diseases" on infection_diseases for all using (true) with check (true);
drop policy if exists "require auth knowledge_base" on knowledge_base;
create policy "allow all knowledge_base" on knowledge_base for all using (true) with check (true);
drop policy if exists "require auth module_custom_fields" on module_custom_fields;
create policy "allow all module_custom_fields" on module_custom_fields for all using (true) with check (true);
drop policy if exists "require auth module_field_options" on module_field_options;
create policy "allow all module_field_options" on module_field_options for all using (true) with check (true);
drop policy if exists "require auth notification_log" on notification_log;
create policy "allow all notification_log" on notification_log for all using (true) with check (true);
drop policy if exists "require auth panic_values" on panic_values;
create policy "allow all panic_values" on panic_values for all using (true) with check (true);
drop policy if exists "require auth portal_accounts" on portal_accounts;
create policy "allow all portal_accounts" on portal_accounts for all using (true) with check (true);
drop policy if exists "require auth push_subscriptions" on push_subscriptions;
create policy "allow all push_subscriptions" on push_subscriptions for all using (true) with check (true);
drop policy if exists "require auth qc_baselines" on qc_baselines;
create policy "allow all qc_baselines" on qc_baselines for all using (true) with check (true);
drop policy if exists "require auth qc_control_lots" on qc_control_lots;
create policy "allow all qc_control_lots" on qc_control_lots for all using (true) with check (true);
drop policy if exists "require auth qc_entries" on qc_entries;
create policy "allow all qc_entries" on qc_entries for all using (true) with check (true);
drop policy if exists "require auth qc_panels" on qc_panels;
create policy "allow all qc_panels" on qc_panels for all using (true) with check (true);
drop policy if exists "require auth reject_samples" on reject_samples;
create policy "allow all reject_samples" on reject_samples for all using (true) with check (true);
drop policy if exists "require auth riqas_cycles" on riqas_cycles;
create policy "allow all riqas_cycles" on riqas_cycles for all using (true) with check (true);
drop policy if exists "require auth riqas_programs" on riqas_programs;
create policy "allow all riqas_programs" on riqas_programs for all using (true) with check (true);
drop policy if exists "require auth riqas_results" on riqas_results;
create policy "allow all riqas_results" on riqas_results for all using (true) with check (true);
drop policy if exists "require auth schedule_entries" on schedule_entries;
create policy "allow all schedule_entries" on schedule_entries for all using (true) with check (true);
drop policy if exists "require auth shift_handovers" on shift_handovers;
create policy "allow all shift_handovers" on shift_handovers for all using (true) with check (true);
drop policy if exists "require auth shift_templates" on shift_templates;
create policy "allow all shift_templates" on shift_templates for all using (true) with check (true);
drop policy if exists "require auth staff_accounts" on staff_accounts;
create policy "allow all staff_accounts" on staff_accounts for all using (true) with check (true);
drop policy if exists "require auth staff_members" on staff_members;
create policy "allow all staff_members" on staff_members for all using (true) with check (true);
drop policy if exists "require auth user_profiles" on user_profiles;
create policy "allow all user_profiles" on user_profiles for all using (true) with check (true);
drop policy if exists "attachments read" on storage.objects;
create policy "attachments read" on storage.objects for select using (bucket_id = 'attachments');
drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert with check (bucket_id = 'attachments');
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments delete" on storage.objects for delete using (bucket_id = 'attachments');
*/
