-- الدخول بالبصمة أو الوجه (Passkeys / WebAuthn): المفتاح العام بس ينحفظ، والبصمة ما تطلع من الجوال
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,                 -- رقم المفتاح (credential id)
  user_id INTEGER NOT NULL REFERENCES users(id),
  public_key TEXT NOT NULL,            -- JWK
  alg INTEGER NOT NULL,                -- -7 (ES256) أو -257 (RS256)
  counter INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used TEXT
);
CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys (user_id);

-- تحدّي لمرة وحدة لكل محاولة تسجيل أو دخول
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                  -- register / login
  user_id INTEGER,
  expires_at TEXT NOT NULL
);
