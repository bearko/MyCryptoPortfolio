// Google の ID トークン（Google でログインのボタンが返すもの）の検証。
// Workshop（bearko/mycryptoworkshop の api/leaderboard.ts）の googleVerifier と同じ手順：
// Google の公開鍵で RS256 の署名を確かめ、aud（クライアント ID）・iss・exp を見る。
// 返すのは Google のアカウント識別子 sub だけ（メールアドレスなどは読まない）。

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const fromBase64Url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const utf8 = (bytes) => new TextDecoder().decode(bytes);

export function googleVerifier(clientId, { now = Date.now, fetchKeys } = {}) {
  const loadKeys =
    fetchKeys ??
    (async () => {
      const res = await fetch(GOOGLE_CERTS);
      if (!res.ok) throw new Error(`google certs ${res.status}`);
      return (await res.json()).keys;
    });
  let cache = null;
  async function keyFor(kid) {
    const stale = !cache || now() - cache.at > 3600_000;
    // Google は鍵を入れ替える：知らない kid のときは取り直す（多くても 1 分に 1 回）
    const unknown = cache && !cache.keys.some((k) => k.kid === kid) && now() - cache.at > 60_000;
    if (stale || unknown) cache = { keys: await loadKeys(), at: now() };
    return cache.keys.find((k) => k.kid === kid);
  }
  return async (credential) => {
    if (typeof credential !== 'string') return null;
    const parts = credential.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(utf8(fromBase64Url(parts[0])));
      const claims = JSON.parse(utf8(fromBase64Url(parts[1])));
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
      if (claims.aud !== clientId || !GOOGLE_ISSUERS.includes(claims.iss ?? '')) return null;
      if (typeof claims.exp !== 'number' || claims.exp * 1000 < now() - 60_000) return null;
      if (typeof claims.sub !== 'string' || !claims.sub) return null;
      const jwk = await keyFor(header.kid);
      if (!jwk) return null;
      const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      return ok ? { sub: claims.sub } : null;
    } catch {
      return null;
    }
  };
}
