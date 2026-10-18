-- صحة الوالد — قاعدة بيانات Cloudflare D1 (dad-health-db)
-- الوقت يتسجل تلقائيًا من السيرفر بصيغة ISO (UTC)

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  glucose INTEGER NOT NULL CHECK (glucose BETWEEN 10 AND 700),
  -- fasting / after_breakfast / after_lunch / after_dinner / random
  context TEXT NOT NULL DEFAULT 'random',
  note TEXT
);
CREATE INDEX IF NOT EXISTS readings_created_at_idx ON readings (created_at DESC);

-- جرعات الإنسولين اللي أخذها فعلًا
CREATE TABLE IF NOT EXISTS doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  insulin TEXT NOT NULL,   -- Humalog / Tresiba
  slot TEXT NOT NULL,      -- breakfast / lunch / dinner / bedtime
  units REAL NOT NULL CHECK (units > 0 AND units <= 100)
);
CREATE INDEX IF NOT EXISTS doses_created_at_idx ON doses (created_at DESC);

-- قراءات الضغط
CREATE TABLE IF NOT EXISTS bp_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  systolic INTEGER NOT NULL CHECK (systolic BETWEEN 50 AND 260),
  diastolic INTEGER NOT NULL CHECK (diastolic BETWEEN 30 AND 160),
  pulse INTEGER CHECK (pulse IS NULL OR pulse BETWEEN 30 AND 220),
  spo2 INTEGER CHECK (spo2 IS NULL OR spo2 BETWEEN 50 AND 100),   -- الأكسجين %
  note TEXT
);
CREATE INDEX IF NOT EXISTS bp_created_at_idx ON bp_readings (created_at DESC);

-- سجل تغييرات جرعة Tresiba
CREATE TABLE IF NOT EXISTS tresiba_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  old_dose REAL,
  new_dose REAL NOT NULL,
  reason TEXT
);

-- خطة الدكتور (صف واحد فقط id = 1)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  patient_name TEXT DEFAULT 'الوالد',
  humalog_breakfast REAL NOT NULL DEFAULT 20,
  humalog_lunch REAL NOT NULL DEFAULT 20,
  humalog_dinner REAL NOT NULL DEFAULT 12,
  tresiba_dose REAL NOT NULL DEFAULT 40,
  low_threshold INTEGER NOT NULL DEFAULT 70,
  fasting_low INTEGER NOT NULL DEFAULT 80,
  fasting_high INTEGER NOT NULL DEFAULT 130,
  post_low INTEGER NOT NULL DEFAULT 100,
  post_high INTEGER NOT NULL DEFAULT 180,
  bp_sys_high INTEGER NOT NULL DEFAULT 140,   -- الضغط: الانقباضي (العالي) من كذا وفوق = مرتفع
  bp_dia_high INTEGER NOT NULL DEFAULT 90,    -- الانبساطي (الواطي) من كذا وفوق = مرتفع
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- الأدوية (غير الإنسولين). times = JSON مثل ["08:00","20:00"]
CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL,
  dose TEXT,
  times TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- كل مرة ياخذ فيها دواء
CREATE TABLE IF NOT EXISTS med_doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  medication_id INTEGER NOT NULL,
  time_slot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS med_doses_created_at_idx ON med_doses (created_at DESC);

-- المواعيد الطبية. at = وقت الموعد بتوقيت الرياض مثل 2026-11-02T09:30
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  at TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'visit',   -- visit / lab / other
  place TEXT,
  notes TEXT
);

-- الملاحظات اليومية
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);

-- نتائج التحاليل (مثل السكر التراكمي). taken_on = تاريخ التحليل 2026-10-08
CREATE TABLE IF NOT EXISTS labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  taken_on TEXT NOT NULL,
  test TEXT NOT NULL DEFAULT 'hba1c',
  value REAL NOT NULL,
  unit TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS labs_taken_on_idx ON labs (taken_on DESC);

-- الوجبات: followed = 1 أكل حسب الخطة، 0 أكل شي ثاني (مكتوب في text)
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  slot TEXT NOT NULL,   -- breakfast / lunch / dinner / snack
  followed INTEGER NOT NULL DEFAULT 1,
  text TEXT
);
CREATE INDEX IF NOT EXISTS meals_created_at_idx ON meals (created_at DESC);
