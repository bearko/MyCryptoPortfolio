-- bearko.games 共通基盤（SPEC-001）段階 4：RTA の計測（6 章）
-- 定義（チェックポイント・レギュレーション）は platform/rta.js。時刻はすべてサーバーが受け取った時刻（ミリ秒）
CREATE TABLE IF NOT EXISTS rta_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  regulation TEXT NOT NULL,
  -- running：計測中 ／ finished：完了 ／ abandoned：中断 ／ rejected：最短時間より速い（無効）
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,      -- 最後に「操作あり」か区切りを受け取った時刻
  max_idle_ms INTEGER NOT NULL DEFAULT 0,
  reference INTEGER NOT NULL DEFAULT 0, -- 1：参考記録（15 分以上の無操作。6.4）
  next_cp INTEGER NOT NULL DEFAULT 0,   -- 次に受け付ける区切りの番号
  time_ms INTEGER,                   -- 公式タイム（完了したときだけ）
  igt_ms INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS rta_runs_rank ON rta_runs (regulation, status, reference, time_ms);
CREATE INDEX IF NOT EXISTS rta_runs_user ON rta_runs (user_id, started_at);

CREATE TABLE IF NOT EXISTS rta_splits (
  run_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  checkpoint TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,       -- 計測の開始からの経過（サーバーの時刻）
  igt_ms INTEGER,
  PRIMARY KEY (run_id, ord)
);
