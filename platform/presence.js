// 同時接続数（SPEC-007）。ポチゲーポータルに 5 分ごとに送る人数を数える部屋。
//
//   SDK ── POST /api/presence ──▶ Worker（api.js）── Presence.fetch('/beat', { k }) ──▶ seen(k, at)
//   定期実行（worker.js）────────────────────────── Presence.fetch('/count') ──▶ 直近 5 分の数
//
// - 部屋は 1 つ（idFromName('global')）。SQLite つきの Durable Object（無料プランで使える種類）
// - 置くのは「番号 → 最後に操作のあった時刻」だけ。どのゲームか・IP・アカウントは置かない
// - 純関数（presenceKey / pochiUrl / isCleanupTick）は platform/test/presence.test.mjs で試す

export const WINDOW_MS = 5 * 60e3;        // 「過去 5 分以内に操作した人」（運営の指示）
export const KEEP_MS = 10 * 60e3;         // これより古い行は数えるときに消す
export const COOKIE_TTL_MS = 30 * 60e3;   // Cookie の番号は 30 分操作がなければ消える
export const PRESENCE_COOKIE = '__Host-bg_presence';
export const KEY_RE = /^[A-Za-z0-9_-]{16,32}$/;
export const CLEANUP_UTC = { hour: 19, minute: 0 }; // 毎日の掃除（日本時間 4:00）

/** 新しい番号（22 文字。base64url） */
export function newKey() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 誰かを見分ける番号。Cookie の番号 → SDK のページの番号 → 新しく作る、の順。
 * ページの番号を Cookie にも入れるので、初めての人が 2 回目から別の番号になって二重に数えられない
 */
export function presenceKey(cookieValue, page) {
  if (typeof cookieValue === 'string' && KEY_RE.test(cookieValue)) return cookieValue;
  if (typeof page === 'string' && KEY_RE.test(page)) return page;
  return newKey();
}

/** 送り先の URL（API キーが入るので、ログに書かない） */
export function pochiUrl(endpoint, gameKey, apiKey, count) {
  const u = new URL(endpoint);
  u.searchParams.set('game_key', gameKey);
  u.searchParams.set('api_key', apiKey);
  u.searchParams.set('online_count', String(Math.max(0, Math.floor(Number(count) || 0))));
  return u.toString();
}

/** 5 分ごとの定期実行のうち、毎日の掃除もする回か */
export function isCleanupTick(scheduledTime) {
  const d = new Date(scheduledTime);
  return d.getUTCHours() === CLEANUP_UTC.hour && d.getUTCMinutes() === CLEANUP_UTC.minute;
}

/**
 * 人数を数えて送る（定期実行から）。シークレット POCHI_API_KEY が無ければ送らない（プレビュー・未設定）。
 * 返すのは { count, status }（ログ用。URL は返さない）
 */
export async function reportOnline(env, { fetchImpl = fetch, now = Date.now } = {}) {
  if (!env.PRESENCE) return { skipped: 'no_presence' };
  const room = env.PRESENCE.get(env.PRESENCE.idFromName('global'));
  const res = await room.fetch(new Request(`https://presence/count?at=${now()}`));
  const { count } = await res.json();
  if (!env.POCHI_API_KEY || !env.POCHI_ENDPOINT || !env.POCHI_GAME_KEY) return { count, skipped: 'no_key' };
  try {
    const r = await fetchImpl(pochiUrl(env.POCHI_ENDPOINT, env.POCHI_GAME_KEY, env.POCHI_API_KEY, count), { method: 'GET', signal: AbortSignal.timeout(10e3) });
    return { count, status: r.status };
  } catch (e) {
    // 失敗してもやり直さない（次の 5 分で送り直る）。エラーの文に URL が入ることがあるので、種類だけ
    return { count, error: e && e.name ? e.name : 'error' };
  }
}

export class Presence {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    // 索引は付けない（行が少なく、索引のぶん書き込みの行数が増えるため）
    this.sql.exec('CREATE TABLE IF NOT EXISTS seen (k TEXT PRIMARY KEY, at INTEGER NOT NULL)');
  }

  beat(k, at) {
    this.sql.exec('INSERT INTO seen (k, at) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET at = excluded.at', k, at);
  }

  count(at) {
    this.sql.exec('DELETE FROM seen WHERE at < ?', at - KEEP_MS);
    return Number(this.sql.exec('SELECT COUNT(*) AS n FROM seen WHERE at >= ?', at - WINDOW_MS).one().n) || 0;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const at = Number(url.searchParams.get('at')) || Date.now();
    if (url.pathname === '/beat' && req.method === 'POST') {
      const { k } = await req.json().catch(() => ({}));
      if (typeof k !== 'string' || !KEY_RE.test(k)) return Response.json({ error: 'key' }, { status: 400 });
      this.beat(k, at);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/count') return Response.json({ count: this.count(at) });
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
