-- bearko.games 共通基盤（SPEC-009）：ポータルの計測。日ごとの回数だけ（だれかを見分ける値は持たない）
-- day：日本時間の日付（YYYY-MM-DD）／event：view・feat・peek・open・mood・play／game・source：無いときは ''
CREATE TABLE IF NOT EXISTS portal_counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, game, source)
);
