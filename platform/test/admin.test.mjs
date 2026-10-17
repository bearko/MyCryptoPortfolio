// 管理画面の API（SPEC-003）のテスト。D1 は Node の SQLite で真似て、migrations/ の SQL をそのまま流す。
// 実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../api.js';
import { distribution, parseAdminSubs, cleanReason } from '../admin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORTAL = 'https://bearko.games';
const SURVIVOR = 'https://survivor.bearko.games';
const MIN = 60e3;

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

// ブラウザの Cookie 置き場の代わり。既定の Origin は Survivor（ゲーム）
function browser(api) {
  const jar = {};
  return {
    async call(method, path, body, { origin = SURVIVOR } = {}) {
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
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    // 管理画面（bearko.games の画面から）
    admin(method, path, body) {
      return this.call(method, path, body, { origin: method === 'GET' ? null : PORTAL });
    },
  };
}

function setup() {
  let t = Date.parse('2026-10-17T00:00:00Z');
  const db = d1();
  const logs = [];
  const api = createApi({
    db,
    now: () => t,
    verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null),
    cookieDomain: '.bearko.games',
    adminSubs: ['boss'],
    log: (...a) => logs.push(a.join(' ')),
  });
  const player = async (sub, name) => {
    const b = browser(api);
    if (sub) {
      await b.call('POST', '/api/auth/google', { credential: `ok:${sub}` });
      if (name) await b.call('POST', '/api/me/name', { name });
    }
    return b;
  };
  return { db, api, logs, player, tick: (ms) => (t += ms) };
}

const survivorPlay = (report) => ({ game: 'survivor', metrics: { stagesCleared: 3, cleared: true, reportScore: report, regulationMul: 1 } });

async function runThrough(b, tick) {
  const start = await b.call('POST', '/api/rta/start', { regulation: 'survivor-normal' });
  for (const cp of ['stage1', 'stage2', 'clear']) {
    tick(4.5 * MIN);
    await b.call('POST', '/api/rta/checkpoint', { runId: start.body.runId, checkpoint: cp, igtMs: 240e3, idleMs: 1000 });
  }
  return start.body.runId;
}

test('分布：件数・中央値・上位 10%・最高', () => {
  assert.deepEqual(distribution([]), { count: 0, median: null, top10: null, max: null });
  assert.deepEqual(distribution([500]), { count: 1, median: 500, top10: 500, max: 500 });
  assert.deepEqual(distribution([1, 4, 2, 3]), { count: 4, median: 2.5, top10: 4, max: 4 });
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(distribution(hundred), { count: 100, median: 50.5, top10: 91, max: 100 }, '上位 10 人目の点');
  assert.equal(distribution(Array.from({ length: 11 }, (_, i) => i)).top10, 9, '11 件なら切り上げて 2 番目');
});

test('会員番号の一覧と理由の整形', () => {
  assert.deepEqual(parseAdminSubs(' 111, 222\n333 ,'), ['111', '222', '333']);
  assert.deepEqual(parseAdminSubs(undefined), []);
  assert.equal(cleanReason('  タイム\n改ざん  '), 'タイム 改ざん');
  assert.equal(cleanReason(''), null);
  assert.equal([...cleanReason('あ'.repeat(300))].length, 200);
});

test('管理者の判定：会員番号が一覧にある人だけ。本人の番号は見える', async () => {
  const { player } = setup();
  const anon = await player(null);
  assert.deepEqual((await anon.admin('GET', '/api/admin/me')).body, { admin: false, user: null, sub: null });
  assert.equal((await anon.admin('GET', '/api/admin/scores')).status, 401);

  const p = await player('someone', 'くま');
  const me = (await p.admin('GET', '/api/admin/me')).body;
  assert.equal(me.admin, false);
  assert.equal(me.sub, 'someone', '設定のために本人の会員番号を出す');
  for (const path of ['/api/admin/scores', '/api/admin/rta', '/api/admin/users', '/api/admin/bans']) assert.equal((await p.admin('GET', path)).status, 403, path);
  assert.equal((await p.admin('POST', '/api/admin/ban', { userId: me.user.id })).status, 403);

  const boss = await player('boss');
  assert.equal((await boss.admin('GET', '/api/admin/me')).body.admin, true);
  assert.equal((await boss.admin('GET', '/api/admin/scores')).status, 200);
});

test('管理の API は bearko.games の画面からだけ（ゲームのサブドメインからは読めない）', async () => {
  const { player } = setup();
  const boss = await player('boss');
  assert.equal((await boss.call('GET', '/api/admin/scores', undefined, { origin: SURVIVOR })).status, 403);
  assert.equal((await boss.call('GET', '/api/admin/scores', undefined, { origin: PORTAL })).status, 200);
  assert.equal((await boss.call('POST', '/api/admin/unban', { userId: 'a'.repeat(32) }, { origin: null })).status, 403, '書き込みは Origin が要る');
});

test('総合スコアの分布：タイトルごとの件数・中央値・上位 10%、上位 10 件。記録を消せる', async () => {
  const { player, logs } = setup();
  const a = await player('a', 'Aさん');
  const b = await player('b', 'Bさん');
  const g = await player(null); // 仮アカウントも分布に入る
  await a.call('POST', '/api/score/submit', survivorPlay(150000)); // 10,000
  await b.call('POST', '/api/score/submit', survivorPlay(300000)); // 15,000
  await g.call('POST', '/api/score/submit', survivorPlay(30000)); // 6,000

  const boss = await player('boss');
  const games = (await boss.admin('GET', '/api/admin/scores')).body.games;
  const sv = games.find((x) => x.id === 'survivor');
  assert.equal(sv.formula, 'survivor.v2');
  assert.deepEqual([sv.count, sv.login, sv.median, sv.top10, sv.max], [3, 2, 10000, 15000, 15000]);
  assert.deepEqual(sv.top.map((t) => [t.name, t.account, t.score]), [['Bさん', 'login', 15000], ['Aさん', 'login', 10000], [null, 'guest', 6000]]);
  assert.equal(games.find((x) => x.id === 'tactics').count, 0, '記録のないタイトルも行は出る');

  const target = sv.top[0].userId;
  assert.equal((await boss.admin('POST', '/api/admin/score/delete', { userId: target, game: 'survivor' })).status, 200);
  assert.equal((await boss.admin('POST', '/api/admin/score/delete', { userId: target, game: 'survivor' })).status, 404);
  assert.equal((await boss.admin('POST', '/api/admin/score/delete', { userId: target, game: 'nope' })).status, 400);
  const ranking = (await a.call('GET', '/api/score/ranking?game=survivor')).body.entries;
  assert.deepEqual(ranking.map((e) => e.name), ['Aさん']);
  assert.ok(logs.some((l) => l.includes('score/delete')), '管理者の操作をログに残す');
});

test('RTA の記録の一覧と削除：削除すると次に速い記録が繰り上がる', async () => {
  const { player, tick } = setup();
  const p = await player('runner', 'はしる');
  const first = await runThrough(p, tick);
  tick(10 * MIN);
  const second = await runThrough(p, tick);

  const boss = await player('boss');
  const list = (await boss.admin('GET', '/api/admin/rta?regulation=survivor-normal')).body;
  assert.deepEqual(list.runs.map((r) => r.id), [second, first], '新しい順');
  assert.equal(list.runs[0].name, 'はしる');
  assert.equal(list.runs[0].account, 'login');
  assert.deepEqual(list.runs[0].splits.map((s) => s.checkpoint), ['stage1', 'stage2', 'clear']);
  assert.ok(list.regulations.some((r) => r.id === 'survivor-normal'));
  assert.equal((await boss.admin('GET', '/api/admin/rta')).body.runs.length, 2, 'すべてのレギュレーション');
  assert.equal((await boss.admin('GET', '/api/admin/rta?regulation=nope')).status, 400);

  assert.equal((await boss.admin('POST', '/api/admin/rta/delete', { runId: first })).status, 200);
  assert.equal((await boss.admin('POST', '/api/admin/rta/delete', { runId: first })).status, 404);
  assert.deepEqual((await boss.admin('GET', '/api/admin/rta')).body.runs.map((r) => r.id), [second]);
  assert.equal((await p.call('GET', '/api/me/rta')).body.runs.length, 1);
});

test('締め出し：ランキングから隠し、新しい記録を受け付けない。解除で元に戻る', async () => {
  const { player, tick } = setup();
  const bad = await player('bad', 'ずる');
  const good = await player('good', 'まじめ');
  await bad.call('POST', '/api/score/submit', survivorPlay(900000));
  await good.call('POST', '/api/score/submit', survivorPlay(150000));
  await runThrough(bad, tick);
  await runThrough(good, tick);

  const boss = await player('boss');
  const badId = (await boss.admin('GET', '/api/admin/users?q=ずる')).body.users[0].id;
  assert.equal((await boss.admin('POST', '/api/admin/ban', { userId: badId, reason: 'ありえない点' })).status, 200);
  assert.deepEqual((await boss.admin('GET', '/api/admin/bans')).body.bans.map((x) => [x.name, x.reason, x.withdrawn]), [['ずる', 'ありえない点', false]]);

  const names = async (path) => (await good.call('GET', path)).body.entries.map((e) => e.name);
  assert.deepEqual(await names('/api/score/ranking'), ['まじめ']);
  assert.deepEqual(await names('/api/score/ranking?game=survivor'), ['まじめ']);
  assert.deepEqual(await names('/api/rta/ranking?regulation=survivor-normal'), ['まじめ']);
  assert.equal((await good.call('GET', '/api/score/ranking')).body.me.rank, 1, '自分の順位も外した母集団で数える');

  assert.equal((await bad.call('POST', '/api/score/submit', survivorPlay(1))).status, 403);
  assert.equal((await bad.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' })).status, 403);
  assert.equal((await bad.call('POST', '/api/rta/start', { regulation: 'survivor-normal' })).status, 403);
  assert.equal((await bad.call('GET', '/api/me')).body.banned, true);
  assert.equal((await good.call('GET', '/api/me')).body.banned, undefined);
  assert.equal((await bad.call('GET', '/api/me/scores')).body.titles.length, 1, '自分の記録は見られる（消さない）');

  assert.equal((await boss.admin('POST', '/api/admin/unban', { userId: badId })).status, 200);
  assert.deepEqual(await names('/api/score/ranking?game=survivor'), ['ずる', 'まじめ']);
  assert.equal((await bad.call('POST', '/api/trophies/unlock', { id: 'survivor.stage1' })).status, 200);
});

test('締め出し：走っている計測の区切りも受け付けない', async () => {
  const { player, tick } = setup();
  const bad = await player('bad', 'ずる');
  const start = await bad.call('POST', '/api/rta/start', { regulation: 'survivor-normal' });
  const boss = await player('boss');
  const badId = (await bad.call('GET', '/api/me')).body.user.id;
  await boss.admin('POST', '/api/admin/ban', { userId: badId });
  tick(5 * MIN);
  assert.equal((await bad.call('POST', '/api/rta/checkpoint', { runId: start.body.runId, checkpoint: 'stage1', idleMs: 0 })).status, 403);
  assert.equal((await bad.call('POST', '/api/rta/ping', { runId: start.body.runId, idleMs: 0 })).status, 403);
});

test('締め出し：退会してログインし直しても抜けられない。解除で両方消える', async () => {
  const { player, db } = setup();
  const bad = await player('bad', 'ずる');
  const oldId = (await bad.call('GET', '/api/me')).body.user.id;
  const boss = await player('boss');
  await boss.admin('POST', '/api/admin/ban', { userId: oldId, reason: '改ざん' });

  await bad.call('DELETE', '/api/me', undefined, { origin: PORTAL });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(oldId).n, 0, '退会でアカウントは消える');
  await bad.call('POST', '/api/auth/google', { credential: 'ok:bad' });
  const me = (await bad.call('GET', '/api/me')).body;
  assert.notEqual(me.user.id, oldId);
  assert.equal(me.banned, true, '同じ会員番号の新しいアカウントにも付け直す');
  assert.equal((await bad.call('POST', '/api/score/submit', survivorPlay(1))).status, 403);
  const list = (await boss.admin('GET', '/api/admin/bans')).body.bans;
  assert.deepEqual(list.map((x) => [x.withdrawn, x.reason]).sort(), [[false, '改ざん'], [true, '改ざん']]);

  await boss.admin('POST', '/api/admin/unban', { userId: me.user.id });
  assert.deepEqual((await boss.admin('GET', '/api/admin/bans')).body.bans, [], '退会前の行もまとめて解除');
  assert.equal((await bad.call('POST', '/api/score/submit', survivorPlay(1))).status, 200);
});

test('締め出し：仮アカウントを締め出すと、その端末でログインした本アカウントも締め出す。消えた仮アカウントの行は掃除で消える', async () => {
  const { player, api, db, tick } = setup();
  const g = await player(null);
  await g.call('POST', '/api/score/submit', survivorPlay(1));
  const guestId = (await g.call('GET', '/api/me')).body.guest.id;
  const boss = await player('boss');
  await boss.admin('POST', '/api/admin/ban', { userId: guestId });
  assert.equal((await g.call('POST', '/api/score/submit', survivorPlay(1))).status, 403);

  await g.call('POST', '/api/auth/google', { credential: 'ok:newcomer' });
  assert.equal((await g.call('GET', '/api/me')).body.banned, true);

  const other = await player(null);
  await other.call('POST', '/api/score/submit', survivorPlay(1));
  const otherId = (await other.call('GET', '/api/me')).body.guest.id;
  await boss.admin('POST', '/api/admin/ban', { userId: otherId });
  tick(91 * 86400e3);
  await api.cleanup();
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM bans WHERE user_id = ?').get(otherId).n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM bans WHERE google_sub = ?').get('newcomer').n, 1, '本アカウントの締め出しは残る');
});

test('プレイヤーを探す：名前か ID。何も入れなければ最近のログインした人', async () => {
  const { player } = setup();
  await player('a', 'くまさん');
  await player('b', 'ねこ_100%');
  await player(null);
  const boss = await player('boss', 'かんり');
  const q = async (s) => (await boss.admin('GET', `/api/admin/users?q=${encodeURIComponent(s)}`)).body.users.map((u) => u.name);
  assert.deepEqual(await q('くま'), ['くまさん']);
  assert.deepEqual(await q('_100%'), ['ねこ_100%'], '% と _ はそのままの文字として探す');
  assert.deepEqual(await q('%'), ['ねこ_100%']);
  const all = (await boss.admin('GET', '/api/admin/users')).body.users;
  assert.equal(all.length, 3, '仮アカウントは出さない');
  const id = all.find((u) => u.name === 'くまさん').id;
  assert.deepEqual(await q(id.slice(0, 8)), ['くまさん']);
  assert.equal((await boss.admin('POST', '/api/admin/ban', { userId: 'f'.repeat(32) })).status, 404);
  assert.equal((await boss.admin('POST', '/api/admin/ban', { userId: 'x' })).status, 400);
});
