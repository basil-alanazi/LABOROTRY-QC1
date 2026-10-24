-- صور الأكل وتحليلها، ونصائح الأمراض المزمنة
ALTER TABLE meals ADD COLUMN photo TEXT;     -- data:image/jpeg;base64 (صغيرة)
ALTER TABLE meals ADD COLUMN analysis TEXT;  -- JSON من الذكاء الاصطناعي

CREATE TABLE IF NOT EXISTS health_advice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  patient_id INTEGER NOT NULL,
  advice TEXT NOT NULL,
  model TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS health_advice_p_idx ON health_advice (patient_id, created_at DESC);
