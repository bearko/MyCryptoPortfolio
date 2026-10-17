// 全体チャット（SPEC-004）。部屋は Durable Object「ChatRoom」が 1 つだけ（idFromName('global')）。
//
//   Worker（api.js）── /api/chat/ws ──▶ ChatRoom.fetch('/ws?u=…')   休止つき WebSocket（Hibernation API）
//                  ── /api/chat/messages ─▶ ChatRoom.fetch('/messages?after=')
//                  ── /api/me/chat ───────▶ ChatRoom.fetch('/mine?uid=')
//                  ── DELETE / 管理 ──────▶ ChatRoom.fetch('/delete' | '/purge' | '/admin/list')
//
// - 本人の確認は Worker が cookie で済ませ、部屋には { uid, name, game, banned } を渡す（部屋は D1 を読まない）
// - 発言は部屋の SQLite に置き、直近 500 件・7 日で切る（1 時間ごとのアラーム）
// - 連投の上限（2 秒に 1 件・10 分に 60 件）は部屋が数える（SQLite の直近の行から。眠りから覚めても数え直せる）
// 純関数（cleanText / cleanGame / userFromParam / trimPlan）は platform/test/chat.test.mjs で試す。

export const MAX_TEXT = 200;        // 1 件の文字数（コードポイント）
export const HISTORY = 50;          // つないだ直後に送る件数
export const ADMIN_LIST = 200;      // 管理画面に出す件数
export const KEEP = 500;            // 残す件数
export const KEEP_MS = 7 * 86400e3; // 残す期間
export const MIN_GAP_MS = 2000;     // 同じ人の次の発言まで
export const BURST = 60;            // 10 分あたり
export const BURST_MS = 600e3;
export const TRIM_EVERY_MS = 3600e3;
export const GAME_RE = /^[a-z0-9-]{1,24}$/;
export const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 本文を整える：制御文字を落とし、前後の空白を削る。1〜200 文字でなければ null */
export function cleanText(raw) {
  if (typeof raw !== 'string') return null;
  // 制御文字・ゼロ幅・行の区切り（1 行の発言にする）
  const t = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '').trim();
  const n = [...t].length;
  return n >= 1 && n <= MAX_TEXT ? t : null;
}

/** ゲームの札（SDK の init({ game }) の値）。合わなければ portal */
export function cleanGame(raw) {
  return typeof raw === 'string' && GAME_RE.test(raw) ? raw : 'portal';
}

/** Worker が /ws?u= に載せた本人の情報を読む。壊れていれば未ログイン扱い */
export function userFromParam(raw) {
  let u = {};
  try { u = JSON.parse(raw || '{}') || {}; } catch { u = {}; }
  const uid = typeof u.uid === 'string' && UID_RE.test(u.uid) ? u.uid : null;
  const name = uid && typeof u.name === 'string' && u.name.trim() ? u.name.trim().slice(0, 16) : null;
  return { uid, name, game: cleanGame(u.game), banned: !!u.banned && !!uid };
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

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const row2msg = (r) => ({ id: r.id, uid: r.uid, name: r.name, game: r.game, text: r.text, at: r.at });

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.now = () => Date.now();
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT NOT NULL, game TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);' +
        'CREATE INDEX IF NOT EXISTS messages_uid ON messages (uid);' +
        'CREATE INDEX IF NOT EXISTS messages_at ON messages (at);',
    );
    // ping は部屋を起こさずに pong（休止の節約）
    if (typeof WebSocketRequestResponsePair !== 'undefined' && ctx.setWebSocketAutoResponse) {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  // ---------------------------------------------------------------- 読む
  recent(limit = HISTORY, after = 0) {
    const rows = after > 0
      ? this.sql.exec('SELECT * FROM messages WHERE id > ? ORDER BY id DESC LIMIT ?', after, limit).toArray()
      : this.sql.exec('SELECT * FROM messages ORDER BY id DESC LIMIT ?', limit).toArray();
    return rows.reverse().map(row2msg);
  }

  mine(uid, limit = 100) {
    return this.sql.exec('SELECT * FROM messages WHERE uid = ? ORDER BY id DESC LIMIT ?', uid, limit).toArray().map(row2msg);
  }

  count() {
    return this.sql.exec('SELECT COUNT(*) AS n FROM messages').one().n;
  }

  // ---------------------------------------------------------------- 書く
  post(user, text) {
    const deny = denyReason(user);
    if (deny) return { err: deny };
    const clean = cleanText(text);
    if (clean == null) return { err: 'long' };
    const now = this.now();
    const r = this.sql.exec('SELECT MAX(at) AS last, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS burst FROM messages WHERE uid = ?', now - BURST_MS, user.uid).one();
    if (rateLimited(now, r.last ?? null, r.burst ?? 0)) return { err: 'rate' };
    const id = this.sql.exec('INSERT INTO messages (uid, name, game, text, at) VALUES (?, ?, ?, ?, ?) RETURNING id', user.uid, user.name, user.game, clean, now).one().id;
    const msg = { id, uid: user.uid, name: user.name, game: user.game, text: clean, at: now };
    this.broadcast({ t: 'msg', ...msg });
    this.armAlarm();
    return { msg };
  }

  /** 1 件消す。本人か管理者だけ。消したら全員に知らせる */
  remove(id, uid, admin = false) {
    const row = this.sql.exec('SELECT id, uid FROM messages WHERE id = ?', id).toArray()[0];
    if (!row) return { ok: false, status: 404 };
    if (!admin && row.uid !== uid) return { ok: false, status: 403 };
    this.sql.exec('DELETE FROM messages WHERE id = ?', id);
    this.broadcast({ t: 'del', id });
    return { ok: true };
  }

  /** その人の発言をすべて消し、接続も切る（締め出し・退会） */
  purge(uid) {
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM messages WHERE uid = ?', uid).one().n;
    if (n > 0) this.sql.exec('DELETE FROM messages WHERE uid = ?', uid);
    this.broadcast({ t: 'purge', uid });
    for (const ws of this.sockets(uid)) {
      try { ws.close(4003, 'banned'); } catch { /* もう閉じている */ }
    }
    return { ok: true, deleted: n };
  }

  /** 古いもの・多すぎるものを切る */
  trim() {
    const now = this.now();
    this.sql.exec('DELETE FROM messages WHERE at < ?', now - KEEP_MS);
    this.sql.exec('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT ?)', KEEP);
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
      try { server.send(JSON.stringify({ t: 'hist', msgs: this.recent(HISTORY), you: user.uid ? { uid: user.uid, name: user.name, can: denyReason(user) } : null })); } catch { /* 開いた直後に閉じた */ }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/messages' && req.method === 'GET') {
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
      return json(200, { msgs: this.recent(HISTORY, after) });
    }
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
      return json(200, { msgs: this.recent(ADMIN_LIST), total: this.count() });
    }
    if (path === '/trim' && req.method === 'POST') return json(200, { left: this.trim() });
    return json(404, { error: 'not_found' });
  }

  /** 客からの 1 件（{ t: 'msg', text }）。本人の情報は接続のときの attachment */
  async webSocketMessage(ws, raw) {
    let data = null;
    try { data = JSON.parse(typeof raw === 'string' ? raw : ''); } catch { data = null; }
    if (!data || data.t !== 'msg') return;
    const user = ws.deserializeAttachment() || {};
    const r = this.post(user, data.text);
    if (r.err) {
      try { ws.send(JSON.stringify({ t: 'err', code: r.err })); } catch { /* 閉じた */ }
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* 相手が先に閉じた */ }
  }

  async webSocketError(ws) {
    try { ws.close(); } catch { /* 相手が先に閉じた */ }
  }
}
