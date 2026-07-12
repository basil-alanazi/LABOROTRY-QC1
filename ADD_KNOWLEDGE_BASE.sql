-- Run this in your Supabase project's SQL Editor.
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'SOP',  -- SOP | IFU | Training Video | Troubleshooting | FAQ
  title text not null default '',
  content_type text not null default 'text', -- 'text' | 'link' | 'file'
  content text not null default '',       -- the text body, or the URL, or the storage path
  description text not null default '',
  created_by text,
  deleted boolean not null default false,
  created_at timestamptz default now()
);
alter table knowledge_base enable row level security;
create policy "allow all knowledge_base" on knowledge_base for all using (true) with check (true);
