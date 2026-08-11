-- Caches the Gemini File API reference for each uploaded policy PDF, so
-- api/ask-policy.js doesn't re-download from Supabase Storage and
-- re-upload to Gemini on every single question (that round trip for a
-- large "compiled" policy PDF was slow enough to make ordinary chat
-- messages time out). Gemini keeps uploaded files for ~48h, so a cached
-- reference is reused until it's close to that age, then refreshed.
create table if not exists gemini_file_cache (
  knowledge_base_id uuid primary key references knowledge_base(id) on delete cascade,
  file_uri text not null,
  uploaded_at timestamptz not null default now()
);

alter table gemini_file_cache enable row level security;
-- No policies on purpose — read/written only by api/ask-policy.js with
-- the service role key, same pattern as otp_codes and fixed_account_auth.
