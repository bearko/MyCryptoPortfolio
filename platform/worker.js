// bearko.games の Worker の入口。
// /api/* は共通基盤の API（platform/api.js）、それ以外はポータルの静的ファイル（ASSETS）。
import { createApi } from './api.js';
import { googleVerifier } from './google.js';

let api;
function apiFor(env) {
  if (!api) {
    const clientId = env.GOOGLE_CLIENT_ID || null;
    api = createApi({
      db: env.DB,
      clientId,
      verifyGoogle: clientId ? googleVerifier(clientId) : null,
      cookieDomain: env.COOKIE_DOMAIN || null,
      extraOrigins: (env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
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
