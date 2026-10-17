// トロフィーの定義（SPEC-001 9 章）。名前・説明はあとから変えてよいが、ID は変えない。
// 名前は、条件に合うマイクリのヒーローのパッシブスキル名・エクステンションのスキル名を優先する（nameFrom に由来）。
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
  { id: 'tactics.ch1', game: 'tactics', name: '兵は詭道なり', nameFrom: '孫子のパッシブスキル', description: '第 1 章のボスを倒す' },
  { id: 'tactics.ch2', game: 'tactics', name: '二天一流', nameFrom: '宮本武蔵のパッシブスキル', description: '第 2 章のボスを倒す' },
  { id: 'tactics.clear', game: 'tactics', name: '天下布武', nameFrom: '織田信長のパッシブスキル', description: '全 5 章をクリアする', clear: true },

  { id: 'survivor.stage1', game: 'survivor', name: 'スノーフォール', nameFrom: 'エクステンション「雪だるま」のスキル', description: '最初のステージをクリアする（ボス撃破か 5 分耐久）' },
  { id: 'survivor.clear', game: 'survivor', name: '幻の生存者', nameFrom: 'アナスタシアのパッシブスキル', description: '全 3 ステージをクリアする', clear: true },

  { id: 'fortress.level01', game: 'fortress', name: '天地開闢の守護', nameFrom: 'エクステンション「アメノミナカヌシ」のスキル', description: 'レベル 01 をクリアする' },
  { id: 'fortress.level05', game: 'fortress', name: '過五関斬六将', nameFrom: '関羽のパッシブスキル', description: 'レベル 05 をクリアする' },
  { id: 'fortress.clear', game: 'fortress', name: '毘沙門天の化身', nameFrom: '上杉謙信のパッシブスキル', description: 'レベル 09 までクリアする', clear: true },

  { id: 'deckbattle.area1', game: 'deckbattle', name: '開拓者の一歩', nameFrom: 'エクステンション「大西部のブーツ」のスキル', description: '最初のノード（近代・日本）を制覇する' },
  { id: 'deckbattle.clear', game: 'deckbattle', name: '十二の功業', nameFrom: 'エクステンション「キングヘラクレス」のスキル', description: '最後のノード「時空のはざま」を制覇する', clear: true },

  { id: 'workshop.day30', game: 'workshop', name: '行列のできる人気店', nameFrom: 'エクステンション「定番醤油ラーメン」のスキル', description: '30 日目の営業を終える' },
  { id: 'workshop.legendary', game: 'workshop', name: '千磨百錬', nameFrom: 'エクステンション「鍛冶バッタ」のスキル', description: '「MCH製法」を習得して Legendary をクラフトできるようにする' },
  { id: 'workshop.clear', game: 'workshop', name: '黄金の工房', nameFrom: 'ルーベンスのパッシブスキル', description: '黄金のエクステンションを作る', clear: true },
  { id: 'workshop.relocate', game: 'workshop', name: '西廻り航路の夢', nameFrom: 'コロンブスのパッシブスキル', description: 'ランド移転して 2 周目を始める' },

  { id: '10buy.debtfree', game: '10buy', name: '解放の一矢', nameFrom: 'ウィリアム・テルのパッシブスキル', description: '借金を返し終える' },
  { id: '10buy.sold1000', game: '10buy', name: '千客万来', nameFrom: 'エクステンション「バッタ商人」のスキル', description: '累計 1,000 個売る' },
  { id: '10buy.stage5', game: '10buy', name: '頂点の覇気', nameFrom: 'エクステンション「チャンピオンベルト」のスキル', description: 'ステージ 5 に上がる' },
  { id: '10buy.clear', game: '10buy', name: 'うさぎとかめ', nameFrom: 'イソップのパッシブスキル', description: '10 年を走り切る（事業売却での引退も含む）', clear: true },
  { id: '10buy.rank_s', game: '10buy', name: '功名立志伝', nameFrom: '豊臣秀吉のパッシブスキル', description: 'S ランク（純資産 5,000 万円以上）で 10 年を終える' },

  { id: 'cross.two', game: 'cross', name: '二倍楽しむ、猫型バーガー！', nameFrom: 'エクステンション「ダブルにゃんバーガー」のスキル', description: '2 タイトルでトロフィーを獲得する', titles: 2 },
  { id: 'cross.four', game: 'cross', name: 'おくのほそ道', nameFrom: '松尾芭蕉のパッシブスキル', description: '4 タイトルでトロフィーを獲得する', titles: 4 },
  { id: 'cross.allclear', game: 'cross', name: '征服王の偉業', nameFrom: 'アレキサンダーのパッシブスキル', description: '対応しているすべてのタイトルで、クリアのトロフィーを獲得する', allClear: true },
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
