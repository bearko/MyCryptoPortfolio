// 管理画面の API（SPEC-003）。管理者は Google の会員番号（sub）の一覧（シークレット ADMIN_SUBS）で見分ける。
//
//   GET  /api/admin/me              { admin, user, sub, testerDevice } sub はログインしている本人の会員番号（設定用）
//   GET  /api/admin/scores          タイトルごとの点数の分布と上位 10 件
//   POST /api/admin/score/delete    { userId, game } 総合スコアの記録（自己ベストと生の成績）を消す
//   GET  /api/admin/rta?regulation=&order=recent|time  RTA の完了した記録（100 件まで）
//   POST /api/admin/rta/delete      { runId } RTA の記録を消す
//   GET  /api/admin/users?q=        プレイヤーを探す（名前か ID）
//   GET  /api/admin/bans            締め出し中の一覧
//   POST /api/admin/ban             { userId, reason } 締め出す
//   POST /api/admin/unban           { userId } 解除する
//   GET  /api/admin/chat            全体チャットの直近 200 件（SPEC-004）
//   POST /api/admin/chat/delete     { id } 発言を消す
//   GET  /api/admin/portal?days=14  ポータルの計測（SPEC-009）。日ごと・できごとごとの回数
//   GET  /api/admin/kpi?game=&days=30  NUU・DAU・WAU・MAU・RR1/3/7（SPEC-010 4 章）。game が空ならタイトル横断。テスターは除く
//   GET  /api/admin/tutorial?game=&days=30  チュートリアルの漏斗（SPEC-010 6.2）。その期間に始めた人
//   POST /api/admin/tester-device   { on } この端末をテスターの端末にする／やめる（SPEC-009 3.2。Cookie を付け外しする）
//   POST /api/admin/tester          { userId, on } アカウントにテスターの印を付ける／外す（前に作者が遊んだ仮アカウントなど）
//   GET  /api/admin/pochi           ポチゲーの通知（SPEC-011）：送った出来事の一覧と、送れるかどうか
//   POST /api/admin/pochi/send      { channel, title, body, url } 出来事をフィードに載せ、共通ハブへ知らせる
//   POST /api/admin/pochi/hub       もう一度ハブへ知らせる（前回が 429・通信の失敗だったとき。フィードは変えない）
//
// 締め出しの効き目（ランキングから隠す・記録を受け付けない）は api.js の側にある。

import { SCORERS } from './scoring/index.js';
import { REGULATION_BY_ID, publicRegulations } from './rta.js';
import { GAME_NAMES } from './trophies.js';
import { kpi, tutorialFunnel, addDays, burstGuests } from './kpi.js';
import { jstDay } from './portal-stats.js';
import { checkEvent, eventId, notifyHub, HUB_GAP_MS } from './pochi-notify.js';

const LIST_LIMIT = 100;
const TOP_LIMIT = 10;
const USER_LIMIT = 20;
const REASON_MAX = 200;
const ID_RE = /^[0-9a-f]{32}$/;

/** ADMIN_SUBS（カンマか空白で区切る）を一覧にする */
export function parseAdminSubs(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

/**
 * 点数の分布。件数・中央値（偶数件なら真ん中 2 つの平均）・上位 10% の点・最高。
 * 上位 10% の点は、高い順に並べて「件数 × 0.1 を切り上げた順位」の点（この点以上が上位 10%）。
 */
export function distribution(scores) {
  const s = [...scores].sort((a, b) => b - a);
  const n = s.length;
  if (!n) return { count: 0, median: null, top10: null, max: null };
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { count: n, median, top10: s[Math.ceil(n * 0.1) - 1], max: s[0] };
}

export function cleanReason(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? [...text].slice(0, REASON_MAX).join('') : null;
}

/**
 * 管理の API。api.js の handle から /api/admin/* を渡される。
 * portalOrigins：管理の API を受ける Origin（bearko.games の画面だけ。ゲームのサブドメインからは読ませない）
 */
export function createAdmin({ db, now, login, reply, adminSubs = [], portalOrigins = [], chat = null, testerDevice = () => false, testerCookie = null, markTester = null, pochi = null, log = console.log }) {
  const isAdmin = (s) => !!s?.sub && adminSubs.includes(s.sub);

  async function scores(req) {
    const { results } = await db
      .prepare(
        `SELECT ts.user_id, ts.game, ts.score, ts.milestone, ts.performance, ts.formula, ts.updated_at, u.name, u.google_sub IS NOT NULL AS login
         FROM title_scores ts JOIN users u ON u.id = ts.user_id
         WHERE ts.user_id NOT IN (SELECT user_id FROM bans) ORDER BY ts.game, ts.score DESC, ts.updated_at`,
      )
      .all();
    const byGame = {};
    for (const r of results) (byGame[r.game] ||= []).push(r);
    const games = Object.entries(SCORERS).map(([id, sc]) => {
      const rows = byGame[id] || [];
      return {
        id,
        name: GAME_NAMES[id] || id,
        formula: `${id}.${sc.version}`,
        kind: sc.kind,
        ...distribution(rows.map((r) => r.score)),
        login: rows.filter((r) => r.login).length,
        top: rows.slice(0, TOP_LIMIT).map((r) => ({
          userId: r.user_id,
          name: r.name ?? null,
          account: r.login ? 'login' : 'guest',
          score: r.score,
          milestone: r.milestone,
          performance: r.performance,
          formula: r.formula,
          at: r.updated_at,
        })),
      };
    });
    return reply(req, 200, { games });
  }

  async function rta(req, url) {
    const regulation = url.searchParams.get('regulation') || '';
    if (regulation && !REGULATION_BY_ID[regulation]) return reply(req, 400, { error: 'regulation' });
    const order = url.searchParams.get('order') === 'time' ? 'r.time_ms, r.finished_at' : 'r.finished_at DESC';
    const where = regulation ? "r.status = 'finished' AND r.regulation = ?1" : "r.status = 'finished' AND ?1 = ''";
    const { results } = await db
      .prepare(
        `SELECT r.id, r.user_id, r.regulation, r.time_ms, r.igt_ms, r.reference, r.max_idle_ms, r.started_at, r.finished_at,
           u.name, u.google_sub IS NOT NULL AS login, r.user_id IN (SELECT user_id FROM bans) AS banned
         FROM rta_runs r JOIN users u ON u.id = r.user_id WHERE ${where} ORDER BY ${order} LIMIT ?2`,
      )
      .bind(regulation, LIST_LIMIT)
      .all();
    const byRun = {};
    if (results.length) {
      const splits = await db
        .prepare('SELECT run_id, ord, checkpoint, elapsed_ms, igt_ms FROM rta_splits WHERE run_id IN (SELECT value FROM json_each(?1)) ORDER BY run_id, ord')
        .bind(JSON.stringify(results.map((r) => r.id)))
        .all();
      for (const x of splits.results) (byRun[x.run_id] ||= []).push({ checkpoint: x.checkpoint, elapsedMs: x.elapsed_ms, igtMs: x.igt_ms ?? null });
    }
    return reply(req, 200, {
      regulations: publicRegulations(),
      games: GAME_NAMES,
      runs: results.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name ?? null,
        account: r.login ? 'login' : 'guest',
        banned: !!r.banned,
        regulation: r.regulation,
        timeMs: r.time_ms,
        igtMs: r.igt_ms ?? null,
        reference: !!r.reference,
        maxIdleMs: r.max_idle_ms,
        startedAt: r.started_at,
        at: r.finished_at,
        splits: byRun[r.id] || [],
      })),
    });
  }

  async function users(req, url) {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
    const cols = `u.id, u.name, u.google_sub IS NOT NULL AS login, u.created_at, u.last_seen,
      (SELECT COALESCE(SUM(score), 0) FROM title_scores WHERE user_id = u.id) AS total,
      (SELECT COUNT(*) FROM rta_runs WHERE user_id = u.id AND status = 'finished') AS runs,
      u.id IN (SELECT user_id FROM bans) AS banned, u.tester`;
    const stmt = q
      ? db
          .prepare(`SELECT ${cols} FROM users u WHERE u.name LIKE ?1 ESCAPE '\\' OR u.id LIKE ?2 ORDER BY u.last_seen DESC LIMIT ?3`)
          .bind(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, /^[0-9a-f]{4,32}$/.test(q) ? `${q}%` : '', USER_LIMIT)
      : db.prepare(`SELECT ${cols} FROM users u WHERE u.google_sub IS NOT NULL ORDER BY u.last_seen DESC LIMIT ?1`).bind(USER_LIMIT);
    const { results } = await stmt.all();
    return reply(req, 200, {
      users: results.map((u) => ({
        id: u.id,
        name: u.name ?? null,
        account: u.login ? 'login' : 'guest',
        createdAt: u.created_at,
        lastSeen: u.last_seen,
        total: u.total,
        runs: u.runs,
        banned: !!u.banned,
        tester: !!u.tester,
      })),
    });
  }

  async function bans(req) {
    const { results } = await db
      .prepare('SELECT b.user_id, b.reason, b.banned_at, b.google_sub IS NOT NULL AS login, u.name, u.id IS NOT NULL AS present FROM bans b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.banned_at DESC')
      .all();
    return reply(req, 200, {
      bans: results.map((b) => ({ userId: b.user_id, name: b.name ?? null, account: b.login ? 'login' : 'guest', withdrawn: !b.present, reason: b.reason ?? null, at: b.banned_at })),
    });
  }

  async function handle(req, method, path, url, body) {
    // 管理の情報は bearko.games の画面からだけ（Origin なしは同じ origin の GET）
    const origin = req.headers.get('origin');
    if (origin && !portalOrigins.includes(origin)) return reply(req, 403, { error: 'origin' });

    const s = await login(req);
    if (method === 'GET' && path === '/api/admin/me') {
      return reply(req, 200, { admin: isAdmin(s), user: s ? { id: s.userId, name: s.name ?? null } : null, sub: s?.sub ?? null, ...(isAdmin(s) ? { testerDevice: testerDevice(req) } : {}) });
    }
    if (!s) return reply(req, 401, { error: 'login' });
    if (!isAdmin(s)) return reply(req, 403, { error: 'admin' });
    const audit = (action, detail) => log('[admin]', JSON.stringify({ by: s.userId, action, ...detail }));

    if (method === 'GET' && path === '/api/admin/scores') return scores(req);
    if (method === 'GET' && path === '/api/admin/rta') return rta(req, url);
    if (method === 'GET' && path === '/api/admin/users') return users(req, url);
    if (method === 'GET' && path === '/api/admin/bans') return bans(req);

    // ポータルの計測（SPEC-009）。行をそのまま返し、まとめ方は画面で決める（1 日 100 行もない）
    if (method === 'GET' && path === '/api/admin/portal') {
      const days = Math.min(400, Math.max(1, Math.floor(Number(url.searchParams.get('days')) || 14)));
      const since = new Date(now() + 9 * 3600e3 - (days - 1) * 86400e3).toISOString().slice(0, 10);
      const { results } = await db.prepare('SELECT day, event, game, source, n FROM portal_counts WHERE day >= ?1 ORDER BY day DESC').bind(since).all();
      return reply(req, 200, { days, since, rows: results });
    }

    // 全体チャット（SPEC-004 7 章）：直近の発言と、発言ごとの削除。締め出しは下の /api/admin/ban が部屋にも伝える
    if (method === 'GET' && path === '/api/admin/chat') {
      if (!chat) return reply(req, 503, { error: 'chat' });
      const r = await chat.list();
      return reply(req, r.status, r.body);
    }
    if (method === 'POST' && path === '/api/admin/chat/delete') {
      if (!chat) return reply(req, 503, { error: 'chat' });
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return reply(req, 400, { error: 'id' });
      const r = await chat.remove(id, null, true);
      if (r.status === 200) audit('chat/delete', { id });
      return reply(req, r.status, r.body);
    }

    if (method === 'POST' && path === '/api/admin/score/delete') {
      if (typeof body.userId !== 'string' || !ID_RE.test(body.userId) || !SCORERS[body.game]) return reply(req, 400, { error: 'target' });
      const row = await db.prepare('SELECT score FROM title_scores WHERE user_id = ?1 AND game = ?2').bind(body.userId, body.game).first();
      if (!row) return reply(req, 404, { error: 'not_found' });
      await db.batch([
        db.prepare('DELETE FROM title_scores WHERE user_id = ?1 AND game = ?2').bind(body.userId, body.game),
        db.prepare('DELETE FROM plays WHERE user_id = ?1 AND game = ?2').bind(body.userId, body.game),
      ]);
      audit('score/delete', { userId: body.userId, game: body.game, score: row.score });
      return reply(req, 200, { ok: true });
    }

    if (method === 'POST' && path === '/api/admin/rta/delete') {
      if (typeof body.runId !== 'string' || !ID_RE.test(body.runId)) return reply(req, 400, { error: 'run' });
      const run = await db.prepare('SELECT user_id, regulation, time_ms FROM rta_runs WHERE id = ?1').bind(body.runId).first();
      if (!run) return reply(req, 404, { error: 'not_found' });
      await db.batch([
        db.prepare('DELETE FROM rta_splits WHERE run_id = ?1').bind(body.runId),
        db.prepare('DELETE FROM rta_runs WHERE id = ?1').bind(body.runId),
      ]);
      audit('rta/delete', { runId: body.runId, userId: run.user_id, regulation: run.regulation, timeMs: run.time_ms });
      return reply(req, 200, { ok: true });
    }

    // ---- ポチゲーポータルのプッシュ通知（SPEC-011）。pochi：{ hub, gameKey, apiKey, fetch }（API キーが無ければ null）
    const lastHubAt = async () => (await db.prepare('SELECT MAX(hub_at) AS t FROM pochi_events').first())?.t ?? 0;
    async function tellHub() {
      const r = await notifyHub(pochi, pochi.fetch || fetch);
      log('pochi/hub', JSON.stringify(r));   // 返事の状態だけ（API キーは出さない）
      return r;
    }
    if (method === 'GET' && path === '/api/admin/pochi') {
      const { results } = await db.prepare('SELECT * FROM pochi_events ORDER BY published_at DESC LIMIT 20').all();
      const last = await lastHubAt();
      return reply(req, 200, { ready: !!pochi, gameKey: pochi?.gameKey ?? null, feed: 'https://bearko.games/api/game-events/', events: results, waitMs: Math.max(0, last + HUB_GAP_MS - now()) });
    }
    if (method === 'POST' && path === '/api/admin/pochi/send') {
      if (!pochi) return reply(req, 503, { error: 'no_key' });
      const c = checkEvent(body);
      if (!c.ok) return reply(req, 400, { error: c.error });
      if (now() - (await lastHubAt()) < HUB_GAP_MS) return reply(req, 429, { error: 'gap' });
      const at = now();
      const id = eventId(c.value.channel, at);
      await db.prepare('INSERT INTO pochi_events (id, channel, title, body, url, published_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(id, c.value.channel, c.value.title, c.value.body, c.value.url, at).run();
      // フィードに載せたあとでハブへ知らせる（ハブはすぐ取りに来る）
      const hub = await tellHub();
      await db.prepare('UPDATE pochi_events SET hub_status = ?2, hub_queued = ?3, hub_at = ?4 WHERE id = ?1')
        .bind(id, hub.status, hub.queued === null ? null : Number(hub.queued), now()).run();
      audit('pochi/send', { id, channel: c.value.channel, status: hub.status, queued: hub.queued });
      return reply(req, 200, { id, hub });
    }
    if (method === 'POST' && path === '/api/admin/pochi/hub') {
      if (!pochi) return reply(req, 503, { error: 'no_key' });
      if (now() - (await lastHubAt()) < HUB_GAP_MS) return reply(req, 429, { error: 'gap' });
      const latest = await db.prepare('SELECT id FROM pochi_events ORDER BY published_at DESC LIMIT 1').first();
      if (!latest) return reply(req, 400, { error: 'empty' });
      const hub = await tellHub();
      await db.prepare('UPDATE pochi_events SET hub_status = ?2, hub_queued = ?3, hub_at = ?4 WHERE id = ?1')
        .bind(latest.id, hub.status, hub.queued === null ? null : Number(hub.queued), now()).run();
      audit('pochi/hub', { id: latest.id, status: hub.status, queued: hub.queued });
      return reply(req, 200, { id: latest.id, hub });
    }

    // bot とみなして数えないアカウント（SPEC-010 7 章）：作者が印を付けたもの（users.bot）と、
    // 使い捨ての仮アカウントがまとまって作られたもの（kpi.js の burstGuests）。テスターはもともと除いている
    async function botUsers() {
      const { results: marked } = await db.prepare('SELECT id FROM users WHERE bot = 1').all();
      const { results: cands } = await db
        .prepare(`SELECT u.id AS user, u.created_at AS createdAt FROM users u
          WHERE u.google_sub IS NULL AND u.bot = 0 AND u.tester = 0
            AND NOT EXISTS (SELECT 1 FROM user_trophies t WHERE t.user_id = u.id AND t.trophy_id NOT LIKE '%.visit')
            AND NOT EXISTS (SELECT 1 FROM tutorial_steps s WHERE s.user_id = u.id AND s.step > 0)
            AND NOT EXISTS (SELECT 1 FROM plays p WHERE p.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM rta_runs r WHERE r.user_id = u.id)
            AND (SELECT COUNT(*) FROM user_days d WHERE d.user_id = u.id) <= 1`)
        .all();
      return { manual: new Set(marked.map((r) => r.id)), auto: burstGuests(cands) };
    }
    // 行のうち bot の分を除き、除いた人数（印・自動）を数える
    function dropBots(rows, bots) {
      const manual = new Set(), auto = new Set();
      const kept = rows.filter((r) => {
        if (bots.manual.has(r.user)) { manual.add(r.user); return false; }
        if (bots.auto.has(r.user)) { auto.add(r.user); return false; }
        return true;
      });
      return { kept, bots: { manual: manual.size, auto: auto.size } };
    }

    // KPI（SPEC-010 4 章）。遊んだ日の表を読み、ここで数える（いまの規模なら数千行）
    if (method === 'GET' && path === '/api/admin/kpi') {
      const game = url.searchParams.get('game') || '';
      if (game && (!Object.hasOwn(GAME_NAMES, game) || game === 'cross')) return reply(req, 400, { error: 'game' });
      const days = Math.min(400, Math.max(7, Math.floor(Number(url.searchParams.get('days')) || 30)));
      const today = jstDay(now());
      const span = { from: addDays(today, -(days - 1)), to: today, today };
      const { results: all } = await db
        .prepare('SELECT d.user_id AS user, d.game, d.day FROM user_days d LEFT JOIN users u ON u.id = d.user_id WHERE COALESCE(u.tester, 0) = 0 AND d.day <= ?1')
        .bind(today)
        .all();
      const botSet = await botUsers();
      const { kept: results } = dropBots(all, botSet);
      const of = (g) => (g ? results.filter((r) => r.game === g) : results);
      // 期間の中に遊んだ日がある人のうち、bot として除いた人数（選んだタイトルの分）
      const { bots } = dropBots(all.filter((r) => r.day >= span.from && (!game || r.game === game)), botSet);
      const main = kpi(of(game), span);
      const games = [{ game: '', name: 'タイトル横断', ...(game ? kpi(results, span).summary : main.summary) }];
      for (const g of Object.keys(GAME_NAMES)) if (g !== 'cross') games.push({ game: g, name: GAME_NAMES[g], ...(g === game ? main.summary : kpi(of(g), span).summary) });
      return reply(req, 200, { game, days, from: span.from, to: today, rows: main.days, summary: main.summary, games, bots });
    }

    // チュートリアルの漏斗（SPEC-010 6.2）。記録のあるゲームだけ選べる
    if (method === 'GET' && path === '/api/admin/tutorial') {
      const { results: gs } = await db.prepare('SELECT game, COUNT(DISTINCT user_id) AS n FROM tutorial_steps GROUP BY game ORDER BY n DESC').all();
      const games = gs.map((g) => ({ game: g.game, name: GAME_NAMES[g.game] || g.game }));
      const game = url.searchParams.get('game') || games[0]?.game || '';
      const days = Math.min(400, Math.max(1, Math.floor(Number(url.searchParams.get('days')) || 30)));
      const today = jstDay(now());
      const from = addDays(today, -(days - 1));
      if (!game) return reply(req, 200, { games, game: '', days, from, funnel: null });
      if (!games.some((g) => g.game === game)) return reply(req, 400, { error: 'game' });
      const { results: allRows } = await db
        .prepare('SELECT t.user_id AS user, t.step, t.step_id AS stepId, t.at FROM tutorial_steps t LEFT JOIN users u ON u.id = t.user_id WHERE t.game = ?1 AND COALESCE(u.tester, 0) = 0')
        .bind(game)
        .all();
      const botSet = await botUsers();
      const { kept: rows } = dropBots(allRows, botSet);
      const fromMs = Date.parse(`${from}T00:00:00+09:00`);
      // 期間の中に始めた人のうち、bot として除いた人数
      const { bots } = dropBots(allRows.filter((r) => r.step === 0 && r.at >= fromMs), botSet);
      const { results: act } = await db
        .prepare('SELECT user_id, day FROM user_days WHERE game = ?1 AND user_id IN (SELECT user_id FROM tutorial_steps WHERE game = ?1)')
        .bind(game)
        .all();
      const activeDays = new Map();
      for (const a of act) { if (!activeDays.has(a.user_id)) activeDays.set(a.user_id, new Set()); activeDays.get(a.user_id).add(a.day); }
      const funnel = tutorialFunnel(rows, { fromMs, toMs: now() + 1, activeDays, today });
      return reply(req, 200, { games, game, days, from, funnel, bots });
    }

    // テスター（SPEC-009 3.2）：分析から除く印。ランキング・記録には効かない
    if (method === 'POST' && path === '/api/admin/tester-device') {
      if (!testerCookie) return reply(req, 503, { error: 'tester' });
      const on = body.on !== false;
      if (on && markTester) await markTester(s.userId);
      audit('tester-device', { on });
      return reply(req, 200, { ok: true, testerDevice: on }, [testerCookie(on)]);
    }
    if (method === 'POST' && path === '/api/admin/tester') {
      if (typeof body.userId !== 'string' || !ID_RE.test(body.userId)) return reply(req, 400, { error: 'user' });
      const r = await db.prepare('UPDATE users SET tester = ?2 WHERE id = ?1 RETURNING id').bind(body.userId, body.on === false ? 0 : 1).first();
      if (!r) return reply(req, 404, { error: 'not_found' });
      audit('tester', { userId: body.userId, on: body.on !== false });
      return reply(req, 200, { ok: true });
    }

    if (method === 'POST' && path === '/api/admin/ban') {
      if (typeof body.userId !== 'string' || !ID_RE.test(body.userId)) return reply(req, 400, { error: 'user' });
      const user = await db.prepare('SELECT google_sub FROM users WHERE id = ?1').bind(body.userId).first();
      if (!user) return reply(req, 404, { error: 'not_found' });
      const reason = cleanReason(body.reason);
      await db
        .prepare('INSERT INTO bans (user_id, google_sub, reason, banned_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason')
        .bind(body.userId, user.google_sub ?? null, reason, now())
        .run();
      // 締め出した人の発言は部屋からも消し、接続を切る（SPEC-004 3.3）
      if (chat) await chat.purge(body.userId).catch(() => {});
      audit('ban', { userId: body.userId, reason });
      return reply(req, 200, { ok: true });
    }

    if (method === 'POST' && path === '/api/admin/unban') {
      if (typeof body.userId !== 'string' || !ID_RE.test(body.userId)) return reply(req, 400, { error: 'user' });
      const ban = await db.prepare('SELECT google_sub FROM bans WHERE user_id = ?1').bind(body.userId).first();
      if (!ban) return reply(req, 404, { error: 'not_found' });
      // 同じ会員番号の行（退会する前のアカウントの分）もまとめて解除する
      await db.prepare('DELETE FROM bans WHERE user_id = ?1 OR (google_sub IS NOT NULL AND google_sub = ?2)').bind(body.userId, ban.google_sub ?? null).run();
      audit('unban', { userId: body.userId });
      return reply(req, 200, { ok: true });
    }

    return reply(req, 404, { error: 'not_found' });
  }

  return handle;
}
