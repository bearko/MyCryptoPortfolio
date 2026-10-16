// 計算式の共通部品（SPEC-002）。成績の確かめと丸め。
// 計算式は「節目の点 ＋ 成績の点」。成績の点は係数を掛けるだけで、上限・頭打ちは作らない（D11）。

/** 整数か（範囲つき）。ありえない値は null を返して受け付けない */
export function int(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}
/** 数（範囲つき） */
export function num(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
export const bool = (v) => (typeof v === 'boolean' ? v : null);

/** 結果の形：{ score, milestone, performance }（score は整数） */
export function result(milestone, performance) {
  return { score: Math.round(milestone + performance), milestone: Math.round(milestone), performance: Math.round(performance) };
}
