-- Run this in your Supabase project's SQL Editor.

alter table riqas_cycles add column if not exists cycle_number text not null default '';
alter table riqas_cycles add column if not exists sample_number text not null default '';
alter table riqas_cycles add column if not exists equipment_id uuid references equipment(id);
alter table riqas_cycles add column if not exists graded_date date;

create table if not exists riqas_results (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references riqas_cycles(id) on delete cascade,
  analyte_name text not null default '',
  result_value text not null default '',
  pass_status text not null default 'pending',
  entered_by text not null default '',
  entered_date date default current_date,
  sort_order integer default 0,
  created_at timestamptz default now()
);
alter table riqas_results enable row level security;
create policy "allow all riqas_results" on riqas_results for all using (true) with check (true);
