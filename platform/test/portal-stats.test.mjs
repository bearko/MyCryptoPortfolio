// ポータルの計測（SPEC-009）のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.js';
import { portalEvent, jstDay, PORTAL_GAMES } from '../portal-stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORTAL = 'https://bearko.games';

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(ROOT, 'migrations')).sort()) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => (sqlite.prepare(sql).run(...args), { success: true }),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return { sqlite, prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } };
}

function setup({ limit = null } = {}) {
  let t = Date.parse('2026-10-19T14:30:00Z'); // 日本時間 10/19 23:30
  const db = d1();
  const api = createApi({ db, now: () => t, verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null), adminSubs: ['boss'], portalLimit: limit, log: () => {} });
  const jar = {};
  const call = async (method, path, body, origin = PORTAL, raw = false) => {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (origin) headers.origin = origin;
    const res = await api.fetch(new Request(`https://bearko.games${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }));
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split('; '); const [k, v] = pair.split('='); jar[k] = v; }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, api, call, tick: (ms) => (t += ms) };
}

const rows = (db) => db.sqlite.prepare('SELECT day, event, game, source, n FROM portal_counts ORDER BY day, event, game, source').all().map((r) => ({ ...r }));

test('受け付ける値：できごと・作品・どこから', () => {
  assert.deepEqual(portalEvent({ e: 'view', s: 'new' }), { event: 'view', game: '', source: 'new' });
  assert.deepEqual(portalEvent({ e: 'play', g: 'tenbuy', s: 'feat' }), { event: 'play', game: 'tenbuy', source: 'feat' });
  assert.deepEqual(portalEvent({ e: 'peek', g: 'survivor' }), { event: 'peek', game: 'survivor', source: '' });
  assert.deepEqual(portalEvent({ e: 'mood', s: 'action' }), { event: 'mood', game: '', source: 'action' });
  assert.deepEqual(portalEvent({ e: 'ach', s: 'preview' }), { event: 'ach', game: '', source: 'preview' });
  assert.deepEqual(portalEvent({ e: 'mine', s: 'heard' }), { event: 'mine', game: '', source: 'heard' });
  for (const bad of [null, {}, { e: 'nope' }, { e: 'view', s: 'other' }, { e: 'view', g: 'survivor', s: 'new' }, { e: 'play', g: '10buy', s: 'feat' },
    { e: 'play', g: 'survivor' }, { e: 'open', g: 'survivor', s: 'sheet' }, { e: 'feat' }, { e: 'play', g: ['survivor'], s: 'feat' }, { e: 'toString' },
    { e: 'ach' }, { e: 'ach', s: 'view' }, { e: 'ach', g: 'survivor', s: 'login' }, { e: 'mine', s: 'other' }]) {
    assert.equal(portalEvent(bad), null, JSON.stringify(bad));
  }
  assert.equal(PORTAL_GAMES.length, 10);
  assert.equal(jstDay(Date.parse('2026-10-19T14:59:59Z')), '2026-10-19');
  assert.equal(jstDay(Date.parse('2026-10-19T15:00:00Z')), '2026-10-20', '日本時間の 0 時で日が変わる');
});

test('日ごと・組み合わせごとに 1 ずつ足す（行は増えない）。だれかを見分ける値は残さない', async () => {
  const { db, call, tick } = setup();
  assert.equal((await call('POST', '/api/portal/event', { e: 'view', s: 'new' })).status, 204);
  await call('POST', '/api/portal/event', { e: 'view', s: 'new' });
  await call('POST', '/api/portal/event', { e: 'play', g: 'survivor', s: 'feat' });
  // sendBeacon は text/plain で送る。中身が JSON なら同じに数える
  assert.equal((await call('POST', '/api/portal/event', JSON.stringify({ e: 'play', g: 'survivor', s: 'feat' }), PORTAL, true)).status, 204);
  tick(60 * 60e3); // 日本時間 10/20 0:30
  await call('POST', '/api/portal/event', { e: 'view', s: 'return' });
  assert.deepEqual(rows(db), [
    { day: '2026-10-19', event: 'play', game: 'survivor', source: 'feat', n: 2 },
    { day: '2026-10-19', event: 'view', game: '', source: 'new', n: 2 },
    { day: '2026-10-20', event: 'view', game: '', source: 'return', n: 1 },
  ]);
  const cols = db.sqlite.prepare("SELECT name FROM pragma_table_info('portal_counts')").all().map((c) => c.name);
  assert.deepEqual(cols, ['day', 'event', 'game', 'source', 'n']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 0, '仮アカウントも作らない');
});

test('ポータルからだけ受け付け、知らない値は 400、上限を超えたら 429', async () => {
  let allow = true;
  const { db, call } = setup({ limit: async () => allow });
  assert.equal((await call('POST', '/api/portal/event', { e: 'view', s: 'new' }, 'https://survivor.bearko.games')).status, 403, 'ゲームのサブドメインからは数えない');
  assert.equal((await call('POST', '/api/portal/event', { e: 'view', s: 'new' }, null)).status, 403);
  assert.equal((await call('POST', '/api/portal/event', { e: 'view', s: 'new' }, 'https://evil.example')).status, 403);
  assert.equal((await call('POST', '/api/portal/event', { e: 'play', g: 'nope', s: 'feat' })).status, 400);
  allow = false;
  assert.equal((await call('POST', '/api/portal/event', { e: 'view', s: 'new' })).status, 429);
  assert.deepEqual(rows(db), []);
});

test('管理画面：期間の行を返す。管理者だけ', async () => {
  const { call, tick } = setup();
  await call('POST', '/api/portal/event', { e: 'open', g: 'tactics', s: 'card' });
  tick(3 * 86400e3);
  await call('POST', '/api/portal/event', { e: 'play', g: 'tactics', s: 'sheet' });
  assert.equal((await call('GET', '/api/admin/portal', undefined, null)).status, 401);
  await call('POST', '/api/auth/google', { credential: 'ok:someone' });
  assert.equal((await call('GET', '/api/admin/portal', undefined, null)).status, 403);
  await call('POST', '/api/auth/logout', {});
  await call('POST', '/api/auth/google', { credential: 'ok:boss' });
  const all = (await call('GET', '/api/admin/portal?days=14', undefined, null)).body;
  assert.equal(all.days, 14);
  assert.deepEqual(all.rows.map((r) => [r.day, r.event, r.game, r.source, r.n]), [['2026-10-22', 'play', 'tactics', 'sheet', 1], ['2026-10-19', 'open', 'tactics', 'card', 1]]);
  const two = (await call('GET', '/api/admin/portal?days=2', undefined, null)).body;
  assert.deepEqual(two.rows.map((r) => r.day), ['2026-10-22'], '2 日なら今日と昨日だけ');
  assert.equal((await call('GET', '/api/admin/portal?days=99999', undefined, null)).body.days, 400);
});

test('掃除：400 日より古い日の行を消す', async () => {
  const { db, api, call, tick } = setup();
  await call('POST', '/api/portal/event', { e: 'view', s: 'new' });
  tick(401 * 86400e3);
  await call('POST', '/api/portal/event', { e: 'view', s: 'new' });
  assert.equal(rows(db).length, 2);
  await api.cleanup();
  assert.deepEqual(rows(db).map((r) => r.day), [jstDay(Date.parse('2026-10-19T14:30:00Z') + 401 * 86400e3)]);
});
