// トロフィーの定義（SPEC-001 9 章）。名前・説明はあとから変えてよいが、ID は変えない。
// 名前は、条件に合うマイクリのヒーローのパッシブスキル名・エクステンションのスキル名を優先する（nameFrom に由来）。
//   game：タイトル ID（GAME_HOSTS のキー）か 'cross'（横断。共通基盤が判定する）
//   clear：ゲームクリアのトロフィー（横断トロフィー「全制覇」の判定に使う）
//   avatar / avatarName：獲得すると使えるアイコン（SPEC-006。名前の由来になったスキルを持つヒーロー／エクステンション。
//     雪だるまは図鑑に出ない Rep 版しかスキルを持たない。Rep F（11126）は白黒の絵なので、色のある Rep E の ext:12126）。トロフィーを足すときは必ず付ける（テストが見る）

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
  { id: 'tactics.ch1', game: 'tactics', name: '兵は詭道なり', nameFrom: '孫子のパッシブスキル', avatar: 'hero:2011', avatarName: '孫子', description: '第 1 章のボスを倒す' },
  { id: 'tactics.ch2', game: 'tactics', name: '二天一流', nameFrom: '宮本武蔵のパッシブスキル', avatar: 'hero:5032', avatarName: '宮本武蔵', description: '第 2 章のボスを倒す' },
  { id: 'tactics.clear', game: 'tactics', name: '天下布武', nameFrom: '織田信長のパッシブスキル', avatar: 'hero:5001', avatarName: '織田信長', description: '全 5 章をクリアする', clear: true },

  { id: 'survivor.stage1', game: 'survivor', name: 'スノーフォール', nameFrom: 'エクステンション「雪だるま」のスキル', avatar: 'ext:12126', avatarName: '雪だるま', description: '最初のステージをクリアする（ボス撃破か 5 分耐久）' },
  { id: 'survivor.clear', game: 'survivor', name: '幻の生存者', nameFrom: 'アナスタシアのパッシブスキル', avatar: 'hero:2016', avatarName: 'アナスタシア', description: '全 3 ステージをクリアする', clear: true },

  { id: 'fortress.level01', game: 'fortress', name: '天地開闢の守護', nameFrom: 'エクステンション「アメノミナカヌシ」のスキル', avatar: 'ext:5147', avatarName: 'アメノミナカヌシ', description: 'レベル 01 をクリアする' },
  { id: 'fortress.level05', game: 'fortress', name: '過五関斬六将', nameFrom: '関羽のパッシブスキル', avatar: 'hero:4037', avatarName: '関羽', description: 'レベル 05 をクリアする' },
  { id: 'fortress.clear', game: 'fortress', name: '毘沙門天の化身', nameFrom: '上杉謙信のパッシブスキル', avatar: 'hero:4032', avatarName: '上杉謙信', description: 'レベル 09 までクリアする', clear: true },

  { id: 'deckbattle.area1', game: 'deckbattle', name: '開拓者の一歩', nameFrom: 'エクステンション「大西部のブーツ」のスキル', avatar: 'ext:4031', avatarName: '大西部のブーツ', description: '最初のノード（近代・日本）を制覇する' },
  { id: 'deckbattle.clear', game: 'deckbattle', name: '十二の功業', nameFrom: 'エクステンション「キングヘラクレス」のスキル', avatar: 'ext:5136', avatarName: 'キングヘラクレス', description: '最後のノード「時空のはざま」を制覇する', clear: true },

  { id: 'workshop.day30', game: 'workshop', name: '行列のできる人気店', nameFrom: 'エクステンション「定番醤油ラーメン」のスキル', avatar: 'ext:3154', avatarName: '定番醤油ラーメン', description: '30 日目の営業を終える' },
  { id: 'workshop.legendary', game: 'workshop', name: '千磨百錬', nameFrom: 'エクステンション「鍛冶バッタ」のスキル', avatar: 'ext:2131', avatarName: '鍛冶バッタ', description: '「MCH製法」を習得して Legendary をクラフトできるようにする' },
  { id: 'workshop.clear', game: 'workshop', name: '黄金の工房', nameFrom: 'ルーベンスのパッシブスキル', avatar: 'hero:3024', avatarName: 'ルーベンス', description: '黄金のエクステンションを作る', clear: true },
  { id: 'workshop.relocate', game: 'workshop', name: '西廻り航路の夢', nameFrom: 'コロンブスのパッシブスキル', avatar: 'hero:3042', avatarName: 'コロンブス', description: 'ランド移転して 2 周目を始める' },

  { id: '10buy.debtfree', game: '10buy', name: '解放の一矢', nameFrom: 'ウィリアム・テルのパッシブスキル', avatar: 'hero:4053', avatarName: 'ウィリアム・テル', description: '借金を返し終える' },
  { id: '10buy.sold1000', game: '10buy', name: '千客万来', nameFrom: 'エクステンション「バッタ商人」のスキル', avatar: 'ext:3131', avatarName: 'バッタ商人', description: '累計 1,000 個売る' },
  { id: '10buy.stage5', game: '10buy', name: '頂点の覇気', nameFrom: 'エクステンション「チャンピオンベルト」のスキル', avatar: 'ext:4096', avatarName: 'チャンピオンベルト', description: 'ステージ 5 に上がる' },
  { id: '10buy.clear', game: '10buy', name: 'うさぎとかめ', nameFrom: 'イソップのパッシブスキル', avatar: 'hero:2027', avatarName: 'イソップ', description: '10 年を走り切る（事業売却での引退も含む）', clear: true },
  { id: '10buy.rank_s', game: '10buy', name: '功名立志伝', nameFrom: '豊臣秀吉のパッシブスキル', avatar: 'hero:2026', avatarName: '豊臣秀吉', description: 'S ランク（純資産 5,000 万円以上）で 10 年を終える' },

  { id: 'factory.lv2', game: 'factory', name: 'エレキテル', nameFrom: '平賀源内のパッシブスキル', avatar: 'hero:3003', avatarName: '平賀源内', description: '工房 Lv.2 になる' },
  { id: 'factory.legendary', game: 'factory', name: 'ダビデの覚醒', nameFrom: 'ミケランジェロのパッシブスキル', avatar: 'hero:2023', avatarName: 'ミケランジェロ', description: 'Legendary のエクステンションをクラフトする（打ち直しで Legendary にしたものも含む）' },
  { id: 'factory.clear', game: 'factory', name: 'エジソン・エフェクト', nameFrom: 'トーマス・エジソンのパッシブスキル', avatar: 'hero:4007', avatarName: 'トーマス・エジソン', description: '期限（8 年）内に工房 Lv.5 になる', clear: true },
  { id: 'factory.clear3y', game: 'factory', name: '来た、見た、勝った', nameFrom: 'カエサルのパッシブスキル', avatar: 'hero:4026', avatarName: 'カエサル', description: '3 年（144 週）以内に工房 Lv.5 になる' },

  { id: 'education.hero1', game: 'education', name: 'ヘウレーカ！ヘウレーカ！', nameFrom: 'アルキメデスのパッシブスキル', avatar: 'hero:2006', avatarName: 'アルキメデス', description: 'チャレンジで最初の英雄を仲間にする' },
  { id: 'education.clear', game: 'education', name: '戦乱を呼ぶ美貌', nameFrom: 'クレオパトラのパッシブスキル', avatar: 'hero:5016', avatarName: 'クレオパトラ', description: 'クレオパトラのチャレンジに勝つ', clear: true },
  { id: 'education.map', game: 'education', name: '大日本沿海輿地全図', nameFrom: '伊能忠敬のパッシブスキル', avatar: 'hero:1005', avatarName: '伊能忠敬', description: '知識マップのマスをすべて埋める' },
  { id: 'education.cards300', game: 'education', name: '種の起源', nameFrom: 'ダーウィンのパッシブスキル', avatar: 'hero:4028', avatarName: 'ダーウィン', description: '知識カードを 300 枚集める' },

  { id: 'cross.two', game: 'cross', name: '二倍楽しむ、猫型バーガー！', nameFrom: 'エクステンション「ダブルにゃんバーガー」のスキル', avatar: 'ext:4151', avatarName: 'ダブルにゃんバーガー', description: '2 タイトルでトロフィーを獲得する', titles: 2 },
  { id: 'cross.four', game: 'cross', name: 'おくのほそ道', nameFrom: '松尾芭蕉のパッシブスキル', avatar: 'hero:3016', avatarName: '松尾芭蕉', description: '4 タイトルでトロフィーを獲得する', titles: 4 },
  { id: 'cross.allclear', game: 'cross', name: '征服王の偉業', nameFrom: 'アレキサンダーのパッシブスキル', avatar: 'hero:5017', avatarName: 'アレキサンダー', description: '対応しているすべてのタイトルで、クリアのトロフィーを獲得する', allClear: true },
];

export const TROPHY_BY_ID = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

// ---- SPEC-008：アチーブメント（画面ではトロフィーをこう呼ぶ）。ヒーローとエクステンションに分け、マイクリのレアリティを付ける ----
// 種類はアイコンの絵（hero: / ext:）で決まる。レアリティは手で書かず、マイクリの id の千の位から出す：
// 1 Common・2 Uncommon・3 Rare・4 Epic・5 Legendary（4 桁の id を持つヒーロー 201・エクステンション 956 で例外なし。2026-10-18 に資産リポジトリで確かめた）。
// 5 桁の id は図鑑に出ない特別な絵（エクステンションは Rep 版、ヒーローは MCHウォーリアーなど）
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/** アイコンの id（"hero:5001"）→ 'hero' | 'ext' */
export function kindOf(avatar) {
  return String(avatar).startsWith('hero:') ? 'hero' : 'ext';
}

/** アイコンの id → マイクリのレアリティ。図鑑に出ない絵は 'Replica'（エクステンション）／'Special'（ヒーロー） */
export function rarityOf(avatar) {
  const [kind, id] = String(avatar).split(':');
  if (id.length === 4) return RARITIES[Number(id[0]) - 1] || 'Special';
  return kind === 'ext' ? 'Replica' : 'Special';
}

export const GAME_URLS = Object.fromEntries(Object.entries(GAME_HOSTS).map(([g, host]) => [g, `https://${host}/`]));

// ---- SPEC-006：アイコン図鑑。最初から使える 3 体と、トロフィー 1 つにつき 1 つ ----
export const DEFAULT_AVATAR = 'hero:10001';   // MCHウォーリアー（何も選んでいない人の絵）
export const STARTER_AVATARS = [
  { id: 'hero:10001', name: 'MCHウォーリアー' },
  { id: 'hero:10002', name: 'MCHタクティシャン' },
  { id: 'hero:10003', name: 'MCHアーティスト' },
];
export const AVATAR_TOTAL = STARTER_AVATARS.length + TROPHIES.length;

/** そのアイコンを使えるか（最初からの 3 体か、そのアイコンのトロフィーを持っている）。null は既定の絵 */
export function canUseAvatar(id, ownedTrophyIds) {
  if (id == null) return true;
  if (STARTER_AVATARS.some((a) => a.id === id)) return true;
  const owned = new Set(ownedTrophyIds || []);
  return TROPHIES.some((t) => t.avatar === id && owned.has(t.id));
}

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
