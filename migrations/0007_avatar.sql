-- SPEC-005 5.3：bearko.games 全体で共通のプレイヤーアイコン。
-- 資産リポジトリ（bearko/mycryptoheroes）のヒーロー・エクステンションの id（"hero:1001" / "ext:5106"）。NULL は既定の絵。
-- ALTER TABLE ADD COLUMN には IF NOT EXISTS が無い。2 度流すと「duplicate column name」で止まるが、表は壊れない。
ALTER TABLE users ADD COLUMN avatar TEXT;
