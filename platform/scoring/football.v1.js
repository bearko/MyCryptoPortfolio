// Football（SPEC-002 3.10）：積み上げ（部は年をまたいで続く。届いたいちばん上の格・通算の勝ち数・大会の優勝回数）
//   ゲームが送るもの（mycryptofootball の src/game/feats.ts の scoreOf）：
//     { tier: 届いたいちばん上の格 0 素人〜6 名門, years: 何年目, wins: 通算の勝ち数, titles: [地区, 県, 地方, 全国] の優勝回数,
//       nation: 全国大会で優勝したことがあるか, summit: 頂上決戦に勝ったことがあるか }
//   係数は、ゲームの「ていねいに遊ぶ自動操縦」60 部の実測（2026-11-27、mycryptofootball 4f08a1c の tests/bot.ts）に合わせた：
//     同好会は 1 年目（55 部）か 2 年目（5 部）。同好会になった時点の勝ちは 2 つほど（練習試合と地区大会の 1 回戦）
//     10 年目のおわり：通算 52 勝（p10 49・p90 57）、優勝 4 回（平均 地区 1.1・県 1.6・地方 0.8・全国 0.9）、格は 58 部が名門
//     頂上決戦の勝利は 30 年で 60 部のうち 2 部（6 年目・21 年目）
import { int, bool, result } from './util.js';

export const KIND = 'progress';
export const TIERS = 6; // 0 素人 〜 6 名門
export const CLUB = 1000; // 同好会（tier >= 1）＝最初の節目
export const SUMMIT = 5000; // 頂上決戦の勝利＝ゲームクリア
export const PER_WIN = 80; // ふつうの 10 年（約 52 勝）で約 4,200
export const PER_TITLE = [200, 400, 700, 1200]; // 地区・県・地方・全国の優勝 1 回。ふつうの 10 年で約 2,500
export const PER_TIER = 500; // 同好会より上の格 1 つ（同好会の分は節目の点。名門で 2,500）

export function score(m) {
  const tier = int(m.tier, 0, TIERS);
  const years = int(m.years, 1, 1e4);
  const wins = int(m.wins, 0, 1e6);
  const nation = bool(m.nation ?? false);
  const summit = bool(m.summit ?? false);
  if (tier == null || years == null || wins == null || nation == null || summit == null) return null;
  if (!Array.isArray(m.titles) || m.titles.length !== PER_TITLE.length) return null;
  const titles = m.titles.map((n) => int(n, 0, 1e5));
  if (titles.some((n) => n == null)) return null;
  // 優勝は決勝の勝ちなので、勝ち数より多くはならない。頂上決戦に挑めるのは名門だけ
  if (titles.reduce((a, n) => a + n, 0) > wins) return null;
  if (summit && (tier < TIERS || wins < 1)) return null;
  const milestone = summit ? SUMMIT : tier >= 1 ? CLUB : 0;
  const performance = wins * PER_WIN + titles.reduce((a, n, i) => a + n * PER_TITLE[i], 0) + Math.max(0, tier - 1) * PER_TIER;
  return result(milestone, performance);
}
