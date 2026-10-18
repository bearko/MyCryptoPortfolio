// DeckBattle（SPEC-002 3.4。v3）：積み上げ（ストーリーの進み具合）
//   ノードの成績 ＝ 190 × 戦力 ÷ そのノードのふつうの戦力 ＋ 1,900 ÷ 平均秒（mycryptodeckbattle#8）
//   ノードごとの戦力の上限を越えたら、そのノードの成績の点は入れない（節目の点は残す。mycryptodeckbattle#11）
// ふつうの戦力はボット 200 周の平均（2026-10-18）。送る成績の形は v1・v2 と同じなので、生の成績からそのまま計算し直せる
import { num, result } from './util.js';
import { MAIN_NODES, SPECIAL_NODES } from './deckbattle.v1.js';

export { MAIN_NODES, SPECIAL_NODES };
export const KIND = 'progress';
export const POWER = 190; // ふつうの戦力で制覇したノードの、戦力の部分の点
export const SPEED = 1900; // ÷ 平均の戦闘秒（ゲーム内）

/** ノードごとのふつうの戦力（ボットの平均を 5 単位に丸めた。mycryptodeckbattle の js/platform.js の NORMAL_POWER と同じ） */
export const NORMAL_POWER = {
  'kindai-jp': 180,
  'kindai-eu': 255,
  'kindai-us': 295,
  'kinsei-jp': 290,
  'kinsei-eu': 340,
  'kinsei-sea': 340,
  'chusei-jp': 335,
  'chusei-eu': 315,
  'chusei-asia': 345,
  'kodai-sangoku': 340,
  'kodai-east': 345,
  'kodai-med': 345,
  hazama: 340,
  'ex-corsica': 205,
  'ex-abyss': 215,
  'ex-maou': 235,
};

/** ノードのウェーブ数（mycryptodeckbattle の stageWaves の合計） */
const WAVES = { 'kindai-jp': 12, 'ex-corsica': 14, 'ex-abyss': 14, 'ex-maou': 16 };
/**
 * ノードごとの戦力の上限：6 枠すべて Legendary（22）の Lv 4 ＋ ウェーブごとにイフリートの魔石（+20%）を 1 つ
 * ＝ 22 × 4 × (6 ＋ 0.2 × ウェーブ数)。どう頑張っても越えられない値（近代・日本 739、本編のほか 1,232、特異点 774〜810）
 */
export const MAX_POWER = Object.fromEntries(Object.keys(NORMAL_POWER).map((id) => [id, Math.round(22 * 4 * (6 + 0.2 * (WAVES[id] ?? 40)))]));

/** ノードの成績の点。上限を越えた戦力は 0（ありえない値。節目の点は別に数える）、形が壊れていたら null */
export function nodePerformance(id, n) {
  const power = num(n?.power, 0, Infinity);
  const sec = num(n?.avgBattleSec, 1, 3600);
  if (power == null || sec == null) return null;
  if (power > MAX_POWER[id]) return 0;
  return (POWER * power) / NORMAL_POWER[id] + SPEED / sec;
}

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
    if (!nodes[id]) continue;
    const p = nodePerformance(id, nodes[id]);
    if (p == null) return null;
    performance += p;
  }
  return result(milestone, performance);
}
