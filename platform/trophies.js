// トロフィーの定義（SPEC-001 9 章）。名前・説明はあとから変えてよいが、ID は変えない。
//   game：タイトル ID（GAME_HOSTS のキー）か 'cross'（横断。共通基盤が判定する）
//   clear：ゲームクリアのトロフィー（横断トロフィー「全制覇」の判定に使う）

// タイトル内のトロフィーは、そのゲームのサブドメインからしか受け付けない
export const GAME_HOSTS = {
  tactics: 'tactics.bearko.games',
  factory: 'factory.bearko.games',
  survivor: 'survivor.bearko.games',
  tcg: 'tcg.bearko.games',
  education: 'education.bearko.games',
  workshop: 'workshop.bearko.games',
  fortress: 'fortress.bearko.games',
  '10buy': '10-buy-year.bearko.games',
  deckbattle: 'deckbattle.bearko.games',
};

export const GAME_NAMES = {
  tactics: 'MyCryptoTactics',
  factory: 'MyCryptoFactory',
  survivor: 'MyCryptoSurvivor',
  tcg: 'MyCryptoTCG',
  education: 'MyCryptoEducation',
  workshop: 'MyCryptoWorkshop',
  fortress: 'MyCryptoFortress',
  '10buy': '10 buy year！',
  deckbattle: 'MyCryptoDeckBattle',
  cross: 'タイトル横断',
};

export const TROPHIES = [
  { id: 'tactics.ch1', game: 'tactics', name: '第 1 章踏破', description: '第 1 章のボスを倒す' },
  { id: 'tactics.ch2', game: 'tactics', name: '第 2 章踏破', description: '第 2 章のボスを倒す' },
  { id: 'tactics.clear', game: 'tactics', name: '時の旅人', description: '全 5 章をクリアする', clear: true },

  { id: 'survivor.stage1', game: 'survivor', name: '雪原を越えて', description: '最初のステージのボスを倒す' },
  { id: 'survivor.clear', game: 'survivor', name: '生還者', description: '全 3 ステージをクリアする', clear: true },

  { id: 'fortress.level01', game: 'fortress', name: '初陣の守り', description: 'レベル 01 をクリアする' },
  { id: 'fortress.level05', game: 'fortress', name: '中盤の砦', description: 'レベル 05 をクリアする' },
  { id: 'fortress.clear', game: 'fortress', name: '不落の城塞', description: 'レベル 09 までクリアする', clear: true },

  { id: 'deckbattle.area1', game: 'deckbattle', name: '旅立ち', description: '最初のエリアをクリアする' },
  { id: 'deckbattle.clear', game: 'deckbattle', name: '伝説の冒険者', description: 'ストーリーを最後までクリアする', clear: true },

  { id: 'cross.two', game: 'cross', name: 'シリーズの入り口', description: '2 タイトルでトロフィーを獲得する', titles: 2 },
  { id: 'cross.four', game: 'cross', name: '渡り歩く者', description: '4 タイトルでトロフィーを獲得する', titles: 4 },
  { id: 'cross.allclear', game: 'cross', name: '全制覇', description: '対応しているすべてのタイトルで、クリアのトロフィーを獲得する', allClear: true },
];

export const TROPHY_BY_ID = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

// 持っているトロフィー ID から、新たに得られる横断トロフィーを返す
export function crossTrophiesFor(ownedIds) {
  const owned = new Set(ownedIds);
  const titles = new Set();
  const clearedTitles = new Set();
  for (const id of owned) {
    const t = TROPHY_BY_ID[id];
    if (!t || t.game === 'cross') continue;
    titles.add(t.game);
    if (t.clear) clearedTitles.add(t.game);
  }
  const clearTitles = new Set(TROPHIES.filter((t) => t.clear).map((t) => t.game));
  const earned = [];
  for (const t of TROPHIES) {
    if (t.game !== 'cross' || owned.has(t.id)) continue;
    if (t.titles && titles.size >= t.titles) earned.push(t.id);
    if (t.allClear && clearTitles.size > 0 && [...clearTitles].every((g) => clearedTitles.has(g))) earned.push(t.id);
  }
  return earned;
}
