-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table app_config add column if not exists app_title text not null default 'QC Log';
alter table app_config add column if not exists app_subtitle text not null default 'Rabia Hospital · Quality Control';
alter table app_config add column if not exists theme_color text not null default '#0F7173';

alter table custom_tables add column if not exists pinned boolean not null default false;
alter table custom_tables add column if not exists nav_icon text not null default 'Table2';

create table if not exists portal_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table portal_accounts enable row level security;
create policy "allow all portal_accounts" on portal_accounts for all using (true) with check (true);
