-- bearko.games 共通基盤（SPEC-001 6.14）：タイトルをまたぐ RTA の挑戦。定義は platform/rta.js の CROSS_REGULATIONS
CREATE TABLE IF NOT EXISTS rta_cross (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  regulation TEXT NOT NULL,
  -- running：挑戦中 ／ finished：全区間を終えた ／ abandoned：やめた ／ expired：期限切れ
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  reference INTEGER NOT NULL DEFAULT 0, -- 1：どれかの区間が参考記録（6.4）
  time_ms INTEGER,                      -- 公式タイム（各区間の合計。終えたときだけ）
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS rta_cross_rank ON rta_cross (regulation, status, reference, time_ms);
CREATE INDEX IF NOT EXISTS rta_cross_user ON rta_cross (user_id, status);

CREATE TABLE IF NOT EXISTS rta_cross_segments (
  cross_id TEXT NOT NULL,
  seg INTEGER NOT NULL,                 -- 区間の番号（segments の並び）
  run_id TEXT NOT NULL,                 -- 区間に数えた計測（rta_runs）
  ms INTEGER NOT NULL,                  -- 区間のタイム（その計測の開始から区切りまで。サーバーの時刻）
  reference INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (cross_id, seg)
);
