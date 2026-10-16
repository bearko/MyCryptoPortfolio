// Tactics（SPEC-002 3.1）：1 プレイ ＝ 1 回の挑戦
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const PERF_PER_FINAL_SCORE = 0.25; // ふつうのクリアの最終スコア 20,000 → 5,000

export function score(m) {
  const chapters = int(m.chaptersCleared, 0, 5);
  const cleared = bool(m.cleared);
  const finalScore = m.finalScore == null ? 0 : num(m.finalScore, 0, 1e9);
  if (chapters == null || cleared == null || finalScore == null) return null;
  if (cleared && chapters !== 5) return null;
  return result(chapters * 1000, cleared ? finalScore * PERF_PER_FINAL_SCORE : 0);
}
