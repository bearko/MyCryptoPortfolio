// 共通基盤 API のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi, cleanName, GUEST_TTL } from '../api.js';
import { googleVerifier } from '../google.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://tactics.bearko.games';

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

// ブラウザの Cookie 置き場の代わり
function browser(api) {
  const jar = {};
  return {
    jar,
    async call(method, path, body, { origin = ORIGIN } = {}) {
      const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
      if (origin) headers.origin = origin;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await api.fetch(new Request(`https://bearko.games${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split('; ');
        const [k, v] = pair.split('=');
        if (attrs.includes('Max-Age=0')) delete jar[k];
        else jar[k] = v;
      }
      const text = await res.text();
      return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null, cookies: res.headers.getSetCookie() };
    },
  };
}

const fakeVerify = async (credential) => (credential?.startsWith('ok:') ? { sub: credential.slice(3) } : null);

function setup(now = () => Date.parse('2026-10-16T00:00:00Z')) {
  const db = d1();
  const api = createApi({ db, now, verifyGoogle: fakeVerify, clientId: 'cid', cookieDomain: '.bearko.games' });
  return { db, api };
}

test('設定と未ログインの状態', async () => {
  const b = browser(setup().api);
  assert.deepEqual((await b.call('GET', '/api/config')).body, { googleClientId: 'cid' });
  assert.deepEqual((await b.call('GET', '/api/me')).body, { user: null, guest: null });
});

test('サブドメインからの呼び出しに CORS を返し、Cookie は bearko.games 全体に効く', async () => {
  const b = browser(setup().api);
  const res = await b.call('POST', '/api/guest', {});
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.match(res.cookies[0], /^bg_guest=[0-9a-f]{64}; Domain=\.bearko\.games; Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$/);
  const other = await b.call('GET', '/api/me', undefined, { origin: 'https://evil.example' });
  assert.equal(other.headers.get('access-control-allow-origin'), null, '許可していない Origin には CORS を返さない');
});

test('書き込みは bearko.games 以外の Origin からは受けない（CSRF 対策）', async () => {
  const b = browser(setup().api);
  assert.equal((await b.call('POST', '/api/guest', {}, { origin: null })).status, 403);
  assert.equal((await b.call('POST', '/api/guest', {}, { origin: 'https://bearko.games.evil.example' })).status, 403);
  assert.equal((await b.call('POST', '/api/guest', {}, { origin: 'https://bearko.games' })).status, 200);
});

test('仮アカウント：何度呼んでも 1 つ。ページを開いただけ（GET）では作らない', async () => {
  const { db, api } = setup();
  const b = browser(api);
  await b.call('GET', '/api/me');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  const g1 = await b.call('POST', '/api/guest', {});
  const g2 = await b.call('POST', '/api/guest', {});
  assert.equal(g1.body.guest.id, g2.body.guest.id);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.deepEqual((await b.call('GET', '/api/me')).body, { user: null, guest: { id: g1.body.guest.id } });
});

test('Google でログイン：初回は作る・2 回目は同じアカウント。仮アカウントは本アカウントにまとめる', async () => {
  const { db, api } = setup();
  const b = browser(api);
  await b.call('POST', '/api/guest', {});
  const first = await b.call('POST', '/api/auth/google', { credential: 'ok:sub-1' });
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.equal(first.body.merged, true);
  assert.ok(b.jar.bg_session && !b.jar.bg_guest, 'ログイン Cookie が付き、仮アカウントの Cookie は消える');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 1, '仮アカウントは消える');
  assert.deepEqual((await b.call('GET', '/api/me')).body, { user: { id: first.body.user.id, name: null }, guest: null });

  const other = browser(api); // 別の端末
  const again = await other.call('POST', '/api/auth/google', { credential: 'ok:sub-1' });
  assert.equal(again.body.created, false);
  assert.equal(again.body.user.id, first.body.user.id);
  assert.equal((await b.call('POST', '/api/guest', {})).status, 409, 'ログイン中は仮アカウントを作らない');
  assert.equal((await b.call('POST', '/api/auth/google', { credential: 'bad' })).status, 401);
});

test('表示名・ログアウト・退会', async () => {
  const { db, api } = setup();
  const b = browser(api);
  await b.call('POST', '/api/auth/google', { credential: 'ok:sub-2' });
  assert.equal((await b.call('POST', '/api/me/name', { name: '  <bearko>  ' })).body.user.name, 'bearko');
  assert.equal((await b.call('POST', '/api/me/name', { name: '   ' })).status, 400);
  assert.equal((await b.call('GET', '/api/me')).body.user.name, 'bearko');

  await b.call('POST', '/api/auth/logout', {});
  assert.equal((await b.call('GET', '/api/me')).body.user, null);
  assert.equal((await b.call('POST', '/api/me/name', { name: 'x' })).status, 401);

  await b.call('POST', '/api/auth/google', { credential: 'ok:sub-2' });
  assert.equal((await b.call('DELETE', '/api/me')).status, 200);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 0, '退会で消える');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('掃除：90 日使われていない仮アカウントと、期限切れのセッションを消す', async () => {
  let t = Date.parse('2026-01-01T00:00:00Z');
  const { db, api } = setup(() => t);
  await browser(api).call('POST', '/api/guest', {});
  await browser(api).call('POST', '/api/auth/google', { credential: 'ok:keep' });
  t += GUEST_TTL + 86400e3;
  const fresh = browser(api);
  await fresh.call('POST', '/api/guest', {});
  assert.deepEqual(await api.cleanup(), { guests: 1 });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users WHERE google_sub IS NULL').get().n, 1, '新しい仮アカウントは残る');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users WHERE google_sub = ?').get('keep').n, 1, '本アカウントは消さない');
  assert.ok((await fresh.call('GET', '/api/me')).body.guest);
});

test('表示名の整形', () => {
  assert.equal(cleanName('ＢＥＡＲＫＯ'), 'BEARKO');
  assert.equal(cleanName('a'.repeat(30)).length, 16);
  assert.equal(cleanName(null), null);
  assert.equal(cleanName('<script>'), 'script');
});

test('Google の ID トークン：署名・aud・iss・期限を確かめる', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
  const now = Date.parse('2026-10-16T00:00:00Z');
  async function token(claims, kid = 'k1') {
    const head = `${b64({ alg: 'RS256', kid })}.${b64(claims)}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(head));
    return `${head}.${Buffer.from(sig).toString('base64url')}`;
  }
  const verify = googleVerifier('cid', { now: () => now, fetchKeys: async () => [jwk] });
  const good = { aud: 'cid', iss: 'https://accounts.google.com', exp: now / 1000 + 600, sub: '123', email: 'x@example.com' };
  assert.deepEqual(await verify(await token(good)), { sub: '123' }, 'sub だけを返す');
  assert.equal(await verify(await token({ ...good, aud: 'other' })), null);
  assert.equal(await verify(await token({ ...good, iss: 'evil' })), null);
  assert.equal(await verify(await token({ ...good, exp: now / 1000 - 3600 })), null);
  assert.equal(await verify(await token(good, 'unknown')), null);
  const t = await token(good);
  assert.equal(await verify(t.slice(0, -4) + 'AAAA'), null, '署名が違う');
  assert.equal(await verify('not.a.token'), null);
});

import { crossTrophiesFor, TROPHIES } from '../trophies.js';

test('トロフィー：未ログインなら仮アカウントに貯まり、ログインでまとめて本アカウントへ', async () => {
  const { db, api } = setup();
  const b = browser(api);
  const first = await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { account: 'guest', unlocked: ['tactics.ch1'], total: 1 });
  assert.ok(b.jar.bg_guest, '仮アカウントがこのとき作られる');
  const again = await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  assert.deepEqual(again.body.unlocked, [], '同じトロフィーは 1 つ');
  await b.call('POST', '/api/trophies/unlock', { id: 'tactics.clear' });
  assert.deepEqual((await b.call('GET', '/api/me/trophies')).body.trophies.map((t) => t.id), ['tactics.ch1', 'tactics.clear']);

  // 別の端末で、すでに同じアカウントに ch1 を持っている
  const other = browser(api);
  await other.call('POST', '/api/auth/google', { credential: 'ok:sub-t' });
  await other.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });

  const login = await b.call('POST', '/api/auth/google', { credential: 'ok:sub-t' });
  assert.equal(login.body.mergedTrophies, 1, '重なった ch1 は 1 つにまとまり、clear だけ増える');
  const mine = await b.call('GET', '/api/me/trophies');
  assert.equal(mine.body.account, 'login');
  assert.deepEqual(mine.body.trophies.map((t) => t.id).sort(), ['tactics.ch1', 'tactics.clear']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users WHERE google_sub IS NULL').get().n, 0, '仮アカウントは消える');
});

test('トロフィー：そのゲームのサブドメインからしか受け付けず、横断トロフィーは送れない', async () => {
  const b = browser(setup().api);
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'fortress.level01' })).status, 403, 'tactics から fortress のトロフィーは送れない');
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'fortress.level01' }, { origin: 'https://fortress.bearko.games' })).status, 200);
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'cross.two' })).status, 400);
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'nope' })).status, 400);
});

test('横断トロフィー：2 タイトルで「シリーズの入り口」、クリアがそろうと「全制覇」', async () => {
  const b = browser(setup().api);
  await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  const r = await b.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' }, { origin: 'https://survivor.bearko.games' });
  assert.deepEqual(r.body.unlocked, ['survivor.stage1', 'cross.two']);

  const clears = TROPHIES.filter((t) => t.clear).map((t) => t.id);
  assert.deepEqual(crossTrophiesFor(clears.slice(0, -1)).includes('cross.allclear'), false);
  assert.deepEqual(crossTrophiesFor(clears).sort(), ['cross.allclear', 'cross.four', 'cross.two']);
  assert.deepEqual(crossTrophiesFor([...clears, 'cross.two', 'cross.four', 'cross.allclear']), [], '持っているものは返さない');
});

test('トロフィーの定義：ID が重ならず、タイトルが登録済み', async () => {
  const ids = TROPHIES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const res = await browser(setup().api).call('GET', '/api/trophies');
  assert.equal(res.body.trophies.length, TROPHIES.length);
  for (const t of res.body.trophies) assert.ok(res.body.games[t.game], t.id);
});

test('退会でトロフィーも消える', async () => {
  const { db, api } = setup();
  const b = browser(api);
  await b.call('POST', '/api/auth/google', { credential: 'ok:bye' });
  await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  await b.call('DELETE', '/api/me');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM user_trophies').get().n, 0);
});
