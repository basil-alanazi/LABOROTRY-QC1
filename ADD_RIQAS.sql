-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists riqas_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists riqas_cycles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references riqas_programs(id) on delete cascade,
  lot_number text not null default '',
  received_date date not null default current_date,
  expiry_date date,
  submission_deadline date,
  submitted boolean not null default false,
  submitted_date date,
  submitted_by text,
  score_status text not null default 'pending',
  score_summary text not null default '',
  note text not null default '',
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table riqas_programs enable row level security;
alter table riqas_cycles enable row level security;
create policy "allow all riqas_programs" on riqas_programs for all using (true) with check (true);
create policy "allow all riqas_cycles" on riqas_cycles for all using (true) with check (true);
