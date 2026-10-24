-- bearko.games 共通基盤（SPEC-010）：KPI とチュートリアルの離脱

-- 遊んだ日（ゲームで操作した日）。day は日本時間の日付（YYYY-MM-DD）。同じ人・ゲーム・日は 1 行
CREATE TABLE IF NOT EXISTS user_days (
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, game, day)
);
CREATE INDEX IF NOT EXISTS user_days_day ON user_days (day);

-- チュートリアルの段に着いた時刻（人・ゲーム・段ごとに最初の 1 回）。step 0 が「始めた」
-- user_id は共通基盤のアカウント。10 buy year! のプレイログから移した過去の分だけ 'tb:<端末>'
CREATE TABLE IF NOT EXISTS tutorial_steps (
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  step INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game, step)
);
CREATE INDEX IF NOT EXISTS tutorial_steps_game ON tutorial_steps (game, step, at);

-- 過去の分：アチーブメント（タイトル横断 cross.* を除く）と成績の時刻から、遊んだ日を埋める（近似）
INSERT OR IGNORE INTO user_days (user_id, game, day)
  SELECT user_id, substr(trophy_id, 1, instr(trophy_id, '.') - 1), date(unlocked_at / 1000, 'unixepoch', '+9 hours')
  FROM user_trophies WHERE trophy_id NOT LIKE 'cross.%' AND instr(trophy_id, '.') > 1;
INSERT OR IGNORE INTO user_days (user_id, game, day)
  SELECT user_id, game, date(created_at / 1000, 'unixepoch', '+9 hours') FROM plays;
