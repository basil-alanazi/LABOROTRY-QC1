-- الترحيل من نسخة "مريض واحد" إلى عائلات ومرضى.
-- بيانات الوالد كلها تصير المريض رقم 1 في عائلة السطام (رقم 1).
-- الجداول القديمة محفوظة نسخة منها باسم bk_* قبل الترحيل.

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  k TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS login_attempts_k_idx ON login_attempts (k, created_at);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  family_id INTEGER NOT NULL REFERENCES families(id),
  archived INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  sex TEXT,
  birth_year INTEGER,
  height_cm REAL,
  weight_kg REAL,
  activity TEXT DEFAULT 'light',
  conditions TEXT NOT NULL DEFAULT '[]',
  allergies TEXT,
  likes TEXT,
  dislikes TEXT,
  history TEXT,
  uses_insulin INTEGER NOT NULL DEFAULT 0,
  tresiba_titration INTEGER NOT NULL DEFAULT 0,
  humalog_breakfast REAL NOT NULL DEFAULT 0,
  humalog_lunch REAL NOT NULL DEFAULT 0,
  humalog_dinner REAL NOT NULL DEFAULT 0,
  tresiba_dose REAL NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS diet_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  patient_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  model TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS diet_plans_p_idx ON diet_plans (patient_id, created_at DESC);

-- عائلة السطام، والوالد أول مريض فيها (بخطته الحالية من جدول settings القديم)
INSERT INTO families (id, name) VALUES (1, 'السطام');
INSERT INTO patients (
  id, family_id, name, sex, conditions, uses_insulin, tresiba_titration,
  humalog_breakfast, humalog_lunch, humalog_dinner, tresiba_dose,
  low_threshold, fasting_low, fasting_high, post_low, post_high, bp_sys_high, bp_dia_high, reminders
)
SELECT 1, 1, patient_name, 'male', '["diabetes2","hypertension"]', 1, 1,
  humalog_breakfast, humalog_lunch, humalog_dinner, tresiba_dose,
  low_threshold, fasting_low, fasting_high, post_low, post_high, bp_sys_high, bp_dia_high, reminders
FROM settings WHERE id = 1;

-- ربط كل السجلات الحالية بالوالد
ALTER TABLE readings ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE readings ADD COLUMN user_id INTEGER;
ALTER TABLE doses ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE doses ADD COLUMN user_id INTEGER;
ALTER TABLE bp_readings ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bp_readings ADD COLUMN user_id INTEGER;
ALTER TABLE tresiba_changes ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE medications ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE med_doses ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE med_doses ADD COLUMN user_id INTEGER;
ALTER TABLE appointments ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN user_id INTEGER;
ALTER TABLE labs ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE meals ADD COLUMN patient_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE meals ADD COLUMN user_id INTEGER;
ALTER TABLE push_subs ADD COLUMN family_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN user_id INTEGER;

CREATE INDEX IF NOT EXISTS readings_p_idx ON readings (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS doses_p_idx ON doses (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bp_p_idx ON bp_readings (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS med_doses_p_idx ON med_doses (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_p_idx ON notes (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meals_p_idx ON meals (patient_id, created_at DESC);
