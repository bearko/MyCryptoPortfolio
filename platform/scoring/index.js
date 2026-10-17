// 総合スコアの計算式の一覧（SPEC-002）。版を上げたら、保存してある生の成績から全員を計算し直す（SPEC-001 8.4）。
//   kind 'run'：1 回の挑戦ごとに送る。'progress'：積み上げ（進み具合のいまの値を送る）
import * as tactics from './tactics.v2.js';
import * as survivor from './survivor.v3.js';
import * as fortress from './fortress.v2.js';
import * as deckbattle from './deckbattle.v2.js';
import * as education from './education.v2.js';
import * as workshop from './workshop.v1.js';
import * as tenbuy from './10buy.v1.js';
import * as factory from './factory.v1.js';

// combine：成績を束ねる関数を持つタイトル（レベルごとの自己ベストの合計など）は、共通基盤が前回の自己ベストと束ねてから計算する
const v = (mod, version = 'v1') => ({ version, kind: mod.KIND, score: mod.score, ...(mod.combine ? { combine: mod.combine } : {}) });

export const SCORERS = {
  tactics: v(tactics, 'v2'), // v2：レギュレーション倍率を共通基盤の難易度の係数に（SPEC-002 3.1）
  survivor: v(survivor, 'v3'), // v3：難易度の係数を共通基盤で（名前と ABSOLUTE の 4 軸から。上限 2.0）
  fortress: v(fortress, 'v2'), // v2：レベルごとの自己ベストの合計と早呼びのボーナス（SPEC-002 3.3）
  deckbattle: v(deckbattle, 'v2'), // v2：係数をボットの通しプレイの実測に合わせた（SPEC-002 3.4）
  education: v(education, 'v2'), // v2：ゲームクリアと加点（MyCryptoEducation#1）
  workshop: v(workshop),
  '10buy': v(tenbuy),
  factory: v(factory),
};

/** 総合スコアにまだ入れないタイトル（SPEC-002 3.5） */
export const PLANNED = ['tcg'];
