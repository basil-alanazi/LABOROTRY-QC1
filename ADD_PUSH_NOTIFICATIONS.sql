-- Run this in your existing QC Log Supabase project's SQL Editor.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(username, endpoint)
);
alter table push_subscriptions enable row level security;
create policy "allow all push_subscriptions" on push_subscriptions for all using (true) with check (true);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  date date not null,
  notif_type text not null,
  sent_at timestamptz default now(),
  unique(staff_id, date, notif_type)
);
alter table notification_log enable row level security;
create policy "allow all notification_log" on notification_log for all using (true) with check (true);
