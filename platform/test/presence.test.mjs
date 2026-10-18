// 同時接続数（SPEC-007）のテスト。Durable Object の SQLite は Node の SQLite で真似る。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Presence, presenceKey, pochiUrl, isCleanupTick, reportOnline, newKey, KEY_RE, WINDOW_MS, KEEP_MS, PRESENCE_COOKIE } from '../presence.js';
import { createApi } from '../api.js';

// ctx.storage.sql の真似（exec(query, ...bindings) → { one(), toArray() }）
function fakeCtx() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    storage: {
      sql: {
        exec(query, ...args) {
          const st = db.prepare(query);
          if (/^\s*(SELECT)/i.test(query)) {
            const rows = st.all(...args);
            return { one: () => rows[0], toArray: () => rows };
          }
          if (args.length) st.run(...args); else db.exec(query);
          return { one: () => undefined, toArray: () => [] };
        },
      },
    },
  };
}

// env.PRESENCE（namespace）の真似。部屋は 1 つ
function fakeNamespace() {
  const ctx = fakeCtx();
  const room = new Presence(ctx, {});
  return { room, ctx, idFromName: (n) => n, get: () => ({ fetch: (req) => room.fetch(req) }) };
}

test('presenceKey: Cookie → ページの番号 → 新しく作る', () => {
  const a = 'AAAAAAAAAAAAAAAAAAAAAA', b = 'BBBBBBBBBBBBBBBBBBBBBB';
  assert.equal(presenceKey(a, b), a);
  assert.equal(presenceKey(undefined, b), b);
  assert.equal(presenceKey('短い', b), b);               // 形の合わない Cookie は使わない
  assert.equal(presenceKey('x;y=z' + a, b), b);
  const k = presenceKey(null, '<script>');
  assert.match(k, KEY_RE);
  assert.notEqual(presenceKey(null, null), presenceKey(null, null));
  assert.match(newKey(), KEY_RE);
});

test('pochiUrl: 3 つの値を付ける。人数は 0 以上の整数', () => {
  const u = new URL(pochiUrl('https://games-alchemist.com/api/portal/online-count/', 'mycryptgames', 'k3y', 12.7));
  assert.equal(u.origin + u.pathname, 'https://games-alchemist.com/api/portal/online-count/');
  assert.equal(u.searchParams.get('game_key'), 'mycryptgames');
  assert.equal(u.searchParams.get('api_key'), 'k3y');
  assert.equal(u.searchParams.get('online_count'), '12');
  assert.equal(new URL(pochiUrl('https://x.example/', 'g', 'k', -3)).searchParams.get('online_count'), '0');
  assert.equal(new URL(pochiUrl('https://x.example/', 'g', 'k', NaN)).searchParams.get('online_count'), '0');
});

test('isCleanupTick: UTC 19:00 の回だけ', () => {
  assert.equal(isCleanupTick(Date.UTC(2026, 9, 18, 19, 0)), true);
  assert.equal(isCleanupTick(Date.UTC(2026, 9, 18, 19, 5)), false);
  assert.equal(isCleanupTick(Date.UTC(2026, 9, 18, 18, 0)), false);
  assert.equal(isCleanupTick(Date.UTC(2026, 9, 18, 10, 0)), false);
});

test('Presence: 同じ番号は 1 人。5 分で数えなくなり、10 分で消える', async () => {
  const ns = fakeNamespace();
  const beat = (k, at) => ns.room.fetch(new Request(`https://presence/beat?at=${at}`, { method: 'POST', body: JSON.stringify({ k }) }));
  const count = async (at) => (await (await ns.room.fetch(new Request(`https://presence/count?at=${at}`))).json()).count;
  const t = 1_000_000_000_000, A = 'AAAAAAAAAAAAAAAAAAAAAA', B = 'BBBBBBBBBBBBBBBBBBBBBB';
  assert.equal((await beat(A, t)).status, 204);
  await beat(A, t + 1000);                     // 別のゲームから同じ番号（同じブラウザ）
  await beat(B, t + 2000);
  assert.equal(await count(t + 3000), 2);
  assert.equal(await count(t + 1000 + WINDOW_MS), 2);           // ちょうど 5 分はまだ数える
  assert.equal(await count(t + 1000 + WINDOW_MS + 1), 1);       // A は 5 分を過ぎた
  assert.equal(await count(t + 2000 + WINDOW_MS + 1), 0);
  assert.equal(ns.ctx.db.prepare('SELECT COUNT(*) AS n FROM seen').get().n, 2); // まだ行は残る
  await count(t + 2000 + KEEP_MS + 1);
  assert.equal(ns.ctx.db.prepare('SELECT COUNT(*) AS n FROM seen').get().n, 0); // 10 分で消える
  assert.equal((await beat('bad', t)).status, 400);
});

test('API: 操作ありで 204 と Cookie。Cookie の番号で、どのゲームから送っても 1 人', async () => {
  const ns = fakeNamespace();
  let t = 1_000_000_000_000;
  const api = createApi({ db: null, now: () => t, presence: ns });
  const post = (origin, cookie, body) => api.fetch(new Request('https://bearko.games/api/presence', {
    method: 'POST', headers: { origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  }));
  const page = 'PAGEPAGEPAGEPAGEPAGEPA';
  const r1 = await post('https://tactics.bearko.games', null, { game: 'tactics', page });
  assert.equal(r1.status, 204);
  const set = r1.headers.getSetCookie()[0];
  assert.match(set, new RegExp(`^${PRESENCE_COOKIE}=${page}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax$`));
  assert.equal(r1.headers.get('access-control-allow-origin'), 'https://tactics.bearko.games');
  // 2 つ目のゲーム（別のページの番号）でも、Cookie があれば同じ人
  await post('https://survivor.bearko.games', `${PRESENCE_COOKIE}=${page}`, { game: 'survivor', page: 'OTHEROTHEROTHEROTHER12' });
  // 別の人
  t += 1000;
  await post('https://factory.bearko.games', null, { game: 'factory', page: 'ZZZZZZZZZZZZZZZZZZZZZZ' });
  const n = (await (await ns.room.fetch(new Request(`https://presence/count?at=${t}`))).json()).count;
  assert.equal(n, 2);
  // 一覧に無い Origin は 403（数えない）
  assert.equal((await post('https://evil.example', null, { page: 'EVILEVILEVILEVILEVIL12' })).status, 403);
  assert.equal((await post('https://bearko-games.example', null, {})).status, 403);
});

test('API: 回数の上限を超えたら 429 で数えない。部屋が無ければ何もしない', async () => {
  const ns = fakeNamespace();
  const limited = createApi({ db: null, presence: ns, presenceLimit: async () => false });
  const r = await limited.fetch(new Request('https://bearko.games/api/presence', { method: 'POST', headers: { origin: 'https://bearko.games' }, body: '{}' }));
  assert.equal(r.status, 429);
  assert.equal(ns.ctx.db.prepare('SELECT COUNT(*) AS n FROM seen').get().n, 0);
  const none = createApi({ db: null });
  const r2 = await none.fetch(new Request('https://bearko.games/api/presence', { method: 'POST', headers: { origin: 'https://bearko.games' }, body: '{}' }));
  assert.equal(r2.status, 204);
  assert.equal(r2.headers.getSetCookie().length, 0);
});

test('reportOnline: キーが無ければ送らない。あれば人数を GET で送り、URL は返さない', async () => {
  const ns = fakeNamespace();
  const t = 1_000_000_000_000;
  await ns.room.fetch(new Request(`https://presence/beat?at=${t}`, { method: 'POST', body: JSON.stringify({ k: 'AAAAAAAAAAAAAAAAAAAAAA' }) }));
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, method: init.method }); return new Response('ok', { status: 200 }); };
  const base = { PRESENCE: ns, POCHI_ENDPOINT: 'https://games-alchemist.com/api/portal/online-count/', POCHI_GAME_KEY: 'mycryptgames' };
  assert.deepEqual(await reportOnline(base, { fetchImpl, now: () => t }), { count: 1, skipped: 'no_key' });
  assert.equal(sent.length, 0);
  const r = await reportOnline({ ...base, POCHI_API_KEY: 'secret-key' }, { fetchImpl, now: () => t });
  assert.deepEqual(r, { count: 1, status: 200 });
  assert.equal(JSON.stringify(r).includes('secret-key'), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'GET');
  assert.equal(new URL(sent[0].url).searchParams.get('online_count'), '1');
  assert.equal(new URL(sent[0].url).searchParams.get('api_key'), 'secret-key');
  // 送り先が落ちていても例外にしない（やり直さない）。エラーの文（URL が入りうる）は返さない
  const bad = await reportOnline({ ...base, POCHI_API_KEY: 'secret-key' }, { fetchImpl: async () => { throw new TypeError('fetch failed https://games-alchemist.com/?api_key=secret-key'); }, now: () => t });
  assert.deepEqual(bad, { count: 1, error: 'TypeError' });
  assert.deepEqual(await reportOnline({}), { skipped: 'no_presence' });
});
