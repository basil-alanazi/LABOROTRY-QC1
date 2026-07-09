-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists qc_control_lots (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references qc_panels(id) on delete cascade,
  lot_number text not null,
  expiry_date date,
  received_date date not null default current_date,
  received_by text not null,
  created_at timestamptz default now()
);

alter table qc_control_lots enable row level security;
create policy "allow all qc_control_lots" on qc_control_lots for all using (true) with check (true);
