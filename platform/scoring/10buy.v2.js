// 10 buy year（SPEC-002 3.8。v2）：1 プレイ ＝ 10 年。係数は自動プレイ 2,160 本の実測（2026-10-18）
//   クリア（10 年遊ぶ・事業売却）：1,000 ＋ 純資産 ÷ 5,555 × 難易度 × 継承
//   途中で終わった周（破産・失踪・逮捕など）：年数 × 100 ＋ その 3 割
import { int, num, result } from './util.js';

export const KIND = 'run';
export const YEN_PER_POINT = 5555; // ふつう・継承なしでクリアした周の中央値 4,983 万円 ≒ 9,000
export const DIFFICULTY = { easy: 0.9, normal: 1.0, hard: 1.3 };
export const PARTIAL = 0.3; // 途中で終わった周の成績の割合（5 割までなら「途中で終わったほうが得」にならない）
export const MENTOR_ONLY = 0.8; // 継承なし・師匠だけ
export const LEGACY = { default: 0.7, cap_trade: 0.45, cap_dark: 0.5 }; // 継承あり（総合商社・裏社会の帝王は別の値）
const LEGACY_RE = /^[a-z0-9_]{1,40}$/;

/** 継承の係数。legacy は継承スキルの ID（なければ null）、mentor は師匠がついたか */
export function legacyFactor(legacy, mentor) {
  if (typeof legacy === 'string' && LEGACY_RE.test(legacy)) return LEGACY[legacy] ?? LEGACY.default;
  return mentor ? MENTOR_ONLY : 1;
}

export function score(m) {
  const years = int(m.years, 0, 10);
  const netWorth = num(m.netWorth, -1e12, 1e13);
  const diff = m.difficulty == null ? 'normal' : m.difficulty;
  if (years == null || netWorth == null || !(diff in DIFFICULTY)) return null;
  const perf = (Math.max(0, netWorth) / YEN_PER_POINT) * DIFFICULTY[diff] * legacyFactor(m.legacy, !!m.mentor);
  // 事業売却は 9 年目までに起きるが、遊び切ったのと同じクリア（トロフィー 10buy.clear と同じ扱い）
  if (years >= 10 || m.ending === 'exit') return result(1000, perf);
  return result(years * 100, perf * PARTIAL);
}
