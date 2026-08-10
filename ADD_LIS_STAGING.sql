-- Staging area for results coming in automatically from an analyzer (first
-- target: Sysmex CBC over HL7). Results land here raw and unmapped —
-- nothing writes to qc_entries automatically, because we don't yet have a
-- confirmed way to tell a QC sample from a patient sample on this specific
-- analyzer, nor a confirmed analyte-code mapping. A human reviews rows
-- here and only then turns the ones that are real QC results into actual
-- qc_entries. Safer than guessing wrong into records Westgard rules run on.
create table if not exists lis_incoming_results (
  id bigint generated always as identity primary key,
  device_name text not null,
  sample_id text,
  raw_message text not null,
  parsed jsonb not null default '[]'::jsonb, -- [{code, name, value, unit}, ...] from the OBX segments
  received_at timestamptz not null default now(),
  reviewed boolean not null default false
);

create index if not exists lis_incoming_results_received_idx on lis_incoming_results (received_at desc);

alter table lis_incoming_results enable row level security;
-- No anon/authenticated policies: this table is written only by
-- api/receive-lis-result.js (service role key) and is meant to be
-- reviewed via the Supabase table editor for now — same "server-only"
-- pattern as otp_codes and fixed_account_auth.
