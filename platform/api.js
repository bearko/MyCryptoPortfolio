// bearko.games 共通基盤の API（SPEC-001）。段階 1：共通ログイン・仮アカウント・マイページ。
//
//   GET    /api/config         { googleClientId }
//   GET    /api/me             { user: {id, name} | null, guest: {id} | null }
//   POST   /api/guest          仮アカウントを用意する（なければ作る）→ { guest: {id} }
//   POST   /api/auth/google    { credential } Google でログイン → { user, created, merged }
//   POST   /api/auth/logout    この端末のログインを終える
//   POST   /api/me/name        { name } 表示名を変える
//   DELETE /api/me             退会（アカウントと記録をすべて消す）
//   GET    /api/trophies       トロフィーの定義 { games, trophies }
//   GET    /api/me/trophies    { account: 'login'|'guest'|null, trophies: [{id, at}] }
//   POST   /api/trophies/unlock { id } 獲得（未ログインなら仮アカウントに貯める）→ { account, unlocked, total }
//   GET    /api/rta/regulations  RTA のレギュレーション（6.6）
//   POST   /api/rta/start      { regulation } → { runId, startedAt, account }
//   POST   /api/rta/checkpoint { runId, checkpoint, igtMs, idleMs } → { splitMs, finished, timeMs, reference, best, rank }
//   POST   /api/rta/ping       { runId, idleMs } 「操作あり」
//   POST   /api/rta/abort      { runId } 中断
//   GET    /api/rta/ranking?regulation=  ランキング（ログインした人の、参考記録でない自己ベスト）
//   GET    /api/me/rta         自分の記録（参考記録も含む）
//   GET    /api/score/games    総合スコアの対象タイトル（SPEC-002）
//   POST   /api/score/submit   { game, metrics, version } 成績を送る → { score, best, improved, total }
//   GET    /api/score/ranking  総合ランキング（?game= でタイトル別）
//   GET    /api/me/scores      自分のタイトルスコアと総合スコア
//   /api/admin/*               管理画面（SPEC-003。platform/admin.js）
//
// 締め出したアカウント（表 bans。SPEC-003 5 章）は、ランキングから隠し、成績・トロフィー・RTA を 403 で受け付けない。
// Cookie（どちらも Domain=.bearko.games・HttpOnly・Secure・SameSite=Lax）：
//   bg_session … ログイン（180 日）  bg_guest … 仮アカウント（最後に使ってから 90 日）
// DB には Cookie の値を置かず、SHA-256 のハッシュだけを持つ。

import { TROPHIES, TROPHY_BY_ID, GAME_HOSTS, GAME_NAMES, crossTrophiesFor } from './trophies.js';
import { REGULATION_BY_ID, publicRegulations, judgeCheckpoint, judgeActivity, RANKING_LIMIT } from './rta.js';
import { SCORERS, PLANNED } from './scoring/index.js';
import { createAdmin } from './admin.js';

export const LOGIN_TTL = 180 * 86400e3;
export const GUEST_TTL = 90 * 86400e3;
const DAY = 86400e3;
const NAME_MAX = 16;

// 段階 2 以降で増える「user_id を持つ表」。仮アカウントの記録を移す・退会で消すときに使う
export const USER_TABLES = ['user_trophies', 'rta_runs', 'plays', 'title_scores'];
const PLAY_TTL = 90 * DAY; // 自己ベストのもとになっていない生の成績は 90 日で消す（SPEC-001 11 章）
const METRICS_MAX = 4096; // 成績の JSON の大きさの上限（バイト）
const SCORE_GAMES = Object.keys(SCORERS).map((g) => `'${g}'`).join(', '); // SQL に埋める（定数だけ）
const RTA_STALE = 2 * DAY; // これより前に始めて終わっていない計測は掃除で消す

const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*bearko\.games$/;
const NOT_BANNED = (col) => `${col} NOT IN (SELECT user_id FROM bans)`; // ランキングの集計から締め出しを外す

export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? [...name].slice(0, NAME_MAX).join('') : null;
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function createApi({ db, now = Date.now, verifyGoogle, clientId = null, cookieDomain = null, extraOrigins = [], adminSubs = [], log }) {
  const allowed = (origin) => !!origin && (ORIGIN_RE.test(origin) || extraOrigins.includes(origin));

  const cookie = (name, value, maxAgeMs) =>
    [
      `${name}=${value}`,
      cookieDomain ? `Domain=${cookieDomain}` : null,
      'Path=/',
      `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ]
      .filter(Boolean)
      .join('; ');

  function reply(req, status, body, setCookies = []) {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    const origin = req.headers.get('origin');
    if (allowed(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Vary', 'Origin');
    }
    for (const c of setCookies) headers.append('Set-Cookie', c);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  }

  // Cookie から有効なセッションを引く。使われたら期限を延ばす（書き込みは 1 日に 1 回まで）
  async function sessionOf(req, name, kind, ttl) {
    const token = parseCookies(req.headers.get('cookie'))[name];
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const hash = await sha256(token);
    const row = await db
      .prepare('SELECT s.user_id, s.expires_at, u.name, u.google_sub FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.kind = ?2')
      .bind(hash, kind)
      .first();
    if (!row || row.expires_at <= now()) return null;
    if (row.expires_at - now() < ttl - DAY) {
      await db.batch([
        db.prepare('UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2').bind(now() + ttl, hash),
        db.prepare('UPDATE users SET last_seen = ?1 WHERE id = ?2').bind(now(), row.user_id),
      ]);
    }
    return { hash, userId: row.user_id, name: row.name, sub: row.google_sub };
  }

  async function newSession(userId, kind, ttl) {
    const token = randomToken();
    await db.prepare('INSERT INTO sessions (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(await sha256(token), userId, kind, now() + ttl).run();
    return token;
  }

  // 仮アカウントの記録を本アカウントへ移し、仮アカウントを消す（SPEC-001 4.6）
  async function mergeGuest(guestId, userId) {
    // タイトルスコアは高いほうを残す（まとめる前に、仮アカウントの自己ベストを上書きで入れる）
    const stmts = [
      db
        .prepare(
          `INSERT INTO title_scores (user_id, game, score, milestone, performance, formula, play_id, updated_at)
           SELECT ?1, game, score, milestone, performance, formula, play_id, updated_at FROM title_scores WHERE user_id = ?2 AND true
           ON CONFLICT (user_id, game) DO UPDATE SET score = excluded.score, milestone = excluded.milestone, performance = excluded.performance,
             formula = excluded.formula, play_id = excluded.play_id, updated_at = excluded.updated_at
           WHERE excluded.score > title_scores.score`,
        )
        .bind(userId, guestId),
    ];
    // 仮アカウントを締め出していたら、本アカウントも締め出す（同じ人とみなす。SPEC-003 5 章）
    stmts.push(
      db
        .prepare('INSERT OR IGNORE INTO bans (user_id, google_sub, reason, banned_at) SELECT ?1, (SELECT google_sub FROM users WHERE id = ?1), reason, banned_at FROM bans WHERE user_id = ?2')
        .bind(userId, guestId),
    );
    stmts.push(db.prepare('DELETE FROM bans WHERE user_id = ?1').bind(guestId));
    for (const t of USER_TABLES) stmts.push(db.prepare(`UPDATE OR IGNORE ${t} SET user_id = ?1 WHERE user_id = ?2`).bind(userId, guestId));
    for (const t of USER_TABLES) stmts.push(db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(guestId));
    stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(guestId));
    stmts.push(db.prepare('DELETE FROM users WHERE id = ?1 AND google_sub IS NULL').bind(guestId));
    const combined = Object.entries(SCORERS).filter(([, sc]) => sc.combine);
    const had = combined.length
      ? (await db.prepare('SELECT DISTINCT game FROM plays WHERE user_id = ?1').bind(guestId).all()).results.map((r) => r.game)
      : [];
    await db.batch(stmts);
    // 成績を束ねるタイトルは、両方のアカウントの成績を束ね直す（高いほうを残すだけだと、片方だけでクリアしたレベルが消える）
    for (const [game, sc] of combined) if (had.includes(game)) await rebuildCombined(userId, game, sc);
  }

  // 締め出し（bans）の行は消さない。退会してログインし直すだけで抜けられないように（SPEC-003 5 章）
  async function deleteUser(userId) {
    // 区切りの記録は計測にぶら下がるので、計測より先に消す
    const stmts = [db.prepare('DELETE FROM rta_splits WHERE run_id IN (SELECT id FROM rta_runs WHERE user_id = ?1)').bind(userId)];
    stmts.push(...USER_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(userId)));
    stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId));
    stmts.push(db.prepare('DELETE FROM users WHERE id = ?1').bind(userId));
    await db.batch(stmts);
  }

  async function createGuest() {
    const id = randomToken().slice(0, 32);
    await db.prepare('INSERT INTO users (id, google_sub, name, created_at, last_seen) VALUES (?1, NULL, NULL, ?2, ?2)').bind(id, now()).run();
    return { id, cookie: cookie('bg_guest', await newSession(id, 'guest', GUEST_TTL), GUEST_TTL) };
  }

  const isBanned = async (userId) => !!(await db.prepare('SELECT 1 AS b FROM bans WHERE user_id = ?1').bind(userId).first());

  // 記録先のアカウント：ログイン中なら本アカウント、そうでなければ仮アカウント（なければ作る）。
  // 締め出し中なら { banned: true }（呼ぶ側は 403 を返す）
  async function accountFor(req) {
    const s = await login(req);
    if (s) return (await isBanned(s.userId)) ? { banned: true } : { userId: s.userId, kind: 'login', cookies: [] };
    const g = await guest(req);
    if (g) return (await isBanned(g.userId)) ? { banned: true } : { userId: g.userId, kind: 'guest', cookies: [] };
    const created = await createGuest();
    return { userId: created.id, kind: 'guest', cookies: [created.cookie] };
  }

  async function trophyIds(userId) {
    const { results } = await db.prepare('SELECT trophy_id FROM user_trophies WHERE user_id = ?1').bind(userId).all();
    return results.map((r) => r.trophy_id);
  }

  async function grant(userId, id) {
    const row = await db
      .prepare('INSERT INTO user_trophies (user_id, trophy_id, unlocked_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING trophy_id')
      .bind(userId, id, now())
      .first();
    return !!row;
  }

  // 横断トロフィーを判定し直し、新しく得たものを記録して返す
  async function grantCross(userId) {
    const out = [];
    for (const id of crossTrophiesFor(await trophyIds(userId))) if (await grant(userId, id)) out.push(id);
    return out;
  }

  // ゲームの Origin が、そのトロフィーのタイトルのサブドメインか
  const fromGame = (req, game) => {
    const origin = req.headers.get('origin') || '';
    return origin === `https://${GAME_HOSTS[game]}` || extraOrigins.includes(origin);
  };

  // ---------------------------------------------------------------- RTA（6 章）
  // ランキングに出るのは：完了・参考記録でない・ログインした人（仮アカウントは出さない）
  const RANKED = `r.regulation = ?1 AND r.status = 'finished' AND r.reference = 0 AND u.google_sub IS NOT NULL AND ${NOT_BANNED('r.user_id')}`;

  async function rankOf(regulation, timeMs) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM (SELECT MIN(r.time_ms) AS t FROM rta_runs r JOIN users u ON u.id = r.user_id WHERE ${RANKED} GROUP BY r.user_id) WHERE t < ?2`)
      .bind(regulation, timeMs)
      .first();
    return (row?.n ?? 0) + 1;
  }

  // 自分の計測で、まだ走っているもの
  async function ownRun(req, runId) {
    if (typeof runId !== 'string' || !/^[0-9a-f]{32}$/.test(runId)) return { error: [400, 'run'] };
    const s = (await login(req)) || (await guest(req));
    if (!s) return { error: [401, 'account'] };
    const run = await db.prepare('SELECT * FROM rta_runs WHERE id = ?1').bind(runId).first();
    if (!run || run.user_id !== s.userId) return { error: [404, 'run'] };
    if (await isBanned(s.userId)) return { error: [403, 'banned'] };
    const reg = REGULATION_BY_ID[run.regulation];
    if (!reg) return { error: [400, 'regulation'] };
    if (!fromGame(req, reg.game)) return { error: [403, 'game'] };
    if (run.status !== 'running') return { error: [409, run.status] };
    return { run, reg, account: s.sub ? 'login' : 'guest' };
  }

  async function rtaCheckpoint(req, body) {
    const o = await ownRun(req, body.runId);
    if (o.error) return reply(req, o.error[0], { error: o.error[1] });
    const { run, reg, account } = o;
    const at = now();
    const j = judgeCheckpoint(reg, run, body.checkpoint, at, Number(body.idleMs));
    if (j.error) return reply(req, 409, { error: j.error });
    const igt = Number.isFinite(Number(body.igtMs)) && body.igtMs !== null ? Math.max(0, Math.round(Number(body.igtMs))) : null;

    if (j.rejected) {
      await db.prepare("UPDATE rta_runs SET status = 'rejected', finished_at = ?2 WHERE id = ?1").bind(run.id, at).run();
      return reply(req, 200, { account, finished: true, rejected: true });
    }
    const stmts = [db.prepare('INSERT INTO rta_splits (run_id, ord, checkpoint, elapsed_ms, igt_ms) VALUES (?1, ?2, ?3, ?4, ?5)').bind(run.id, j.ord, body.checkpoint, j.elapsedMs, igt)];
    if (j.last) {
      stmts.push(
        db
          .prepare("UPDATE rta_runs SET status = 'finished', next_cp = ?2, last_active = ?3, max_idle_ms = ?4, reference = ?5, time_ms = ?6, igt_ms = ?7, finished_at = ?3 WHERE id = ?1")
          .bind(run.id, j.ord + 1, at, j.maxIdleMs, j.reference ? 1 : 0, j.elapsedMs, igt),
      );
    } else {
      stmts.push(
        db.prepare('UPDATE rta_runs SET next_cp = ?2, last_active = ?3, max_idle_ms = ?4, reference = ?5 WHERE id = ?1').bind(run.id, j.ord + 1, at, j.maxIdleMs, j.reference ? 1 : 0),
      );
    }
    await db.batch(stmts);
    const out = { account, checkpoint: body.checkpoint, splitMs: j.elapsedMs, finished: j.last, reference: j.reference };
    if (j.last) {
      const prev = await db
        .prepare("SELECT MIN(time_ms) AS t FROM rta_runs WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0 AND id <> ?3")
        .bind(run.user_id, run.regulation, run.id)
        .first();
      out.timeMs = j.elapsedMs;
      out.best = !j.reference && (prev?.t == null || j.elapsedMs < prev.t);
      out.rank = account === 'login' && !j.reference ? await rankOf(run.regulation, j.elapsedMs) : null;
    }
    return reply(req, 200, out);
  }

  // ---------------------------------------------------------------- 総合スコア（SPEC-002）
  const totalOf = async (userId) =>
    (await db.prepare(`SELECT COALESCE(SUM(score), 0) AS t FROM title_scores WHERE user_id = ?1 AND game IN (${SCORE_GAMES})`).bind(userId).first())?.t ?? 0;

  // 総合ランキングの母集団：ログインした人（仮アカウントは出さない）
  const TOTALS = `SELECT ts.user_id, u.name, SUM(ts.score) AS total, MAX(ts.updated_at) AS at FROM title_scores ts JOIN users u ON u.id = ts.user_id
    WHERE u.google_sub IS NOT NULL AND ${NOT_BANNED('ts.user_id')} AND ts.game IN (${SCORE_GAMES}) GROUP BY ts.user_id`;

  async function scoreSubmit(req, body) {
    const sc = SCORERS[body.game];
    if (!sc) return reply(req, 400, { error: 'game' });
    if (!fromGame(req, body.game)) return reply(req, 403, { error: 'game' });
    let metrics = body.metrics;
    let json = metrics && typeof metrics === 'object' && !Array.isArray(metrics) ? JSON.stringify(metrics) : null;
    if (!json || json.length > METRICS_MAX) return reply(req, 400, { error: 'metrics' });
    let r = sc.score(metrics);
    if (!r) return reply(req, 400, { error: 'metrics' });
    const acc = await accountFor(req);
    if (acc.banned) return reply(req, 403, { error: 'banned' });
    const at = now();
    // 成績を束ねるタイトル（combine）：前回の自己ベストのもとと束ねてから計算する（別の端末・古いセーブで送っても下がらない）
    if (sc.combine) {
      const base = await db
        .prepare('SELECT p.metrics FROM title_scores ts JOIN plays p ON p.id = ts.play_id WHERE ts.user_id = ?1 AND ts.game = ?2')
        .bind(acc.userId, body.game)
        .first();
      if (base) {
        metrics = sc.combine([JSON.parse(base.metrics), metrics]);
        json = JSON.stringify(metrics);
        r = sc.score(metrics);
      }
    }
    const gameVersion = typeof body.version === 'string' ? body.version.slice(0, 32) : null;
    const play = await db
      .prepare('INSERT INTO plays (user_id, game, metrics, game_version, formula, score, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id')
      .bind(acc.userId, body.game, json, gameVersion, sc.version, r.score, at)
      .first();
    const prev = await db.prepare('SELECT score FROM title_scores WHERE user_id = ?1 AND game = ?2').bind(acc.userId, body.game).first();
    const improved = !prev || r.score > prev.score;
    const stmts = [];
    if (improved) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO title_scores (user_id, game, score, milestone, performance, formula, play_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (user_id, game) DO UPDATE SET score = excluded.score, milestone = excluded.milestone, performance = excluded.performance,
               formula = excluded.formula, play_id = excluded.play_id, updated_at = excluded.updated_at`,
          )
          .bind(acc.userId, body.game, r.score, r.milestone, r.performance, sc.version, play.id, at),
      );
    }
    // 積み上げのタイトルは、いまの値と自己ベストのもとだけ残す（行を増やさない）
    if (sc.kind === 'progress') {
      stmts.push(
        db
          .prepare('DELETE FROM plays WHERE user_id = ?1 AND game = ?2 AND id <> ?3 AND id NOT IN (SELECT play_id FROM title_scores WHERE user_id = ?1 AND game = ?2)')
          .bind(acc.userId, body.game, play.id),
      );
    }
    if (stmts.length) await db.batch(stmts);
    return reply(
      req,
      200,
      { account: acc.kind, game: body.game, score: r.score, milestone: r.milestone, performance: r.performance, best: improved ? r.score : prev.score, improved, total: await totalOf(acc.userId) },
      acc.cookies,
    );
  }

  // 計算式の版が変わったタイトルの自己ベストを、保存してある生の成績から計算し直す（SPEC-001 8.4）
  async function recompute(limit = 200) {
    let done = 0;
    for (const [game, sc] of Object.entries(SCORERS)) {
      const { results } = await db.prepare('SELECT user_id FROM title_scores WHERE game = ?1 AND formula <> ?2 LIMIT ?3').bind(game, sc.version, limit).all();
      for (const { user_id } of results) {
        if (sc.combine) {
          await rebuildCombined(user_id, game, sc);
          done++;
          continue;
        }
        const plays = await db.prepare('SELECT id, metrics FROM plays WHERE user_id = ?1 AND game = ?2').bind(user_id, game).all();
        let best = null;
        const stmts = [];
        for (const p of plays.results) {
          const r = sc.score(JSON.parse(p.metrics));
          if (!r) continue;
          stmts.push(db.prepare('UPDATE plays SET score = ?2, formula = ?3 WHERE id = ?1').bind(p.id, r.score, sc.version));
          if (!best || r.score > best.score) best = { ...r, id: p.id };
        }
        if (best) {
          stmts.push(
            db
              .prepare('UPDATE title_scores SET score = ?3, milestone = ?4, performance = ?5, formula = ?6, play_id = ?7 WHERE user_id = ?1 AND game = ?2')
              .bind(user_id, game, best.score, best.milestone, best.performance, sc.version, best.id),
          );
        } else {
          stmts.push(db.prepare('DELETE FROM title_scores WHERE user_id = ?1 AND game = ?2').bind(user_id, game));
        }
        await db.batch(stmts);
        done++;
      }
    }
    return done;
  }

  // 成績を束ねるタイトル（combine）：保存してある生の成績をぜんぶ束ね、1 つの成績として保存し直して自己ベストにする
  //   （計算式の版が変わったとき・仮アカウントをまとめたとき。v1 の 1 レベルずつの成績からも計算し直せる）
  async function rebuildCombined(userId, game, sc) {
    const plays = await db.prepare('SELECT metrics FROM plays WHERE user_id = ?1 AND game = ?2').bind(userId, game).all();
    if (!plays.results.length) return;
    const metrics = sc.combine(plays.results.map((p) => JSON.parse(p.metrics)));
    const r = sc.score(metrics);
    if (!r) return;
    const at = now();
    const play = await db
      .prepare('INSERT INTO plays (user_id, game, metrics, game_version, formula, score, created_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6) RETURNING id')
      .bind(userId, game, JSON.stringify(metrics), sc.version, r.score, at)
      .first();
    await db.batch([
      db
        .prepare(
          `INSERT INTO title_scores (user_id, game, score, milestone, performance, formula, play_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT (user_id, game) DO UPDATE SET score = excluded.score, milestone = excluded.milestone, performance = excluded.performance,
             formula = excluded.formula, play_id = excluded.play_id`,
        )
        .bind(userId, game, r.score, r.milestone, r.performance, sc.version, play.id, at),
      // 束ねたので、もとの成績は要らない
      db.prepare('DELETE FROM plays WHERE user_id = ?1 AND game = ?2 AND id <> ?3').bind(userId, game, play.id),
    ]);
  }

  const login = (req) => sessionOf(req, 'bg_session', 'login', LOGIN_TTL);
  const guest = (req) => sessionOf(req, 'bg_guest', 'guest', GUEST_TTL);
  const publicUser = (s) => ({ id: s.userId, name: s.name ?? null });
  const admin = createAdmin({ db, now, login, reply, adminSubs, portalOrigins: ['https://bearko.games', ...extraOrigins], ...(log ? { log } : {}) });

  async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method;

    if (method === 'OPTIONS') {
      const res = reply(req, 204);
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      res.headers.set('Access-Control-Max-Age', '86400');
      return res;
    }
    // 書き込みは bearko.games とそのサブドメインからだけ受ける（CSRF 対策）
    if (method !== 'GET' && !allowed(req.headers.get('origin'))) return reply(req, 403, { error: 'origin' });

    const body = method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (method === 'GET' && path === '/api/config') return reply(req, 200, { googleClientId: clientId });

    if (path.startsWith('/api/admin/')) return admin(req, method, path, url, body);

    if (method === 'GET' && path === '/api/me') {
      const s = await login(req);
      if (s) return reply(req, 200, { user: publicUser(s), guest: null, ...((await isBanned(s.userId)) ? { banned: true } : {}) });
      const g = await guest(req);
      return reply(req, 200, { user: null, guest: g ? { id: g.userId } : null, ...(g && (await isBanned(g.userId)) ? { banned: true } : {}) });
    }

    if (method === 'POST' && path === '/api/guest') {
      if (await login(req)) return reply(req, 409, { error: 'logged_in' });
      const g = await guest(req);
      if (g) return reply(req, 200, { guest: { id: g.userId } });
      const created = await createGuest();
      return reply(req, 200, { guest: { id: created.id } }, [created.cookie]);
    }

    if (method === 'POST' && path === '/api/auth/google') {
      if (!verifyGoogle) return reply(req, 503, { error: 'not_configured' });
      const claims = await verifyGoogle(body.credential);
      if (!claims) return reply(req, 401, { error: 'credential' });
      let user = await db.prepare('SELECT id, name FROM users WHERE google_sub = ?1').bind(claims.sub).first();
      const created = !user;
      if (!user) {
        user = { id: randomToken().slice(0, 32), name: null };
        await db.prepare('INSERT INTO users (id, google_sub, name, created_at, last_seen) VALUES (?1, ?2, NULL, ?3, ?3)').bind(user.id, claims.sub, now()).run();
        // 退会する前に締め出されていた会員番号なら、新しいアカウントにも付け直す（SPEC-003 5 章）
        await db
          .prepare('INSERT OR IGNORE INTO bans (user_id, google_sub, reason, banned_at) SELECT ?1, google_sub, reason, MIN(banned_at) FROM bans WHERE google_sub = ?2 GROUP BY google_sub')
          .bind(user.id, claims.sub)
          .run();
      }
      const cookies = [];
      const g = await guest(req);
      let mergedTrophies = 0;
      if (g && g.userId !== user.id) {
        const before = (await trophyIds(user.id)).length;
        await mergeGuest(g.userId, user.id);
        await grantCross(user.id);
        mergedTrophies = (await trophyIds(user.id)).length - before;
      }
      if (g) cookies.push(cookie('bg_guest', '', 0));
      const old = await login(req);
      if (old) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(old.hash).run();
      cookies.push(cookie('bg_session', await newSession(user.id, 'login', LOGIN_TTL), LOGIN_TTL));
      return reply(req, 200, { user: { id: user.id, name: user.name ?? null }, created, merged: !!g, mergedTrophies }, cookies);
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      const s = await login(req);
      if (s) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(s.hash).run();
      return reply(req, 200, { ok: true }, [cookie('bg_session', '', 0)]);
    }

    if (method === 'POST' && path === '/api/me/name') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      const name = cleanName(body.name);
      if (!name) return reply(req, 400, { error: 'name' });
      await db.prepare('UPDATE users SET name = ?1 WHERE id = ?2').bind(name, s.userId).run();
      return reply(req, 200, { user: { id: s.userId, name } });
    }

    if (method === 'DELETE' && path === '/api/me') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      await deleteUser(s.userId);
      return reply(req, 200, { ok: true }, [cookie('bg_session', '', 0)]);
    }

    if (method === 'GET' && path === '/api/trophies') {
      const res = reply(req, 200, {
        games: GAME_NAMES,
        trophies: TROPHIES.map(({ id, game, name, nameFrom, description, clear }) => ({ id, game, name, nameFrom: nameFrom ?? null, description, clear: !!clear })),
      });
      res.headers.set('Cache-Control', 'public, max-age=300');
      return res;
    }

    if (method === 'GET' && path === '/api/me/trophies') {
      const s = (await login(req)) || (await guest(req));
      if (!s) return reply(req, 200, { account: null, trophies: [] });
      const { results } = await db.prepare('SELECT trophy_id, unlocked_at FROM user_trophies WHERE user_id = ?1 ORDER BY unlocked_at').bind(s.userId).all();
      return reply(req, 200, { account: s.sub ? 'login' : 'guest', trophies: results.map((r) => ({ id: r.trophy_id, at: r.unlocked_at })) });
    }

    if (method === 'POST' && path === '/api/trophies/unlock') {
      const t = TROPHY_BY_ID[body.id];
      if (!t || t.game === 'cross') return reply(req, 400, { error: 'trophy' });
      if (!fromGame(req, t.game)) return reply(req, 403, { error: 'game' });
      const acc = await accountFor(req);
      if (acc.banned) return reply(req, 403, { error: 'banned' });
      const unlocked = [];
      if (await grant(acc.userId, t.id)) unlocked.push(t.id, ...(await grantCross(acc.userId)));
      const total = (await trophyIds(acc.userId)).length;
      return reply(req, 200, { account: acc.kind, unlocked, total }, acc.cookies);
    }

    if (method === 'GET' && path === '/api/score/games') {
      const games = [
        ...Object.entries(SCORERS).map(([id, sc]) => ({ id, name: GAME_NAMES[id] || id, kind: sc.kind, formula: sc.version, status: 'live' })),
        ...PLANNED.map((id) => ({ id, name: GAME_NAMES[id] || id, status: 'planned' })),
      ];
      const res = reply(req, 200, { games });
      res.headers.set('Cache-Control', 'public, max-age=300');
      return res;
    }

    if (method === 'POST' && path === '/api/score/submit') return scoreSubmit(req, body);

    if (method === 'GET' && path === '/api/score/ranking') {
      const s = await login(req);
      const game = url.searchParams.get('game');
      if (game) {
        if (!SCORERS[game]) return reply(req, 400, { error: 'game' });
        const { results } = await db
          .prepare(`SELECT ts.user_id, u.name, ts.score, ts.updated_at AS at FROM title_scores ts JOIN users u ON u.id = ts.user_id
             WHERE u.google_sub IS NOT NULL AND ${NOT_BANNED('ts.user_id')} AND ts.game = ?1 ORDER BY ts.score DESC, ts.updated_at LIMIT ?2`)
          .bind(game, RANKING_LIMIT)
          .all();
        let rank = 0;
        let prev = null;
        const entries = results.map((r, i) => {
          if (r.score !== prev) rank = i + 1;
          prev = r.score;
          return { rank, name: r.name ?? null, score: r.score, at: r.at, me: !!s && s.userId === r.user_id };
        });
        return reply(req, 200, { game, entries });
      }
      const { results } = await db.prepare(`${TOTALS} ORDER BY total DESC, at LIMIT ?1`).bind(RANKING_LIMIT).all();
      const parts = await db
        .prepare(`SELECT user_id, game, score FROM title_scores WHERE game IN (${SCORE_GAMES}) AND user_id IN (SELECT user_id FROM (${TOTALS} ORDER BY total DESC, at LIMIT ?1))`)
        .bind(RANKING_LIMIT)
        .all();
      const byUser = {};
      for (const p of parts.results) (byUser[p.user_id] ||= {})[p.game] = p.score;
      let rank = 0;
      let prev = null;
      const entries = results.map((r, i) => {
        if (r.total !== prev) rank = i + 1;
        prev = r.total;
        return { rank, name: r.name ?? null, total: r.total, titles: byUser[r.user_id] || {}, at: r.at, me: !!s && s.userId === r.user_id };
      });
      let me = null;
      if (s) {
        const total = await totalOf(s.userId);
        if (total > 0) {
          const above = await db.prepare(`SELECT COUNT(*) AS n FROM (${TOTALS}) WHERE total > ?1`).bind(total).first();
          me = { rank: (above?.n ?? 0) + 1, total };
        }
      }
      return reply(req, 200, { entries, me });
    }

    if (method === 'GET' && path === '/api/me/scores') {
      const s = (await login(req)) || (await guest(req));
      if (!s) return reply(req, 200, { account: null, total: 0, titles: [] });
      const { results } = await db
        .prepare(`SELECT game, score, milestone, performance, updated_at FROM title_scores WHERE user_id = ?1 AND game IN (${SCORE_GAMES}) ORDER BY score DESC`)
        .bind(s.userId)
        .all();
      return reply(req, 200, {
        account: s.sub ? 'login' : 'guest',
        total: results.reduce((a, r) => a + r.score, 0),
        titles: results.map((r) => ({ game: r.game, score: r.score, milestone: r.milestone, performance: r.performance, at: r.updated_at })),
      });
    }

    if (method === 'GET' && path === '/api/rta/regulations') {
      const res = reply(req, 200, { games: GAME_NAMES, regulations: publicRegulations() });
      res.headers.set('Cache-Control', 'public, max-age=300');
      return res;
    }

    if (method === 'POST' && path === '/api/rta/start') {
      const reg = REGULATION_BY_ID[body.regulation];
      if (!reg || reg.deprecated) return reply(req, 400, { error: 'regulation' });
      if (!fromGame(req, reg.game)) return reply(req, 403, { error: 'game' });
      const acc = await accountFor(req);
      if (acc.banned) return reply(req, 403, { error: 'banned' });
      const id = randomToken().slice(0, 32);
      const at = now();
      await db.batch([
        // 同時に走れるのは 1 本。終わっていない計測は中断にする
        db.prepare("UPDATE rta_runs SET status = 'abandoned' WHERE user_id = ?1 AND status = 'running'").bind(acc.userId),
        db.prepare('INSERT INTO rta_runs (id, user_id, regulation, started_at, last_active) VALUES (?1, ?2, ?3, ?4, ?4)').bind(id, acc.userId, reg.id, at),
      ]);
      return reply(req, 200, { account: acc.kind, runId: id, regulation: reg.id, startedAt: at }, acc.cookies);
    }

    if (method === 'POST' && path === '/api/rta/checkpoint') return rtaCheckpoint(req, body);

    if (method === 'POST' && path === '/api/rta/ping') {
      const o = await ownRun(req, body.runId);
      if (o.error) return reply(req, o.error[0], { error: o.error[1] });
      const at = now();
      const a = judgeActivity(o.run, at, Number(body.idleMs));
      await db.prepare('UPDATE rta_runs SET last_active = ?2, max_idle_ms = ?3, reference = ?4 WHERE id = ?1').bind(o.run.id, at, a.maxIdleMs, a.reference ? 1 : 0).run();
      return reply(req, 200, { reference: a.reference });
    }

    if (method === 'POST' && path === '/api/rta/abort') {
      const o = await ownRun(req, body.runId);
      if (o.error) return reply(req, o.error[0], { error: o.error[1] });
      await db.prepare("UPDATE rta_runs SET status = 'abandoned' WHERE id = ?1").bind(o.run.id).run();
      return reply(req, 200, { ok: true });
    }

    if (method === 'GET' && path === '/api/rta/ranking') {
      const reg = REGULATION_BY_ID[url.searchParams.get('regulation')];
      if (!reg) return reply(req, 400, { error: 'regulation' });
      const { results } = await db
        .prepare(`SELECT r.user_id, u.name, MIN(r.time_ms) AS time_ms, r.igt_ms, r.finished_at FROM rta_runs r JOIN users u ON u.id = r.user_id WHERE ${RANKED} GROUP BY r.user_id ORDER BY time_ms, r.finished_at LIMIT ?2`)
        .bind(reg.id, RANKING_LIMIT)
        .all();
      const s = await login(req);
      let rank = 0;
      let prev = null;
      const entries = results.map((r, i) => {
        if (r.time_ms !== prev) rank = i + 1;
        prev = r.time_ms;
        return { rank, name: r.name ?? null, timeMs: r.time_ms, igtMs: r.igt_ms ?? null, at: r.finished_at, me: !!s && s.userId === r.user_id };
      });
      let me = null;
      if (s) {
        const best = await db
          .prepare("SELECT MIN(time_ms) AS t FROM rta_runs WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0")
          .bind(s.userId, reg.id)
          .first();
        if (best?.t != null) me = { rank: await rankOf(reg.id, best.t), timeMs: best.t };
      }
      return reply(req, 200, { regulation: reg.id, entries, me });
    }

    if (method === 'GET' && path === '/api/me/rta') {
      const s = (await login(req)) || (await guest(req));
      if (!s) return reply(req, 200, { account: null, runs: [] });
      const recent = "SELECT id FROM rta_runs WHERE user_id = ?1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 50";
      const runs = await db
        .prepare(`SELECT id, regulation, time_ms, igt_ms, reference, finished_at FROM rta_runs WHERE id IN (${recent}) ORDER BY finished_at DESC`)
        .bind(s.userId)
        .all();
      const splits = await db.prepare(`SELECT run_id, ord, checkpoint, elapsed_ms, igt_ms FROM rta_splits WHERE run_id IN (${recent}) ORDER BY run_id, ord`).bind(s.userId).all();
      const byRun = {};
      for (const x of splits.results) (byRun[x.run_id] ||= []).push({ checkpoint: x.checkpoint, elapsedMs: x.elapsed_ms, igtMs: x.igt_ms ?? null });
      return reply(req, 200, {
        account: s.sub ? 'login' : 'guest',
        runs: runs.results.map((r) => ({ id: r.id, regulation: r.regulation, timeMs: r.time_ms, igtMs: r.igt_ms ?? null, reference: !!r.reference, at: r.finished_at, splits: byRun[r.id] || [] })),
      });
    }

    return reply(req, 404, { error: 'not_found' });
  }

  // 毎日の掃除：期限切れのセッションと、最後に使ってから 90 日たった仮アカウント
  async function cleanup() {
    const cutoff = now() - GUEST_TTL;
    const { results } = await db.prepare('SELECT id FROM users WHERE google_sub IS NULL AND last_seen < ?1 LIMIT 500').bind(cutoff).all();
    for (const { id } of results) await deleteUser(id);
    await db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now()).run();
    // 消えた仮アカウントの締め出し（会員番号がないので、残しても付け直せない）
    await db.prepare('DELETE FROM bans WHERE google_sub IS NULL AND user_id NOT IN (SELECT id FROM users)').run();
    // 中断・無効の計測と、2 日たっても終わっていない計測（区切りの記録ごと）
    const stale = "SELECT id FROM rta_runs WHERE status IN ('abandoned', 'rejected') OR (status = 'running' AND started_at < ?1)";
    await db.batch([
      db.prepare(`DELETE FROM rta_splits WHERE run_id IN (${stale})`).bind(now() - RTA_STALE),
      db.prepare(`DELETE FROM rta_runs WHERE id IN (${stale})`).bind(now() - RTA_STALE),
    ]);
    // 自己ベストのもとになっていない、90 日より古い生の成績
    await db.prepare('DELETE FROM plays WHERE created_at < ?1 AND id NOT IN (SELECT play_id FROM title_scores)').bind(now() - PLAY_TTL).run();
    const recomputed = await recompute();
    return { guests: results.length, recomputed };
  }

  return {
    async fetch(req) {
      try {
        return await handle(req);
      } catch (e) {
        console.error(e);
        return reply(req, 500, { error: 'server' });
      }
    },
    cleanup,
  };
}
