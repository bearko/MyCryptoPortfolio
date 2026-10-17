// Survivor（SPEC-002 3.2）：1 プレイ ＝ 1 回の挑戦。v2：ABSOLUTE の倍率に上限 2.0 を付ける（作者の決定 2026-10-17）
//   ABSOLUTE は倍率が最大 5.0 になり、出現数の軸で撃破数（活動レポートのスコアの大半）も増えるため、
//   総合スコアに効く倍率は 2.0 で止める（Tactics v2 の ABSOLUTE の上限と同じ）。係数 1/30 は実測で v1 のまま
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const MILESTONES = [0, 1000, 3000, 5000]; // クリアしたステージの数ごと
export const PERF_DIVISOR = 30; // ふつうの全クリアの活動レポート 150,000 → 5,000（実測 2026-10-17：自動プレイ 147,663〜162,500）
export const MUL_MAX = 2.0; // 総合スコアに効くレギュレーション倍率の上限

export function score(m) {
  const stages = int(m.stagesCleared, 0, 3);
  const cleared = bool(m.cleared);
  const report = m.reportScore == null ? 0 : num(m.reportScore, 0, 1e9);
  const mul = m.regulationMul == null ? 1 : num(m.regulationMul, 0.01, 100);
  if (stages == null || cleared == null || report == null || mul == null) return null;
  if (cleared && stages !== 3) return null;
  return result(MILESTONES[stages], cleared ? (report * Math.min(mul, MUL_MAX)) / PERF_DIVISOR : 0);
}
