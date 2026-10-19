// ポータルの計測（SPEC-009）。トップで起きたことを、日ごとの回数としてだけ数える。
// だれかを見分ける値（アカウント・Cookie・IP・端末の番号）は受け取らない・残さない。

// 作品はポータルの台帳（js/games.js）の id。共通基盤のタイトル ID（10buy）とは違う（tenbuy）
export const PORTAL_GAMES = ['tactics', 'factory', 'survivor', 'tcg', 'education', 'workshop', 'fortress', 'tenbuy', 'deckbattle', 'heroes'];
const MOODS = ['', 'quick', 'action', 'think', 'idle', 'learn'];

// できごと → 作品が要るか・「どこから」に入ってよい値
export const PORTAL_EVENTS = {
  view: { game: false, sources: ['new', 'return'] },
  feat: { game: true, sources: [''] },
  peek: { game: true, sources: [''] },
  open: { game: true, sources: ['card', 'feat', 'link'] },
  mood: { game: false, sources: MOODS },
  play: { game: true, sources: ['feat', 'sheet', 'cont', 'guide'] },
};

export const PORTAL_KEEP_DAYS = 400; // これより古い行は毎日の掃除で消す

/** 送られてきた { e, g, s } を確かめる。正しければ { event, game, source }、だめなら null */
export function portalEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const event = body.e;
  const def = Object.hasOwn(PORTAL_EVENTS, event) ? PORTAL_EVENTS[event] : null;
  if (!def) return null;
  const game = body.g == null ? '' : body.g;
  const source = body.s == null ? '' : body.s;
  if (typeof game !== 'string' || typeof source !== 'string') return null;
  if (def.game ? !PORTAL_GAMES.includes(game) : game !== '') return null;
  if (!def.sources.includes(source)) return null;
  return { event, game, source };
}

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDay(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
}
