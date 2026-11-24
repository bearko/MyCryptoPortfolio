-- bearko.games 共通基盤（SPEC-010 7 章）：bot の印
-- 1 = 作者が「人ではない」と判断したアカウント。KPI とチュートリアルの数に入れない（ランキング・記録は変えない）。
-- 印が無くても、使い捨ての仮アカウントがまとまって作られたものは、読むときに除く（platform/kpi.js の burstGuests）
ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
