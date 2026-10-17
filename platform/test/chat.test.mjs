// 全体チャット（SPEC-004）のテスト。部屋の SQLite は Node の SQLite で真似る。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ChatRoom, cleanText, cleanGame, userFromParam, denyReason, rateLimited, MAX_TEXT, KEEP, KEEP_MS, HISTORY, MIN_GAP_MS, BURST } from '../chat.js';
import { createApi } from '../api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURVIVOR = 'https://survivor.bearko.games';
const PORTAL = 'https://bearko.games';

// ---------------------------------------------------------------- 部屋の土台（Durable Object の ctx の代わり）
function roomCtx() {
  const sqlite = new DatabaseSync(':memory:');
  const sockets = [];
  let alarm = null;
  const cursor = (rows) => ({ toArray: () => rows, one: () => { if (rows.length !== 1) throw new Error(`one(): ${rows.length} rows`); return rows[0]; } });
  const ctx = {
    storage: {
      sql: {
        exec(q, ...args) {
          if (!args.length && /;\s*\S/.test(q)) { sqlite.exec(q); return cursor([]); }
          const st = sqlite.prepare(q);
          if (/^\s*(SELECT|INSERT[^;]*RETURNING)/i.test(q)) return cursor(st.all(...args));
          st.run(...args);
          return cursor([]);
        },
      },
      getAlarm: async () => alarm,
      setAlarm: async (t) => { alarm = t; },
    },
    acceptWebSocket: (ws, tags) => { ws.tags = tags || []; sockets.push(ws); },
    getWebSockets: (tag) => sockets.filter((w) => !w.closed && (!tag || w.tags.includes(tag))),
    sockets,
    alarmAt: () => alarm,
  };
  return ctx;
}
function fakeWs(att) {
  return { sent: [], att, tags: [], closed: false, send(s) { this.sent.push(JSON.parse(s)); }, serializeAttachment(o) { this.att = o; }, deserializeAttachment() { return this.att; }, close() { this.closed = true; } };
}
function room(now = () => Date.parse('2026-10-17T00:00:00Z')) {
  const ctx = roomCtx();
  const r = new ChatRoom(ctx, {});
  r.now = now;
  return { ctx, room: r };
}
const join_ = (ctx, room, att) => { const ws = fakeWs(att); ctx.acceptWebSocket(ws, att.uid ? [att.uid] : []); return ws; };
const ALICE = { uid: 'a'.repeat(32), name: 'alice', game: 'survivor', banned: false };
const BOB = { uid: 'b'.repeat(32), name: 'bob', game: 'portal', banned: false };

test('本文：制御文字を落とし、1〜200 文字。ゲームの札', () => {
  assert.equal(cleanText('  こんにちは\u0000\n '), 'こんにちは');
  assert.equal(cleanText(''), null);
  assert.equal(cleanText('   '), null);
  assert.equal(cleanText('x'.repeat(MAX_TEXT)), 'x'.repeat(MAX_TEXT));
  assert.equal(cleanText('x'.repeat(MAX_TEXT + 1)), null);
  assert.equal(cleanText('🙂'.repeat(MAX_TEXT)), '🙂'.repeat(MAX_TEXT), 'コードポイントで数える');
  assert.equal(cleanText(123), null);
  assert.equal(cleanGame('survivor'), 'survivor');
  assert.equal(cleanGame('10buy-year'), '10buy-year');
  assert.equal(cleanGame('Bad Game'), 'portal');
  assert.equal(cleanGame(undefined), 'portal');
});

test('本人の情報と、発言できない理由', () => {
  assert.deepEqual(userFromParam(JSON.stringify(ALICE)), ALICE);
  assert.deepEqual(userFromParam('{broken'), { uid: null, name: null, game: 'portal', banned: false });
  assert.deepEqual(userFromParam(JSON.stringify({ uid: 'x y', name: 'n' })), { uid: null, name: null, game: 'portal', banned: false }, '変な id は未ログイン扱い');
  assert.equal(denyReason({}), 'login');
  assert.equal(denyReason({ uid: 'u', name: null }), 'name');
  assert.equal(denyReason({ uid: 'u', name: 'n', banned: true }), 'banned');
  assert.equal(denyReason(ALICE), null);
  assert.equal(rateLimited(10000, 9000, 0), true, '2 秒以内');
  assert.equal(rateLimited(10000, 7999, 0), false);
  assert.equal(rateLimited(10000, null, BURST), true, '10 分に 60 件');
  assert.equal(rateLimited(10000, null, BURST - 1), false);
});

test('部屋：発言は全員に配り、連投は止め、消すのは本人と管理者だけ', async () => {
  let t = Date.parse('2026-10-17T00:00:00Z');
  const { ctx, room: r } = room(() => t);
  const a = join_(ctx, r, ALICE), b = join_(ctx, r, BOB), guest = join_(ctx, r, { uid: null, name: null, game: 'portal' });
  r.webSocketMessage(a, JSON.stringify({ t: 'msg', text: ' hello ' }));
  assert.equal(a.sent.length, 1);
  assert.deepEqual(b.sent[0], { t: 'msg', id: 1, uid: ALICE.uid, name: 'alice', game: 'survivor', text: 'hello', at: t });
  assert.deepEqual(guest.sent[0], b.sent[0], '未ログインでも読める');
  // 2 秒以内はだめ
  t += 1000;
  r.webSocketMessage(a, JSON.stringify({ t: 'msg', text: 'again' }));
  assert.deepEqual(a.sent.at(-1), { t: 'err', code: 'rate' });
  assert.equal(b.sent.length, 1);
  t += MIN_GAP_MS;
  r.webSocketMessage(a, JSON.stringify({ t: 'msg', text: 'again' }));
  assert.equal(b.sent.length, 2);
  // 未ログイン・名無し・締め出しは送れない
  r.webSocketMessage(guest, JSON.stringify({ t: 'msg', text: 'hi' }));
  assert.deepEqual(guest.sent.at(-1), { t: 'err', code: 'login' });
  const noname = join_(ctx, r, { uid: 'c'.repeat(32), name: null, game: 'portal', banned: false });
  r.webSocketMessage(noname, JSON.stringify({ t: 'msg', text: 'hi' }));
  assert.deepEqual(noname.sent.at(-1), { t: 'err', code: 'name' });
  const banned = join_(ctx, r, { ...BOB, uid: 'd'.repeat(32), banned: true });
  r.webSocketMessage(banned, JSON.stringify({ t: 'msg', text: 'hi' }));
  assert.deepEqual(banned.sent.at(-1), { t: 'err', code: 'banned' });
  // 長すぎ・壊れた JSON・msg 以外は無視か long
  r.webSocketMessage(a, JSON.stringify({ t: 'msg', text: 'x'.repeat(201) }));
  assert.deepEqual(a.sent.at(-1), { t: 'err', code: 'long' });
  const before = b.sent.length;
  r.webSocketMessage(a, 'not json'); r.webSocketMessage(a, JSON.stringify({ t: 'ping' }));
  assert.equal(b.sent.length, before);
  // 消す
  assert.deepEqual(r.remove(1, BOB.uid), { ok: false, status: 403 }, 'ほかの人のは消せない');
  assert.deepEqual(r.remove(1, ALICE.uid), { ok: true });
  assert.deepEqual(b.sent.at(-1), { t: 'del', id: 1 });
  assert.deepEqual(r.remove(1, ALICE.uid), { ok: false, status: 404 });
  assert.deepEqual(r.remove(2, BOB.uid, true), { ok: true }, '管理者はだれのでも');
  assert.equal(r.count(), 0);
  await new Promise((resolve) => setTimeout(resolve, 0));   // アラームは getAlarm の返事を待ってから入る
  assert.ok(ctx.alarmAt() > t, '最初の発言でアラームが入る');
});

test('部屋：締め出しは発言を消して接続を切る。古いもの・多すぎるものは切る', () => {
  let t = Date.parse('2026-10-17T00:00:00Z');
  const { ctx, room: r } = room(() => t);
  const a = join_(ctx, r, ALICE), b = join_(ctx, r, BOB);
  for (let i = 0; i < 3; i++) { r.post(ALICE, `a${i}`); t += MIN_GAP_MS; }
  r.post(BOB, 'b0');
  assert.deepEqual(r.purge(ALICE.uid), { ok: true, deleted: 3 });
  assert.equal(a.closed, true);
  assert.equal(b.closed, false);
  assert.deepEqual(b.sent.at(-1), { t: 'purge', uid: ALICE.uid });
  assert.equal(r.count(), 1);
  // 7 日たったものは消える
  t += KEEP_MS + 1;
  assert.equal(r.trim(), 0);
  // 500 件を超えたぶんは古いほうから消える（連投の上限を避けて 1 人ずつ別の時刻で）
  for (let i = 0; i < KEEP + 20; i++) { t += MIN_GAP_MS; const u = { ...ALICE, uid: `u${i % 100}`.padEnd(32, '0') }; const res = r.post(u, `m${i}`); assert.ok(res.msg, JSON.stringify(res)); }
  assert.equal(r.trim(), KEEP);
  assert.equal(r.recent(HISTORY).length, HISTORY);
  assert.equal(r.recent(10, r.recent(1)[0].id).length, 0, 'after は新しいものだけ');
});

// ---------------------------------------------------------------- Worker 側（api.js）
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
function browser(api) {
  const jar = {};
  return {
    jar,
    async call(method, path, body, { origin = SURVIVOR, headers: extra = {} } = {}) {
      const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...extra };
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
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
}
const fakeVerify = async (credential) => (credential?.startsWith('ok:') ? { sub: credential.slice(3) } : null);

function setup() {
  let t = Date.parse('2026-10-17T00:00:00Z');
  const now = () => t;
  const tick = (ms) => { t += ms; };
  const { ctx, room: r } = room(now);
  // Durable Object の namespace の代わり：どの id でも同じ部屋
  const chat = { idFromName: () => 'global', get: () => ({ fetch: (req) => r.fetch(req instanceof Request ? req : new Request(req)) }) };
  const api = createApi({ db: d1(), now, verifyGoogle: fakeVerify, clientId: 'cid', cookieDomain: '.bearko.games', adminSubs: ['admin-sub'], chat });
  return { api, room: r, ctx, tick };
}
async function loginAs(b, sub, name) {
  await b.call('POST', '/api/auth/google', { credential: `ok:${sub}` });
  if (name) await b.call('POST', '/api/me/name', { name });
  return (await b.call('GET', '/api/me')).body.user;
}

test('API：WebSocket 以外の入口と、自分の発言の削除', async () => {
  const { api, room: r, tick } = setup();
  const b = browser(api);
  // 読むのはだれでも
  assert.deepEqual((await b.call('GET', '/api/chat/messages')).body, { msgs: [] });
  const alice = await loginAs(b, 'alice-sub', 'alice');
  r.post({ uid: alice.id, name: 'alice', game: 'survivor', banned: false }, 'hello');
  tick(5000);
  r.post({ uid: alice.id, name: 'alice', game: 'survivor', banned: false }, 'world');
  const msgs = (await b.call('GET', '/api/chat/messages')).body.msgs;
  assert.deepEqual(msgs.map((m) => m.text), ['hello', 'world']);
  assert.deepEqual((await b.call('GET', `/api/chat/messages?after=${msgs[0].id}`)).body.msgs.map((m) => m.text), ['world']);
  // 自分の発言
  assert.deepEqual((await b.call('GET', '/api/me/chat')).body.msgs.map((m) => m.text), ['world', 'hello']);
  // ほかの人は消せない
  const c = browser(api);
  await loginAs(c, 'bob-sub', 'bob');
  assert.equal((await c.call('DELETE', `/api/chat/messages/${msgs[0].id}`)).status, 403);
  assert.equal((await b.call('DELETE', `/api/chat/messages/${msgs[0].id}`)).status, 200);
  assert.equal((await b.call('DELETE', `/api/chat/messages/${msgs[0].id}`)).status, 404);
  assert.equal((await b.call('DELETE', '/api/chat/messages/abc')).status, 400);
  // 未ログインは消せない・自分の発言も空
  const g = browser(api);
  assert.equal((await g.call('DELETE', `/api/chat/messages/${msgs[1].id}`)).status, 401);
  assert.equal((await g.call('GET', '/api/me/chat')).status, 401);
  // 管理者はだれのでも消せる
  const adm = browser(api);
  await loginAs(adm, 'admin-sub', 'admin');
  assert.equal((await adm.call('DELETE', `/api/chat/messages/${msgs[1].id}`)).status, 200);
  assert.equal(r.count(), 0);
});

test('API：接続の入口は Origin と Upgrade を見る。本人の情報を部屋に渡す', async () => {
  const { api, room: r, ctx } = setup();
  const b = browser(api);
  assert.equal((await b.call('GET', '/api/chat/ws')).status, 426, 'Upgrade が無い');
  assert.equal((await b.call('GET', '/api/chat/ws', undefined, { origin: 'https://evil.example', headers: { upgrade: 'websocket' } })).status, 403);
  // Node には WebSocketPair が無いので、部屋は 501 を返す（= 玄関を通って部屋に届いたことは分かる）
  let got = null;
  const orig = r.fetch.bind(r);
  r.fetch = (req) => { got = new URL(req.url); return orig(req); };
  assert.equal((await b.call('GET', '/api/chat/ws?game=survivor', undefined, { headers: { upgrade: 'websocket' } })).status, 501);
  assert.deepEqual(userFromParam(got.searchParams.get('u')), { uid: null, name: null, game: 'survivor', banned: false }, '未ログインでも読める');
  const alice = await loginAs(b, 'alice-sub', 'alice');
  await b.call('GET', '/api/chat/ws?game=Bad', undefined, { headers: { upgrade: 'websocket' } });
  assert.deepEqual(userFromParam(got.searchParams.get('u')), { uid: alice.id, name: 'alice', game: 'portal', banned: false });
  assert.equal(ctx.sockets.length, 0);
});

test('API：締め出しと退会で、その人の発言は部屋からも消える。管理の一覧と削除', async () => {
  const { api, room: r, tick } = setup();
  const b = browser(api);
  const alice = await loginAs(b, 'alice-sub', 'alice');
  r.post({ uid: alice.id, name: 'alice', game: 'survivor', banned: false }, 'one');
  tick(5000);
  r.post({ uid: alice.id, name: 'alice', game: 'survivor', banned: false }, 'two');
  const adm = browser(api);
  await loginAs(adm, 'admin-sub', 'admin');
  const list = (await adm.call('GET', '/api/admin/chat', undefined, { origin: PORTAL })).body;
  assert.deepEqual(list.msgs.map((m) => m.text), ['one', 'two']);
  assert.equal(list.total, 2);
  assert.equal((await adm.call('POST', '/api/admin/chat/delete', { id: list.msgs[0].id }, { origin: PORTAL })).status, 200);
  assert.equal(r.count(), 1);
  assert.equal((await adm.call('POST', '/api/admin/ban', { userId: alice.id, reason: 'spam' }, { origin: PORTAL })).status, 200);
  assert.equal(r.count(), 0, '締め出すと発言が消える');
  // 締め出された人は接続しても banned で渡る
  let got = null;
  const orig = r.fetch.bind(r);
  r.fetch = (req) => { got = new URL(req.url); return orig(req); };
  await b.call('GET', '/api/chat/ws', undefined, { headers: { upgrade: 'websocket' } });
  assert.equal(userFromParam(got.searchParams.get('u')).banned, true);
  // 退会
  const c = browser(api);
  const bob = await loginAs(c, 'bob-sub', 'bob');
  r.post({ uid: bob.id, name: 'bob', game: 'portal', banned: false }, 'bye');
  assert.equal(r.count(), 1);
  assert.equal((await c.call('DELETE', '/api/me')).status, 200);
  assert.equal(r.count(), 0, '退会で発言が消える');
  // 管理者でなければ管理の入口は 403
  assert.equal((await b.call('GET', '/api/admin/chat', undefined, { origin: PORTAL })).status, 403);
});

test('API：部屋が無い構成（chat を渡さない）では 503', async () => {
  const api = createApi({ db: d1(), now: () => 0, verifyGoogle: fakeVerify, clientId: 'cid' });
  const b = browser(api);
  assert.equal((await b.call('GET', '/api/chat/messages')).status, 503);
  assert.equal((await b.call('GET', '/api/chat/ws', undefined, { headers: { upgrade: 'websocket' } })).status, 503);
});
