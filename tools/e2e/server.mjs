// 共通基盤をローカルで動かす（D1 の代わりに Node の SQLite。migrations/ をそのまま流す）。
//   node tools/e2e/server.mjs            → http://localhost:8788 （ポータル + /api/*）
// ゲームを別のポートで配信して、ブラウザから https://bearko.games と https://<game>.bearko.games を
// ここに向けて確かめる（game-check.mjs）。Google ログインは偽物：credential が "ok:<sub>" なら通る。
//   ADMIN_SUBS=admin node tools/e2e/server.mjs → /admin/ に "ok:admin" でログインすると管理者（SPEC-003）
//   GET /__skew?add=<ms>  サーバーの時計を進める（RTA の最短時間を待たずに確かめるため）
//   GET /__presence       同時接続数の部屋がいま数えている人数（SPEC-007）
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8788);
const { createApi } = await import(join(ROOT, 'platform/api.js'));

const sqlite = new DatabaseSync(':memory:');
for (const f of readdirSync(join(ROOT, 'migrations')).sort()) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  run: async () => (sqlite.prepare(sql).run(...args), {}),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const db = { prepare: (s) => stmt(s), batch: async (l) => { for (const s of l) await s.run(); } };

// 同時接続数の部屋（SPEC-007）。Durable Object の SQLite を Node の SQLite で真似る
const { Presence } = await import(join(ROOT, 'platform/presence.js'));
const presenceDb = new DatabaseSync(':memory:');
const presenceRoom = new Presence({ storage: { sql: { exec(q, ...a) {
  const st = presenceDb.prepare(q);
  if (/^\s*SELECT/i.test(q)) { const rows = st.all(...a); return { one: () => rows[0] }; }
  if (a.length) st.run(...a); else presenceDb.exec(q);
  return { one: () => undefined };
} } } }, {});
const presence = { idFromName: (n) => n, get: () => ({ fetch: (r) => presenceRoom.fetch(r) }) };

let skew = 0;
const api = createApi({
  db,
  now: () => Date.now() + skew,
  clientId: 'test-client',
  verifyGoogle: async (c) => (c?.startsWith('ok:') ? { sub: c.slice(3) } : null),
  // ゲームを http://localhost:8790 で直接開いたときも受け付ける（ふつうは https://<game>.bearko.games に向けるので要らない）
  extraOrigins: [`http://localhost:${PORT}`, 'http://localhost:8790'],
  // 管理画面（SPEC-003）：ADMIN_SUBS=admin で起動し、credential "ok:admin" でログインすると管理者
  adminSubs: (process.env.ADMIN_SUBS || '').split(',').filter(Boolean),
  presence,
});

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/__skew') {
    skew += Number(url.searchParams.get('add') || 0);
    res.end(String(skew));
    return;
  }
  if (url.pathname === '/__presence') {
    res.end(JSON.stringify({ count: presenceRoom.count(Date.now() + skew), keys: presenceDb.prepare('SELECT COUNT(*) AS n FROM seen').get().n }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    const r = await api.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    const h = {};
    r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) h['set-cookie'] = cookies;
    res.writeHead(r.status, h);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(PORT, () => console.log(`platform: http://localhost:${PORT}`));
