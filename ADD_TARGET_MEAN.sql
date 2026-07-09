-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table qc_baselines add column if not exists target_mean numeric;
