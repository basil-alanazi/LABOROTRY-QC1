-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table department_assignments add column if not exists period text not null default 'morning';

alter table department_assignments drop constraint if exists department_assignments_staff_id_date_key;
alter table department_assignments add constraint department_assignments_staff_date_period_key unique (staff_id, date, period);
