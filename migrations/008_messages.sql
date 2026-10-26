-- لغة كل جهاز للإشعارات
ALTER TABLE push_subs ADD COLUMN lang TEXT NOT NULL DEFAULT 'ar';

-- رسائل للمصمم (مدير الموقع) من أي مستخدم
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

-- ملاحظات بين العائلة والدكتور عن المريض
CREATE TABLE IF NOT EXISTS doctor_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  patient_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  from_doctor INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS doctor_notes_p_idx ON doctor_notes (patient_id, created_at DESC);
