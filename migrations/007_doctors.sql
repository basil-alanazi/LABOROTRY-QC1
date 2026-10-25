-- حساب دكتور: يفتح حسابات لمرضاه ويتابعهم ويعدّل جرعاتهم
ALTER TABLE users ADD COLUMN is_doctor INTEGER NOT NULL DEFAULT 0;

-- العائلات اللي يتابعها كل دكتور (الدكتور يفتحها، أو العائلة تشاركه)
CREATE TABLE IF NOT EXISTS doctor_families (
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  family_id INTEGER NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (doctor_id, family_id)
);
CREATE INDEX IF NOT EXISTS doctor_families_f_idx ON doctor_families (family_id);
