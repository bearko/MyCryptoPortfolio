// 総合スコア（SPEC-002）：タイトルごとの計算式（基準プレイ A・B）と API
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORERS } from '../scoring/index.js';
import { MAIN_NODES, SPECIAL_NODES } from '../scoring/deckbattle.v1.js';

const s = (game, m) => SCORERS[game].score(m)?.score ?? null;

test('基準プレイ：A（ひととおり）≒ 1,000、B（ふつうにクリア）≒ 10,000', () => {
  const cases = [
    ['tactics', { chaptersCleared: 1, cleared: false }, { chaptersCleared: 5, cleared: true, finalScore: 20000 }],
    ['survivor', { stagesCleared: 1, cleared: false }, { stagesCleared: 3, cleared: true, reportScore: 150000, regulationMul: 1 }],
    ['fortress', { levelId: 'L1', won: true, hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 }, { levelId: 'L9', won: true, hpLeft: 2, maxHp: 3, heroesUsed: 7, slots: 15 }],
    ['deckbattle', { nodesCleared: ['kindai-jp'] }, { nodesCleared: MAIN_NODES, nodes: Object.fromEntries(MAIN_NODES.map((id) => [id, { power: 180, avgBattleSec: 30 }])) }],
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

test('10 buy year：難易度の係数', () => {
  const m = (difficulty) => s('10buy', { years: 10, netWorth: 5e7, difficulty });
  assert.equal(m('normal'), 10001);
  assert.equal(m('hard'), 13601);
  assert.equal(m('easy'), 7301);
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
