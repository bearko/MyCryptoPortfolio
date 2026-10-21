-- bearko.games 共通基盤（SPEC-009 3.2）：作者・テスターのアカウント。分析（新しく来た人の数・離脱）から除くための印だけで、
-- ランキング・成績・アチーブメントは今までどおり（印で変わるものは何もない）
ALTER TABLE users ADD COLUMN tester INTEGER NOT NULL DEFAULT 0;
