// Fortress（SPEC-002 3.3）：1 プレイ ＝ 1 レベル
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const TYPICAL = 1.2; // ふつうのクリア：体力 2/3 が残る + 15 スロットに 7 体（空き 8/15）

export function score(m) {
  const n = typeof m.levelId === 'string' && /^L[1-9]$/.test(m.levelId) ? Number(m.levelId.slice(1)) : null;
  const won = bool(m.won);
  if (n == null || won == null) return null;
  if (!won) return result(0, 0);
  const maxHp = int(m.maxHp, 1, 1000);
  const hpLeft = maxHp == null ? null : int(m.hpLeft, 1, maxHp); // クリアしたなら体力は 1 以上
  const slots = int(m.slots, 1, 100);
  const used = slots == null ? null : int(m.heroesUsed, 0, slots);
  if (hpLeft == null || used == null) return null;
  const p = 500 + (n - 1) * 562.5; // レベル 01 ＝ 500 〜 レベル 09 ＝ 5,000（ふつうのクリアならレベル 01 で合計 1,000）
  return result(p, (p * (hpLeft / maxHp + (slots - used) / slots)) / TYPICAL);
}
