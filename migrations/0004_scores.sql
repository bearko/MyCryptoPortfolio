-- bearko.games 共通基盤（SPEC-002）段階 3：総合スコア
-- plays：生の成績（計算式を直したら、ここから全員を計算し直す）
CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  metrics TEXT NOT NULL,          -- JSON（ゲームが送った成績そのまま）
  game_version TEXT,
  formula TEXT NOT NULL,          -- 計算した式の版（v1 など）
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plays_user_game ON plays (user_id, game, score);
CREATE INDEX IF NOT EXISTS plays_created ON plays (created_at);

-- title_scores：タイトルごとの自己ベスト（総合スコア ＝ この合計）
CREATE TABLE IF NOT EXISTS title_scores (
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  milestone INTEGER NOT NULL,
  performance INTEGER NOT NULL,
  formula TEXT NOT NULL,
  play_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
CREATE INDEX IF NOT EXISTS title_scores_game ON title_scores (game, score);
