// KPI とチュートリアルの漏斗（SPEC-010）のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.js';
import { kpi, tutorialFunnel, addDays, dayRange } from '../kpi.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = readdirSync(join(ROOT, 'migrations')).sort();
const PORTAL = 'https://bearko.games';
const TENBUY = 'https://10-buy-year.bearko.games';
const SURVIVOR = 'https://survivor.bearko.games';

function d1(upTo = null) {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of MIGRATIONS) if (!upTo || f < upTo) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => (sqlite.prepare(sql).run(...args), { success: true }),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return { sqlite, prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } };
}

function setup() {
  let t = Date.parse('2026-10-20T03:00:00Z'); // 日本時間 10/20 12:00
  const db = d1();
  const api = createApi({ db, now: () => t, verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null), adminSubs: ['boss'], log: () => {} });
  const device = () => {
    const jar = {};
    const call = async (method, path, body, origin = PORTAL) => {
      const headers = { cookie: Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ') };
      if (origin) headers.origin = origin;
      const res = await api.fetch(new Request(`https://bearko.games${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      for (const c of res.headers.getSetCookie()) { const [pair] = c.split('; '); const i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    };
    return { jar, call };
  };
  return { db, device, tick: (ms) => (t += ms) };
}
const DAY = 86400e3;

test('日付の足し算と範囲', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(dayRange('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('KPI：NUU・DAU・WAU・MAU・RR1/3/7 の定義どおり', () => {
  const rows = [
    // a：10/1 に始め、10/2・10/4・10/8 にも遊ぶ
    ...['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-08'].map((day) => ({ user: 'a', day })),
    // b：10/1 に始め、それきり
    { user: 'b', day: '2026-10-01' },
    // c：10/2 に始め、10/3 に遊ぶ（同じ日の行が重なってもよい）
    { user: 'c', day: '2026-10-02' }, { user: 'c', day: '2026-10-02' }, { user: 'c', day: '2026-10-03' },
    // d：9/1 に始めた古い人。10/8 に戻る
    { user: 'd', day: '2026-09-01' }, { user: 'd', day: '2026-10-08' },
  ];
  const r = kpi(rows, { from: '2026-10-01', to: '2026-10-08', today: '2026-10-09' });
  const day = (d) => r.days.find((x) => x.day === d);
  assert.deepEqual([day('2026-10-01').nuu, day('2026-10-02').nuu, day('2026-10-08').nuu], [2, 1, 0], 'd は 9/1 が初めて');
  assert.deepEqual([day('2026-10-01').dau, day('2026-10-02').dau, day('2026-10-08').dau], [2, 2, 2]);
  assert.equal(day('2026-10-07').wau, 3, '10/1〜10/7：a・b・c');
  assert.equal(day('2026-10-08').wau, 3, '10/2〜10/8：a・c・d');
  assert.equal(day('2026-10-08').mau, 4, '9/9〜10/8：a・b・c・d（d の 9/1 は外だが 10/8 にいる）');
  assert.deepEqual(day('2026-10-01').rr[1], { kept: 1, of: 2 }, '10/1 の 2 人のうち 10/2 に a');
  assert.deepEqual(day('2026-10-01').rr[3], { kept: 1, of: 2 }, '10/4 に a');
  assert.deepEqual(day('2026-10-01').rr[7], { kept: 1, of: 2 }, '10/8 に a');
  assert.deepEqual(day('2026-10-02').rr[1], { kept: 1, of: 1 }, 'c は 10/3');
  assert.equal(day('2026-10-02').rr[7], null, '10/9 はまだ終わっていない');
  assert.equal(day('2026-10-08').rr[1], null);
  assert.deepEqual(day('2026-10-05').rr[1], { kept: 0, of: 0 }, '新しい人のいない日');
  assert.deepEqual(r.summary.rr[1], { kept: 2, of: 3 }, '日の来ている新規の人をまとめる');
  assert.deepEqual(r.summary.rr[7], { kept: 1, of: 2 });
  assert.equal(r.summary.nuu, 3);
  assert.equal(r.summary.mau, 4);
  assert.equal(r.summary.dauAvg, Math.round(((2 + 2 + 1 + 1 + 0 + 0 + 0 + 2) / 8) * 10) / 10);
});

test('チュートリアルの漏斗：着いた数・割合・時間の中央値・いちばん落ちた段・終えた人の RR', () => {
  const T = Date.parse('2026-10-20T01:00:00Z'); // 日本時間 10/20 10:00
  const s = (user, step, stepId, sec) => ({ user, step, stepId, at: T + sec * 1000 });
  const rows = [
    s('a', 0, 'start', 0), s('a', 1, 'list_home', 30), s('a', 2, 'sell_home', 60), s('a', 3, 'done', 300),
    s('b', 0, 'start', 0), s('b', 1, 'list_home', 50), s('b', 2, 'sell_home', 100),
    s('c', 0, 'start', 0), s('c', 1, 'list_home', 90),
    s('d', 0, 'start', 0),
    s('e', 0, 'start', 0), s('e', 3, 'done', 400), // 途中の段が抜けていても、先へ進んだ人は通ったとみなす
    s('old', 0, 'start', -10 * DAY / 1000), s('old', 1, 'list_home', -10 * DAY / 1000 + 5), // 期間の外
  ];
  const activeDays = new Map([['a', new Set(['2026-10-20', '2026-10-21'])], ['b', new Set(['2026-10-20'])], ['d', new Set(['2026-10-20', '2026-10-27'])]]);
  const f = tutorialFunnel(rows, { fromMs: Date.parse('2026-10-14T15:00:00Z'), toMs: Date.parse('2026-10-30T00:00:00Z'), activeDays, today: '2026-10-30' });
  assert.equal(f.started, 5);
  assert.deepEqual(f.steps.map((x) => [x.step, x.id, x.reached]), [[0, 'start', 5], [1, 'list_home', 4], [2, 'sell_home', 3], [3, 'done', 2]]);
  assert.equal(f.steps[1].medianSec, 50, '30・50・90 の真ん中');
  assert.equal(f.steps[3].medianSec, 350);
  assert.equal(f.steps[2].ofPrev, 3 / 4);
  assert.equal(f.finished, 2);
  assert.equal(f.worstStep, 1, '1 人ずつ減る段が並ぶときは手前');
  assert.deepEqual(f.daily, [{ day: '2026-10-20', started: 5, finished: 2 }]);
  assert.deepEqual(f.retention.finished[1], { kept: 1, of: 1 }, 'a は 10/21 に遊んだ（e はアカウントがない）');
  assert.deepEqual(f.retention.unfinished[1], { kept: 0, of: 2 }, 'b と d');
  assert.deepEqual(f.retention.unfinished[7], { kept: 1, of: 2 }, 'd は 10/27');
});

test('遊んだ日の記録：来訪・アチーブメント・チュートリアルで付き、同じ日は 1 行。ポータルは数えない', async () => {
  const { db, device, tick } = setup();
  const p = device();
  await p.call('POST', '/api/trophies/visit', { game: 'survivor' }, SURVIVOR);
  await p.call('POST', '/api/trophies/visit', { game: 'survivor' }, SURVIVOR);
  await p.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, SURVIVOR);
  await p.call('POST', '/api/trophies/welcome', {});
  tick(DAY);
  assert.equal((await p.call('POST', '/api/tutorial/step', { game: '10buy', step: 0, id: 'start' }, TENBUY)).status, 200);
  const days = db.sqlite.prepare('SELECT game, day FROM user_days ORDER BY day, game').all().map((r) => [r.game, r.day]);
  assert.deepEqual(days, [['survivor', '2026-10-20'], ['10buy', '2026-10-21']]);
});

test('チュートリアルの受け口：段ごとに最初の 1 回だけ。値とゲームの出どころを確かめる', async () => {
  const { db, device, tick } = setup();
  const p = device();
  assert.equal((await p.call('POST', '/api/tutorial/step', { game: '10buy', step: 1, id: 'list_home' }, TENBUY)).status, 200);
  tick(60e3);
  await p.call('POST', '/api/tutorial/step', { game: '10buy', step: 1, id: 'list_home' }, TENBUY);
  const rows = db.sqlite.prepare('SELECT step, step_id, at FROM tutorial_steps').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].at, Date.parse('2026-10-20T03:00:00Z'), '最初の時刻のまま');
  for (const [body, origin, status] of [
    [{ game: '10buy', step: 1, id: 'x' }, SURVIVOR, 403],
    [{ game: 'nope', step: 1, id: 'x' }, TENBUY, 400],
    [{ game: 'toString', step: 1, id: 'x' }, TENBUY, 400],
    [{ game: '10buy', step: 100, id: 'x' }, TENBUY, 400],
    [{ game: '10buy', step: 1.5, id: 'x' }, TENBUY, 400],
    [{ game: '10buy', step: 1, id: 'Bad Id' }, TENBUY, 400],
    [{ game: '10buy', step: 1, id: 'x'.repeat(41) }, TENBUY, 400],
  ]) assert.equal((await p.call('POST', '/api/tutorial/step', body, origin)).status, status, JSON.stringify(body));
});

test('仮アカウントをまとめると、遊んだ日とチュートリアルも本アカウントへ移る', async () => {
  const { db, device } = setup();
  const p = device();
  await p.call('POST', '/api/tutorial/step', { game: '10buy', step: 0, id: 'start' }, TENBUY);
  await p.call('POST', '/api/auth/google', { credential: 'ok:someone' });
  const users = db.sqlite.prepare('SELECT id FROM users').all();
  assert.equal(users.length, 1);
  assert.deepEqual(db.sqlite.prepare('SELECT DISTINCT user_id FROM user_days UNION SELECT DISTINCT user_id FROM tutorial_steps').all().map((r) => r.user_id), [users[0].id]);
});

test('管理画面：KPI（横断・タイトル別）とチュートリアル。テスターは除く。管理者だけ', async () => {
  const { device, tick } = setup();
  const a = device();
  await a.call('POST', '/api/trophies/visit', { game: 'survivor' }, SURVIVOR);
  await a.call('POST', '/api/tutorial/step', { game: '10buy', step: 0, id: 'start' }, TENBUY);
  await a.call('POST', '/api/tutorial/step', { game: '10buy', step: 1, id: 'list_home' }, TENBUY);
  const b = device();
  await b.call('POST', '/api/tutorial/step', { game: '10buy', step: 0, id: 'start' }, TENBUY);
  tick(DAY);
  await a.call('POST', '/api/trophies/visit', { game: 'survivor' }, SURVIVOR);
  const boss = device();   // 管理者の端末はテスター。ここで遊んだ分は数えない
  await boss.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  await boss.call('POST', '/api/trophies/visit', { game: 'survivor' }, SURVIVOR);
  tick(DAY);
  const k = (await boss.call('GET', '/api/admin/kpi?days=7', undefined, null)).body;
  assert.equal(k.game, '');
  const day = (d) => k.rows.find((x) => x.day === d);
  assert.deepEqual([day('2026-10-20').nuu, day('2026-10-20').dau, day('2026-10-21').dau], [2, 2, 1]);
  assert.deepEqual(day('2026-10-20').rr[1], { kept: 1, of: 2 });
  const surv = k.games.find((g) => g.game === 'survivor');
  assert.equal(surv.nuu, 1);
  assert.deepEqual(surv.rr[1], { kept: 1, of: 1 });
  assert.equal(k.games.find((g) => g.game === '10buy').nuu, 2);
  const only = (await boss.call('GET', '/api/admin/kpi?game=10buy&days=7', undefined, null)).body;
  assert.equal(only.summary.nuu, 2);
  assert.equal((await boss.call('GET', '/api/admin/kpi?game=cross', undefined, null)).status, 400);
  const tu = (await boss.call('GET', '/api/admin/tutorial?days=7', undefined, null)).body;
  assert.equal(tu.game, '10buy');
  assert.equal(tu.funnel.started, 2);
  assert.deepEqual(tu.funnel.steps.map((s) => s.reached), [2, 1]);
  const someone = device();
  await someone.call('POST', '/api/auth/google', { credential: 'ok:someone' });
  assert.equal((await someone.call('GET', '/api/admin/kpi', undefined, null)).status, 403);
  assert.equal((await someone.call('GET', '/api/admin/tutorial', undefined, null)).status, 403);
});

test('移行 0011：アチーブメントと成績の時刻から、遊んだ日を埋める（タイトル横断は除く）', () => {
  const db = d1('0011');
  db.sqlite.exec(`INSERT INTO users (id, google_sub, name, created_at, last_seen) VALUES ('u', NULL, NULL, 0, 0);
    INSERT INTO user_trophies (user_id, trophy_id, unlocked_at) VALUES ('u', 'survivor.visit', ${Date.parse('2026-10-19T14:59:00Z')}), ('u', 'cross.two', ${Date.parse('2026-10-19T16:00:00Z')}), ('u', '10buy.tutorial', ${Date.parse('2026-10-19T15:00:00Z')});
    INSERT INTO plays (user_id, game, metrics, formula, score, created_at) VALUES ('u', 'survivor', '{}', 'v1', 1, ${Date.parse('2026-10-21T00:00:00Z')});`);
  db.sqlite.exec(readFileSync(join(ROOT, 'migrations', MIGRATIONS.find((f) => f.startsWith('0011'))), 'utf8'));
  const days = db.sqlite.prepare('SELECT game, day FROM user_days ORDER BY day, game').all().map((r) => [r.game, r.day]);
  assert.deepEqual(days, [['survivor', '2026-10-19'], ['10buy', '2026-10-20'], ['survivor', '2026-10-21']]);
});
