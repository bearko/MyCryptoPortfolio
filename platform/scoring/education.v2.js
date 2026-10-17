// Education（SPEC-002 3.6、v2）：積み上げ。ゲームクリア（クレオパトラに勝つ）＋ 加点（知識カード・知識マップのマス・解放した英雄・称号）
// 作者の決定（2026-10-16、MyCryptoEducation#1）：称号・英雄の解放・知識マップはクリアの条件ではなく加点。
// 答え方（難モードか 4 択か、ヒント、速さ）はゲームが送らない（Education の原則 3-2）。
import { int, bool, result } from './util.js';

export const KIND = 'progress';
export const CLEAR = 5000;
export const PER_CARD = 6;
export const PER_CELL = 30;
export const PER_HERO = 150;
export const PER_TITLE = 150;

// v1 のころの成績（cards だけ）も受け付ける。無い欄は 0 として数える
const opt = (v, max) => (v == null ? 0 : int(v, 0, max));

export function score(m) {
  const cards = int(m.cards, 0, 100000);
  const cells = opt(m.cells, 1000);
  const heroes = opt(m.heroes, 1000);
  const titles = opt(m.titles, 1000);
  const cleared = m.cleared == null ? false : bool(m.cleared);
  if ([cards, cells, heroes, titles, cleared].includes(null)) return null;
  if (cleared && heroes < 1) return null; // クリアならクレオパトラを解放している
  return result(cleared ? CLEAR : 0, cards * PER_CARD + cells * PER_CELL + heroes * PER_HERO + titles * PER_TITLE);
}
