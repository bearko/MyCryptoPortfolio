// 管理画面の API（SPEC-003）。管理者は Google の会員番号（sub）の一覧（シークレット ADMIN_SUBS）で見分ける。
//
//   GET  /api/admin/me              { admin, user, sub } sub はログインしている本人の会員番号（設定用）
//   GET  /api/admin/scores          タイトルごとの点数の分布と上位 10 件
//   POST /api/admin/score/delete    { userId, game } 総合スコアの記録（自己ベストと生の成績）を消す
//   GET  /api/admin/rta?regulation=&order=recent|time  RTA の完了した記録（100 件まで）
//   POST /api/admin/rta/delete      { runId } RTA の記録を消す
//   GET  /api/admin/users?q=        プレイヤーを探す（名前か ID）
//   GET  /api/admin/bans            締め出し中の一覧
//   POST /api/admin/ban             { userId, reason } 締め出す
//   POST /api/admin/unban           { userId } 解除する
//
// 締め出しの効き目（ランキングから隠す・記録を受け付けない）は api.js の側にある。

import { SCORERS } from './scoring/index.js';
import { REGULATION_BY_ID, publicRegulations } from './rta.js';
import { GAME_NAMES } from './trophies.js';

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
export function createAdmin({ db, now, login, reply, adminSubs = [], portalOrigins = [], log = console.log }) {
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
      u.id IN (SELECT user_id FROM bans) AS banned`;
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
      return reply(req, 200, { admin: isAdmin(s), user: s ? { id: s.userId, name: s.name ?? null } : null, sub: s?.sub ?? null });
    }
    if (!s) return reply(req, 401, { error: 'login' });
    if (!isAdmin(s)) return reply(req, 403, { error: 'admin' });
    const audit = (action, detail) => log('[admin]', JSON.stringify({ by: s.userId, action, ...detail }));

    if (method === 'GET' && path === '/api/admin/scores') return scores(req);
    if (method === 'GET' && path === '/api/admin/rta') return rta(req, url);
    if (method === 'GET' && path === '/api/admin/users') return users(req, url);
    if (method === 'GET' && path === '/api/admin/bans') return bans(req);

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

    if (method === 'POST' && path === '/api/admin/ban') {
      if (typeof body.userId !== 'string' || !ID_RE.test(body.userId)) return reply(req, 400, { error: 'user' });
      const user = await db.prepare('SELECT google_sub FROM users WHERE id = ?1').bind(body.userId).first();
      if (!user) return reply(req, 404, { error: 'not_found' });
      const reason = cleanReason(body.reason);
      await db
        .prepare('INSERT INTO bans (user_id, google_sub, reason, banned_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason')
        .bind(body.userId, user.google_sub ?? null, reason, now())
        .run();
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
