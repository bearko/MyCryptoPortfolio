-- bearko.games 共通基盤（SPEC-003）：管理者による締め出し
-- 締め出したアカウントはランキングから隠し、新しい記録を受け付けない（記録は消さない）。
-- 退会しても行は残し、同じ会員番号（google_sub）で作り直したアカウントにはログインのときに付け直す
CREATE TABLE IF NOT EXISTS bans (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT,
  reason TEXT,
  banned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bans_sub ON bans (google_sub);
