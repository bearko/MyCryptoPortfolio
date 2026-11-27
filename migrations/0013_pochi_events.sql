-- bearko.games 共通基盤（SPEC-011）：ポチゲーポータルのプッシュ通知に載せる出来事
-- 管理画面から作り、公開のフィード（/api/game-events/）に載せて、共通ハブへ知らせる。時刻はミリ秒
CREATE TABLE IF NOT EXISTS pochi_events (
  id TEXT PRIMARY KEY,               -- <チャンネル>_<日本時間の YYYYMMDD_HHMMSS>。同じ出来事は同じ ID
  channel TEXT NOT NULL,             -- ポチゲーの編集ページで登録したチャンネルの ID
  title TEXT NOT NULL,               -- 60 文字まで
  body TEXT NOT NULL,                -- 160 文字まで
  url TEXT NOT NULL,                 -- 押したときの行き先（https://bearko.games の中）
  published_at INTEGER NOT NULL,     -- 出来事の時刻（作った瞬間）
  expires_at INTEGER,                -- 省略できる
  hub_status INTEGER,                -- 最後にハブへ知らせたときの HTTP の状態（202 など。0 は通信の失敗）
  hub_queued INTEGER,                -- ハブの返事の queued（1：取りに来る／0：購読している端末がいない）
  hub_at INTEGER                     -- 最後にハブへ知らせた時刻
);
CREATE INDEX IF NOT EXISTS pochi_events_published ON pochi_events (published_at);
