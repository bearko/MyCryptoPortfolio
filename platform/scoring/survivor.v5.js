// Survivor（SPEC-002 3.2）：1 プレイ ＝ 1 回の挑戦。
// v5：Extra パネル（Survivor SPEC-176。エンドコンテンツ。店の通常の品が尽きたら商人が売る、難しさに干渉するパネル）。
//   ゲームはパネルごとのレベル（extra：{ horde: 3, ... }。各 0〜10）だけを送る。倍率への上乗せはここの表で決める（ゲームと同じ値）。
//   係数 ＝ 難易度の係数（v3：NORMAL 1.0・ABSOLUTE は 4 軸の平均）＋ 上乗せ。上限は v3 と同じ 2.0。
//   extra のない成績は v4 と同じ点（版を足しただけ）
import { int, num, bool, result } from './util.js';
import { difficulty, divisor, MILESTONES, MUL_MAX, AXES, AXIS_MIN, AXIS_MAX, PERF_DIVISOR, BALANCE_MAX } from './survivor.v4.js';

export const KIND = 'run';
export { difficulty, divisor, MILESTONES, MUL_MAX, AXES, AXIS_MIN, AXIS_MAX, PERF_DIVISOR, BALANCE_MAX };

/** パネル 1 レベルあたりの上乗せ（Survivor の js/battle/extra-panels.js の add と同じ） */
export const EXTRA_ADD = { horde: 0.03, gale: 0.03, iron: 0.03, famine: 0.02, trial: 0.01, harsh: 0.02, bell: 0.03, overlord: 0.03 };
export const EXTRA_MAX_LEVEL = 10;

/** 上乗せ。extra がなければ 0。知らないパネル・範囲の外は null */
export function extraAdd(m) {
  if (m.extra == null) return 0;
  if (typeof m.extra !== 'object' || Array.isArray(m.extra)) return null;
  let sum = 0;
  for (const [k, v] of Object.entries(m.extra)) {
    if (!Object.hasOwn(EXTRA_ADD, k)) return null;
    const lv = int(v, 0, EXTRA_MAX_LEVEL);
    if (lv == null) return null;
    sum += lv * EXTRA_ADD[k];
  }
  return Math.round(sum * 100) / 100;
}

export function score(m) {
  const stages = int(m.stagesCleared, 0, 3);
  const cleared = bool(m.cleared);
  const report = m.reportScore == null ? 0 : num(m.reportScore, 0, 1e9);
  const coef = difficulty(m);
  const add = extraAdd(m);
  const div = divisor(m);
  if (stages == null || cleared == null || report == null || coef == null || add == null || div == null) return null;
  if (cleared && stages !== 3) return null;
  return result(MILESTONES[stages], cleared ? (report * Math.min(coef + add, MUL_MAX)) / div : 0);
}
