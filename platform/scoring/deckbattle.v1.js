// DeckBattle（SPEC-002 3.4）：積み上げ（ストーリーの進み具合）
import { num, result } from './util.js';

export const KIND = 'progress';
// 本編のノード（順番どおり）と特別ステージ。mycryptodeckbattle の js/engine/world.js の AREAS と合わせる
export const MAIN_NODES = ['kindai-jp', 'kindai-eu', 'kindai-us', 'kinsei-jp', 'kinsei-eu', 'kinsei-sea', 'chusei-jp', 'chusei-eu', 'chusei-asia', 'kodai-sangoku', 'kodai-east', 'kodai-med', 'hazama'];
export const SPECIAL_NODES = ['ex-corsica', 'ex-abyss', 'ex-maou'];
export const SPEED = 4800; // ノードの成績 ＝ 戦力 ＋ 4,800 ÷ 平均の戦闘秒（ふつう：180 + 4800/30）
export const MAX_POWER = 6 * 22 * 4 * 50; // 6 枠 × Legendary × Lv4 × 永続強化を大きめに見た上限（ありえない値をはじくため）

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
    performance += power + SPEED / sec;
  }
  return result(milestone, performance);
}
