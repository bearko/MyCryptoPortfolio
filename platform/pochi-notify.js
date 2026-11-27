// ポチゲーポータルのプッシュ通知（SPEC-011）。
//
// ポチゲーの通知仕様 v1：
//   1) 公開のイベントフィード（ログイン不要の GET。{ spec_version: 1, events: [...] }）を、登録したゲームの URL と同じ origin に置く
//      → https://bearko.games/api/game-events/
//   2) 出来事をフィードに載せたあと、サーバーから共通ハブへ POST { game_key } で知らせる（API キーは Authorization）
//   3) ハブがフィードを取りに来て、購読している端末へ配る。取りに来た時点で 15 分より古い出来事は配られない
//
// ここは DB にも画面にも触れない純関数だけ（platform/test/pochi.test.mjs で試す）。

export const FEED_LIMIT = 20;                // フィードに載せる数（新しい順。ポチゲーは先頭 50 件まで読む）
export const HUB_GAP_MS = 60e3;              // ハブへ知らせる間隔（ポチゲー：ゲームごとに 60 秒以上）
export const SITE_ORIGIN = 'https://bearko.games';
const TITLE_MAX = 60;
const BODY_MAX = 160;
const URL_MAX = 500;
const ID_MAX = 100;

const len = (s) => [...s].length;
// HTML・< >・改行・制御文字は使えない（通知仕様 v1）
// eslint-disable-next-line no-control-regex
const plain = (s) => !/[<>\u0000-\u001f\u007f\u2028\u2029]/.test(s);

/** ミリ秒 → タイムゾーン付きの ISO 8601（日本時間） */
export function isoJst(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

/** 出来事の ID：<チャンネル>_<日本時間の YYYYMMDD_HHMMSS>。同じ出来事には同じ ID（フィードを何度読まれても変えない） */
export function eventId(channel, ms) {
  const t = isoJst(ms);
  return `${channel}_${t.slice(0, 10).replace(/-/g, '')}_${t.slice(11, 19).replace(/:/g, '')}`.slice(0, ID_MAX);
}

/**
 * 管理画面から送られた中身を確かめる。よければ { ok: true, value }、だめなら { ok: false, error }（画面に出す言葉）
 * value：{ channel, title, body, url }
 */
export function checkEvent(input = {}) {
  const channel = typeof input.channel === 'string' ? input.channel.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!/^[a-z0-9_]{1,40}$/.test(channel)) return { ok: false, error: 'channel' };
  if (!title || len(title) > TITLE_MAX || !plain(title)) return { ok: false, error: 'title' };
  if (!body || len(body) > BODY_MAX || !plain(body)) return { ok: false, error: 'body' };
  if (len(url) > URL_MAX || !(url === SITE_ORIGIN || url.startsWith(`${SITE_ORIGIN}/`)) || /\s/.test(url)) return { ok: false, error: 'url' };
  return { ok: true, value: { channel, title, body, url } };
}

/** フィードの JSON（rows：新しい順。{ id, channel, title, body, url, published_at, expires_at }。時刻はミリ秒） */
export function feed(rows) {
  return {
    spec_version: 1,
    events: rows.slice(0, FEED_LIMIT).map((r) => ({
      id: r.id,
      channel: r.channel,
      title: r.title,
      body: r.body,
      url: r.url,
      published_at: isoJst(r.published_at),
      ...(r.expires_at ? { expires_at: isoJst(r.expires_at) } : {}),
    })),
  };
}

/**
 * 共通ハブへ「フィードを更新した」と知らせる。返すのは { status, queued, retryAfter, error }（ログと画面用。API キーは含めない）
 * fetchImpl を差し替えてテストする
 */
export async function notifyHub({ hub, gameKey, apiKey }, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(hub, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_key: gameKey }),
      signal: AbortSignal.timeout(10e3),
    });
    const data = await res.json().catch(() => ({}));
    const retry = Number(res.headers.get('retry-after'));
    return {
      status: res.status,
      queued: typeof data.queued === 'boolean' ? data.queued : null,
      retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
      error: res.ok ? null : String(data.error || data.detail || data.message || '').slice(0, 200) || null,
    };
  } catch (e) {
    return { status: 0, queued: null, retryAfter: null, error: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
