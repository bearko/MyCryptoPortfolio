// DeckBattle（SPEC-002 3.4）：積み上げ（ストーリーの進み具合）。v2：係数を実測（ボットの通しプレイ）に合わせた
//   v1：ノードの成績 ＝ 戦力 ＋ 4,800 ÷ 平均秒（仮の基準：戦力 180・1 戦 30 秒）
//   v2：ノードの成績 ＝ 戦力 × 0.6 ＋ 1,900 ÷ 平均秒（実測：戦力の合計 約 4,060・1 ÷ 平均秒 の合計 約 1.33）
// 送る成績の形は v1 と同じなので、v1 の生の成績からもそのまま計算し直せる
import { num, result } from './util.js';
import { MAIN_NODES, SPECIAL_NODES, MAX_POWER } from './deckbattle.v1.js';

export { MAIN_NODES, SPECIAL_NODES };
export const KIND = 'progress';
export const POWER = 0.6; // 戦力の係数
export const SPEED = 1900; // ÷ 平均の戦闘秒（ゲーム内）

export function score(m) {
  const cleared = Array.isArray(m.nodesCleared) ? m.nodesCleared : null;
  const nodes = m.nodes && typeof m.nodes === 'object' ? m.nodes : {};
  if (!cleared || cleared.length > MAIN_NODES.length + SPECIAL_NODES.length) return null;
  const set = new Set(cleared);
  if ([...set].some((id) => !MAIN_NODES.includes(id) && !SPECIAL_NODES.includes(id))) return null;
  const main = MAIN_NODES.filter((id) => set.has(id)).length;
  const special = SPECIAL_NODES.filter((id) => set.has(id)).length;
  const milestone = (main ? 1000 + ((main - 1) * 4000) / (MAIN_NODES.length - 1) : 0) + (special * 5000) / SPECIAL_NODES.length;
  let performance = 0;
  for (const id of set) {
    const n = nodes[id];
    if (!n) continue;
    const power = num(n.power, 0, MAX_POWER);
    const sec = num(n.avgBattleSec, 1, 3600);
    if (power == null || sec == null) return null;
    performance += power * POWER + SPEED / sec;
  }
  return result(milestone, performance);
}
