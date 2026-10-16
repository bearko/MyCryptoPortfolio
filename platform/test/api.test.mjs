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

// ---------------------------------------------------------------- RTA（SPEC-001 6 章）
import { REGULATION_BY_ID, judgeActivity, IDLE_LIMIT_MS } from '../rta.js';

const SURVIVOR = 'https://survivor.bearko.games';
const MIN = 60e3;

// 時計を進められる環境。b.call の既定の Origin は Survivor
function rtaSetup() {
  let t = Date.parse('2026-10-16T00:00:00Z');
  const { db, api } = setup(() => t);
  const mk = () => {
    const b = browser(api);
    const call = b.call;
    b.call = (m, p, body, opt = {}) => call(m, p, body, { origin: SURVIVOR, ...opt });
    return b;
  };
  return { db, api, mk, tick: (ms) => (t += ms) };
}

// 3 つの区切りを、間隔 ms ずつ（途中で「操作あり」を送りながら）通る
async function runThrough(b, tick, gaps = [4.2 * MIN, 4.5 * MIN, 4.4 * MIN]) {
  const start = await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' });
  const runId = start.body.runId;
  const out = [];
  for (const [i, cp] of ['stage1', 'stage2', 'clear'].entries()) {
    tick(gaps[i] / 2);
    await b.call('POST', '/api/rta/ping', { runId, idleMs: 1000 });
    tick(gaps[i] / 2);
    out.push((await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: cp, igtMs: 240e3 * (i + 1), idleMs: 2000 })).body);
  }
  return { runId, start: start.body, last: out.at(-1), out };
}

test('RTA：未ログインで走ると仮アカウントに残り、ログインするとランキングに出る', async () => {
  const { mk, tick } = rtaSetup();
  const b = mk();
  const r = await runThrough(b, tick);
  assert.equal(r.start.account, 'guest');
  assert.deepEqual(r.out.map((x) => x.splitMs), [252e3, 522e3, 786e3], '区間はサーバーの時刻で、開始からの経過');
  assert.equal(r.last.finished, true);
  assert.equal(r.last.timeMs, 786e3);
  assert.equal(r.last.reference, false);
  assert.equal(r.last.best, true);
  assert.equal(r.last.rank, null, '仮アカウントには順位を付けない');
  assert.deepEqual((await b.call('GET', '/api/rta/ranking?regulation=survivor-normal')).body.entries, [], '仮アカウントはランキングに出ない');

  const mine = await b.call('GET', '/api/me/rta');
  assert.equal(mine.body.account, 'guest');
  assert.equal(mine.body.runs.length, 1);
  assert.deepEqual(mine.body.runs[0].splits.map((s) => s.checkpoint), ['stage1', 'stage2', 'clear']);

  await b.call('POST', '/api/auth/google', { credential: 'ok:runner' });
  await b.call('POST', '/api/me/name', { name: 'くま' });
  const ranking = await b.call('GET', '/api/rta/ranking?regulation=survivor-normal');
  assert.deepEqual(ranking.body.entries.map((e) => [e.rank, e.name, e.timeMs, e.me]), [[1, "くま", 786e3, true]]);
  assert.deepEqual(ranking.body.me, { rank: 1, timeMs: 786e3 });
});

test('RTA：1 人 1 件（自己ベスト）で並び、同じタイムは同じ順位', async () => {
  const { mk, tick } = rtaSetup();
  const a = mk();
  const c = mk();
  const d = mk();
  await a.call('POST', '/api/auth/google', { credential: 'ok:a' });
  await c.call('POST', '/api/auth/google', { credential: 'ok:c' });
  await d.call('POST', '/api/auth/google', { credential: 'ok:d' });
  const slow = await runThrough(a, tick, [5 * MIN, 5 * MIN, 5 * MIN]);
  assert.equal(slow.last.rank, 1);
  const fast = await runThrough(a, tick, [4 * MIN, 4 * MIN, 4 * MIN]);
  assert.equal(fast.last.best, true);
  const notBest = await runThrough(a, tick, [4.5 * MIN, 4.5 * MIN, 4.5 * MIN]);
  assert.equal(notBest.last.best, false);
  assert.equal((await runThrough(c, tick, [4 * MIN, 4 * MIN, 4 * MIN])).last.rank, 1, '同じタイムは同じ順位');
  assert.equal((await runThrough(d, tick, [4.1 * MIN, 4.1 * MIN, 4.1 * MIN])).last.rank, 3);
  const e = (await a.call('GET', '/api/rta/ranking?regulation=survivor-normal')).body.entries;
  assert.deepEqual(e.map((x) => [x.rank, x.timeMs]), [[1, 12 * MIN], [1, 12 * MIN], [3, 12.3 * MIN]]);
});

test('RTA：15 分以上操作がないと参考記録（SDK の申告・サーバーの間隔のどちらでも）', async () => {
  const { mk, tick } = rtaSetup();
  const b = mk();
  await b.call('POST', '/api/auth/google', { credential: 'ok:idle' });

  // SDK が「16 分操作がなかった」と申告
  let runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).body.runId;
  tick(4.5 * MIN);
  await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1', idleMs: 1000 });
  tick(4.5 * MIN);
  await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage2', idleMs: 1000 });
  tick(17 * MIN);
  assert.equal((await b.call('POST', '/api/rta/ping', { runId, idleMs: 16 * MIN })).body.reference, true);
  const r1 = (await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'clear', idleMs: 16 * MIN })).body;
  assert.equal(r1.reference, true);
  assert.equal(r1.rank, null);
  assert.equal(r1.best, false, '参考記録は自己ベストにしない');

  // 申告はないが、サーバーが 20 分を超えて何も受け取らなかった（ブラウザが止まっていたなど）
  runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).body.runId;
  tick(21 * MIN);
  const r2 = (await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1', idleMs: 0 })).body;
  assert.equal(r2.reference, true);

  assert.deepEqual((await b.call('GET', '/api/rta/ranking?regulation=survivor-normal')).body.entries, [], '参考記録はランキングに出ない');
  const mine = (await b.call('GET', '/api/me/rta')).body.runs;
  assert.equal(mine.length, 1, '完了した参考記録は個人記録に残る');
  assert.equal(mine[0].reference, true);

  // 純関数：申告は開始からの経過を超えない
  const run = { started_at: 0, last_active: 0, max_idle_ms: 0, reference: 0 };
  assert.deepEqual(judgeActivity(run, 5 * MIN, IDLE_LIMIT_MS), { reference: false, maxIdleMs: 5 * MIN });
});

test('RTA：順番どおりでない区切り・最短時間より速い記録・他人の計測・他のゲームからは受けない', async () => {
  const { db, mk, tick } = rtaSetup();
  const b = mk();
  const runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).body.runId;
  tick(5 * MIN);
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage2' })).status, 409, '飛ばせない');
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1' }, { origin: 'https://tactics.bearko.games' })).status, 403);
  assert.equal((await mk().call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1' })).status, 401, 'Cookie のない人');
  const other = mk();
  await other.call('POST', '/api/guest', {});
  assert.equal((await other.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1' })).status, 404, '他人の計測');
  assert.equal((await b.call('POST', '/api/rta/start', { regulation: 'nope' })).status, 400);
  assert.equal((await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' }, { origin: 'https://tactics.bearko.games' })).status, 403);

  // 最短時間（ステージ 1 は 3 分 55 秒）より速い
  const cheat = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).body.runId;
  assert.equal(db.sqlite.prepare('SELECT status FROM rta_runs WHERE id = ?').get(runId).status, 'abandoned', '新しく始めると、前の計測は中断');
  tick(1 * MIN);
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId: cheat, checkpoint: 'stage1' })).body.rejected, true);
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId: cheat, checkpoint: 'stage2' })).status, 409, '無効にした計測は続けられない');
  assert.deepEqual((await b.call('GET', '/api/me/rta')).body.runs, [], '無効・中断は個人記録にも出さない');
});

test('RTA：中断・退会・掃除', async () => {
  const { db, api, mk, tick } = rtaSetup();
  const b = mk();
  await b.call('POST', '/api/auth/google', { credential: 'ok:bye-rta' });
  const runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).body.runId;
  assert.equal((await b.call('POST', '/api/rta/abort', { runId })).status, 200);
  assert.equal((await b.call('POST', '/api/rta/ping', { runId })).status, 409, '中断した計測には送れない');
  await runThrough(b, tick);
  const stuck = mk();
  await stuck.call('POST', '/api/rta/start', { regulation: 'survivor-normal' }); // 走ったまま放置
  tick(3 * 86400e3);
  await api.cleanup();
  assert.deepEqual(
    db.sqlite.prepare('SELECT status FROM rta_runs ORDER BY status').all().map((r) => r.status),
    ['finished'],
    '中断と、2 日以上終わっていない計測は消える。完了は残る',
  );
  await b.call('DELETE', '/api/me');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM rta_runs').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM rta_splits').get().n, 0);
});

test('RTA：レギュレーションの定義', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === 'survivor-normal');
  assert.deepEqual(reg.checkpoints.map((c) => c.id), ['stage1', 'stage2', 'clear']);
  assert.equal(reg.checkpoints[0].minMs, undefined, '最短時間は公開しない');
  const def = REGULATION_BY_ID['survivor-normal'];
  for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
  assert.equal(def.checkpoints.at(-1).kind, 'clear');
});
