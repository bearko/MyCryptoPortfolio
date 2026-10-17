// Tactics（SPEC-002 3.1）：1 プレイ ＝ 1 回の挑戦。v2：レギュレーション倍率をゲーム内の倍率から共通基盤の難易度の係数に置き換える
//   成績の点 ＝ 倍率の前の点（baseScore）× 難易度の係数 × 0.25。節目の点には係数を掛けない
//   ゲーム内の倍率（Red 3.0・ABSOLUTE 最大 2,500 倍）は総合スコアには使わない
import { int, num, bool, result } from './util.js';

export const KIND = 'run';
export const PERF_PER_BASE_SCORE = 0.25; // ふつうのクリアの倍率の前の点 20,000 → 5,000

/** 共通基盤で決める難易度の係数（作者の決定 2026-10-17） */
export const DIFFICULTY = { common: 1.0, egg: 1.2, baby: 1.4, blue: 1.7, red: 2.0 };
/** ABSOLUTE の係数 ＝ ABSOLUTE の倍率そのもの。ただし Red を超えない（下限はない） */
export const ABSOLUTE_MAX = DIFFICULTY.red;
/** ゲーム内の倍率（Tactics の prototype/js/scoring.js）。v1 の成績（倍率の前の点がない）から戻すときだけ使う */
export const GAME_REGULATION_MUL = { common: 1.0, egg: 1.2, baby: 1.5, blue: 2.0, red: 3.0 };
/** ABSOLUTE の倍率の範囲：(敵 HP × 敵ダメ) ÷ (自 HP × 自ダメ)、各 0.1〜5.0 */
const ABS_MIN = 0.0004;
const ABS_MAX = 2500;

/** 難易度の係数。ありえないレギュレーションは null。ABSOLUTE の倍率が分からない（v1 の成績）ときは 0 */
export function difficulty(regulation, absoluteMult) {
  const reg = regulation == null ? 'common' : regulation;
  if (reg === 'absolute') {
    if (absoluteMult == null) return 0;
    const a = num(absoluteMult, ABS_MIN * 0.999, ABS_MAX * 1.001);
    return a == null ? null : Math.min(a, ABSOLUTE_MAX);
  }
  return Object.hasOwn(DIFFICULTY, reg) ? DIFFICULTY[reg] : null;
}

export function score(m) {
  const chapters = int(m.chaptersCleared, 0, 5);
  const cleared = bool(m.cleared);
  if (chapters == null || cleared == null) return null;
  if (cleared && chapters !== 5) return null;
  const coef = difficulty(m.regulation, m.absoluteMult);
  if (coef == null) return null;
  if (!cleared) return result(chapters * 1000, 0);
  let base;
  if (m.baseScore != null) {
    base = num(m.baseScore, 0, 1e9);
  } else {
    // v1 の成績：最終スコア ÷ ゲーム内の倍率で戻す（ABSOLUTE は倍率が分からないので係数 0 ＝ 節目の点だけ）
    const fin = m.finalScore == null ? 0 : num(m.finalScore, 0, 1e9);
    const reg = m.regulation == null ? 'common' : m.regulation;
    base = fin == null ? null : fin / (GAME_REGULATION_MUL[reg] || 1);
  }
  if (base == null) return null;
  return result(5000, base * coef * PERF_PER_BASE_SCORE);
}
