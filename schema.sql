-- ود — قاعدة بيانات Cloudflare D1 (dad-health-db)
-- الأوقات بصيغة ISO (UTC). كل البيانات الصحية مربوطة بمريض، وكل مريض بعائلة.

-- ===== الحسابات =====
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL
);

-- role: owner = صاحب الحساب، member = فرد. is_admin = مدير الموقع (يسوي حسابات العائلات)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  family_id INTEGER NOT NULL REFERENCES families(id),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER
);

-- الجلسات: نخزن hash التوكن بس، والتوكن نفسه في كوكي HttpOnly
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

-- محاولات الدخول الغلط (حماية من التخمين)
CREATE TABLE IF NOT EXISTS login_attempts (
  k TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS login_attempts_k_idx ON login_attempts (k, created_at);

-- ===== المرضى =====
-- الملف الصحي + خطة الدكتور + أوقات التذكير
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  family_id INTEGER NOT NULL REFERENCES families(id),
  archived INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  sex TEXT,                 -- male / female
  birth_year INTEGER,
  height_cm REAL,
  weight_kg REAL,
  activity TEXT DEFAULT 'light',   -- sedentary / light / moderate / active
  conditions TEXT NOT NULL DEFAULT '[]',  -- JSON: diabetes1, diabetes2, hypertension, kidney, cholesterol, heart, gout, ...
  allergies TEXT,
  likes TEXT,
  dislikes TEXT,
  history TEXT,             -- التاريخ المرضي والعمليات
  -- الإنسولين (اختياري)
  uses_insulin INTEGER NOT NULL DEFAULT 0,
  tresiba_titration INTEGER NOT NULL DEFAULT 0,  -- قاعدة زيادة Tresiba حسب قراءات الصيام
  humalog_breakfast REAL NOT NULL DEFAULT 0,
  humalog_lunch REAL NOT NULL DEFAULT 0,
  humalog_dinner REAL NOT NULL DEFAULT 0,
  tresiba_dose REAL NOT NULL DEFAULT 0,
  -- الأهداف
  low_threshold INTEGER NOT NULL DEFAULT 70,
  fasting_low INTEGER NOT NULL DEFAULT 80,
  fasting_high INTEGER NOT NULL DEFAULT 130,
  post_low INTEGER NOT NULL DEFAULT 100,
  post_high INTEGER NOT NULL DEFAULT 180,
  bp_sys_high INTEGER NOT NULL DEFAULT 140,
  bp_dia_high INTEGER NOT NULL DEFAULT 90,
  reminders TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ===== القياسات والسجلات (كلها لكل مريض) =====
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  glucose INTEGER NOT NULL CHECK (glucose BETWEEN 10 AND 700),
  -- fasting / after_breakfast / before_lunch / after_lunch / before_dinner / after_dinner / bedtime / random
  context TEXT NOT NULL DEFAULT 'random',
  note TEXT,
  last_meal_at TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS readings_p_idx ON readings (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  insulin TEXT NOT NULL,   -- Humalog / Tresiba
  slot TEXT NOT NULL,      -- breakfast / lunch / dinner / bedtime
  units REAL NOT NULL CHECK (units > 0 AND units <= 100),
  planned_units REAL,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS doses_p_idx ON doses (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bp_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  systolic INTEGER CHECK (systolic IS NULL OR systolic BETWEEN 50 AND 260),
  diastolic INTEGER CHECK (diastolic IS NULL OR diastolic BETWEEN 30 AND 160),
  pulse INTEGER CHECK (pulse IS NULL OR pulse BETWEEN 30 AND 220),
  spo2 INTEGER CHECK (spo2 IS NULL OR spo2 BETWEEN 50 AND 100),
  note TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS bp_p_idx ON bp_readings (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tresiba_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  old_dose REAL,
  new_dose REAL NOT NULL,
  reason TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL,
  dose TEXT,
  times TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  patient_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS med_doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  medication_id INTEGER NOT NULL,
  time_slot TEXT NOT NULL,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS med_doses_p_idx ON med_doses (patient_id, created_at DESC);

-- at = وقت الموعد بتوقيت الرياض مثل 2026-11-02T09:30
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  at TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'visit',   -- visit / lab / other
  place TEXT,
  notes TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  text TEXT NOT NULL,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS notes_p_idx ON notes (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  taken_on TEXT NOT NULL,
  test TEXT NOT NULL DEFAULT 'hba1c',
  value REAL NOT NULL,
  unit TEXT,
  notes TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  slot TEXT NOT NULL,   -- breakfast / lunch / dinner / snack
  followed INTEGER NOT NULL DEFAULT 1,
  text TEXT,
  patient_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  photo TEXT,     -- صورة الأكل (data:image/jpeg;base64، صغيرة)
  analysis TEXT   -- تحليل الصورة بالذكاء الاصطناعي (JSON)
);
CREATE INDEX IF NOT EXISTS meals_p_idx ON meals (patient_id, created_at DESC);

-- الحميات اللي سواها الذكاء الاصطناعي (plan = JSON)
CREATE TABLE IF NOT EXISTS diet_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  patient_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  model TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS diet_plans_p_idx ON diet_plans (patient_id, created_at DESC);

-- صور الأكلات اللي يولّدها الذكاء الاصطناعي (مشتركة، حسب وصف الأكلة)
CREATE TABLE IF NOT EXISTS food_images (
  k TEXT PRIMARY KEY,   -- SHA-256 لوصف الأكلة
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  image TEXT NOT NULL   -- data:image/jpeg;base64
);

-- نصائح الأمراض المزمنة من الذكاء الاصطناعي (advice = JSON)
CREATE TABLE IF NOT EXISTS health_advice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  patient_id INTEGER NOT NULL,
  advice TEXT NOT NULL,
  model TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS health_advice_p_idx ON health_advice (patient_id, created_at DESC);

-- ===== الإشعارات =====
CREATE TABLE IF NOT EXISTS secrets (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  name TEXT,
  mode TEXT NOT NULL DEFAULT 'all',  -- all / alerts
  family_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS sent_log (k TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
