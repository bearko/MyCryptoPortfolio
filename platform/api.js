// bearko.games 共通基盤の API（SPEC-001）。段階 1：共通ログイン・仮アカウント・マイページ。
//
//   GET    /api/config         { googleClientId }
//   GET    /api/me             { user: {id, name, avatar} | null, guest: {id} | null }
//   POST   /api/guest          仮アカウントを用意する（なければ作る）→ { guest: {id} }
//   POST   /api/auth/google    { credential } Google でログイン → { user, created, merged }
//   POST   /api/auth/logout    この端末のログインを終える
//   POST   /api/me/name        { name } 表示名を変える
//   POST   /api/me/avatar      { id } アイコンを変える（"hero:1001" / "ext:5106" / null。SPEC-005 5.3。全ゲーム共通）。
//                               使えるのは最初からの 3 体と、持っているトロフィーのアイコンだけ（SPEC-006。ほかは 403 locked）
//   DELETE /api/me             退会（アカウントと記録をすべて消す）
//   GET    /api/trophies       トロフィーの定義 { games, trophies }
//   GET    /api/me/trophies    { account: 'login'|'guest'|null, trophies: [{id, at}] }
//   POST   /api/trophies/unlock { id } 獲得（未ログインなら仮アカウントに貯める）→ { account, unlocked, total }
//   GET    /api/rta/regulations  RTA のレギュレーション（6.6）
//   POST   /api/rta/start      { regulation } → { runId, startedAt, account }
//   POST   /api/rta/checkpoint { runId, checkpoint, igtMs, idleMs } → { splitMs, finished, timeMs, reference, best, rank }
//   POST   /api/rta/ping       { runId, idleMs } 「操作あり」
//   POST   /api/presence       { game, page } 同時接続数の「操作あり」（SPEC-007）→ 204
//   POST   /api/rta/abort      { runId } 中断
//   GET    /api/rta/ranking?regulation=  ランキング（ログインした人の、参考記録でない自己ベスト。横断 RTA も）
//   POST   /api/rta/cross/start { regulation } 横断 RTA の挑戦を始める（ポータルから。6.14）→ { attempt }
//   POST   /api/rta/cross/abort  挑戦をやめる
//   GET    /api/rta/cross/current 挑戦中のもの（区間ごとの記録）
//   GET    /api/me/rta         自分の記録（参考記録も含む）
//   GET    /api/score/games    総合スコアの対象タイトル（SPEC-002）
//   POST   /api/score/submit   { game, metrics, version } 成績を送る → { score, best, improved, total }
//   GET    /api/score/ranking  総合ランキング（?game= でタイトル別）
//   GET    /api/me/scores      自分のタイトルスコアと総合スコア
//   /api/admin/*               管理画面（SPEC-003。platform/admin.js）
//   GET    /api/chat/ws        全体チャットの接続（WebSocket。SPEC-004。platform/chat.js）
//   GET    /api/chat/messages  直近の親 50 件と返信（?after= で新しいもの、?before= で遡る、?order=likes でいいね順。SPEC-005）
//   GET    /api/chat/stats     タイトルごとの直近 24 時間の件数（にぎわい。SPEC-005 5.5）
//   GET    /api/me/chat        自分の発言
//   DELETE /api/chat/messages/<id> 自分の発言を消す（管理者はだれのでも）
//
// 締め出したアカウント（表 bans。SPEC-003 5 章）は、ランキングから隠し、成績・トロフィー・RTA を 403 で受け付けない。
// Cookie（どちらも bearko.games だけに付く __Host- つき・HttpOnly・Secure・SameSite=Lax。SPEC-001 4.7）：
//   __Host-bg_session … ログイン（180 日）  __Host-bg_guest … 仮アカウント（最後に使ってから 90 日）
//   古い Domain=.bearko.games の bg_session / bg_guest は読んで、__Host- へ移してから消す（ゲームのサブドメインへ送らない）
// DB には Cookie の値を置かず、SHA-256 のハッシュだけを持つ。

import { presenceKey, PRESENCE_COOKIE, COOKIE_TTL_MS as PRESENCE_TTL_MS } from './presence.js';
import { TROPHIES, TROPHY_BY_ID, GAME_HOSTS, GAME_NAMES, GAME_URLS, crossTrophiesFor, DEFAULT_AVATAR, STARTER_AVATARS, AVATAR_TOTAL, canUseAvatar, kindOf, rarityOf } from './trophies.js';
import { REGULATION_BY_ID, CROSS_BY_ID, publicRegulations, judgeCheckpoint, judgeActivity, judgeCrossSegment, igtRejected, RANKING_LIMIT } from './rta.js';
import { SCORERS, PLANNED } from './scoring/index.js';
import { createAdmin } from './admin.js';
import { cleanGame, cleanAvatar } from './chat.js';

export const LOGIN_TTL = 180 * 86400e3;
export const GUEST_TTL = 90 * 86400e3;
const DAY = 86400e3;
const NAME_MAX = 16;

// 段階 2 以降で増える「user_id を持つ表」。仮アカウントの記録を移す・退会で消すときに使う
export const USER_TABLES = ['user_trophies', 'rta_runs', 'plays', 'title_scores', 'rta_cross'];
const PLAY_TTL = 90 * DAY; // 自己ベストのもとになっていない生の成績は 90 日で消す（SPEC-001 11 章）
const METRICS_MAX = 4096; // 成績の JSON の大きさの上限（バイト）
const SCORE_GAMES = Object.keys(SCORERS).map((g) => `'${g}'`).join(', '); // SQL に埋める（定数だけ）
const RTA_STALE = 2 * DAY; // これより前に始めて終わっていない計測は掃除で消す

// 受け付ける Origin は、ポータルと GAME_HOSTS のタイトルだけ（正規表現の *.bearko.games にしない。
// 使っていないサブドメインが乗っ取られても、そこから Cookie つきで API を呼べないように）
export const PORTAL_ORIGINS = ['https://bearko.games', 'https://www.bearko.games'];
export const API_ORIGINS = new Set([...PORTAL_ORIGINS, ...Object.values(GAME_HOSTS).map((h) => `https://${h}`)]);
// Cookie の名前（新 → 古）。__Host- は Domain を持てないので、bearko.games だけに付く
export const SESSION_COOKIE = '__Host-bg_session';
export const GUEST_COOKIE = '__Host-bg_guest';
const LEGACY_COOKIE = { [SESSION_COOKIE]: 'bg_session', [GUEST_COOKIE]: 'bg_guest' };
const IGT_MAX = { ms: 1e10, turns: 1e6, weeks: 1e4 }; // IGT の上限（表示が壊れない程度に。RTA の判定には使わない）

/** 回数の上限を超えたとき（呼ぶ側の fetch が 429 にする） */
class RateLimited extends Error {}
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

// cookieDomain：古い Cookie（Domain=.bearko.games）を消すときだけ使う。guestLimit(req)：仮アカウントを作ってよいか（回数の上限）
export function createApi({ db, now = Date.now, verifyGoogle, clientId = null, cookieDomain = null, extraOrigins = [], adminSubs = [], chat = null, guestLimit = null, presence = null, presenceLimit = null, log }) {
  const allowed = (origin) => !!origin && (API_ORIGINS.has(origin) || extraOrigins.includes(origin));

  const cookie = (name, value, maxAgeMs) =>
    [
      `${name}=${value}`,
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
    const jar = parseCookies(req.headers.get('cookie'));
    const token = jar[name] || jar[LEGACY_COOKIE[name]];
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const hash = await sha256(token);
    const row = await db
      .prepare('SELECT s.user_id, s.expires_at, u.name, u.google_sub, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.kind = ?2')
      .bind(hash, kind)
      .first();
    if (!row || row.expires_at <= now()) return null;
    if (row.expires_at - now() < ttl - DAY) {
      await db.batch([
        db.prepare('UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2').bind(now() + ttl, hash),
        db.prepare('UPDATE users SET last_seen = ?1 WHERE id = ?2').bind(now(), row.user_id),
      ]);
    }
    return { hash, userId: row.user_id, name: row.name, sub: row.google_sub, avatar: row.avatar ?? null };
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
    // 区切りの記録は計測にぶら下がるので、計測より先に消す（横断 RTA の区間も同じ）
    const stmts = [
      db.prepare('DELETE FROM rta_splits WHERE run_id IN (SELECT id FROM rta_runs WHERE user_id = ?1)').bind(userId),
      db.prepare('DELETE FROM rta_cross_segments WHERE cross_id IN (SELECT id FROM rta_cross WHERE user_id = ?1)').bind(userId),
    ];
    stmts.push(...USER_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(userId)));
    stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId));
    stmts.push(db.prepare('DELETE FROM users WHERE id = ?1').bind(userId));
    await db.batch(stmts);
    // 退会した人の発言は部屋からも消す（SPEC-004 3.5）
    if (chatRoom) await chatRoom.purge(userId).catch(() => {});
  }

  async function createGuest(req) {
    if (guestLimit && !(await guestLimit(req))) throw new RateLimited();
    const id = randomToken().slice(0, 32);
    await db.prepare('INSERT INTO users (id, google_sub, name, created_at, last_seen) VALUES (?1, NULL, NULL, ?2, ?2)').bind(id, now()).run();
    return { id, cookie: cookie(GUEST_COOKIE, await newSession(id, 'guest', GUEST_TTL), GUEST_TTL) };
  }

  const isBanned = async (userId) => !!(await db.prepare('SELECT 1 AS b FROM bans WHERE user_id = ?1').bind(userId).first());

  // ---------------------------------------------------------------- 全体チャット（SPEC-004）。部屋は Durable Object が 1 つ（platform/chat.js）
  const room = () => chat.get(chat.idFromName('global'));
  const roomJson = async (path, init) => {
    const res = await room().fetch(new Request(`https://chat${path}`, init));
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const chatRoom = chat
    ? {
        list: () => roomJson('/admin/list'),
        remove: (id, uid, admin) => roomJson('/delete', { method: 'POST', body: JSON.stringify({ id, uid, admin }) }),
        purge: (uid) => roomJson('/purge', { method: 'POST', body: JSON.stringify({ uid }) }),
      }
    : null;

  // 記録先のアカウント：ログイン中なら本アカウント、そうでなければ仮アカウント（なければ作る）。
  // 締め出し中なら { banned: true }（呼ぶ側は 403 を返す）
  async function accountFor(req) {
    const s = await login(req);
    if (s) return (await isBanned(s.userId)) ? { banned: true } : { userId: s.userId, kind: 'login', cookies: [] };
    const g = await guest(req);
    if (g) return (await isBanned(g.userId)) ? { banned: true } : { userId: g.userId, kind: 'guest', cookies: [] };
    const created = await createGuest(req);
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

  // IGT で並べるレギュレーション（rank: 'igt'。6.18）：1 人 1 件（IGT が少なく、同じなら実時間が短いもの）
  const BEST_BY_IGT = `SELECT * FROM (SELECT r.user_id, u.name, r.time_ms, r.igt_ms, r.finished_at, ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.igt_ms, r.time_ms, r.finished_at) AS rn FROM rta_runs r JOIN users u ON u.id = r.user_id WHERE ${RANKED}) WHERE rn = 1`;
  async function rankOfIgt(regulation, igt, timeMs) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM (${BEST_BY_IGT}) WHERE igt_ms < ?2 OR (igt_ms = ?2 AND time_ms < ?3)`)
      .bind(regulation, igt, timeMs)
      .first();
    return (row?.n ?? 0) + 1;
  }
  async function myBestIgt(userId, regulation) {
    return db
      .prepare("SELECT igt_ms, time_ms FROM rta_runs WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0 ORDER BY igt_ms, time_ms LIMIT 1")
      .bind(userId, regulation)
      .first();
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
    const igt = Number.isFinite(Number(body.igtMs)) && body.igtMs !== null ? Math.min(IGT_MAX[reg.igt || 'ms'] ?? IGT_MAX.ms, Math.max(0, Math.round(Number(body.igtMs)))) : null;

    // IGT で並べるレギュレーションは、区切りの IGT がありえない値ならはじく（6.18）
    let igtBad = false;
    if (reg.rank === 'igt') {
      const prev = j.ord > 0 ? await db.prepare('SELECT igt_ms FROM rta_splits WHERE run_id = ?1 AND ord = ?2').bind(run.id, j.ord - 1).first() : null;
      igtBad = igtRejected(reg, j.ord, igt, prev?.igt_ms ?? null);
    }
    if (j.rejected || igtBad) {
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
    const cross = await noteCross(run, body.checkpoint, at, j.elapsedMs, j.reference, account);
    if (cross) out.cross = cross;
    if (j.last && reg.rank === 'igt') {
      const prev = await db
        .prepare("SELECT igt_ms, time_ms FROM rta_runs WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0 AND id <> ?3 ORDER BY igt_ms, time_ms LIMIT 1")
        .bind(run.user_id, run.regulation, run.id)
        .first();
      out.timeMs = j.elapsedMs;
      out.igtMs = igt;
      out.best = !j.reference && (!prev || igt < prev.igt_ms || (igt === prev.igt_ms && j.elapsedMs < prev.time_ms));
      out.rank = account === 'login' && !j.reference ? await rankOfIgt(run.regulation, igt, j.elapsedMs) : null;
    } else if (j.last) {
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

  // ---------------------------------------------------------------- タイトルをまたぐ RTA（6.14）
  // 挑戦はポータル（bearko.games）で始める。各タイトルの計測はいつもどおりで、区切りを受け取ったときに区間として数える
  const fromPortal = (req) => {
    const origin = req.headers.get('origin') || '';
    return origin === 'https://bearko.games' || extraOrigins.includes(origin);
  };
  const CROSS_RANKED = `c.regulation = ?1 AND c.status = 'finished' AND c.reference = 0 AND u.google_sub IS NOT NULL AND ${NOT_BANNED('c.user_id')}`;

  async function crossRankOf(regulation, timeMs) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM (SELECT MIN(c.time_ms) AS t FROM rta_cross c JOIN users u ON u.id = c.user_id WHERE ${CROSS_RANKED} GROUP BY c.user_id) WHERE t < ?2`)
      .bind(regulation, timeMs)
      .first();
    return (row?.n ?? 0) + 1;
  }

  // 挑戦中のもの。期限を過ぎていたら、ここで「期限切れ」にする
  async function crossAttempt(userId) {
    const a = await db.prepare("SELECT * FROM rta_cross WHERE user_id = ?1 AND status = 'running' ORDER BY started_at DESC LIMIT 1").bind(userId).first();
    if (!a) return null;
    const cross = CROSS_BY_ID[a.regulation];
    if (!cross || now() > a.started_at + cross.windowMs) {
      await db.prepare("UPDATE rta_cross SET status = 'expired' WHERE id = ?1").bind(a.id).run();
      return null;
    }
    return a;
  }

  const crossSegments = async (crossId) =>
    (await db.prepare('SELECT seg, run_id, ms, reference, at FROM rta_cross_segments WHERE cross_id = ?1 ORDER BY seg').bind(crossId).all()).results;

  function crossView(a, segs) {
    const cross = CROSS_BY_ID[a.regulation];
    return {
      id: a.id,
      regulation: a.regulation,
      status: a.status,
      startedAt: a.started_at,
      deadline: a.started_at + cross.windowMs,
      timeMs: a.time_ms ?? null,
      reference: !!a.reference,
      segments: cross.segments.map((sg, i) => {
        const x = segs.find((r) => r.seg === i);
        return { label: sg.label, game: sg.game, done: !!x, ms: x ? x.ms : null, reference: x ? !!x.reference : false };
      }),
    };
  }

  // 区切りを受け取ったとき：挑戦中で、まだ埋まっていない区間にあたれば数える。全区間がそろったら挑戦を終える
  async function noteCross(run, checkpointId, at, ms, reference, account) {
    const a = await crossAttempt(run.user_id);
    if (!a) return null;
    const cross = CROSS_BY_ID[a.regulation];
    const segs = await crossSegments(a.id);
    const seg = judgeCrossSegment(cross, a, run, run.regulation, checkpointId, at, segs.map((r) => r.seg));
    if (seg < 0) return null;
    const all = [...segs, { seg, ms, reference: reference ? 1 : 0 }];
    const finished = all.length === cross.segments.length;
    const timeMs = all.reduce((t, r) => t + r.ms, 0);
    const ref = all.some((r) => r.reference);
    const stmts = [db.prepare('INSERT INTO rta_cross_segments (cross_id, seg, run_id, ms, reference, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(a.id, seg, run.id, ms, reference ? 1 : 0, at)];
    if (finished) {
      stmts.push(db.prepare("UPDATE rta_cross SET status = 'finished', reference = ?2, time_ms = ?3, finished_at = ?4 WHERE id = ?1").bind(a.id, ref ? 1 : 0, timeMs, at));
    } else if (reference) {
      stmts.push(db.prepare('UPDATE rta_cross SET reference = 1 WHERE id = ?1').bind(a.id));
    }
    let best = null;
    if (finished && !ref) {
      const prev = await db
        .prepare("SELECT MIN(time_ms) AS t FROM rta_cross WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0")
        .bind(run.user_id, a.regulation)
        .first();
      best = prev?.t == null || timeMs < prev.t;
    }
    await db.batch(stmts);
    return {
      regulation: a.regulation,
      name: cross.name,
      segment: seg,
      label: cross.segments[seg].label,
      segmentMs: ms,
      filled: all.length,
      total: cross.segments.length,
      finished,
      timeMs: finished ? timeMs : null,
      reference: ref,
      best: finished ? !!best : null,
      rank: finished && !ref && account === 'login' ? await crossRankOf(a.regulation, timeMs) : null,
    };
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
        let prevMetrics = null;
        try { prevMetrics = JSON.parse(base.metrics); } catch { prevMetrics = null; }
        if (prevMetrics) {
          metrics = sc.combine([prevMetrics, metrics]);
          json = JSON.stringify(metrics);
          r = sc.score(metrics);
          if (!r || json.length > METRICS_MAX) return reply(req, 400, { error: 'metrics' });
        }
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

  const login = (req) => sessionOf(req, SESSION_COOKIE, 'login', LOGIN_TTL);
  const guest = (req) => sessionOf(req, GUEST_COOKIE, 'guest', GUEST_TTL);
  const publicUser = (s) => ({ id: s.userId, name: s.name ?? null, avatar: s.avatar ?? null });
  const admin = createAdmin({ db, now, login, reply, adminSubs, portalOrigins: [...PORTAL_ORIGINS, ...extraOrigins], chat: chatRoom, ...(log ? { log } : {}) });

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

    // ---- 同時接続数（SPEC-007）。「操作あり」を数える部屋に渡すだけ。D1 は読まない・書かない。アカウントとは結びつけない
    if (method === 'POST' && path === '/api/presence') {
      if (!presence) return reply(req, 204);
      if (presenceLimit && !(await presenceLimit(req))) return reply(req, 429, { error: 'rate' });
      const k = presenceKey(parseCookies(req.headers.get('cookie'))[PRESENCE_COOKIE], body.page);
      await presence.get(presence.idFromName('global')).fetch(new Request(`https://presence/beat?at=${now()}`, { method: 'POST', body: JSON.stringify({ k }) }));
      return reply(req, 204, null, [cookie(PRESENCE_COOKIE, k, PRESENCE_TTL_MS)]);
    }

    // ---- 全体チャット（SPEC-004）。本人の確認はここで済ませ、部屋には { uid, name, game, banned } を渡す
    if (path === '/api/chat/ws' || path === '/api/chat/messages' || path === '/api/chat/stats' || path === '/api/me/chat' || path.startsWith('/api/chat/messages/')) {
      if (!chatRoom) return reply(req, 503, { error: 'chat' });
    }
    if (method === 'GET' && path === '/api/chat/ws') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return reply(req, 426, { error: 'upgrade' });
      if (!allowed(req.headers.get('origin'))) return reply(req, 403, { error: 'origin' });
      const s = await login(req);
      const user = s ? { uid: s.userId, name: s.name ?? null, avatar: s.avatar ?? null, banned: await isBanned(s.userId) } : {};
      user.game = cleanGame(url.searchParams.get('game'));
      return room().fetch(new Request(`https://chat/ws?u=${encodeURIComponent(JSON.stringify(user))}`, { headers: { Upgrade: 'websocket' } }));
    }
    if (method === 'GET' && path === '/api/chat/messages') {
      const q = new URLSearchParams();
      for (const k of ['after', 'before', 'order', 'limit']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
      const s = await login(req);
      if (s) q.set('uid', s.userId);   // 本人が押したいいねも返す
      const r = await roomJson(`/messages?${q}`);
      return reply(req, r.status, r.body);
    }
    if (method === 'GET' && path === '/api/chat/stats') {
      const r = await roomJson('/stats');
      const res = reply(req, r.status, r.body);
      if (r.status === 200) res.headers.set('Cache-Control', 'public, max-age=60');
      return res;
    }
    if (method === 'GET' && path === '/api/me/chat') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      const r = await roomJson(`/mine?uid=${encodeURIComponent(s.userId)}`);
      return reply(req, r.status, r.body);
    }
    if (method === 'DELETE' && path.startsWith('/api/chat/messages/')) {
      const id = Number(path.slice('/api/chat/messages/'.length));
      if (!Number.isInteger(id) || id <= 0) return reply(req, 400, { error: 'id' });
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      const r = await chatRoom.remove(id, s.userId, adminSubs.includes(s.sub));
      return reply(req, r.status, r.body);
    }

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
      const created = await createGuest(req);
      return reply(req, 200, { guest: { id: created.id } }, [created.cookie]);
    }

    if (method === 'POST' && path === '/api/auth/google') {
      if (!verifyGoogle) return reply(req, 503, { error: 'not_configured' });
      const claims = await verifyGoogle(body.credential);
      if (!claims) return reply(req, 401, { error: 'credential' });
      let user = await db.prepare('SELECT id, name, avatar FROM users WHERE google_sub = ?1').bind(claims.sub).first();
      const created = !user;
      if (!user) {
        user = { id: randomToken().slice(0, 32), name: null, avatar: null };
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
      if (g) cookies.push(cookie(GUEST_COOKIE, '', 0));
      const old = await login(req);
      if (old) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(old.hash).run();
      cookies.push(cookie(SESSION_COOKIE, await newSession(user.id, 'login', LOGIN_TTL), LOGIN_TTL));
      return reply(req, 200, { user: { id: user.id, name: user.name ?? null, avatar: user.avatar ?? null }, created, merged: !!g, mergedTrophies }, cookies);
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      const s = await login(req);
      if (s) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(s.hash).run();
      return reply(req, 200, { ok: true }, [cookie(SESSION_COOKIE, '', 0)]);
    }

    if (method === 'POST' && path === '/api/me/name') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      const name = cleanName(body.name);
      if (!name) return reply(req, 400, { error: 'name' });
      await db.prepare('UPDATE users SET name = ?1 WHERE id = ?2').bind(name, s.userId).run();
      return reply(req, 200, { user: { id: s.userId, name, avatar: s.avatar ?? null } });
    }

    // SPEC-005 5.3：共通のプレイヤーアイコン。資産リポジトリのヒーロー／エクステンションの id。null で既定の絵に戻す
    if (method === 'POST' && path === '/api/me/avatar') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      if (body.id != null && typeof body.id !== 'string') return reply(req, 400, { error: 'avatar' });
      const id = body.id == null ? null : cleanAvatar(body.id);
      if (body.id != null && !id) return reply(req, 400, { error: 'avatar' });
      // SPEC-006：最初からの 3 体と、持っているトロフィーのアイコンだけ
      if (id != null) {
        const { results } = await db.prepare('SELECT trophy_id FROM user_trophies WHERE user_id = ?1').bind(s.userId).all();
        if (!canUseAvatar(id, results.map((r) => r.trophy_id))) return reply(req, 403, { error: 'locked' });
      }
      await db.prepare('UPDATE users SET avatar = ?1 WHERE id = ?2').bind(id, s.userId).run();
      return reply(req, 200, { user: { id: s.userId, name: s.name ?? null, avatar: id } });
    }

    if (method === 'DELETE' && path === '/api/me') {
      const s = await login(req);
      if (!s) return reply(req, 401, { error: 'login' });
      await deleteUser(s.userId);
      return reply(req, 200, { ok: true }, [cookie(SESSION_COOKIE, '', 0)]);
    }

    if (method === 'GET' && path === '/api/trophies') {
      const res = reply(req, 200, {
        games: GAME_NAMES,
        gameUrls: GAME_URLS,   // SPEC-008 アチーブメントの画面から「このゲームを遊ぶ」
        // kind / rarity は SPEC-008（アチーブメント）。ヒーローかエクステンションか・マイクリのレアリティ
        trophies: TROPHIES.map(({ id, game, name, nameFrom, description, clear, avatar, avatarName }) => ({ id, game, name, nameFrom: nameFrom ?? null, description, clear: !!clear, avatar, avatarName, kind: kindOf(avatar), rarity: rarityOf(avatar) })),
        avatars: { default: DEFAULT_AVATAR, starters: STARTER_AVATARS, total: AVATAR_TOTAL },   // SPEC-006 アイコン図鑑
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

    if (method === 'POST' && path === '/api/rta/cross/start') {
      const cross = CROSS_BY_ID[body.regulation];
      if (!cross || cross.deprecated) return reply(req, 400, { error: 'regulation' });
      if (!fromPortal(req)) return reply(req, 403, { error: 'origin' });
      const acc = await accountFor(req);
      if (acc.banned) return reply(req, 403, { error: 'banned' });
      const id = randomToken().slice(0, 32);
      const at = now();
      await db.batch([
        // 挑戦は 1 人 1 本。終わっていない挑戦はやめたことにする
        db.prepare("UPDATE rta_cross SET status = 'abandoned' WHERE user_id = ?1 AND status = 'running'").bind(acc.userId),
        db.prepare('INSERT INTO rta_cross (id, user_id, regulation, started_at) VALUES (?1, ?2, ?3, ?4)').bind(id, acc.userId, cross.id, at),
      ]);
      const a = await db.prepare('SELECT * FROM rta_cross WHERE id = ?1').bind(id).first();
      return reply(req, 200, { account: acc.kind, attempt: crossView(a, []) }, acc.cookies);
    }

    if (method === 'POST' && path === '/api/rta/cross/abort') {
      if (!fromPortal(req)) return reply(req, 403, { error: 'origin' });
      const s = (await login(req)) || (await guest(req));
      if (!s) return reply(req, 401, { error: 'account' });
      await db.prepare("UPDATE rta_cross SET status = 'abandoned' WHERE user_id = ?1 AND status = 'running'").bind(s.userId).run();
      return reply(req, 200, { ok: true });
    }

    if (method === 'GET' && path === '/api/rta/cross/current') {
      const s = (await login(req)) || (await guest(req));
      if (!s) return reply(req, 200, { account: null, attempt: null });
      const a = await crossAttempt(s.userId);
      return reply(req, 200, { account: s.sub ? 'login' : 'guest', attempt: a ? crossView(a, await crossSegments(a.id)) : null });
    }

    if (method === 'GET' && path === '/api/rta/ranking' && CROSS_BY_ID[url.searchParams.get('regulation')]) {
      const cross = CROSS_BY_ID[url.searchParams.get('regulation')];
      const { results } = await db
        .prepare(`SELECT c.user_id, u.name, MIN(c.time_ms) AS time_ms, c.finished_at FROM rta_cross c JOIN users u ON u.id = c.user_id WHERE ${CROSS_RANKED} GROUP BY c.user_id ORDER BY time_ms, c.finished_at LIMIT ?2`)
        .bind(cross.id, RANKING_LIMIT)
        .all();
      const s = await login(req);
      let rank = 0;
      let prev = null;
      const entries = results.map((r, i) => {
        if (r.time_ms !== prev) rank = i + 1;
        prev = r.time_ms;
        return { rank, name: r.name ?? null, timeMs: r.time_ms, igtMs: null, at: r.finished_at, me: !!s && s.userId === r.user_id };
      });
      let me = null;
      if (s) {
        const best = await db
          .prepare("SELECT MIN(time_ms) AS t FROM rta_cross WHERE user_id = ?1 AND regulation = ?2 AND status = 'finished' AND reference = 0")
          .bind(s.userId, cross.id)
          .first();
        if (best?.t != null) me = { rank: await crossRankOf(cross.id, best.t), timeMs: best.t };
      }
      return reply(req, 200, { regulation: cross.id, entries, me });
    }

    if (method === 'GET' && path === '/api/rta/ranking') {
      const reg = REGULATION_BY_ID[url.searchParams.get('regulation')];
      if (!reg) return reply(req, 400, { error: 'regulation' });
      if (reg.rank === 'igt') {
        // IGT（週など）の少ない順、同じなら実時間（6.18）
        const { results } = await db.prepare(`${BEST_BY_IGT} ORDER BY igt_ms, time_ms, finished_at LIMIT ?2`).bind(reg.id, RANKING_LIMIT).all();
        const s = await login(req);
        let rank = 0;
        let prevKey = null;
        const entries = results.map((r, i) => {
          const key = `${r.igt_ms}:${r.time_ms}`;
          if (key !== prevKey) rank = i + 1;
          prevKey = key;
          return { rank, name: r.name ?? null, timeMs: r.time_ms, igtMs: r.igt_ms ?? null, at: r.finished_at, me: !!s && s.userId === r.user_id };
        });
        let me = null;
        if (s) {
          const best = await myBestIgt(s.userId, reg.id);
          if (best) me = { rank: await rankOfIgt(reg.id, best.igt_ms, best.time_ms), timeMs: best.time_ms, igtMs: best.igt_ms };
        }
        return reply(req, 200, { regulation: reg.id, rankBy: 'igt', igt: reg.igt, entries, me });
      }
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
      const crosses = await db
        .prepare("SELECT * FROM rta_cross WHERE user_id = ?1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 20")
        .bind(s.userId)
        .all();
      const cross = [];
      for (const a of crosses.results) if (CROSS_BY_ID[a.regulation]) cross.push({ ...crossView(a, await crossSegments(a.id)), at: a.finished_at });
      return reply(req, 200, {
        account: s.sub ? 'login' : 'guest',
        runs: runs.results.map((r) => ({ id: r.id, regulation: r.regulation, timeMs: r.time_ms, igtMs: r.igt_ms ?? null, reference: !!r.reference, at: r.finished_at, splits: byRun[r.id] || [] })),
        cross,
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
    // 横断 RTA：やめた・期限切れの挑戦と、2 日たっても終わっていない挑戦（区間の記録ごと）
    const staleCross = "SELECT id FROM rta_cross WHERE status IN ('abandoned', 'expired') OR (status = 'running' AND started_at < ?1)";
    await db.batch([
      db.prepare(`DELETE FROM rta_cross_segments WHERE cross_id IN (${staleCross})`).bind(now() - RTA_STALE),
      db.prepare(`DELETE FROM rta_cross WHERE id IN (${staleCross})`).bind(now() - RTA_STALE),
    ]);
    // 自己ベストのもとになっていない、90 日より古い生の成績
    await db.prepare('DELETE FROM plays WHERE created_at < ?1 AND id NOT IN (SELECT play_id FROM title_scores)').bind(now() - PLAY_TTL).run();
    const recomputed = await recompute();
    return { guests: results.length, recomputed };
  }

  // 古い Cookie（Domain=.bearko.games の bg_session / bg_guest）を __Host- へ移し、古いほうを消す。
  // その応答がもう同じ Cookie を書いている（ログイン・ログアウト）なら、移さずに古いほうを消すだけ
  function migrateCookies(req, res) {
    if (res.status === 101 || res.webSocket) return res;   // チャットの接続（ヘッダーを書き換えられない）
    const jar = parseCookies(req.headers.get('cookie'));
    if (!jar.bg_session && !jar.bg_guest) return res;
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const [now_, old] of Object.entries(LEGACY_COOKIE)) {
      if (!jar[old]) continue;
      const writes = set.some((c) => c.startsWith(`${now_}=`));
      if (!jar[now_] && !writes && /^[0-9a-f]{64}$/.test(jar[old])) res.headers.append('Set-Cookie', cookie(now_, jar[old], now_ === SESSION_COOKIE ? LOGIN_TTL : GUEST_TTL));
      res.headers.append('Set-Cookie', [`${old}=`, cookieDomain ? `Domain=${cookieDomain}` : null, 'Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax'].filter(Boolean).join('; '));
    }
    return res;
  }

  return {
    async fetch(req) {
      try {
        return migrateCookies(req, await handle(req));
      } catch (e) {
        if (e instanceof RateLimited) return reply(req, 429, { error: 'rate' });
        console.error(e);
        return reply(req, 500, { error: 'server' });
      }
    },
    cleanup,
  };
}
