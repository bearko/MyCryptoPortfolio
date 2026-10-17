// Survivor（SPEC-002 3.2）：1 プレイ ＝ 1 回の挑戦。
// v3：難易度の係数を共通基盤で決める（SPEC-002 5.1 #27。Tactics・10 buy year と同じ形）。
//   ゲームは難易度の名前（difficulty：normal / absolute）と、ABSOLUTE のときは 4 軸の値（absolute）だけを送る。
//   係数：NORMAL 1.0、ABSOLUTE は 4 軸の平均（0.5〜5.0）で、上限 2.0（v2 と同じ値になる）。係数 1/30 は v2 のまま
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const MILESTONES = [0, 1000, 3000, 5000]; // クリアしたステージの数ごと
export const PERF_DIVISOR = 30; // ふつうの全クリアの活動レポート 150,000 → 5,000（実測 2026-10-17：自動プレイ 147,663〜162,500）
export const MUL_MAX = 2.0; // 総合スコアに効く難易度の係数の上限
export const AXES = ['spawnMul', 'hpMul', 'dmgMul', 'speedMul'];
export const AXIS_MIN = 0.5;
export const AXIS_MAX = 5.0;

/**
 * 難易度の係数。ありえない値は null。
 *   difficulty：'normal' / 'absolute'（v2 までの成績は regulation：'NORMAL' / 'ABSOLUTE'）
 *   absolute：{ spawnMul, hpMul, dmgMul, speedMul }（ABSOLUTE のときだけ）
 *   名前がない古い成績は、ゲームが計算した regulationMul をそのまま使う
 */
export function difficulty(m) {
  const name = m.difficulty ?? (typeof m.regulation === 'string' ? m.regulation.toLowerCase() : null);
  if (name == null) return m.regulationMul == null ? 1 : num(m.regulationMul, 0.01, 100);
  if (name === 'normal') return 1;
  if (name !== 'absolute' || !m.absolute || typeof m.absolute !== 'object') return null;
  let sum = 0;
  for (const k of AXES) {
    const a = m.absolute[k] == null ? 1 : num(m.absolute[k], AXIS_MIN, AXIS_MAX);
    if (a == null) return null;
    sum += a;
  }
  return Math.round((sum / AXES.length) * 100) / 100; // ゲームの computeRegulationMul と同じ丸め
}

export function score(m) {
  const stages = int(m.stagesCleared, 0, 3);
  const cleared = bool(m.cleared);
  const report = m.reportScore == null ? 0 : num(m.reportScore, 0, 1e9);
  const coef = difficulty(m);
  if (stages == null || cleared == null || report == null || coef == null) return null;
  if (cleared && stages !== 3) return null;
  return result(MILESTONES[stages], cleared ? (report * Math.min(coef, MUL_MAX)) / PERF_DIVISOR : 0);
}
