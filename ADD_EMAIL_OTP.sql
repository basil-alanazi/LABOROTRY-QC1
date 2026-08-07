-- Optional email OTP verification step for login.
-- A username only gets the OTP prompt if it has an email on file in
-- user_profiles (set from "My profile"). Everyone else keeps logging in
-- with just username + password, unchanged.

alter table user_profiles add column if not exists email text;

-- Codes are written and checked by the send-otp / verify-otp serverless
-- functions (using the service role key), never read directly by the
-- browser — unlike the rest of this app's tables, RLS here does NOT allow
-- anon select, otherwise anyone could read a valid code straight out of
-- the table instead of receiving it by email.
create table if not exists otp_codes (
  id bigint generated always as identity primary key,
  username text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists otp_codes_username_idx on otp_codes (username, created_at desc);

alter table otp_codes enable row level security;
-- No policies created for otp_codes on purpose: with RLS enabled and zero
-- policies, PostgREST (the anon/publishable key) can't read, insert, or
-- update this table at all. Only the service role key (used server-side
-- in api/send-otp.js and api/verify-otp.js) bypasses RLS.
