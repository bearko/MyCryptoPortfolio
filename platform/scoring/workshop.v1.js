// Workshop（SPEC-002 3.7）：積み上げ（店の育ち具合）
import { int, num, result } from './util.js';

export const KIND = 'progress';
export const TYPICAL_CLEAR_SEC = 2 * 3600; // ふつうのクリアタイム（営業日の秒数）
export const MIN_CLEAR_SEC = 15 * 60; // Workshop のランキングと同じ「ありえない速さ」

export function score(m) {
  const day = int(m.day, 0, 1e7);
  const clearBest = m.clearBest == null ? null : num(m.clearBest, MIN_CLEAR_SEC, 1e10);
  if (day == null || (m.clearBest != null && clearBest == null)) return null;
  if (clearBest != null) return result(5000, (5000 * TYPICAL_CLEAR_SEC) / clearBest);
  return result(day >= 30 ? 1000 : 0, 0);
}
