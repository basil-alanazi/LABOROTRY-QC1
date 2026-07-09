-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table qc_entries add column if not exists reviews jsonb not null default '{}'::jsonb;
-- reviews shape: {"Glu": {"status":"approved","note":"","by":"basil","at":"2026-07-09T..."}, ...}
