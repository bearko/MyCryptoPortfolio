// Factory（SPEC-002 3.9）：積み上げ（工房の育ち具合）
import { int, result } from './util.js';

export const KIND = 'progress';
export const MILESTONES = [0, 0, 1000, 2333, 3667, 5000]; // 工房 Lv ごと（設備は工房 Lv と一緒に増える）
export const TYPICAL_WEEKS_TO_LV5 = 156; // ふつうは 3 年
export const PER_QUEST = 20;
export const CRAFT_WEIGHT = { common: 10, uncommon: 20, rare: 40, epic: 80, legendary: 160 };

export function score(m) {
  const lv = int(m.factoryLevel, 1, 5);
  const weeks = m.weeksToLv5 == null ? null : int(m.weeksToLv5, 1, 1e5);
  const quests = int(m.questsCleared ?? 0, 0, 1e6);
  const crafted = m.crafted && typeof m.crafted === 'object' ? m.crafted : {};
  if (lv == null || quests == null || (m.weeksToLv5 != null && weeks == null)) return null;
  if (weeks != null && lv < 5) return null;
  let craft = 0;
  for (const [rarity, n] of Object.entries(crafted)) {
    if (!(rarity in CRAFT_WEIGHT) || int(n, 0, 1e6) == null) return null;
    craft += CRAFT_WEIGHT[rarity] * n;
  }
  const speed = weeks ? (2000 * TYPICAL_WEEKS_TO_LV5) / weeks : 0;
  return result(MILESTONES[lv], speed + quests * PER_QUEST + craft);
}
