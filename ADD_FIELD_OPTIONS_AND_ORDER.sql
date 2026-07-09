-- Run this in your existing QC Log Supabase project's SQL Editor.

alter table module_custom_fields add column if not exists sort_order numeric not null default 0;

create table if not exists module_field_options (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  field_key text not null,
  option_value text not null,
  sort_order numeric not null default 0,
  created_at timestamptz default now()
);
alter table module_field_options enable row level security;
create policy "allow all module_field_options" on module_field_options for all using (true) with check (true);
