// Fortress v2（SPEC-002 3.3）：積み上げ ＝ レベルごとの自己ベストの合計
//   ゲームはセーブにあるレベルごとの自己ベストをまとめて送る：{ levels: { L1: { hpLeft, maxHp, heroesUsed, slots, earlyBonus }, ... } }
//   v1 の成績（1 回のレベル：{ levelId, won, hpLeft, maxHp, heroesUsed, slots }）も受け付け、combine で束ねられる
import { int, bool, result } from './util.js';

export const KIND = 'progress';
export const LEVEL_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
export const TYPICAL = 1.2; // ふつうのクリア：体力 2/3 が残る + 15 スロットに 7 体（空き 8/15）
export const EARLY = 1; // 早呼びのボーナス 1 GUM ＝ 1 点（上限なし）

/** レベルの重み（節目の点）。L1 ＝ 500、L2〜L9 ＝ 562.5。全部で 5,000（v1 の「レベル n の節目」＝ L1〜Ln の重みの合計） */
export const weightOf = (id) => (id === 'L1' ? 500 : 562.5);

/** 1 レベルの成績を確かめる。ありえない値は null */
function entryOf(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const maxHp = int(e.maxHp, 1, 1000);
  const hpLeft = maxHp == null ? null : int(e.hpLeft, 1, maxHp); // クリアしたなら体力は 1 以上
  const slots = int(e.slots, 1, 100);
  const heroesUsed = slots == null ? null : int(e.heroesUsed, 0, slots);
  const earlyBonus = e.earlyBonus === undefined ? 0 : int(e.earlyBonus, 0, 1e6);
  if (hpLeft == null || heroesUsed == null || earlyBonus == null) return null;
  return { hpLeft, maxHp, heroesUsed, slots, earlyBonus };
}

/** 1 レベルの点：{ milestone, performance } */
export function levelPoints(id, e) {
  const w = weightOf(id);
  return { milestone: w, performance: (w * (e.hpLeft / e.maxHp + (e.slots - e.heroesUsed) / e.slots)) / TYPICAL + e.earlyBonus * EARLY };
}
const total = (id, e) => {
  const p = levelPoints(id, e);
  return p.milestone + p.performance;
};

/** 送られた成績（v2・v1 どちらでも）を { levels } の形にする。ありえない値は null */
export function normalize(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.levels !== undefined) {
    if (!m.levels || typeof m.levels !== 'object' || Array.isArray(m.levels)) return null;
    const levels = {};
    for (const [id, e] of Object.entries(m.levels)) {
      if (!LEVEL_IDS.includes(id)) return null;
      const v = entryOf(e);
      if (!v) return null;
      levels[id] = v;
    }
    return { levels };
  }
  // v1：1 回のレベル。負けは何もクリアしていない
  if (typeof m.levelId !== 'string' || !LEVEL_IDS.includes(m.levelId)) return null;
  const won = bool(m.won);
  if (won == null) return null;
  if (!won) return { levels: {} };
  const v = entryOf(m);
  return v ? { levels: { [m.levelId]: v } } : null;
}

export function score(m) {
  const n = normalize(m);
  if (!n) return null;
  let milestone = 0;
  let performance = 0;
  for (const [id, e] of Object.entries(n.levels)) {
    const p = levelPoints(id, e);
    milestone += p.milestone;
    performance += p.performance;
  }
  return result(milestone, performance);
}

/**
 * 成績をいくつも束ねて、レベルごとの自己ベスト（点の一番高い成績）にする。受け付けない成績は飛ばす。
 * 共通基盤は「前回の自己ベスト ＋ 今回」と「保存してある生の成績ぜんぶ（v1 から計算し直すとき）」に使う
 */
export function combine(list) {
  const levels = {};
  for (const m of list) {
    const n = normalize(m);
    if (!n) continue;
    for (const [id, e] of Object.entries(n.levels)) {
      if (!levels[id] || total(id, e) > total(id, levels[id])) levels[id] = e;
    }
  }
  const ordered = {};
  for (const id of LEVEL_IDS) if (levels[id]) ordered[id] = levels[id];
  return { levels: ordered };
}
