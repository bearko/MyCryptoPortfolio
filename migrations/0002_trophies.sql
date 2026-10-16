-- bearko.games 共通基盤（SPEC-001）段階 2：トロフィーの獲得記録
-- 定義は platform/trophies.js。仮アカウント（4.6）の獲得もここに入り、ログインで本アカウントへ移す
CREATE TABLE IF NOT EXISTS user_trophies (
  user_id TEXT NOT NULL,
  trophy_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, trophy_id)
);
CREATE INDEX IF NOT EXISTS user_trophies_trophy ON user_trophies (trophy_id);
