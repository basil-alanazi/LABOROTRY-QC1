-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null default '',
  serial_number text not null default '',
  install_date date,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists equipment_events (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  event_type text not null default 'maintenance',
  date date not null default current_date,
  description text not null default '',
  performed_by text not null default '',
  engineer_name text not null default '',
  resolved boolean not null default true,
  next_due_date date,
  file_note text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table equipment enable row level security;
alter table equipment_events enable row level security;
create policy "allow all equipment" on equipment for all using (true) with check (true);
create policy "allow all equipment_events" on equipment_events for all using (true) with check (true);
