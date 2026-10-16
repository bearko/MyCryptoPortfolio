-- bearko.games 共通基盤（SPEC-001）段階 1：アカウントとセッション
-- 本アカウントは google_sub を持つ。仮アカウント（4.6）は google_sub が NULL
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_last_seen ON users (last_seen);

-- Cookie の値そのものは保存せず、SHA-256 のハッシュだけを持つ
-- kind：'login'（bg_session）／'guest'（bg_guest）
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
