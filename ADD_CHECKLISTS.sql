-- Run this in your Supabase project's SQL Editor.

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  department text,
  sort_order integer default 0,
  deleted boolean default false,
  created_at timestamptz default now()
);
alter table checklist_items enable row level security;
create policy "allow all checklist_items" on checklist_items for all using (true) with check (true);

create table if not exists checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references checklist_items(id) on delete cascade,
  period_key text not null,          -- '2026-07-12' for daily, '2026-W28' for weekly, '2026-07' for monthly
  completed_by text,
  completed_at timestamptz default now(),
  unique (item_id, period_key)
);
alter table checklist_completions enable row level security;
create policy "allow all checklist_completions" on checklist_completions for all using (true) with check (true);
