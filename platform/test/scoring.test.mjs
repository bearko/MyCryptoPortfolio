// 総合スコア（SPEC-002）：タイトルごとの計算式（基準プレイ A・B）と API
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORERS } from '../scoring/index.js';
import { MAIN_NODES, SPECIAL_NODES } from '../scoring/deckbattle.v2.js';

const s = (game, m) => SCORERS[game].score(m)?.score ?? null;
// Fortress のふつうのクリア：体力 2/3 が残る・15 スロットに 7 体・早呼びなし
const FORTRESS_TYPICAL = { hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 };
const FORTRESS_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];

test('基準プレイ：A（ひととおり）≒ 1,000、B（ふつうにクリア）≒ 10,000', () => {
  const cases = [
    ['tactics', { chaptersCleared: 1, cleared: false }, { chaptersCleared: 5, cleared: true, finalScore: 20000 }],
    ['survivor', { stagesCleared: 1, cleared: false }, { stagesCleared: 3, cleared: true, reportScore: 150000, regulationMul: 1 }],
    ['fortress', { levels: { L1: FORTRESS_TYPICAL } }, { levels: Object.fromEntries(FORTRESS_LEVELS.map((id) => [id, FORTRESS_TYPICAL])) }],
    ['deckbattle', { nodesCleared: ['kindai-jp'] }, { nodesCleared: MAIN_NODES, nodes: Object.fromEntries(MAIN_NODES.map((id) => [id, { power: 312, avgBattleSec: 10 }])) }],
    ['education', { cards: 47, cells: 12, heroes: 1, titles: 1, cleared: false }, { cards: 469, cells: 40, heroes: 6, titles: 4, cleared: true }],
    ['workshop', { day: 30 }, { day: 300, clearBest: 7200 }],
    ['10buy', { years: 10, netWorth: -100000, difficulty: 'normal' }, { years: 10, netWorth: 5e7, difficulty: 'normal' }],
    ['factory', { factoryLevel: 2 }, { factoryLevel: 5, weeksToLv5: 156, questsCleared: 50, crafted: { uncommon: 100 } }],
  ];
  for (const [game, a, b] of cases) {
    const sa = s(game, a), sb = s(game, b);
    assert.ok(sa >= 900 && sa <= 1200, `${game} A = ${sa}`);
    assert.ok(sb >= 9000 && sb <= 11000, `${game} B = ${sb}`);
  }
});

test('上限はない：成績が良くなるほど同じ割合で伸びる（D11）', () => {
  const t = (f) => s('tactics', { chaptersCleared: 5, cleared: true, finalScore: f });
  assert.equal(t(40000) - t(20000), t(80000) - t(60000));
  assert.ok(t(1e6) > 200000);
  assert.ok(s('10buy', { years: 10, netWorth: 2e8, difficulty: 'normal' }) > 30000);
  assert.ok(s('workshop', { day: 1, clearBest: 1800 }) > s('workshop', { day: 1, clearBest: 3600 }));
});

test('節目の点は決まった点', () => {
  assert.equal(s('tactics', { chaptersCleared: 3, cleared: false }), 3000);
  assert.equal(s('survivor', { stagesCleared: 2, cleared: false }), 3000);
  assert.equal(s('deckbattle', { nodesCleared: MAIN_NODES }), 5000);
  assert.equal(s('deckbattle', { nodesCleared: [...MAIN_NODES, ...SPECIAL_NODES] }), 10000);
  assert.equal(s('factory', { factoryLevel: 5 }), 5000);
  assert.equal(s('fortress', { levelId: 'L5', won: false }), 0, '負けは 0');
  assert.equal(s('10buy', { years: 4, netWorth: 1e9 }), 400, '10 年に届かなければ年数 × 100 だけ');
  assert.equal(s('10buy', { years: 10, netWorth: 5e7, legacy: 'cap_sales', mentor: true }), s('10buy', { years: 10, netWorth: 5e7 }), '継承・師匠は記録するだけで、点に効かない（SPEC-002 3.8）');
});

test('DeckBattle v2：戦力 × 0.6 ＋ 1,900 ÷ 平均秒（ボットの実測。v1 の生の成績もそのまま計算し直せる）', () => {
  const d = (nodes) => s('deckbattle', { nodesCleared: Object.keys(nodes), nodes });
  assert.equal(d({ 'kindai-jp': { power: 178, avgBattleSec: 11.5 } }), Math.round(1000 + 178 * 0.6 + 1900 / 11.5), '最初のノード（実測の中央）');
  assert.ok(d({ 'kindai-jp': { power: 200, avgBattleSec: 11.5 } }) > d({ 'kindai-jp': { power: 178, avgBattleSec: 11.5 } }), '強いほど高い');
  assert.ok(d({ 'kindai-jp': { power: 178, avgBattleSec: 8 } }) > d({ 'kindai-jp': { power: 178, avgBattleSec: 11.5 } }), '速いほど高い');
  assert.equal(d({ 'ex-corsica': { power: 205, avgBattleSec: 8 } }), Math.round(5000 / 3 + 205 * 0.6 + 1900 / 8), '特別ステージ');
  assert.equal(d({ 'kindai-jp': { power: 178, avgBattleSec: 0.5 } }), null, '1 秒より短い平均はありえない');
});

test('Education：クリアは 5,000、称号・英雄・マス・カードは加点（v2）', () => {
  const e = (m) => s('education', m);
  const base = { cards: 300, cells: 30, heroes: 5, titles: 3 };
  assert.equal(e({ ...base, cleared: true }) - e({ ...base, cleared: false }), 5000);
  assert.ok(e({ ...base, titles: 4 }) > e(base), '称号');
  assert.ok(e({ ...base, heroes: 6 }) > e(base), '英雄');
  assert.ok(e({ ...base, cells: 31 }) > e(base), 'マス');
  assert.ok(e({ ...base, cards: 301 }) > e(base), 'カード');
  assert.equal(e({ cards: 100 }), 600, 'v1 のころの成績（cards だけ）も受け付ける');
  assert.equal(e({ cards: 10, cleared: true, heroes: 0 }), null, 'クリアならクレオパトラを解放している');
  assert.equal(e({ cards: 10, cleared: 'yes' }), null);
  assert.equal(e({ cards: 10, titles: -1 }), null);
});

test('Fortress：体力が残るほど・ヒーローが少ないほど高い', () => {
  const f = (hpLeft, used) => s('fortress', { levelId: 'L9', won: true, hpLeft, maxHp: 3, heroesUsed: used, slots: 15 });
  assert.ok(f(3, 7) > f(2, 7));
  assert.ok(f(2, 4) > f(2, 7));
});

test('Fortress v2：レベルごとの自己ベストの合計。早呼びのボーナスは 1 GUM ＝ 1 点', () => {
  const all = (e) => ({ levels: Object.fromEntries(FORTRESS_LEVELS.map((id) => [id, e])) });
  assert.equal(SCORERS.fortress.score(all(FORTRESS_TYPICAL)).milestone, 5000, '全レベルの節目 ＝ 5,000');
  assert.equal(s('fortress', all({ ...FORTRESS_TYPICAL, earlyBonus: 200 })) - s('fortress', all(FORTRESS_TYPICAL)), 1800, '9 レベル × 200');
  assert.ok(s('fortress', { levels: { L1: FORTRESS_TYPICAL, L2: FORTRESS_TYPICAL } }) > s('fortress', { levels: { L1: FORTRESS_TYPICAL } }), 'クリアしたレベルが増えるほど高い');
  // v1 の「レベル n をクリア」の節目は、v2 の L1〜Ln の節目の合計と同じ
  const v1Milestone = (n) => 500 + (n - 1) * 562.5;
  for (const n of [1, 5, 9]) {
    const levels = Object.fromEntries(FORTRESS_LEVELS.slice(0, n).map((id) => [id, FORTRESS_TYPICAL]));
    assert.equal(SCORERS.fortress.score({ levels }).milestone, Math.round(v1Milestone(n)));
  }
  assert.deepEqual(SCORERS.fortress.score({ levels: {} }), { score: 0, milestone: 0, performance: 0 });
});

test('Fortress v2：v1 の成績（1 レベルずつ）を束ねて、レベルごとの自己ベストにする', () => {
  const { combine } = SCORERS.fortress;
  const v1 = (levelId, hpLeft, heroesUsed, won = true) => ({ levelId, won, hpLeft, maxHp: 3, heroesUsed, slots: 15 });
  const merged = combine([v1('L1', 1, 7), v1('L1', 3, 5), v1('L2', 2, 7), v1('L3', 0, 0, false), { levelId: 'L4', won: true, hpLeft: 0, maxHp: 3, heroesUsed: 1, slots: 15 }]);
  assert.deepEqual(Object.keys(merged.levels), ['L1', 'L2'], '負けとありえない成績は入らない');
  assert.equal(merged.levels.L1.hpLeft, 3, 'L1 は点の高いほう');
  assert.equal(s('fortress', merged), s('fortress', { levels: { L1: merged.levels.L1 } }) + s('fortress', { levels: { L2: merged.levels.L2 } }));
  assert.equal(s('fortress', v1('L1', 2, 7)), s('fortress', { levels: { L1: FORTRESS_TYPICAL } }), 'v1 の形もそのまま計算できる');
  // 前回の自己ベスト ＋ 今回：下がらない
  const prev = combine([{ levels: { L1: { ...FORTRESS_TYPICAL, hpLeft: 3 }, L2: FORTRESS_TYPICAL } }]);
  const next = combine([prev, { levels: { L1: FORTRESS_TYPICAL, L3: FORTRESS_TYPICAL } }]);
  assert.deepEqual(Object.keys(next.levels), ['L1', 'L2', 'L3']);
  assert.equal(next.levels.L1.hpLeft, 3);
});

test('10 buy year：難易度の係数', () => {
  const m = (difficulty) => s('10buy', { years: 10, netWorth: 5e7, difficulty });
  assert.equal(m('normal'), 10001);
  assert.equal(m('hard'), 13601);
  assert.equal(m('easy'), 7301);
});

test('Tactics v2：倍率の前の点 × 共通基盤の難易度の係数（ゲーム内の倍率は使わない）', () => {
  const t = (regulation, baseScore, extra = {}) => s('tactics', { chaptersCleared: 5, cleared: true, finalScore: 0, regulation, baseScore, ...extra });
  assert.equal(t('common', 20000), 10000);
  assert.equal(t('egg', 20000), 11000);
  assert.equal(t('baby', 20000), 12000);
  assert.equal(t('blue', 20000), 13500);
  assert.equal(t('red', 20000), 15000);
  assert.equal(t('absolute', 20000, { absoluteMult: 2500 }), 15000, 'ABSOLUTE は Red を超えない');
  assert.equal(t('absolute', 20000, { absoluteMult: 1.5 }), 12500, 'ABSOLUTE の倍率そのもの');
  assert.equal(t('absolute', 20000, { absoluteMult: 0.0004 }), 5002, 'やさしい設定ほど小さい（下限なし）');
  assert.equal(s('tactics', { chaptersCleared: 3, cleared: false, regulation: 'red' }), 3000, '節目の点には掛けない');
  assert.equal(t('nightmare', 20000), null);
  assert.equal(t('absolute', 20000, { absoluteMult: 9999 }), null, 'ありえない倍率');
});

test('Tactics v2：v1 の生の成績（倍率の前の点がない）からも計算し直せる', () => {
  const v1 = (regulation, finalScore) => s('tactics', { chaptersCleared: 5, cleared: true, finalScore, regulation });
  assert.equal(v1('common', 20000), 10000);
  assert.equal(v1('red', 60000), 15000, '最終スコア ÷ ゲーム内の倍率 3.0 ＝ 20,000 に Red の係数 2.0');
  assert.equal(v1('absolute', 999999), 5000, 'ABSOLUTE の倍率が分からないので節目の点だけ');
  assert.equal(s('tactics', { chaptersCleared: 4, cleared: false, finalScore: 0, regulation: 'common' }), 4000, '本番の 1 件（2026-10-17）は変わらない');
});

test('Survivor v2：ABSOLUTE の倍率は 2.0 まで（係数 1/30 は v1 のまま）', () => {
  const v = (regulationMul, reportScore = 150000) => s('survivor', { stagesCleared: 3, cleared: true, reportScore, regulationMul });
  assert.equal(SCORERS.survivor.version, 'v2');
  assert.equal(v(1), 10000);
  assert.equal(v(0.5), 7500, '2.0 未満はそのまま');
  assert.equal(v(1.5), 12500);
  assert.equal(v(2), 15000);
  assert.equal(v(5), 15000, '×5.0 でも 2.0 で止める');
  assert.equal(v(5, 300000), 25000, '活動レポートのスコアには上限がない（D11）');
  assert.equal(s('survivor', { stagesCleared: 2, cleared: false, regulationMul: 5 }), 3000, '節目の点には倍率を掛けない');
  assert.equal(s('survivor', { stagesCleared: 3, cleared: true, reportScore: 150000, regulationMul: 1000 }), null);
});

test('ありえない成績は受け付けない', () => {
  assert.equal(s('tactics', { chaptersCleared: 6, cleared: false }), null);
  assert.equal(s('tactics', { chaptersCleared: 3, cleared: true, finalScore: 1 }), null, 'クリアなら 5 章');
  assert.equal(s('fortress', { levelId: 'L9', won: true, hpLeft: 4, maxHp: 3, heroesUsed: 1, slots: 15 }), null);
  assert.equal(s('fortress', { levelId: 'L10', won: true }), null);
  assert.equal(s('deckbattle', { nodesCleared: ['nope'] }), null);
  assert.equal(s('workshop', { day: 1, clearBest: 60 }), null, '15 分より速いクリアはありえない');
  assert.equal(s('factory', { factoryLevel: 3, weeksToLv5: 10 }), null, 'Lv 5 でないのに Lv 5 の週数');
  assert.equal(s('factory', { factoryLevel: 5, crafted: { mythic: 1 } }), null);
  assert.equal(s('10buy', { years: 10, netWorth: 1, difficulty: 'nightmare' }), null);
});

// ---------------------------------------------------------------- API
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(ROOT, 'migrations')).sort()) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => (sqlite.prepare(sql).run(...args), {}),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  let t = Date.parse('2026-10-16T00:00:00Z');
  const api = createApi({ db: { prepare: (q) => stmt(q), batch: async (l) => { for (const x of l) await x.run(); } }, now: () => (t += 1000), verifyGoogle: async (c) => ({ sub: c }) });
  const browser = () => {
    const jar = {};
    return async (method, path, body, origin = 'https://survivor.bearko.games') => {
      const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), origin, 'content-type': 'application/json' };
      const res = await api.fetch(new Request('https://bearko.games' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      for (const c of res.headers.getSetCookie()) {
        const [k, v] = c.split('; ')[0].split('=');
        if (c.includes('Max-Age=0')) delete jar[k];
        else jar[k] = v;
      }
      return { status: res.status, body: await res.json() };
    };
  };
  return { sqlite, api, browser };
}
const run = (reportScore) => ({ game: 'survivor', metrics: { stagesCleared: 3, cleared: true, reportScore, regulationMul: 1 } });

test('API：送ると自己ベストが更新され、総合スコアは自己ベストの合計', async () => {
  const { browser } = setup();
  const b = browser();
  const r1 = await b('POST', '/api/score/submit', run(150000));
  assert.equal(r1.status, 200);
  assert.deepEqual([r1.body.account, r1.body.score, r1.body.improved, r1.body.total], ['guest', 10000, true, 10000]);
  const r2 = await b('POST', '/api/score/submit', run(90000));
  assert.deepEqual([r2.body.score, r2.body.best, r2.body.improved, r2.body.total], [8000, 10000, false, 10000]);
  await b('POST', '/api/score/submit', { game: 'tactics', metrics: { chaptersCleared: 2, cleared: false } }, 'https://tactics.bearko.games');
  const me = await b('GET', '/api/me/scores');
  assert.equal(me.body.total, 12000);
  assert.deepEqual(me.body.titles.map((t) => [t.game, t.score]), [['survivor', 10000], ['tactics', 2000]]);
});

test('API：そのゲームのサブドメインからだけ・正しい成績だけ受ける', async () => {
  const { browser } = setup();
  const b = browser();
  assert.equal((await b('POST', '/api/score/submit', run(1), 'https://tactics.bearko.games')).status, 403);
  assert.equal((await b('POST', '/api/score/submit', { game: 'tcg', metrics: {} }, 'https://tcg.bearko.games')).status, 400, 'TCG は保留');
  assert.equal((await b('POST', '/api/score/submit', { game: 'survivor', metrics: { stagesCleared: 9 } })).status, 400);
  assert.equal((await b('POST', '/api/score/submit', { game: 'survivor', metrics: { x: 'a'.repeat(5000) } })).status, 400);
});

test('API：仮アカウントの点はログインでまとまり、高いほうが残る。ランキングはログインした人だけ', async () => {
  const { browser } = setup();
  const other = browser();
  await other('POST', '/api/auth/google', { credential: 'sub-x' });
  await other('POST', '/api/me/name', { name: 'くま' });
  await other('POST', '/api/score/submit', run(60000)); // 7,000

  const b = browser();
  await b('POST', '/api/score/submit', run(300000)); // 仮アカウントで 15,000
  assert.deepEqual((await b('GET', '/api/score/ranking')).body.entries.map((e) => e.total), [7000], '仮アカウントは出ない');
  await b('POST', '/api/auth/google', { credential: 'sub-x' }); // 同じアカウントにログイン
  const me = await b('GET', '/api/me/scores');
  assert.equal(me.body.account, 'login');
  assert.equal(me.body.total, 15000, '高いほう（仮アカウントの 15,000）が残る');
  const rk = await b('GET', '/api/score/ranking');
  assert.deepEqual(rk.body.entries.map((e) => [e.rank, e.name, e.total, e.titles.survivor, e.me]), [[1, 'くま', 15000, 15000, true]]);
  assert.deepEqual(rk.body.me, { rank: 1, total: 15000 });
  assert.deepEqual((await b('GET', '/api/score/ranking?game=survivor')).body.entries.map((e) => e.score), [15000]);
});

test('API：積み上げのタイトルは生の成績をふやさない。計算式の版が変わると計算し直す', async () => {
  const { sqlite, api, browser } = setup();
  const b = browser();
  for (const cards of [10, 20, 30, 25]) await b('POST', '/api/score/submit', { game: 'education', metrics: { cards } }, 'https://education.bearko.games');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM plays WHERE game = 'education'").get().n, 2, 'いまの値と自己ベストのもとだけ');
  sqlite.prepare("UPDATE title_scores SET formula = 'v0', score = 1").run();
  const r = await api.cleanup();
  assert.equal(r.recomputed, 1);
  assert.equal(sqlite.prepare("SELECT score FROM title_scores WHERE game = 'education'").get().score, SCORERS.education.score({ cards: 30 }).score);
});

const fort = (levels) => ({ game: 'fortress', metrics: { levels } });
const FORT = 'https://fortress.bearko.games';

test('API：Fortress は前回の自己ベストと束ねる（古いセーブ・別の端末から送っても下がらない）', async () => {
  const { sqlite, browser } = setup();
  const b = browser();
  const typ = { hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 };
  // v1 のゲーム（1 レベルずつ送る）がまだ残っていても足し上がる
  await b('POST', '/api/score/submit', { game: 'fortress', metrics: { levelId: 'L1', won: true, ...typ } }, FORT);
  const r2 = await b('POST', '/api/score/submit', { game: 'fortress', metrics: { levelId: 'L2', won: true, ...typ } }, FORT);
  assert.equal(r2.body.score, SCORERS.fortress.score({ levels: { L1: typ, L2: typ } }).score);
  assert.equal(r2.body.improved, true);
  // 別の端末（L3 しか持っていない）
  const r3 = await b('POST', '/api/score/submit', fort({ L3: typ }), FORT);
  assert.equal(r3.body.score, SCORERS.fortress.score({ levels: { L1: typ, L2: typ, L3: typ } }).score);
  // L1 を前より悪く送っても下がらない
  const r4 = await b('POST', '/api/score/submit', fort({ L1: { ...typ, hpLeft: 1 } }), FORT);
  assert.deepEqual([r4.body.score, r4.body.improved], [r3.body.score, false]);
  assert.ok(sqlite.prepare("SELECT COUNT(*) n FROM plays WHERE game = 'fortress'").get().n <= 2, '積み上げなので生の成績はふやさない');
  assert.equal((await b('POST', '/api/score/submit', fort({ L0: typ }), FORT)).status, 400);
  assert.equal((await b('POST', '/api/score/submit', fort({ L1: { ...typ, earlyBonus: -1 } }), FORT)).status, 400);
});

test('API：Fortress を v1 から v2 に計算し直す（1 レベルずつの生の成績を束ねる）', async () => {
  const { sqlite, api } = setup();
  const typ = { hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 };
  // v1 のころに保存された成績（自己ベストは L5 の 1 回だけ）。90 日より古いものは掃除で先に消えるので、新しい日付で入れる
  const NOW = Date.parse('2026-10-16T00:00:00Z');
  sqlite.prepare("INSERT INTO users (id, google_sub, created_at, last_seen) VALUES ('u1', 'g1', 0, 0)").run();
  const ins = sqlite.prepare("INSERT INTO plays (user_id, game, metrics, formula, score, created_at) VALUES ('u1', 'fortress', ?, 'v1', 0, ?)");
  for (const id of ['L1', 'L2', 'L3', 'L4', 'L5']) ins.run(JSON.stringify({ levelId: id, won: true, ...typ }), NOW);
  ins.run(JSON.stringify({ levelId: 'L6', won: false, hpLeft: 0, maxHp: 3, heroesUsed: 9, slots: 12 }), NOW);
  const best = sqlite.prepare("SELECT MAX(id) id FROM plays").get().id - 1;
  sqlite.prepare("INSERT INTO title_scores (user_id, game, score, milestone, performance, formula, play_id, updated_at) VALUES ('u1', 'fortress', 5500, 2750, 2750, 'v1', ?, 0)").run(best);
  const r = await api.cleanup();
  assert.equal(r.recomputed, 1);
  const ts = sqlite.prepare("SELECT score, formula, play_id FROM title_scores WHERE user_id = 'u1'").get();
  const want = SCORERS.fortress.score({ levels: { L1: typ, L2: typ, L3: typ, L4: typ, L5: typ } }).score;
  assert.deepEqual([ts.score, ts.formula], [want, 'v2']);
  assert.equal(want, 5500, 'ふつうにクリアした成績なら、v1 の「L5 クリア」と同じ点');
  const plays = sqlite.prepare("SELECT id, metrics FROM plays WHERE user_id = 'u1'").all();
  assert.equal(plays.length, 1, '束ねた 1 つだけ残る');
  assert.equal(plays[0].id, ts.play_id);
  assert.deepEqual(Object.keys(JSON.parse(plays[0].metrics).levels), ['L1', 'L2', 'L3', 'L4', 'L5']);
});

test('API：Fortress の仮アカウントをまとめると、両方のレベルを束ねる', async () => {
  const { browser } = setup();
  const typ = { hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 };
  const other = browser();
  await other('POST', '/api/auth/google', { credential: 'sub-f' });
  await other('POST', '/api/score/submit', fort({ L1: typ, L2: typ }), FORT);
  const b = browser();
  await b('POST', '/api/score/submit', fort({ L3: typ }), FORT); // 仮アカウント
  await b('POST', '/api/auth/google', { credential: 'sub-f' });
  const me = await b('GET', '/api/me/scores');
  assert.equal(me.body.total, SCORERS.fortress.score({ levels: { L1: typ, L2: typ, L3: typ } }).score);
});

test('API：退会で点も消える', async () => {
  const { sqlite, browser } = setup();
  const b = browser();
  await b('POST', '/api/auth/google', { credential: 'bye' });
  await b('POST', '/api/score/submit', run(150000));
  await b('DELETE', '/api/me');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM plays').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM title_scores').get().n, 0);
});

test('API：対象タイトルの一覧（TCG は対応予定）', async () => {
  const { browser } = setup();
  const g = (await browser()('GET', '/api/score/games')).body.games;
  assert.equal(g.filter((x) => x.status === 'live').length, 8);
  assert.deepEqual(g.filter((x) => x.status === 'planned').map((x) => x.id), ['tcg']);
});
