// 全体チャット（SPEC-004・SPEC-005）。部屋は Durable Object「ChatRoom」が 1 つだけ（idFromName('global')）。
//
//   Worker（api.js）── /api/chat/ws ──▶ ChatRoom.fetch('/ws?u=…')   休止つき WebSocket（Hibernation API）
//                  ── /api/chat/messages ─▶ ChatRoom.fetch('/messages?after=|before=&order=')
//                  ── /api/chat/stats ────▶ ChatRoom.fetch('/stats')
//                  ── /api/me/chat ───────▶ ChatRoom.fetch('/mine?uid=')
//                  ── DELETE / 管理 ──────▶ ChatRoom.fetch('/delete' | '/purge' | '/admin/list')
//
// - 本人の確認は Worker が cookie で済ませ、部屋には { uid, name, avatar, game, banned } を渡す（部屋は D1 を読まない）
// - 発言は部屋の SQLite に置き、直近 2,000 件・30 日で切る（1 時間ごとのアラーム）
// - 連投の上限（2 秒に 1 件・10 分に 60 件）は部屋が数える（SQLite の直近の行から。眠りから覚めても数え直せる）
// - SPEC-005：返信（1 段）・いいね（1 人 1 件 1 回）・編集（本人。編集済みの印）
// 純関数（cleanText / cleanGame / cleanAvatar / userFromParam / denyReason / rateLimited）は platform/test/chat.test.mjs で試す。

export const MAX_TEXT = 200;        // 1 件の文字数（コードポイント）
export const HISTORY = 50;          // つないだ直後に送る親の件数（返信はその分も）
export const ADMIN_LIST = 200;      // 管理画面に出す件数
export const KEEP = 2000;           // 残す件数（SPEC-005：500 → 2,000）
export const KEEP_MS = 30 * 86400e3; // 残す期間（SPEC-005：7 日 → 30 日）
export const MIN_GAP_MS = 2000;     // 同じ人の次の発言まで
export const BURST = 60;            // 発言：10 分あたり
export const LIKE_BURST = 120;      // いいね：10 分あたり
export const EDIT_BURST = 30;       // 編集：10 分あたり
export const BURST_MS = 600e3;
export const STATS_MS = 86400e3;    // にぎわい：直近 24 時間
export const TRIM_EVERY_MS = 3600e3;
export const GAME_RE = /^[a-z0-9-]{1,24}$/;
export const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const AVATAR_RE = /^(hero|ext):[0-9]{1,6}$/;   // 資産リポジトリのヒーロー・エクステンションの id（SPEC-005 5.3）

/** 本文を整える：制御文字を落とし、前後の空白を削る。1〜200 文字でなければ null */
export function cleanText(raw) {
  if (typeof raw !== 'string') return null;
  // 制御文字・ゼロ幅・行の区切り（1 行の発言にする）
  const t = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029﻿]/g, '').trim();
  const n = [...t].length;
  return n >= 1 && n <= MAX_TEXT ? t : null;
}

/** ゲームの札（SDK の init({ game }) の値）。合わなければ portal */
export function cleanGame(raw) {
  return typeof raw === 'string' && GAME_RE.test(raw) ? raw : 'portal';
}

/** アイコンの id（"hero:1001" / "ext:5106"）。合わなければ null（既定の絵） */
export function cleanAvatar(raw) {
  return typeof raw === 'string' && AVATAR_RE.test(raw) ? raw : null;
}

/** Worker が /ws?u= に載せた本人の情報を読む。壊れていれば未ログイン扱い */
export function userFromParam(raw) {
  let u = {};
  try { u = JSON.parse(raw || '{}') || {}; } catch { u = {}; }
  const uid = typeof u.uid === 'string' && UID_RE.test(u.uid) ? u.uid : null;
  const name = uid && typeof u.name === 'string' && u.name.trim() ? u.name.trim().slice(0, 16) : null;
  return { uid, name, avatar: uid ? cleanAvatar(u.avatar) : null, game: cleanGame(u.game), banned: !!u.banned && !!uid };
}

/** 発言できないときの理由（SPEC-004 3.4）。できれば null */
export function denyReason(user) {
  if (!user?.uid) return 'login';
  if (user.banned) return 'banned';
  if (!user.name) return 'name';
  return null;
}

/** 連投の判定（純関数）。last: 最後の発言の時刻（無ければ null）、burst: 10 分の件数 */
export function rateLimited(now, last, burst) {
  if (last != null && now - last < MIN_GAP_MS) return true;
  return burst >= BURST;
}

/**
 * いいね・編集の連打を数える（部屋のメモリ。眠ると消えるが、連打は起きているあいだに来る）。
 * map: uid → { n, since }。10 分の窓で数え、max を超えたら true
 */
export function hitLimited(map, uid, now, max) {
  let e = map.get(uid);
  if (!e || now - e.since > BURST_MS) { e = { n: 0, since: now }; map.set(uid, e); }
  e.n++;
  return e.n > max;
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const row2msg = (r) => ({
  id: r.id, uid: r.uid, name: r.name, avatar: r.avatar ?? null, game: r.game, text: r.text, at: r.at,
  parent: r.parent ?? null, editedAt: r.edited_at ?? null, likes: r.likes ?? 0,
});

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.now = () => Date.now();
    this.likeHits = new Map();   // いいねの連打（uid → { n, since }）
    this.editHits = new Map();   // 編集の連打
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT NOT NULL, game TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, parent INTEGER, edited_at INTEGER, likes INTEGER NOT NULL DEFAULT 0, avatar TEXT);' +
        'CREATE INDEX IF NOT EXISTS messages_uid ON messages (uid);' +
        'CREATE INDEX IF NOT EXISTS messages_at ON messages (at);' +
        'CREATE TABLE IF NOT EXISTS likes (msg INTEGER NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (msg, uid));' +
        'CREATE INDEX IF NOT EXISTS likes_uid ON likes (uid);',
    );
    // SPEC-005：1.x で作った表に列を足す（既にあれば SQLite がエラーを返すので黙って進む）
    for (const ddl of [
      'ALTER TABLE messages ADD COLUMN parent INTEGER',
      'ALTER TABLE messages ADD COLUMN edited_at INTEGER',
      'ALTER TABLE messages ADD COLUMN likes INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE messages ADD COLUMN avatar TEXT',
    ]) {
      try { this.sql.exec(ddl); } catch { /* 列はもうある */ }
    }
    try { this.sql.exec('CREATE INDEX IF NOT EXISTS messages_parent ON messages (parent)'); } catch { /* 無視 */ }
    // ping は部屋を起こさずに pong（休止の節約）
    if (typeof WebSocketRequestResponsePair !== 'undefined' && ctx.setWebSocketAutoResponse) {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  // ---------------------------------------------------------------- 読む
  /**
   * 親 limit 件とその返信。after > 0 なら after より新しい親だけ、before > 0 なら before より古い親（遡る）。
   * order が 'likes' ならいいねの多い順（返す並びもその順）。それ以外は古い → 新しい（1.x の客がそのまま読める）
   */
  recent(limit = HISTORY, after = 0, { before = 0, order = 'new' } = {}) {
    const lim = Math.max(1, Math.min(200, Number(limit) || HISTORY));
    const byLikes = order === 'likes';
    const sort = byLikes ? 'ORDER BY likes DESC, id DESC' : 'ORDER BY id DESC';
    let roots;
    if (after > 0) roots = this.sql.exec(`SELECT * FROM messages WHERE parent IS NULL AND id > ? ${sort} LIMIT ?`, after, lim).toArray();
    else if (before > 0) roots = this.sql.exec(`SELECT * FROM messages WHERE parent IS NULL AND id < ? ${sort} LIMIT ?`, before, lim).toArray();
    else roots = this.sql.exec(`SELECT * FROM messages WHERE parent IS NULL ${sort} LIMIT ?`, lim).toArray();
    if (!byLikes) roots.reverse();
    const replies = this.repliesOf(roots.map((r) => r.id));
    return [...roots.map(row2msg), ...replies.map(row2msg)];
  }

  repliesOf(ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return this.sql.exec(`SELECT * FROM messages WHERE parent IN (${marks}) ORDER BY id ASC`, ...ids).toArray();
  }

  mine(uid, limit = 100) {
    return this.sql.exec('SELECT * FROM messages WHERE uid = ? ORDER BY id DESC LIMIT ?', uid, limit).toArray().map(row2msg);
  }

  /** その人がいいねした id（渡した id の中から） */
  likedBy(uid, ids) {
    if (!uid || !ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return this.sql.exec(`SELECT msg FROM likes WHERE uid = ? AND msg IN (${marks})`, uid, ...ids).toArray().map((r) => r.msg);
  }

  count() {
    return this.sql.exec('SELECT COUNT(*) AS n FROM messages').one().n;
  }

  /** にぎわい：タイトルごとの直近 24 時間の件数（SPEC-005 5.5） */
  stats() {
    const rows = this.sql.exec('SELECT game, COUNT(*) AS n FROM messages WHERE at > ? GROUP BY game', this.now() - STATS_MS).toArray();
    const games = {};
    for (const r of rows) games[r.game] = r.n;
    return { games, total: this.count() };
  }

  // ---------------------------------------------------------------- 書く
  /** 発言。parent を渡すと返信（親は根の発言だけ。返信への返信は同じ親に付ける） */
  post(user, text, parent = null) {
    const deny = denyReason(user);
    if (deny) return { err: deny };
    const clean = cleanText(text);
    if (clean == null) return { err: 'long' };
    let parentId = null;
    if (parent != null) {
      parentId = Number(parent);
      if (!Number.isInteger(parentId) || parentId <= 0) return { err: 'parent' };
      const row = this.sql.exec('SELECT id, parent FROM messages WHERE id = ?', parentId).toArray()[0];
      if (!row) return { err: 'parent' };
      if (row.parent != null) parentId = row.parent;   // 返信への返信は、その親の下に並べる（1 段だけ）
    }
    const now = this.now();
    const r = this.sql.exec('SELECT MAX(at) AS last, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS burst FROM messages WHERE uid = ?', now - BURST_MS, user.uid).one();
    if (rateLimited(now, r.last ?? null, r.burst ?? 0)) return { err: 'rate' };
    const id = this.sql.exec(
      'INSERT INTO messages (uid, name, game, text, at, parent, avatar) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      user.uid, user.name, user.game, clean, now, parentId, user.avatar ?? null,
    ).one().id;
    const msg = { id, uid: user.uid, name: user.name, avatar: user.avatar ?? null, game: user.game, text: clean, at: now, parent: parentId, editedAt: null, likes: 0 };
    this.broadcast({ t: 'msg', ...msg });
    this.armAlarm();
    return { msg };
  }

  /** いいね（on: true）／取り消し（on: false）。1 人 1 件 1 回。数だけ全員に配る */
  like(user, id, on = true) {
    const deny = denyReason(user);
    if (deny) return { err: deny };
    const mid = Number(id);
    if (!Number.isInteger(mid) || mid <= 0) return { err: 'not_found' };
    const row = this.sql.exec('SELECT id FROM messages WHERE id = ?', mid).toArray()[0];
    if (!row) return { err: 'not_found' };
    const now = this.now();
    if (hitLimited(this.likeHits, user.uid, now, LIKE_BURST)) return { err: 'rate' };
    if (on) this.sql.exec('INSERT OR IGNORE INTO likes (msg, uid, at) VALUES (?, ?, ?)', mid, user.uid, now);
    else this.sql.exec('DELETE FROM likes WHERE msg = ? AND uid = ?', mid, user.uid);
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM likes WHERE msg = ?', mid).one().n;
    this.sql.exec('UPDATE messages SET likes = ? WHERE id = ?', n, mid);
    this.broadcast({ t: 'like', id: mid, n });
    return { ok: true, id: mid, n, on: !!on };
  }

  /** 本文を直す（本人だけ）。「編集済み」の印として editedAt を付ける */
  edit(user, id, text) {
    const deny = denyReason(user);
    if (deny) return { err: deny };
    const mid = Number(id);
    if (!Number.isInteger(mid) || mid <= 0) return { err: 'not_found' };
    const row = this.sql.exec('SELECT id, uid, text FROM messages WHERE id = ?', mid).toArray()[0];
    if (!row) return { err: 'not_found' };
    if (row.uid !== user.uid) return { err: 'owner' };
    const clean = cleanText(text);
    if (clean == null) return { err: 'long' };
    const now = this.now();
    if (clean === row.text) return { ok: true, id: mid, text: clean, editedAt: null, same: true };
    if (hitLimited(this.editHits, user.uid, now, EDIT_BURST)) return { err: 'rate' };
    this.sql.exec('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?', clean, now, mid);
    this.broadcast({ t: 'edit', id: mid, text: clean, editedAt: now });
    return { ok: true, id: mid, text: clean, editedAt: now };
  }

  /** 1 件消す。本人か管理者だけ。根なら返信も一緒に消える。消したら全員に知らせる */
  remove(id, uid, admin = false) {
    const row = this.sql.exec('SELECT id, uid, parent FROM messages WHERE id = ?', id).toArray()[0];
    if (!row) return { ok: false, status: 404 };
    if (!admin && row.uid !== uid) return { ok: false, status: 403 };
    if (row.parent == null) {
      this.sql.exec('DELETE FROM likes WHERE msg IN (SELECT id FROM messages WHERE parent = ?)', id);
      this.sql.exec('DELETE FROM messages WHERE parent = ?', id);
    }
    this.sql.exec('DELETE FROM likes WHERE msg = ?', id);
    this.sql.exec('DELETE FROM messages WHERE id = ?', id);
    this.broadcast({ t: 'del', id });
    return { ok: true };
  }

  /** その人の発言（とその返信・いいね）をすべて消し、接続も切る（締め出し・退会） */
  purge(uid) {
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM messages WHERE uid = ?', uid).one().n;
    if (n > 0) {
      this.sql.exec('DELETE FROM likes WHERE msg IN (SELECT id FROM messages WHERE parent IN (SELECT id FROM messages WHERE uid = ?))', uid);
      this.sql.exec('DELETE FROM messages WHERE parent IN (SELECT id FROM messages WHERE uid = ?)', uid);
      this.sql.exec('DELETE FROM likes WHERE msg IN (SELECT id FROM messages WHERE uid = ?)', uid);
      this.sql.exec('DELETE FROM messages WHERE uid = ?', uid);
    }
    // その人が押したいいねも戻す
    this.sql.exec('UPDATE messages SET likes = likes - 1 WHERE id IN (SELECT msg FROM likes WHERE uid = ?) AND likes > 0', uid);
    this.sql.exec('DELETE FROM likes WHERE uid = ?', uid);
    this.broadcast({ t: 'purge', uid });
    for (const ws of this.sockets(uid)) {
      try { ws.close(4003, 'banned'); } catch { /* もう閉じている */ }
    }
    return { ok: true, deleted: n };
  }

  /** 古いもの・多すぎるものを切る。親が消えた返信と、消えた発言のいいねも片づける */
  trim() {
    const now = this.now();
    this.sql.exec('DELETE FROM messages WHERE at < ?', now - KEEP_MS);
    this.sql.exec('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT ?)', KEEP);
    this.sql.exec('DELETE FROM messages WHERE parent IS NOT NULL AND parent NOT IN (SELECT id FROM messages)');
    this.sql.exec('DELETE FROM likes WHERE msg NOT IN (SELECT id FROM messages)');
    return this.count();
  }

  armAlarm() {
    const st = this.ctx.storage;
    if (!st.getAlarm || !st.setAlarm) return;
    Promise.resolve(st.getAlarm()).then((at) => { if (at == null) return st.setAlarm(this.now() + TRIM_EVERY_MS); }).catch(() => {});
  }

  async alarm() {
    const left = this.trim();
    if (left > 0 && this.ctx.storage.setAlarm) await this.ctx.storage.setAlarm(this.now() + TRIM_EVERY_MS);
  }

  // ---------------------------------------------------------------- 接続
  sockets(tag) {
    try { return this.ctx.getWebSockets(tag) || []; } catch { return []; }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.sockets()) {
      try { ws.send(s); } catch { /* 切れた接続は次の close で片づく */ }
    }
  }

  /** つないだ直後に送るもの：直近の発言と、本人の情報と、本人が押したいいね */
  hello(user) {
    const msgs = this.recent(HISTORY);
    return {
      t: 'hist',
      msgs,
      you: user.uid ? { uid: user.uid, name: user.name, avatar: user.avatar ?? null, can: denyReason(user) } : null,
      liked: this.likedBy(user.uid, msgs.map((m) => m.id)),
    };
  }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (path === '/ws') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json(426, { error: 'upgrade' });
      if (typeof WebSocketPair === 'undefined') return json(501, { error: 'websocket' });
      const user = userFromParam(url.searchParams.get('u'));
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.serializeAttachment(user);
      this.ctx.acceptWebSocket(server, user.uid ? [user.uid] : []);
      try { server.send(JSON.stringify(this.hello(user))); } catch { /* 開いた直後に閉じた */ }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/messages' && req.method === 'GET') {
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
      const before = Math.max(0, Number(url.searchParams.get('before')) || 0);
      const order = url.searchParams.get('order') === 'likes' ? 'likes' : 'new';
      const limit = Number(url.searchParams.get('limit')) || HISTORY;
      const msgs = this.recent(limit, after, { before, order });
      const uid = url.searchParams.get('uid') || '';
      return json(200, { msgs, liked: UID_RE.test(uid) ? this.likedBy(uid, msgs.map((m) => m.id)) : [] });
    }
    if (path === '/stats' && req.method === 'GET') return json(200, this.stats());
    if (path === '/mine' && req.method === 'GET') {
      const uid = url.searchParams.get('uid') || '';
      return json(200, { msgs: UID_RE.test(uid) ? this.mine(uid) : [] });
    }
    if (path === '/delete' && req.method === 'POST') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json(400, { error: 'id' });
      const r = this.remove(id, typeof body.uid === 'string' ? body.uid : null, body.admin === true);
      return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.status === 404 ? 'not_found' : 'owner' });
    }
    if (path === '/purge' && req.method === 'POST') {
      if (typeof body.uid !== 'string' || !UID_RE.test(body.uid)) return json(400, { error: 'uid' });
      return json(200, this.purge(body.uid));
    }
    if (path === '/admin/list' && req.method === 'GET') {
      const rows = this.sql.exec('SELECT * FROM messages ORDER BY id DESC LIMIT ?', ADMIN_LIST).toArray().reverse();
      return json(200, { msgs: rows.map(row2msg), total: this.count() });
    }
    if (path === '/trim' && req.method === 'POST') return json(200, { left: this.trim() });
    return json(404, { error: 'not_found' });
  }

  /** 客からの 1 件。本人の情報は接続のときの attachment。{ t: 'msg', text, parent? } / { t: 'like', id, on } / { t: 'edit', id, text } */
  async webSocketMessage(ws, raw) {
    let data = null;
    try { data = JSON.parse(typeof raw === 'string' ? raw : ''); } catch { data = null; }
    if (!data || typeof data.t !== 'string') return;
    const user = ws.deserializeAttachment() || {};
    let r = null;
    if (data.t === 'msg') r = this.post(user, data.text, data.parent ?? null);
    else if (data.t === 'like') r = this.like(user, data.id, data.on !== false);
    else if (data.t === 'edit') r = this.edit(user, data.id, data.text);
    else return;
    if (r.err) {
      try { ws.send(JSON.stringify({ t: 'err', code: r.err, op: data.t, id: data.id ?? null })); } catch { /* 閉じた */ }
    } else if (data.t === 'like') {
      try { ws.send(JSON.stringify({ t: 'liked', id: r.id, on: r.on })); } catch { /* 閉じた */ }
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* 相手が先に閉じた */ }
  }

  async webSocketError(ws) {
    try { ws.close(); } catch { /* 相手が先に閉じた */ }
  }
}
