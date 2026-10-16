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
//
// Cookie（どちらも Domain=.bearko.games・HttpOnly・Secure・SameSite=Lax）：
//   bg_session … ログイン（180 日）  bg_guest … 仮アカウント（最後に使ってから 90 日）
// DB には Cookie の値を置かず、SHA-256 のハッシュだけを持つ。

import { TROPHIES, TROPHY_BY_ID, GAME_HOSTS, GAME_NAMES, crossTrophiesFor } from './trophies.js';

export const LOGIN_TTL = 180 * 86400e3;
export const GUEST_TTL = 90 * 86400e3;
const DAY = 86400e3;
const NAME_MAX = 16;

// 段階 2 以降で増える「user_id を持つ表」。仮アカウントの記録を移す・退会で消すときに使う
export const USER_TABLES = ['user_trophies'];

const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*bearko\.games$/;

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

export function createApi({ db, now = Date.now, verifyGoogle, clientId = null, cookieDomain = null, extraOrigins = [] }) {
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
    const stmts = USER_TABLES.map((t) => db.prepare(`UPDATE OR IGNORE ${t} SET user_id = ?1 WHERE user_id = ?2`).bind(userId, guestId));
    for (const t of USER_TABLES) stmts.push(db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(guestId));
    stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(guestId));
    stmts.push(db.prepare('DELETE FROM users WHERE id = ?1 AND google_sub IS NULL').bind(guestId));
    await db.batch(stmts);
  }

  async function deleteUser(userId) {
    const stmts = USER_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(userId));
    stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId));
    stmts.push(db.prepare('DELETE FROM users WHERE id = ?1').bind(userId));
    await db.batch(stmts);
  }

  async function createGuest() {
    const id = randomToken().slice(0, 32);
    await db.prepare('INSERT INTO users (id, google_sub, name, created_at, last_seen) VALUES (?1, NULL, NULL, ?2, ?2)').bind(id, now()).run();
    return { id, cookie: cookie('bg_guest', await newSession(id, 'guest', GUEST_TTL), GUEST_TTL) };
  }

  // 記録先のアカウント：ログイン中なら本アカウント、そうでなければ仮アカウント（なければ作る）
  async function accountFor(req) {
    const s = await login(req);
    if (s) return { userId: s.userId, kind: 'login', cookies: [] };
    const g = await guest(req);
    if (g) return { userId: g.userId, kind: 'guest', cookies: [] };
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

  const login = (req) => sessionOf(req, 'bg_session', 'login', LOGIN_TTL);
  const guest = (req) => sessionOf(req, 'bg_guest', 'guest', GUEST_TTL);
  const publicUser = (s) => ({ id: s.userId, name: s.name ?? null });

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

    if (method === 'GET' && path === '/api/me') {
      const s = await login(req);
      if (s) return reply(req, 200, { user: publicUser(s), guest: null });
      const g = await guest(req);
      return reply(req, 200, { user: null, guest: g ? { id: g.userId } : null });
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
        trophies: TROPHIES.map(({ id, game, name, description, clear }) => ({ id, game, name, description, clear: !!clear })),
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
      const unlocked = [];
      if (await grant(acc.userId, t.id)) unlocked.push(t.id, ...(await grantCross(acc.userId)));
      const total = (await trophyIds(acc.userId)).length;
      return reply(req, 200, { account: acc.kind, unlocked, total }, acc.cookies);
    }

    return reply(req, 404, { error: 'not_found' });
  }

  // 毎日の掃除：期限切れのセッションと、最後に使ってから 90 日たった仮アカウント
  async function cleanup() {
    const cutoff = now() - GUEST_TTL;
    const { results } = await db.prepare('SELECT id FROM users WHERE google_sub IS NULL AND last_seen < ?1 LIMIT 500').bind(cutoff).all();
    for (const { id } of results) await deleteUser(id);
    await db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now()).run();
    return { guests: results.length };
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
