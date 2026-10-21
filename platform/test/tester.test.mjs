// テスターの印（SPEC-009 3.2）のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi, TESTER_COOKIE } from '../api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORTAL = 'https://bearko.games';
const GAME = 'https://survivor.bearko.games';

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

function setup() {
  const db = d1();
  const api = createApi({ db, now: () => Date.parse('2026-10-21T03:00:00Z'), verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null), adminSubs: ['boss'], log: () => {} });
  // 端末ごとの Cookie 入れ
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
  const testers = () => db.sqlite.prepare('SELECT id, google_sub, tester FROM users ORDER BY google_sub, id').all().map((r) => ({ ...r }));
  const counts = () => db.sqlite.prepare('SELECT COUNT(*) n FROM portal_counts').get().n;
  return { db, device, testers, counts };
}

test('管理者がログインした端末はテスターになり、その端末のアカウントに印が付く。ポータルの回数に数えない', async () => {
  const { device, testers, counts } = setup();
  const pc = device();
  await pc.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, GAME);   // ログインする前の仮アカウント
  assert.equal(testers()[0].tester, 0);
  const r = await pc.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  assert.equal(r.status, 200);
  assert.equal(pc.jar[TESTER_COOKIE], '1', 'テスターの Cookie が付く');
  assert.deepEqual(testers().map((u) => [u.google_sub, u.tester]), [['boss', 1]], '仮アカウントはまとめられ、本アカウントに印');
  assert.equal((await pc.call('GET', '/api/me')).body.tester, true);
  assert.equal((await pc.call('POST', '/api/portal/event', { e: 'view', s: 'new' })).status, 204);
  assert.equal(counts(), 0, 'テスターの端末は数えない');
  // ログアウトして仮アカウントで遊んでも、同じ端末なら印が付く
  await pc.call('POST', '/api/auth/logout', {});
  await pc.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, GAME);
  assert.deepEqual(testers().map((u) => u.tester), [1, 1]);
});

test('ふつうの端末は数え、印は付かない。テスターの仮アカウントをまとめると本アカウントにも付く', async () => {
  const { device, testers, counts } = setup();
  const a = device();
  await a.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, GAME);
  await a.call('POST', '/api/portal/event', { e: 'view', s: 'new' });
  assert.equal(counts(), 1);
  assert.equal((await a.call('GET', '/api/me')).body.tester, undefined);
  assert.equal(testers()[0].tester, 0);
  await a.call('POST', '/api/auth/google', { credential: 'ok:someone' });
  assert.equal(a.jar[TESTER_COOKIE], undefined);
  assert.deepEqual(testers().map((u) => u.tester), [0]);
  // 別の端末：テスターの Cookie だけ持っていて、仮アカウントで遊んでからふつうの人としてログイン
  const b = device();
  b.jar[TESTER_COOKIE] = '1';
  await b.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, GAME);
  await b.call('POST', '/api/auth/google', { credential: 'ok:other' });
  assert.deepEqual(testers().map((u) => [u.google_sub, u.tester]), [['other', 1], ['someone', 0]]);
});

test('管理画面：この端末の切り替えと、アカウントの印の付け外し。管理者だけ', async () => {
  const { device, testers } = setup();
  const player = device();
  await player.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, GAME);
  const guestId = testers()[0].id;
  const boss = device();
  await boss.call('POST', '/api/auth/google', { credential: 'ok:boss' });
  assert.equal((await boss.call('GET', '/api/admin/me')).body.testerDevice, true);
  const off = await boss.call('POST', '/api/admin/tester-device', { on: false });
  assert.equal(off.body.testerDevice, false);
  assert.equal(boss.jar[TESTER_COOKIE], '', 'Cookie を消す');
  assert.equal((await boss.call('GET', '/api/admin/me')).body.testerDevice, false);
  await boss.call('POST', '/api/admin/tester-device', { on: true });
  assert.equal(boss.jar[TESTER_COOKIE], '1');
  assert.equal((await boss.call('POST', '/api/admin/tester', { userId: guestId, on: true })).status, 200);
  assert.equal(testers().find((u) => u.id === guestId).tester, 1);
  const list = (await boss.call('GET', `/api/admin/users?q=${guestId}`)).body.users;
  assert.equal(list[0].tester, true);
  await boss.call('POST', '/api/admin/tester', { userId: guestId, on: false });
  assert.equal(testers().find((u) => u.id === guestId).tester, 0);
  assert.equal((await boss.call('POST', '/api/admin/tester', { userId: 'f'.repeat(32), on: true })).status, 404);
  assert.equal((await boss.call('POST', '/api/admin/tester', { userId: 'nope' })).status, 400);
  // 管理者でない人
  const someone = device();
  await someone.call('POST', '/api/auth/google', { credential: 'ok:someone' });
  assert.equal((await someone.call('POST', '/api/admin/tester-device', { on: true })).status, 403);
  assert.equal((await someone.call('POST', '/api/admin/tester', { userId: guestId, on: true })).status, 403);
});
