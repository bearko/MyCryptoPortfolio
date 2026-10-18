// bearko.games の Worker の入口。
// /api/* は共通基盤の API（platform/api.js）、それ以外はポータルの静的ファイル（ASSETS）。
// 全体チャット（SPEC-004）は Durable Object「ChatRoom」（platform/chat.js）。
import { createApi } from './api.js';
import { googleVerifier } from './google.js';
import { parseAdminSubs } from './admin.js';
import { ChatRoom } from './chat.js';

// 全体チャットの部屋（Durable Object。wrangler.jsonc の durable_objects と migrations）
export { ChatRoom };

let api;
function apiFor(env) {
  if (!api) {
    const clientId = env.GOOGLE_CLIENT_ID || null;
    api = createApi({
      db: env.DB,
      clientId,
      verifyGoogle: clientId ? googleVerifier(clientId) : null,
      // 古い Cookie（Domain=.bearko.games）を消すときだけ使う。新しい Cookie は bearko.games だけに付く（__Host-）
      cookieDomain: env.COOKIE_DOMAIN || null,
      // 仮アカウントを作る回数の上限（IP ごと。wrangler.jsonc の ratelimits。D1 の書き込み枠を守る）
      guestLimit: env.GUEST_LIMIT
        ? async (req) => (await env.GUEST_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'unknown' })).success
        : null,
      extraOrigins: (env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
      // 管理者の Google の会員番号（シークレット。SPEC-003 3 章）
      adminSubs: parseAdminSubs(env.ADMIN_SUBS),
      // 全体チャットの部屋（SPEC-004）。binding が無い構成（プレビュー）では 503
      chat: env.CHAT || null,
    });
  }
  return api;
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return apiFor(env).fetch(request);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    console.log('cleanup', await apiFor(env).cleanup());
  },
};
