// Survivor（SPEC-002 3.2）：1 プレイ ＝ 1 回の挑戦
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const MILESTONES = [0, 1000, 3000, 5000]; // クリアしたステージの数ごと
export const PERF_DIVISOR = 30; // ふつうの全クリアの活動レポート 150,000 → 5,000

export function score(m) {
  const stages = int(m.stagesCleared, 0, 3);
  const cleared = bool(m.cleared);
  const report = m.reportScore == null ? 0 : num(m.reportScore, 0, 1e9);
  const mul = m.regulationMul == null ? 1 : num(m.regulationMul, 0.01, 100);
  if (stages == null || cleared == null || report == null || mul == null) return null;
  if (cleared && stages !== 3) return null;
  return result(MILESTONES[stages], cleared ? (report * mul) / PERF_DIVISOR : 0);
}
