// Education（SPEC-002 3.6）：積み上げ（集めた知識カード）
import { int, result } from './util.js';

export const KIND = 'progress';
export const PER_CARD = 10000 / 469; // いまの問題 938 問の半分で 10,000

export function score(m) {
  const cards = int(m.cards, 0, 100000);
  if (cards == null) return null;
  return result(0, cards * PER_CARD);
}
