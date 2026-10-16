// 10 buy year（SPEC-002 3.8）：1 プレイ ＝ 10 年
import { int, num, result } from './util.js';

export const KIND = 'run';
export const YEN_PER_POINT = 5555; // ふつう・S ランク（5,000 万円）→ 9,000
export const DIFFICULTY = { easy: 0.7, normal: 1.0, hard: 1.4 };

export function score(m) {
  const years = int(m.years, 0, 10);
  const netWorth = num(m.netWorth, -1e12, 1e13);
  const diff = m.difficulty == null ? 'normal' : m.difficulty;
  if (years == null || netWorth == null || !(diff in DIFFICULTY)) return null;
  if (years < 10) return result(years * 100, 0);
  return result(1000, (Math.max(0, netWorth) / YEN_PER_POINT) * DIFFICULTY[diff]);
}
