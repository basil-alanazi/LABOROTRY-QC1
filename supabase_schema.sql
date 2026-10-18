-- صحة الوالد — انسخ الملف كامل والصقه في Supabase → SQL Editor → Run

-- قراءات السكر (+ جرعة الإنسولين إن وُجدت). الوقت يتسجل تلقائيًا من السيرفر.
create table if not exists readings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  glucose int not null check (glucose between 10 and 700),
  context text not null default 'random',      -- fasting / before_meal / after_meal / bedtime / random
  insulin_units numeric(5,1),                   -- الجرعة اللي أخذها فعليًا (اختياري)
  insulin_type text,                            -- مثل NovoRapid
  suggested_units numeric(5,1),                 -- اللي اقترحته الحاسبة وقتها
  note text
);
create index if not exists readings_created_at_idx on readings (created_at desc);

-- إعدادات خطة الدكتور (صف واحد فقط id = 1)
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  patient_name text default 'الوالد',
  low_threshold int not null default 70,
  high_alert int not null default 300,
  target_low int not null default 80,
  target_high int not null default 180,
  max_dose numeric(5,1) not null default 10,
  rapid_insulin text default 'NovoRapid',
  -- جدول Sliding scale: [{ "from": 150, "to": 200, "units": 2 }, ...]
  sliding_scale jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- بدون تسجيل دخول: أي أحد عنده رابط الموقع يقدر يقرأ ويكتب
alter table readings enable row level security;
alter table settings enable row level security;

drop policy if exists "anon all readings" on readings;
create policy "anon all readings" on readings for all to anon using (true) with check (true);

drop policy if exists "anon read settings" on settings;
create policy "anon read settings" on settings for select to anon using (true);
drop policy if exists "anon update settings" on settings;
create policy "anon update settings" on settings for update to anon using (id = 1) with check (id = 1);

-- عشان القراءات تظهر عند كل العائلة مباشرة بدون تحديث الصفحة
do $$ begin
  alter publication supabase_realtime add table readings;
exception when duplicate_object then null;
end $$;
