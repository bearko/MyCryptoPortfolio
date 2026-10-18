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
  assert.match(res.cookies[0], /^__Host-bg_guest=[0-9a-f]{64}; Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$/, 'Domain を付けない（サブドメインへ送らない）');
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
  assert.ok(b.jar['__Host-bg_session'] && !b.jar['__Host-bg_guest'], 'ログイン Cookie が付き、仮アカウントの Cookie は消える');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 1, '仮アカウントは消える');
  assert.deepEqual((await b.call('GET', '/api/me')).body, { user: { id: first.body.user.id, name: null, avatar: null }, guest: null });

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
  assert.deepEqual(await api.cleanup(), { guests: 1, recomputed: 0 });
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

import { crossTrophiesFor, TROPHIES, GAME_HOSTS, RARITIES, kindOf, rarityOf } from '../trophies.js';

test('トロフィー：未ログインなら仮アカウントに貯まり、ログインでまとめて本アカウントへ', async () => {
  const { db, api } = setup();
  const b = browser(api);
  const first = await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { account: 'guest', unlocked: ['tactics.ch1'], total: 1 });
  assert.ok(b.jar['__Host-bg_guest'], '仮アカウントがこのとき作られる');
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
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'workshop.clear' })).status, 403, 'tactics から workshop のトロフィーは送れない');
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: 'workshop.clear' }, { origin: 'https://workshop.bearko.games' })).status, 200);
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: '10buy.clear' })).status, 403, 'tactics から 10 buy year のトロフィーは送れない');
  assert.equal((await b.call('POST', '/api/trophies/unlock', { id: '10buy.clear' }, { origin: 'https://10-buy-year.bearko.games' })).status, 200);
  for (const [id, host] of [['factory.clear', 'factory.bearko.games'], ['education.clear', 'education.bearko.games']]) {
    assert.equal((await b.call('POST', '/api/trophies/unlock', { id })).status, 403, `tactics から ${id} は送れない`);
    assert.equal((await b.call('POST', '/api/trophies/unlock', { id }, { origin: `https://${host}` })).status, 200);
  }
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
  for (const g of ['factory', 'education']) {
    assert.ok(clears.includes(`${g}.clear`), `${g} のクリアも全制覇に要る`);
    assert.equal(crossTrophiesFor(clears.filter((id) => id !== `${g}.clear`)).includes('cross.allclear'), false);
  }
});

test('トロフィーの定義：ID が重ならず、タイトルが登録済み', async () => {
  const ids = TROPHIES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const res = await browser(setup().api).call('GET', '/api/trophies');
  assert.equal(res.body.trophies.length, TROPHIES.length);
  for (const t of res.body.trophies) assert.ok(res.body.games[t.game], t.id);
});

test('アチーブメント（SPEC-008）：種類とマイクリのレアリティ、遊ぶ先の URL', async () => {
  assert.equal(kindOf('hero:5001'), 'hero');
  assert.equal(kindOf('ext:4031'), 'ext');
  assert.deepEqual(['hero:1005', 'hero:2011', 'hero:3024', 'hero:4007', 'hero:5016'].map(rarityOf), RARITIES, '千の位がレアリティ');
  assert.equal(rarityOf('ext:5136'), 'Legendary');
  assert.equal(rarityOf('ext:12126'), 'Replica', 'Rep 版（雪だるま）');
  assert.equal(rarityOf('hero:10001'), 'Special');
  const res = await browser(setup().api).call('GET', '/api/trophies');
  const byId = Object.fromEntries(res.body.trophies.map((t) => [t.id, t]));
  assert.deepEqual([byId['tactics.clear'].kind, byId['tactics.clear'].rarity], ['hero', 'Legendary'], '織田信長');
  assert.deepEqual([byId['deckbattle.area1'].kind, byId['deckbattle.area1'].rarity], ['ext', 'Epic'], '大西部のブーツ');
  for (const t of res.body.trophies) {
    assert.ok(['hero', 'ext'].includes(t.kind), t.id);
    assert.ok([...RARITIES, 'Replica'].includes(t.rarity), `${t.id} ${t.rarity}`);
    if (t.game !== 'cross') assert.equal(res.body.gameUrls[t.game], `https://${GAME_HOSTS[t.game]}/`, t.id);
  }
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

test('RTA：Workshop のレギュレーション', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === 'workshop-golden');
  assert.equal(reg.game, 'workshop');
  assert.deepEqual(reg.checkpoints.map((c) => c.id), ['epic', 'legendary', 'clear']);
  const def = REGULATION_BY_ID['workshop-golden'];
  for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
  assert.equal(def.checkpoints.at(-1).kind, 'clear');
});

test('RTA：Factory のレギュレーション', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === 'factory-lv5');
  assert.equal(reg.game, 'factory');
  assert.deepEqual(reg.checkpoints.map((c) => c.id), ['lv2', 'lv3', 'lv4', 'clear']);
  const def = REGULATION_BY_ID['factory-lv5'];
  for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
  assert.equal(def.checkpoints.at(-1).kind, 'clear');
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

test('RTA：Survivor ABSOLUTE ×2.0 のレギュレーション', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === 'survivor-absolute-2x');
  assert.deepEqual([reg.game, reg.igt, reg.checkpoints.map((c) => c.id)], ['survivor', 'ms', ['stage1', 'stage2', 'clear']]);
  // ボスは ABSOLUTE の倍率を受けず 4 分で出るので、最短時間は NORMAL と同じ
  assert.deepEqual(
    REGULATION_BY_ID['survivor-absolute-2x'].checkpoints.map((c) => [c.id, c.kind, c.minMs]),
    REGULATION_BY_ID['survivor-normal'].checkpoints.map((c) => [c.id, c.kind, c.minMs]),
  );

  const { mk, tick } = rtaSetup();
  const b = mk();
  assert.equal((await b.call('POST', '/api/rta/start', { regulation: 'survivor-absolute-2x' }, { origin: 'https://tactics.bearko.games' })).status, 403);
  const runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-absolute-2x' })).body.runId;
  for (const [cp, min] of [['stage1', 5], ['stage2', 5], ['clear', 5]]) {
    tick(min * MIN);
    await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: cp, igtMs: 1, idleMs: 1000 });
  }
  const runs = (await b.call('GET', '/api/me/rta')).body.runs;
  assert.equal(runs[0].regulation, 'survivor-absolute-2x');
  assert.equal(runs[0].timeMs, 15 * MIN);
});

test('RTA：Survivor v1.3（v4）のレギュレーション。最短時間は v3 と同じで、横断 RTA の区間にも数える', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  for (const [v4, v3] of [['survivor-normal-v4', 'survivor-normal-v3'], ['survivor-absolute-2x-v4', 'survivor-absolute-2x-v3']]) {
    const reg = res.body.regulations.find((r) => r.id === v4);
    assert.deepEqual([reg.game, reg.checkpoints.map((c) => c.id)], ['survivor', ['stage1', 'stage2', 'clear']]);
    assert.ok(res.body.regulations.some((r) => r.id === v3), '古い記録のレギュレーションも残す');
    assert.deepEqual(REGULATION_BY_ID[v4].checkpoints.map((c) => c.minMs), REGULATION_BY_ID[v3].checkpoints.map((c) => c.minMs));
  }
  const seg = CROSS_BY_ID['cross-first6'].segments.find((x) => x.game === 'survivor');
  assert.ok(seg.regulations.includes('survivor-normal-v4'));
});

test('RTA：Survivor v1.2（v3）のレギュレーション。最短時間は v2 と同じで、横断 RTA の区間にも数える', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  for (const [v3, v2] of [['survivor-normal-v3', 'survivor-normal-v2'], ['survivor-absolute-2x-v3', 'survivor-absolute-2x-v2']]) {
    const reg = res.body.regulations.find((r) => r.id === v3);
    assert.deepEqual([reg.game, reg.checkpoints.map((c) => c.id)], ['survivor', ['stage1', 'stage2', 'clear']]);
    assert.ok(res.body.regulations.some((r) => r.id === v2), '古い記録のレギュレーションも残す');
    assert.deepEqual(REGULATION_BY_ID[v3].checkpoints.map((c) => c.minMs), REGULATION_BY_ID[v2].checkpoints.map((c) => c.minMs));
  }
  const seg = CROSS_BY_ID['cross-first6'].segments.find((x) => x.game === 'survivor');
  assert.ok(seg.regulations.includes('survivor-normal-v3'));
});

test('RTA：Survivor 懐中時計あり（v2）のレギュレーション', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  for (const [v2, v1] of [['survivor-normal-v2', 'survivor-normal'], ['survivor-absolute-2x-v2', 'survivor-absolute-2x']]) {
    const reg = res.body.regulations.find((r) => r.id === v2);
    assert.deepEqual([reg.game, reg.checkpoints.map((c) => c.id)], ['survivor', ['stage1', 'stage2', 'clear']]);
    assert.ok(res.body.regulations.some((r) => r.id === v1), 'ゲームが切り替わるまで、懐中時計なしも受け付ける');
    // 宝箱 4 つの懐中時計で 1 ステージ 40 秒まで縮む → 4 分 − 40 秒 ＝ 3 分 20 秒から 5 秒引く
    assert.deepEqual(REGULATION_BY_ID[v2].checkpoints.map((c) => c.minMs), [195e3, 390e3, 585e3]);
  }

  const { mk, tick } = rtaSetup();
  const b = mk();
  let runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal-v2' })).body.runId;
  tick(3 * MIN + 10e3);
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'stage1', igtMs: 1, idleMs: 1000 })).body.rejected, true, '3 分 10 秒は速すぎる');
  runId = (await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal-v2' })).body.runId;
  for (const cp of ['stage1', 'stage2', 'clear']) {
    tick(3 * MIN + 25e3);
    await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: cp, igtMs: 1, idleMs: 1000 });
  }
  const run = (await b.call('GET', '/api/me/rta')).body.runs.find((r) => r.regulation === 'survivor-normal-v2' && r.timeMs);
  assert.equal(run.timeMs, 3 * (3 * MIN + 25e3), '1 ステージ 3 分 25 秒なら記録になる');
  assert.ok(crossSegmentOf(CROSS_BY_ID['cross-first6'], 'survivor-normal-v2', 'stage1') >= 0, '横断 RTA の Survivor の区間にも数える');
});

test('RTA：Tactics のレギュレーション（IGT はターン数）', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const ch1 = res.body.regulations.find((r) => r.id === 'tactics-ch1');
  const all5 = res.body.regulations.find((r) => r.id === 'tactics-all5');
  assert.deepEqual([ch1.game, ch1.igt, ch1.checkpoints.map((c) => c.id)], ['tactics', 'turns', ['ch1']]);
  assert.deepEqual([all5.igt, all5.checkpoints.map((c) => c.id)], ['turns', ['ch1', 'ch2', 'ch3', 'ch4', 'clear']]);
  assert.equal(res.body.regulations.find((r) => r.id === 'survivor-normal').igt, 'ms');
  const def = REGULATION_BY_ID['tactics-all5'];
  for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
  assert.equal(def.checkpoints.at(-1).kind, 'clear');
  assert.equal(REGULATION_BY_ID['tactics-ch1'].checkpoints[0].kind, 'clear');

  const { mk, tick } = rtaSetup();
  const b = mk();
  const opt = { origin: 'https://tactics.bearko.games' };
  assert.equal((await b.call('POST', '/api/rta/start', { regulation: 'tactics-ch1' })).status, 403, 'survivor からは始められない');
  const runId = (await b.call('POST', '/api/rta/start', { regulation: 'tactics-ch1' }, opt)).body.runId;
  tick(3 * MIN);
  const end = await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'ch1', igtMs: 42, idleMs: 1000 }, opt);
  assert.equal(end.body.finished, true);
  assert.equal((await b.call('GET', '/api/me/rta')).body.runs[0].igtMs, 42, 'ターン数をそのまま残す');
});

test('RTA：10 buy year ステージ 5（ゲーム内の週で並べる。SPEC-001 6.18）', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === '10buy-stage5');
  assert.deepEqual([reg.game, reg.igt, reg.rank, reg.checkpoints.map((c) => c.id)], ['10buy', 'weeks', 'igt', ['stage2', 'stage3', 'stage4', 'clear']]);
  assert.equal(res.body.regulations.find((r) => r.id === 'survivor-normal').rank, 'time');

  const { mk, tick } = rtaSetup();
  const opt = { origin: 'https://10-buy-year.bearko.games' };
  const run = async (b, weeks, gapMs = 2 * MIN) => {
    const runId = (await b.call('POST', '/api/rta/start', { regulation: '10buy-stage5' }, opt)).body.runId;
    let last;
    for (const [i, cp] of ['stage2', 'stage3', 'stage4', 'clear'].entries()) {
      tick(gapMs);
      last = (await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: cp, igtMs: weeks[i], idleMs: 1000 }, opt)).body;
    }
    return last;
  };
  const a = mk(); await a.call('POST', '/api/auth/google', { credential: 'ok:slowreal' }); await a.call('POST', '/api/me/name', { name: 'A' });
  const b = mk(); await b.call('POST', '/api/auth/google', { credential: 'ok:fastreal' }); await b.call('POST', '/api/me/name', { name: 'B' });
  const ra = await run(a, [40, 150, 250, 320], 5 * MIN); // 週は少ないが実時間は長い
  const rb = await run(b, [45, 160, 270, 350], 1 * MIN);
  assert.equal(ra.finished, true);
  assert.equal(ra.igtMs, 320);
  assert.equal(rb.rank, 2, '実時間が短くても、週が多ければ 2 位');
  const rk = (await a.call('GET', '/api/rta/ranking?regulation=10buy-stage5', undefined, opt)).body;
  assert.equal(rk.rankBy, 'igt');
  assert.deepEqual(rk.entries.map((e) => [e.name, e.igtMs]), [['A', 320], ['B', 350]]);
  assert.deepEqual([rk.me.rank, rk.me.igtMs], [1, 320]);
  // 同じ人がもっと少ない週で走ったら、そちらが自己ベスト
  assert.equal((await run(b, [30, 120, 220, 300], 1 * MIN)).best, true);
  assert.deepEqual((await a.call('GET', '/api/rta/ranking?regulation=10buy-stage5', undefined, opt)).body.entries.map((e) => [e.name, e.igtMs]), [['B', 300], ['A', 320]], '1 人 1 件');

  // ありえない週ははじく：最小の週より少ない・前の区切りより少ない・週がない
  const c = mk();
  const bad = async (weeks) => {
    const runId = (await c.call('POST', '/api/rta/start', { regulation: '10buy-stage5' }, opt)).body.runId;
    let r;
    for (const [i, cp] of ['stage2', 'stage3', 'stage4', 'clear'].entries()) {
      tick(2 * MIN);
      r = (await c.call('POST', '/api/rta/checkpoint', { runId, checkpoint: cp, igtMs: weeks[i], idleMs: 1000 }, opt)).body;
      if (r.rejected) return r;
    }
    return r;
  };
  assert.equal((await bad([5])).rejected, true, 'ステージ 2 は 7 週より前に着けない');
  assert.equal((await bad([40, 150, 120])).rejected, true, '前の区切りより少ない週');
  assert.equal((await bad([40, null])).rejected, true, '週を送らない');
  assert.equal((await bad([40, 150, 250, 50])).rejected, true, 'ステージ 5 は 51 週より前に着けない');
});

test('RTA：Fortress のレギュレーション（レベル 01〜09）', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const reg = res.body.regulations.find((r) => r.id === 'fortress-all');
  assert.equal(reg.game, 'fortress');
  assert.deepEqual(reg.checkpoints.map((c) => c.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'clear']);
  const def = REGULATION_BY_ID['fortress-all'];
  for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
  assert.equal(def.checkpoints.at(-1).kind, 'clear');
});

test('RTA：DeckBattle のレギュレーション（近代・日本・10 勝でクリア）', async () => {
  const res = await browser(setup().api).call('GET', '/api/rta/regulations');
  const node1 = res.body.regulations.find((r) => r.id === 'deckbattle-node1');
  const quest = res.body.regulations.find((r) => r.id === 'deckbattle-quest');
  assert.deepEqual([node1.game, node1.igt, node1.checkpoints.map((c) => c.id)], ['deckbattle', 'ms', ['stage1', 'stage2', 'clear']]);
  assert.deepEqual([quest.game, quest.igt, quest.checkpoints.map((c) => c.id)], ['deckbattle', 'ms', ['win5', 'clear']]);
  for (const id of ['deckbattle-node1', 'deckbattle-quest']) {
    const def = REGULATION_BY_ID[id];
    for (let i = 1; i < def.checkpoints.length; i++) assert.ok(def.checkpoints[i].minMs > def.checkpoints[i - 1].minMs);
    assert.equal(def.checkpoints.at(-1).kind, 'clear');
  }

  const { mk, tick } = rtaSetup();
  const b = mk();
  const opt = { origin: 'https://deckbattle.bearko.games' };
  assert.equal((await b.call('POST', '/api/rta/start', { regulation: 'deckbattle-quest' })).status, 403, 'survivor からは始められない');
  const runId = (await b.call('POST', '/api/rta/start', { regulation: 'deckbattle-quest' }, opt)).body.runId;
  tick(5e3);
  assert.equal((await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint: 'win5', igtMs: 50e3, idleMs: 1000 }, opt)).body.rejected, true, '7 秒より速い 5 勝はありえない');
});

// ---------------------------------------------------------------- タイトルをまたぐ RTA（SPEC-001 6.14）
import { CROSS_BY_ID, judgeCrossSegment, crossSegmentOf } from '../rta.js';

const PORTAL = 'https://bearko.games';
const HOST_OF = { survivor: SURVIVOR, tactics: 'https://tactics.bearko.games', workshop: 'https://workshop.bearko.games', factory: 'https://factory.bearko.games', fortress: 'https://fortress.bearko.games', deckbattle: 'https://deckbattle.bearko.games' };

// そのタイトルの計測を始め、ms 経ってから区切りを送る
async function segment(b, tick, regulation, checkpoint, ms) {
  const game = regulation.split('-')[0];
  const opt = { origin: HOST_OF[game] };
  const runId = (await b.call('POST', '/api/rta/start', { regulation }, opt)).body.runId;
  tick(ms / 2);
  await b.call('POST', '/api/rta/ping', { runId, idleMs: 1000 }, opt);
  tick(ms / 2);
  return (await b.call('POST', '/api/rta/checkpoint', { runId, checkpoint, igtMs: null, idleMs: 1000 }, opt)).body;
}

test('横断 RTA：区間の判定（純関数）', () => {
  const cross = CROSS_BY_ID['cross-first6'];
  assert.equal(cross.segments.length, 6);
  for (const sg of cross.segments) for (const r of sg.regulations) assert.ok(REGULATION_BY_ID[r].checkpoints.some((c) => c.id === sg.checkpoint), `${r} に ${sg.checkpoint} がある`);
  assert.equal(crossSegmentOf(cross, 'tactics-all5', 'ch1'), 1, '全 5 章の計測の第 1 章でも数える');
  assert.equal(crossSegmentOf(cross, 'survivor-absolute-2x', 'stage1'), -1, 'ABSOLUTE は NORMAL の区間に数えない');
  const attempt = { started_at: 1000 };
  assert.equal(judgeCrossSegment(cross, attempt, { started_at: 2000 }, 'factory-lv5', 'lv2', 5000, []), 3);
  assert.equal(judgeCrossSegment(cross, attempt, { started_at: 500 }, 'factory-lv5', 'lv2', 5000, []), -1, '挑戦の前に始めた計測');
  assert.equal(judgeCrossSegment(cross, attempt, { started_at: 2000 }, 'factory-lv5', 'lv2', 5000, [3]), -1, '埋まっている区間');
  assert.equal(judgeCrossSegment(cross, attempt, { started_at: 2000 }, 'factory-lv5', 'lv2', 1000 + cross.windowMs + 1, []), -1, '期限切れ');
});

test('横断 RTA：6 区間を好きな順に走り、区間の合計が公式タイム（移る時間は数えない）', async () => {
  const { mk, tick } = rtaSetup();
  const b = mk();
  await b.call('POST', '/api/auth/google', { credential: 'ok:crosser' });
  assert.equal((await b.call('POST', '/api/rta/cross/start', { regulation: 'cross-first6' })).status, 403, 'ゲームのサブドメインからは始められない');
  // 挑戦の前に始めた計測は数えない
  const early = await b.call('POST', '/api/rta/start', { regulation: 'factory-lv5' }, { origin: HOST_OF.factory });
  tick(1000);
  const start = await b.call('POST', '/api/rta/cross/start', { regulation: 'cross-first6' }, { origin: PORTAL });
  assert.equal(start.status, 200);
  assert.equal(start.body.attempt.segments.length, 6);
  tick(5 * MIN);
  const earlyCp = await b.call('POST', '/api/rta/checkpoint', { runId: early.body.runId, checkpoint: 'lv2', idleMs: 1000 }, { origin: HOST_OF.factory });
  assert.equal(earlyCp.body.cross, undefined);

  const plan = [
    ['deckbattle-node1', 'stage1', 1 * MIN],
    ['survivor-normal', 'stage1', 4.5 * MIN],
    ['tactics-all5', 'ch1', 2 * MIN],
    ['fortress-all', 'L1', 3 * MIN],
    ['workshop-golden', 'epic', 22 * MIN],
  ];
  let last;
  for (const [i, [reg, cp, ms]] of plan.entries()) {
    last = await segment(b, tick, reg, cp, ms);
    assert.equal(last.cross.filled, i + 1, `${reg} で ${i + 1} 区間`);
    assert.equal(last.cross.segmentMs, ms);
    tick(30 * MIN); // タイトルを移る時間（数えない）
  }
  // 同じ区間を 2 回目に走っても、最初の記録のまま
  const again = await segment(b, tick, 'deckbattle-node1', 'stage1', 0.5 * MIN);
  assert.equal(again.cross, undefined);
  const cur = await b.call('GET', '/api/rta/cross/current');
  assert.equal(cur.body.attempt.segments.filter((x) => x.done).length, 5);
  assert.equal(cur.body.attempt.segments[0].ms, 4.5 * MIN);

  last = await segment(b, tick, 'factory-lv5', 'lv2', 3 * MIN);
  assert.equal(last.cross.finished, true);
  assert.equal(last.cross.timeMs, (1 + 4.5 + 2 + 3 + 22 + 3) * MIN);
  assert.equal(last.cross.best, true);
  assert.equal(last.cross.rank, 1);
  assert.equal((await b.call('GET', '/api/rta/cross/current')).body.attempt, null);

  const rk = await b.call('GET', '/api/rta/ranking?regulation=cross-first6');
  assert.equal(rk.body.entries.length, 1);
  assert.equal(rk.body.entries[0].timeMs, 35.5 * MIN);
  assert.equal(rk.body.me.rank, 1);
  const mine = await b.call('GET', '/api/me/rta');
  assert.equal(mine.body.cross.length, 1);
  assert.equal(mine.body.cross[0].segments.every((x) => x.done), true);
  const regs = await b.call('GET', '/api/rta/regulations');
  assert.ok(regs.body.regulations.some((r) => r.id === 'cross-first6' && r.kind === 'cross' && r.segments.length === 6));
});

test('横断 RTA：24 時間の期限・やめる・未ログインからログイン・退会', async () => {
  const { db, mk, tick } = rtaSetup();
  const b = mk();
  const st = await b.call('POST', '/api/rta/cross/start', { regulation: 'cross-first6' }, { origin: PORTAL });
  assert.equal(st.body.account, 'guest', '未ログインでも挑戦できる（仮アカウント）');
  assert.equal((await segment(b, tick, 'factory-lv5', 'lv2', MIN)).cross.filled, 1);
  tick(24 * 3600e3);
  assert.equal((await segment(b, tick, 'fortress-all', 'L1', MIN)).cross, undefined, '期限を過ぎた区間は数えない');
  assert.equal((await b.call('GET', '/api/rta/cross/current')).body.attempt, null);
  assert.equal(db.sqlite.prepare("SELECT status FROM rta_cross").get().status, 'expired');

  await b.call('POST', '/api/rta/cross/start', { regulation: 'cross-first6' }, { origin: PORTAL });
  assert.equal((await b.call('POST', '/api/rta/cross/abort', {}, { origin: PORTAL })).status, 200);
  assert.equal((await b.call('GET', '/api/rta/cross/current')).body.attempt, null);

  await b.call('POST', '/api/rta/cross/start', { regulation: 'cross-first6' }, { origin: PORTAL });
  await segment(b, tick, 'factory-lv5', 'lv2', MIN);
  await b.call('POST', '/api/auth/google', { credential: 'ok:later' });
  const cur = await b.call('GET', '/api/rta/cross/current');
  assert.equal(cur.body.account, 'login');
  assert.equal(cur.body.attempt.segments[3].done, true, 'ログインしても挑戦は続く');
  await b.call('DELETE', '/api/me');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM rta_cross').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM rta_cross_segments').get().n, 0);
});

test('SPEC-006 アイコン図鑑：最初からの 3 体と、持っているトロフィーのアイコンだけ選べる', async () => {
  const { api } = setup();
  const b = browser(api);
  await b.call('POST', '/api/auth/google', { credential: 'ok:sub-av' });
  const defs = (await b.call('GET', '/api/trophies')).body;
  assert.equal(defs.avatars.default, 'hero:10001');
  assert.deepEqual(defs.avatars.starters.map((a) => a.id), ['hero:10001', 'hero:10002', 'hero:10003']);
  assert.equal(defs.avatars.total, 3 + defs.trophies.length);
  const sunzi = defs.trophies.find((t) => t.id === 'tactics.ch1');
  assert.deepEqual([sunzi.avatar, sunzi.avatarName], ['hero:2011', '孫子']);
  assert.equal((await b.call('POST', '/api/me/avatar', { id: 'hero:10002' })).status, 200, '最初から');
  const locked = await b.call('POST', '/api/me/avatar', { id: 'hero:2011' });
  assert.deepEqual([locked.status, locked.body.error], [403, 'locked'], 'まだトロフィーが無い');
  assert.equal((await b.call('POST', '/api/me/avatar', { id: 'hero:1001' })).status, 403, '図鑑に無い絵');
  await b.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' });
  assert.equal((await b.call('POST', '/api/me/avatar', { id: 'hero:2011' })).body.user.avatar, 'hero:2011', 'トロフィーで解放');
  assert.equal((await b.call('POST', '/api/me/avatar', { id: null })).status, 200, '既定の絵に戻す');
});

test('セキュリティ：古い Domain つきの Cookie は __Host- へ移して消す。知らないサブドメインは受けない。仮アカウントは回数に上限', async () => {
  const db = d1();
  let allow = true;
  const api = createApi({ db, now: () => Date.parse('2026-10-18T00:00:00Z'), verifyGoogle: fakeVerify, clientId: 'cid', cookieDomain: '.bearko.games', guestLimit: async () => allow });
  const b = browser(api);
  await b.call('POST', '/api/guest', {});
  const token = b.jar['__Host-bg_guest'];
  // 古い名前で持っている人（Domain=.bearko.games のころの Cookie）
  delete b.jar['__Host-bg_guest'];
  b.jar.bg_guest = token;
  const me = await b.call('GET', '/api/me');
  assert.ok(me.body.guest, '古い Cookie でも読める');
  assert.ok(me.cookies.some((c) => c.startsWith(`__Host-bg_guest=${token};`) && !/Domain=/.test(c)), '__Host- へ移す');
  assert.ok(me.cookies.some((c) => /^bg_guest=; Domain=\.bearko\.games; Path=\/; Max-Age=0/.test(c)), '古いほうは Domain つきで消す');
  assert.ok(b.jar['__Host-bg_guest'] && !b.jar.bg_guest);
  // Origin は決まった一覧だけ
  const evil = await b.call('POST', '/api/guest', {}, { origin: 'https://old-unused.bearko.games' });
  assert.equal(evil.status, 403, '使っていないサブドメインからは書けない');
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.equal((await b.call('GET', '/api/me', undefined, { origin: 'https://survivor.bearko.games' })).headers.get('access-control-allow-origin'), 'https://survivor.bearko.games');
  // 仮アカウントの作りすぎ
  allow = false;
  const c = browser(api);
  assert.deepEqual([(await c.call('POST', '/api/guest', {})).status], [429]);
  assert.equal((await c.call('POST', '/api/trophies/unlock', { id: 'tactics.ch1' }, { origin: 'https://tactics.bearko.games' })).status, 429);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 1, '作られていない');
});
