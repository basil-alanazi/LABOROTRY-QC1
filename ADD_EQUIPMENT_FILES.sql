-- Run this in your Supabase project's SQL Editor.
create table if not exists equipment_files (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  description text,
  uploaded_by text,
  uploaded_at timestamptz default now()
);
alter table equipment_files enable row level security;
create policy "allow all equipment_files" on equipment_files for all using (true) with check (true);
