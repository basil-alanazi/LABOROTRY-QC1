-- صحة الوالد — انسخ الملف كامل والصقه في Supabase → SQL Editor → Run

-- قراءات السكر. الوقت يتسجل تلقائيًا من السيرفر.
create table if not exists readings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  glucose int not null check (glucose between 10 and 700),
  -- fasting / after_breakfast / after_lunch / after_dinner / random
  context text not null default 'random',
  note text
);
create index if not exists readings_created_at_idx on readings (created_at desc);

-- جرعات الإنسولين اللي أخذها فعلًا
create table if not exists doses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  insulin text not null,          -- Humalog / Tresiba
  slot text not null,             -- breakfast / lunch / dinner / bedtime
  units numeric(5,1) not null check (units > 0 and units <= 100)
);
create index if not exists doses_created_at_idx on doses (created_at desc);

-- سجل تغييرات جرعة Tresiba (عشان الدكتور يشوف متى ولماذا تغيرت)
create table if not exists tresiba_changes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  old_dose numeric(5,1),
  new_dose numeric(5,1) not null,
  reason text
);

-- خطة الدكتور (صف واحد فقط id = 1)
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  patient_name text default 'الوالد',
  humalog_breakfast numeric(5,1) not null default 20,
  humalog_lunch numeric(5,1) not null default 20,
  humalog_dinner numeric(5,1) not null default 12,
  tresiba_dose numeric(5,1) not null default 40,
  low_threshold int not null default 70,      -- تحته = هبوط
  fasting_low int not null default 80,         -- هدف الصيام
  fasting_high int not null default 130,
  post_low int not null default 100,           -- هدف بعد الأكل بساعتين
  post_high int not null default 180,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- بدون تسجيل دخول: أي أحد عنده رابط الموقع يقدر يقرأ ويكتب
alter table readings enable row level security;
alter table doses enable row level security;
alter table tresiba_changes enable row level security;
alter table settings enable row level security;

drop policy if exists "anon all readings" on readings;
create policy "anon all readings" on readings for all to anon using (true) with check (true);
drop policy if exists "anon all doses" on doses;
create policy "anon all doses" on doses for all to anon using (true) with check (true);
drop policy if exists "anon read tresiba" on tresiba_changes;
create policy "anon read tresiba" on tresiba_changes for select to anon using (true);
drop policy if exists "anon add tresiba" on tresiba_changes;
create policy "anon add tresiba" on tresiba_changes for insert to anon with check (true);

drop policy if exists "anon read settings" on settings;
create policy "anon read settings" on settings for select to anon using (true);
drop policy if exists "anon update settings" on settings;
create policy "anon update settings" on settings for update to anon using (id = 1) with check (id = 1);

-- عشان أي تسجيل يظهر عند كل العائلة مباشرة بدون تحديث الصفحة
do $$ begin
  alter publication supabase_realtime add table readings;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table doses;
exception when duplicate_object then null;
end $$;
