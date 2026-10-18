-- SPEC-008：アチーブメントの組み直し（2026-10-18）。定義は platform/trophies.js
-- 1. すでにそのタイトルのトロフィーを持っている人は、そのタイトルを遊んでいる → 来訪のアチーブメント（<タイトル>.visit）を渡す
-- 2. 絵をヒーローに差し替えたもののうち、前のエクステンションを新しいアチーブメントに移したもの（条件が前の条件に含まれるもの）を渡す
--    deckbattle.area1（大西部のブーツ）→ deckbattle.firstwin「初めてバトルに勝つ」
--    cross.two（ダブルにゃんバーガー）→ cross.visit2「2 タイトルを遊ぶ」
-- ほかの差し替え前の絵は、formerAvatars で持っている人だけアイコンに使える（データの移行は要らない）

INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'tactics.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'tactics.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'factory.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'factory.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'survivor.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'survivor.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'education.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'education.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'workshop.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'workshop.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'fortress.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'fortress.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, '10buy.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE '10buy.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'deckbattle.visit', MIN(unlocked_at) FROM user_trophies WHERE trophy_id LIKE 'deckbattle.%' GROUP BY user_id
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'deckbattle.firstwin', unlocked_at FROM user_trophies WHERE trophy_id = 'deckbattle.area1'
  ON CONFLICT DO NOTHING;
INSERT INTO user_trophies (user_id, trophy_id, unlocked_at)
  SELECT user_id, 'cross.visit2', unlocked_at FROM user_trophies WHERE trophy_id = 'cross.two'
  ON CONFLICT DO NOTHING;
