// ポチゲーポータルのプッシュ通知（SPEC-011）のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.js';
import { checkEvent, eventId, isoJst, feed, notifyHub } from '../pochi-notify.js';

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

// ハブの偽物：受けた POST を残し、決めた返事を返す
function fakeHub(answer = { status: 202, body: { queued: true } }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: answer.headers || {} });
  };
  return { calls, fetchImpl };
}

function setup({ pochi = true, hub = fakeHub() } = {}) {
  let t = Date.parse('2026-11-27T03:00:00Z'); // 日本時間 11/27 12:00
  const db = d1();
  const api = createApi({
    db, now: () => t, verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null), adminSubs: ['boss'], log: () => {},
    pochi: pochi ? { hub: 'https://hub.example/api/portal/notifications/hub/', gameKey: 'mycryptgames', apiKey: 'secret-key', fetch: hub.fetchImpl } : null,
  });
  const device = () => {
    const jar = {};
    const call = async (method, path, body, origin = PORTAL) => {
      const headers = { cookie: Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ') };
      if (origin) headers.origin = origin;
      const res = await api.fetch(new Request(`https://bearko.games${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      for (const c of res.headers.getSetCookie()) { const [pair] = c.split('; '); const i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
      return { status: res.status, body: res.status === 204 ? null : await res.json(), type: res.headers.get('content-type') };
    };
    return { call };
  };
  return { db, hub, device, tick: (ms) => (t += ms) };
}

const MSG = { channel: 'new_title', title: '新作「MyCryptoFootball」を公開しました', body: 'マイクリ大学アメフト部の監督として、チームを優勝に導こう！育成好きな人にオススメ！', url: 'https://bearko.games/#football' };

test('中身の確かめ：チャンネル・文字数・改行と < >・行き先は bearko.games の中だけ', () => {
  assert.equal(checkEvent(MSG).ok, true);
  for (const [bad, error] of [
    [{ channel: 'New-Title' }, 'channel'],
    [{ title: '' }, 'title'],
    [{ title: 'あ'.repeat(61) }, 'title'],
    [{ title: '<b>新作</b>' }, 'title'],
    [{ body: '1行目\n2行目' }, 'body'],
    [{ body: 'あ'.repeat(161) }, 'body'],
    [{ url: 'https://football.bearko.games/' }, 'url'],
    [{ url: 'https://bearko.games.evil.example/' }, 'url'],
    [{ url: 'http://bearko.games/' }, 'url'],
  ]) assert.deepEqual(checkEvent({ ...MSG, ...bad }), { ok: false, error }, JSON.stringify(bad));
  assert.equal(checkEvent({ ...MSG, title: 'あ'.repeat(60), body: 'い'.repeat(160) }).ok, true, 'ちょうど 60・160 文字はよい');
});

test('時刻はタイムゾーン付き（日本時間）、ID はチャンネルと時刻から', () => {
  const t = Date.parse('2026-11-27T03:04:05Z');
  assert.equal(isoJst(t), '2026-11-27T12:04:05+09:00');
  assert.equal(eventId('new_title', t), 'new_title_20261127_120405');
  const f = feed([{ id: 'a', channel: 'c', title: 'T', body: 'B', url: 'https://bearko.games/', published_at: t, expires_at: null }]);
  assert.deepEqual(f, { spec_version: 1, events: [{ id: 'a', channel: 'c', title: 'T', body: 'B', url: 'https://bearko.games/', published_at: '2026-11-27T12:04:05+09:00' }] });
});

test('ハブへの知らせ：Authorization に API キー、本文は game_key だけ。返事の状態を返す（キーは返さない）', async () => {
  const hub = fakeHub({ status: 429, body: { error: 'too many' }, headers: { 'Retry-After': '42' } });
  const r = await notifyHub({ hub: 'https://hub.example/', gameKey: 'mycryptgames', apiKey: 'k' }, hub.fetchImpl);
  assert.deepEqual(hub.calls, [{ url: 'https://hub.example/', auth: 'Bearer k', body: { game_key: 'mycryptgames' } }]);
  assert.deepEqual(r, { status: 429, queued: null, retryAfter: 42, error: 'too many' });
  const down = await notifyHub({ hub: 'https://hub.example/', gameKey: 'g', apiKey: 'k' }, async () => { throw new TypeError('x'); });
  assert.equal(down.status, 0);
});

test('管理画面から送る → フィードに載り、ハブへ知らせる。60 秒あけないと送れない。管理者だけ', async () => {
  const { device, hub, tick } = setup();
  const anyone = device();
  const empty = await anyone.call('GET', '/api/game-events/', undefined, null);
  assert.equal(empty.status, 200);
  assert.match(empty.type, /application\/json/);
  assert.deepEqual(empty.body, { spec_version: 1, events: [] });

  assert.equal((await anyone.call('POST', '/api/admin/pochi/send', MSG)).status, 401, 'ログインしていない');
  const someone = device();
  await someone.call('POST', '/api/auth/google', { credential: 'ok:someone' });
  assert.equal((await someone.call('POST', '/api/admin/pochi/send', MSG)).status, 403, '管理者だけ');
  const boss = device();
  await boss.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  assert.deepEqual((await boss.call('POST', '/api/admin/pochi/send', { ...MSG, url: 'https://football.bearko.games/' })).body, { error: 'url' });

  const sent = await boss.call('POST', '/api/admin/pochi/send', MSG);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.id, 'new_title_20261127_120000');
  assert.deepEqual(sent.body.hub, { status: 202, queued: true, retryAfter: null, error: null });
  assert.deepEqual(hub.calls.map((c) => [c.auth, c.body]), [['Bearer secret-key', { game_key: 'mycryptgames' }]]);

  const f = (await anyone.call('GET', '/api/game-events', undefined, null)).body;
  assert.deepEqual(f.events, [{ id: 'new_title_20261127_120000', channel: 'new_title', title: MSG.title, body: MSG.body, url: MSG.url, published_at: '2026-11-27T12:00:00+09:00' }]);
  assert.equal(JSON.stringify(f).includes('secret-key'), false, 'フィードに API キーは出ない');

  assert.deepEqual((await boss.call('POST', '/api/admin/pochi/send', MSG)).body, { error: 'gap' }, '60 秒あけていない');
  assert.equal((await boss.call('POST', '/api/admin/pochi/hub')).status, 429);
  tick(61e3);
  const again = await boss.call('POST', '/api/admin/pochi/hub');
  assert.equal(again.status, 200);
  assert.equal(again.body.id, 'new_title_20261127_120000');
  assert.equal(hub.calls.length, 2);

  const list = (await boss.call('GET', '/api/admin/pochi', undefined, null)).body;
  assert.equal(list.ready, true);
  assert.equal(list.feed, 'https://bearko.games/api/game-events/');
  assert.equal(list.events.length, 1);
  assert.deepEqual([list.events[0].hub_status, list.events[0].hub_queued], [202, 1]);
  assert.equal(JSON.stringify(list).includes('secret-key'), false, '管理画面にも API キーは出ない');
});

test('購読している端末がいないときは queued: false（だれにも届かない）と記録する', async () => {
  const { device } = setup({ hub: fakeHub({ status: 202, body: { queued: false } }) });
  const boss = device();
  await boss.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  assert.equal((await boss.call('POST', '/api/admin/pochi/send', MSG)).body.hub.queued, false);
  assert.equal((await boss.call('GET', '/api/admin/pochi', undefined, null)).body.events[0].hub_queued, 0);
});

test('API キーが無い環境（プレビュー）では送れない。フィードは読める', async () => {
  const { device, db } = setup({ pochi: false });
  const boss = device();
  await boss.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  assert.deepEqual((await boss.call('POST', '/api/admin/pochi/send', MSG)).body, { error: 'no_key' });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pochi_events').get().n, 0, '載せない');
  assert.equal((await boss.call('GET', '/api/admin/pochi', undefined, null)).body.ready, false);
  assert.equal((await device().call('GET', '/api/game-events/', undefined, null)).status, 200);
});
