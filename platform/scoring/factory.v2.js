// Factory（SPEC-002 3.9）：積み上げ（工房の育ち具合）
// v2：係数を自動プレイの実測に合わせた（SPEC-002 5.1 #24）。式の形は v1 と同じ
//   実測（2026-10-17）：本物のゲームを自動プレイで期限（8 年）まで 4 回。Lv 5 まで 220〜260 週（中央値 248）、
//   期限までのクエスト 84〜98（中央値 87.5）、クラフト 52〜59 本（Legendary 21〜25 本はすべて Lv 5 のあと）
import { int, result } from './util.js';

export const KIND = 'progress';
export const MILESTONES = [0, 0, 1000, 2333, 3667, 5000]; // 工房 Lv ごと（設備は工房 Lv と一緒に増える）
export const TYPICAL_WEEKS_TO_LV5 = 240; // ふつうは 5 年（実測の中央値 248 週。v1 は 3 年 156 週と推測）
export const PER_QUEST = 12; // ふつうの 8 年で約 88 回 → 約 1,000（v1 は 20）
export const CRAFT_WEIGHT = { common: 4, uncommon: 8, rare: 15, epic: 30, legendary: 60 }; // ふつうの 8 年で約 2,000（v1 は 10/20/40/80/160）

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
