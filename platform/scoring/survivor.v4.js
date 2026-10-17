// Survivor（SPEC-002 3.2）：1 プレイ ＝ 1 回の挑戦。
// v4：ゲームのバランスの版（balance）ごとに、ふつうの全クリアが 5,000 になる係数を使う（作者の決定 2026-10-17）。
//   ゲーム v1.2（balance 2）で、撃ってくる敵・雷鼓・ステージの仕掛け・トロイの大群・レベルアップの速さが入り、
//   活動レポートのスコアが約 2 倍になった。balance のない成績（v1.1 まで）は 1/30 のままなので、点は変わらない。
//   ゲーム v1.3（balance 3。Survivor SPEC-078〜081）で、敵の大群（ボスの直前に画面の半分〜9 割）・ボスの強化・ボス戦の宝箱が入り、
//   撃破が 1 回で 2 万体を超えるようになった（スコアは v1.2 の約 9 倍）。版を足しただけなので、v1.2 までの点は変わらない
//   難易度の係数（名前と ABSOLUTE の 4 軸。上限 2.0）・節目の点は v3 と同じ
import { int, num, bool, result } from './util.js';
import { difficulty, MILESTONES, MUL_MAX, AXES, AXIS_MIN, AXIS_MAX } from './survivor.v3.js';

export const KIND = 'run';
export { difficulty, MILESTONES, MUL_MAX, AXES, AXIS_MIN, AXIS_MAX };
/** バランスの版ごとの係数（活動レポートのスコア ÷ これ）。ふつうの全クリアを 5,000 にそろえる */
export const PERF_DIVISOR = {
  1: 30, // v1.1 まで：ふつうの全クリア 150,000（実測 2026-10-17：147,663〜162,500）
  2: 60, // v1.2：ふつうの全クリア 300,000（実測 2026-10-17。SPEC-002 3.2）
  3: 560, // v1.3：ふつうの全クリア 2,800,000（実測 2026-10-17。SPEC-002 3.2）
};
export const BALANCE_MAX = 3;

/** 成績の係数。balance がなければ 1（v1.1 まで）。知らない版は null */
export function divisor(m) {
  const balance = m.balance == null ? 1 : int(m.balance, 1, BALANCE_MAX);
  return balance == null ? null : PERF_DIVISOR[balance];
}

export function score(m) {
  const stages = int(m.stagesCleared, 0, 3);
  const cleared = bool(m.cleared);
  const report = m.reportScore == null ? 0 : num(m.reportScore, 0, 1e9);
  const coef = difficulty(m);
  const div = divisor(m);
  if (stages == null || cleared == null || report == null || coef == null || div == null) return null;
  if (cleared && stages !== 3) return null;
  return result(MILESTONES[stages], cleared ? (report * Math.min(coef, MUL_MAX)) / div : 0);
}
