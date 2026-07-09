-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  from_username text not null,
  to_username text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz default now()
);
alter table chat_messages enable row level security;
create policy "allow all chat_messages" on chat_messages for all using (true) with check (true);
