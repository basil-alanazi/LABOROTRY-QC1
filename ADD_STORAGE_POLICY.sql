-- Run this in your Supabase project's SQL Editor.
-- Allows the app to upload, update, and read files in the "attachments"
-- storage bucket (used for equipment documents, files library, and the
-- automatic weekly backup snapshots).

create policy "allow all attachments bucket"
on storage.objects for all
using (bucket_id = 'attachments')
with check (bucket_id = 'attachments');
