// アチーブメント（コードと API ではトロフィー）の定義（SPEC-001 9 章・SPEC-008）。名前・説明はあとから変えてよいが、ID は変えない。
// 名前は、絵のヒーローのパッシブスキル名・エクステンションのスキル名（nameFrom に由来）。
//   game：タイトル ID（GAME_HOSTS のキー）か 'cross'（横断。共通基盤が判定する）
//   clear：ゲームクリア（横断の「全制覇」などに使う）
//   avatar / avatarName：獲得すると使えるアイコン（SPEC-006）。種類（ヒーロー／エクステンション）とレアリティもこの絵で決まる（SPEC-008）。
//     足すときは必ず付け、ほかと重ねない（テストが見る）

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

// ---- ヒーロー名鑑（100 枚。no が名鑑の番号で、変えない・使い回さない）→ エクステンション（すべて Epic 以上）。SPEC-008 5 章 ----
// 名前・avatarName は資産リポジトリのスキル名・名前から写した（tools/check-achievements.mjs で照らし合わせる）。
//   formerAvatars：SPEC-008 で絵を差し替える前の絵。そのアチーブメントを持っている人は、前の絵もアイコンに使える
//   titles / clears / book / allClear / allExt / visits / visitsAll：タイトル横断の条件（crossTrophiesFor が判定）
//   judge：共通基盤の出来事で渡すもの（welcome・login・avatar・chat・rtarun・crossrta）
//   visit：そのタイトルの来訪（SDK が最初の操作で送る。/api/trophies/visit）
//   chapter：名鑑の章（SPEC-008 5.2。省くと第 1 章）。タイトルが増えたら、足すヒーローを chapter: 2 にして第 2 章とする。
//     名鑑の枚数（book）はその章のヒーローだけを数える。trueClear は、その章の最後の 1 枚（真のゲームクリアの記録。一度得たら消えない）
export const TROPHIES = [
  // tactics
  { id: 'tactics.ch1', game: 'tactics', no: 1, name: '遼来遼来', nameFrom: '張遼のパッシブスキル', avatar: 'hero:1003', avatarName: '張遼', description: '第 1 章のボスを倒す', formerAvatars: ['hero:2011'] },
  { id: 'tactics.ch2', game: 'tactics', no: 2, name: '兵は詭道なり', nameFrom: '孫子のパッシブスキル', avatar: 'hero:2011', avatarName: '孫子', description: '第 2 章のボスを倒す', formerAvatars: ['hero:5032'] },
  { id: 'tactics.party3', game: 'tactics', no: 3, name: '剣闘士の反乱', nameFrom: 'スパルタクスのパッシブスキル', avatar: 'hero:2002', avatarName: 'スパルタクス', description: '3 人パーティで第 1 章のボスを倒す' },
  { id: 'tactics.ch3', game: 'tactics', no: 4, name: '奇兵隊', nameFrom: '高杉晋作のパッシブスキル', avatar: 'hero:2021', avatarName: '高杉晋作', description: '第 3 章のボスを倒す' },
  { id: 'tactics.ch4', game: 'tactics', no: 5, name: '真田丸', nameFrom: '真田幸村のパッシブスキル', avatar: 'hero:3025', avatarName: '真田幸村', description: '第 4 章のボスを倒す' },
  { id: 'tactics.llfull', game: 'tactics', no: 6, name: '戦国一の傾奇者', nameFrom: '前田 慶次のパッシブスキル', avatar: 'hero:3011', avatarName: '前田 慶次', description: 'LL エクステの枠を 2 つとも埋める' },
  { id: 'tactics.rta1', game: 'tactics', no: 7, name: '伊賀越え', nameFrom: '服部半蔵のパッシブスキル', avatar: 'hero:3010', avatarName: '服部半蔵', description: 'RTA「第 1 章」を完走する' },
  { id: 'tactics.clear', game: 'tactics', no: 8, name: '風林火山', nameFrom: '武田信玄のパッシブスキル', avatar: 'hero:4025', avatarName: '武田信玄', description: '全 5 章をクリアする', clear: true, formerAvatars: ['hero:5001'] },
  { id: 'tactics.egg', game: 'tactics', no: 9, name: '独眼竜', nameFrom: '伊達政宗のパッシブスキル', avatar: 'hero:4009', avatarName: '伊達政宗', description: 'Dragon Egg で全 5 章をクリアする' },
  { id: 'tactics.rta5', game: 'tactics', no: 10, name: '三段突き', nameFrom: '沖田総司のパッシブスキル', avatar: 'hero:4012', avatarName: '沖田総司', description: 'RTA「全 5 章」を完走する' },
  { id: 'tactics.red', game: 'tactics', no: 11, name: '天下布武', nameFrom: '織田信長のパッシブスキル', avatar: 'hero:5001', avatarName: '織田信長', description: 'Red Dragon で全 5 章をクリアする' },
  // factory
  { id: 'factory.lv2', game: 'factory', no: 12, name: 'ボストン・ストロング・ボーイ', nameFrom: 'ジョン・L・サリバンのパッシブスキル', avatar: 'hero:1008', avatarName: 'ジョン・L・サリバン', description: '工房 Lv.2 になる', formerAvatars: ['hero:3003'] },
  { id: 'factory.lv3', game: 'factory', no: 13, name: '凧とライデン瓶の雷実験', nameFrom: 'ベンジャミン・フランクリンのパッシブスキル', avatar: 'hero:2041', avatarName: 'ベンジャミン・フランクリン', description: '工房 Lv.3 になる' },
  { id: 'factory.rank3', game: 'factory', no: 14, name: 'けだものあつめて すもうのけいこ', nameFrom: '金太郎のパッシブスキル', avatar: 'hero:2019', avatarName: '金太郎', description: 'ヒーローをランク 3 まで育てる' },
  { id: 'factory.passes', game: 'factory', no: 15, name: 'サン・ガブリエル', nameFrom: 'ヴァスコ・ダ・ガマのパッシブスキル', avatar: 'hero:2042', avatarName: 'ヴァスコ・ダ・ガマ', description: 'ランド通行証を 9 つすべてそろえる' },
  { id: 'factory.lv4', game: 'factory', no: 16, name: 'エレキテル', nameFrom: '平賀源内のパッシブスキル', avatar: 'hero:3003', avatarName: '平賀源内', description: '工房 Lv.4 になる' },
  { id: 'factory.rank5', game: 'factory', no: 17, name: '無敵の剣', nameFrom: '斎藤一のパッシブスキル', avatar: 'hero:3045', avatarName: '斎藤一', description: 'ヒーローをランク 5 まで育てる' },
  { id: 'factory.masterpiece', game: 'factory', no: 18, name: '睡蓮', nameFrom: 'モネのパッシブスキル', avatar: 'hero:3028', avatarName: 'モネ', description: '品評会で傑作（45 点以上）を出す' },
  { id: 'factory.clear', game: 'factory', no: 19, name: 'エジソン・エフェクト', nameFrom: 'トーマス・エジソンのパッシブスキル', avatar: 'hero:4007', avatarName: 'トーマス・エジソン', description: '期限（8 年）内に工房 Lv.5 になる', clear: true },
  { id: 'factory.legendary', game: 'factory', no: 20, name: 'テスラコイル', nameFrom: 'ニコラ・テスラのパッシブスキル', avatar: 'hero:4041', avatarName: 'ニコラ・テスラ', description: 'Legendary のエクステンションをクラフトする（打ち直しで Legendary にしたものも含む）', formerAvatars: ['hero:2023'] },
  { id: 'factory.clear3y', game: 'factory', no: 21, name: '来た、見た、勝った', nameFrom: 'カエサルのパッシブスキル', avatar: 'hero:4026', avatarName: 'カエサル', description: '3 年（144 週）以内に工房 Lv.5 になる' },
  { id: 'factory.y50', game: 'factory', no: 22, name: '聖神皇帝', nameFrom: '武則天のパッシブスキル', avatar: 'hero:5030', avatarName: '武則天', description: '工房を 50 年続ける' },
  // survivor
  { id: 'survivor.stage1', game: 'survivor', no: 23, name: '狼王ロボ', nameFrom: 'シートンのパッシブスキル', avatar: 'hero:1004', avatarName: 'シートン', description: '最初のステージをクリアする（ボス撃破か 5 分耐久）', formerAvatars: ['ext:12126'] },
  { id: 'survivor.awaken', game: 'survivor', no: 24, name: '荒野の復讐者', nameFrom: 'ジェロニモのパッシブスキル', avatar: 'hero:2017', avatarName: 'ジェロニモ', description: 'スキルツリーの「サバイバーの覚醒」を解放する' },
  { id: 'survivor.stage2', game: 'survivor', no: 25, name: '幻の生存者', nameFrom: 'アナスタシアのパッシブスキル', avatar: 'hero:2016', avatarName: 'アナスタシア', description: 'ステージ 2 をクリアする' },
  { id: 'survivor.tree5', game: 'survivor', no: 26, name: '変身', nameFrom: 'カフカのパッシブスキル', avatar: 'hero:2010', avatarName: 'カフカ', description: 'スキルツリーの節を 5 つ取る' },
  { id: 'survivor.stage3', game: 'survivor', no: 27, name: '不屈のガンマン', nameFrom: 'ワイアット・アープのパッシブスキル', avatar: 'hero:3031', avatarName: 'ワイアット・アープ', description: 'ステージ 3 にたどり着く' },
  { id: 'survivor.fao', game: 'survivor', no: 28, name: 'フンババとの戦い', nameFrom: 'ギルガメッシュのパッシブスキル', avatar: 'hero:3040', avatarName: 'ギルガメッシュ', description: '覚醒魔王ファオを倒す' },
  { id: 'survivor.capstone', game: 'survivor', no: 29, name: '六韜', nameFrom: '太公望のパッシブスキル', avatar: 'hero:3009', avatarName: '太公望', description: 'スキルツリーの奥義をひとつ解放する' },
  { id: 'survivor.clear', game: 'survivor', no: 30, name: 'ロシアの怪僧', nameFrom: 'ラスプーチンのパッシブスキル', avatar: 'hero:4046', avatarName: 'ラスプーチン', description: '全 3 ステージをクリアする', clear: true, formerAvatars: ['hero:2016'] },
  { id: 'survivor.allboss', game: 'survivor', no: 31, name: '人中に呂布あり', nameFrom: '呂布のパッシブスキル', avatar: 'hero:4016', avatarName: '呂布', description: '3 体のボスをすべて倒して全ステージをクリアする' },
  { id: 'survivor.rta', game: 'survivor', no: 32, name: 'ワンホールショット', nameFrom: 'ビリー・ザ・キッドのパッシブスキル', avatar: 'hero:4006', avatarName: 'ビリー・ザ・キッド', description: 'RTA で全ステージを完走する' },
  { id: 'survivor.absolute', game: 'survivor', no: 33, name: '蒼狼', nameFrom: 'チンギス・ハンのパッシブスキル', avatar: 'hero:5013', avatarName: 'チンギス・ハン', description: 'ABSOLUTE の 4 軸すべて ×2.0 以上で全ステージをクリアする' },
  // education
  { id: 'education.hero1', game: 'education', no: 34, name: 'テトラクテュス', nameFrom: 'ピタゴラスのパッシブスキル', avatar: 'hero:1006', avatarName: 'ピタゴラス', description: 'チャレンジで最初の英雄を仲間にする', formerAvatars: ['hero:2006'] },
  { id: 'education.crew6', game: 'education', no: 35, name: 'ヘウレーカ！ヘウレーカ！', nameFrom: 'アルキメデスのパッシブスキル', avatar: 'hero:2006', avatarName: 'アルキメデス', description: '仲間を 6 人にする' },
  { id: 'education.six', game: 'education', no: 36, name: 'アイテール', nameFrom: 'アリストテレスのパッシブスキル', avatar: 'hero:2047', avatarName: 'アリストテレス', description: '6 教科すべてで正解する' },
  { id: 'education.map24', game: 'education', no: 37, name: 'アレテー', nameFrom: 'ソクラテスのパッシブスキル', avatar: 'hero:2044', avatarName: 'ソクラテス', description: '知識マップのマスを 24 埋める' },
  { id: 'education.heroes5', game: 'education', no: 38, name: '万有引力', nameFrom: 'ニュートンのパッシブスキル', avatar: 'hero:3043', avatarName: 'ニュートン', description: 'チャレンジで英雄を 5 人仲間にする' },
  { id: 'education.edison', game: 'education', no: 39, name: '大唐西域記', nameFrom: '三蔵法師のパッシブスキル', avatar: 'hero:3017', avatarName: '三蔵法師', description: 'エジソンのチャレンジに勝ち、新しい課程の扉を開く' },
  { id: 'education.chuden', game: 'education', no: 40, name: 'エイボンの吟遊詩人', nameFrom: 'シェイクスピアのパッシブスキル', avatar: 'hero:3030', avatarName: 'シェイクスピア', description: '中伝のエクステンションを作る' },
  { id: 'education.clear', game: 'education', no: 41, name: '傾国の美女', nameFrom: '楊貴妃のパッシブスキル', avatar: 'hero:4015', avatarName: '楊貴妃', description: 'クレオパトラのチャレンジに勝つ', clear: true, formerAvatars: ['hero:5016'] },
  { id: 'education.cards300', game: 'education', no: 42, name: '種の起源', nameFrom: 'ダーウィンのパッシブスキル', avatar: 'hero:4028', avatarName: 'ダーウィン', description: '知識カードを 300 枚集める' },
  { id: 'education.heroes9', game: 'education', no: 43, name: '白衣の天使', nameFrom: 'ナイチンゲールのパッシブスキル', avatar: 'hero:4002', avatarName: 'ナイチンゲール', description: 'チャレンジの英雄 9 人をすべて仲間にする' },
  { id: 'education.map', game: 'education', no: 44, name: '相対性理論', nameFrom: 'アインシュタインのパッシブスキル', avatar: 'hero:5010', avatarName: 'アインシュタイン', description: '知識マップのマスをすべて埋める', formerAvatars: ['hero:1005'] },
  // workshop
  { id: 'workshop.day1', game: 'workshop', no: 45, name: '李氏朝鮮、宮廷医女', nameFrom: '大長今のパッシブスキル', avatar: 'hero:1007', avatarName: '大長今', description: '1 日目の営業を終える' },
  { id: 'workshop.brave', game: 'workshop', no: 46, name: '三綱五常', nameFrom: '花木蘭のパッシブスキル', avatar: 'hero:2040', avatarName: '花木蘭', description: '「ブレイブ製法」を習得する' },
  { id: 'workshop.capsule', game: 'workshop', no: 47, name: 'シュレディンガーの猫', nameFrom: 'シュレディンガーのパッシブスキル', avatar: 'hero:2008', avatarName: 'シュレディンガー', description: '具現化カプセルを動かす' },
  { id: 'workshop.day30', game: 'workshop', no: 48, name: 'プレゼント・フォー・ユー', nameFrom: 'サンタクロースのパッシブスキル', avatar: 'hero:2007', avatarName: 'サンタクロース', description: '30 日目の営業を終える', formerAvatars: ['ext:3154'] },
  { id: 'workshop.imperial', game: 'workshop', no: 49, name: 'システィーナの聖母', nameFrom: 'ラファエロのパッシブスキル', avatar: 'hero:3041', avatarName: 'ラファエロ', description: '「インペリアル製法」を習得する' },
  { id: 'workshop.legendhall', game: 'workshop', no: 50, name: '聖杯探索', nameFrom: 'パーシヴァルのパッシブスキル', avatar: 'hero:3034', avatarName: 'パーシヴァル', description: '伝説の間を開く' },
  { id: 'workshop.legendary', game: 'workshop', no: 51, name: '黄金の工房', nameFrom: 'ルーベンスのパッシブスキル', avatar: 'hero:3024', avatarName: 'ルーベンス', description: '「MCH製法」を習得して Legendary をクラフトできるようにする', formerAvatars: ['ext:2131'] },
  { id: 'workshop.clear', game: 'workshop', no: 52, name: 'ひまわり', nameFrom: 'ゴッホのパッシブスキル', avatar: 'hero:4021', avatarName: 'ゴッホ', description: '黄金のエクステンションを作る', clear: true, formerAvatars: ['hero:3024'] },
  { id: 'workshop.relocate', game: 'workshop', no: 53, name: '東方見聞録', nameFrom: 'マルコ・ポーロのパッシブスキル', avatar: 'hero:4008', avatarName: 'マルコ・ポーロ', description: 'ランド移転して 2 周目を始める', formerAvatars: ['hero:3042'] },
  { id: 'workshop.loop3', game: 'workshop', no: 54, name: '女王直属海賊', nameFrom: 'フランシス・ドレークのパッシブスキル', avatar: 'hero:4052', avatarName: 'フランシス・ドレーク', description: '3 周目を始める' },
  { id: 'workshop.versepass', game: 'workshop', no: 55, name: 'モナリザ', nameFrom: 'レオナルド・ダ・ビンチのパッシブスキル', avatar: 'hero:5005', avatarName: 'レオナルド・ダ・ビンチ', description: '「MCH Verse Pass」を習得する' },
  // fortress
  { id: 'fortress.level01', game: 'fortress', no: 56, name: '浪切', nameFrom: '甲斐姫のパッシブスキル', avatar: 'hero:1002', avatarName: '甲斐姫', description: 'レベル 01 をクリアする', formerAvatars: ['ext:5147'] },
  { id: 'fortress.level03', game: 'fortress', no: 57, name: '錦城の女主', nameFrom: '茶々のパッシブスキル', avatar: 'hero:2018', avatarName: '茶々', description: 'レベル 03 をクリアする' },
  { id: 'fortress.heroes5', game: 'fortress', no: 58, name: 'ブレーメンの音楽隊', nameFrom: 'グリム兄弟のパッシブスキル', avatar: 'hero:2005', avatarName: 'グリム兄弟', description: '5 種類のヒーローをすべて使えるようにする' },
  { id: 'fortress.boss10', game: 'fortress', no: 59, name: '虎痴', nameFrom: '許褚のパッシブスキル', avatar: 'hero:2013', avatarName: '許褚', description: 'ボスを通算 10 体倒す' },
  { id: 'fortress.level05', game: 'fortress', no: 60, name: '五虎・左将軍', nameFrom: '馬超のパッシブスキル', avatar: 'hero:3048', avatarName: '馬超', description: 'レベル 05 をクリアする', formerAvatars: ['hero:4037'] },
  { id: 'fortress.flawless', game: 'fortress', no: 61, name: '弁慶の立往生', nameFrom: '武蔵坊弁慶のパッシブスキル', avatar: 'hero:3018', avatarName: '武蔵坊弁慶', description: 'ダメージを受けずにレベルをクリアする' },
  { id: 'fortress.level07', game: 'fortress', no: 62, name: '東照大権現', nameFrom: '徳川家康のパッシブスキル', avatar: 'hero:3044', avatarName: '徳川家康', description: 'レベル 07 をクリアする' },
  { id: 'fortress.clear', game: 'fortress', no: 63, name: '毘沙門天の化身', nameFrom: '上杉謙信のパッシブスキル', avatar: 'hero:4032', avatarName: '上杉謙信', description: 'レベル 09 までクリアする', clear: true },
  { id: 'fortress.boss25', game: 'fortress', no: 64, name: '過五関斬六将', nameFrom: '関羽のパッシブスキル', avatar: 'hero:4037', avatarName: '関羽', description: 'ボスを通算 25 体倒す' },
  { id: 'fortress.rta', game: 'fortress', no: 65, name: '虎威将軍', nameFrom: '趙雲のパッシブスキル', avatar: 'hero:4023', avatarName: '趙雲', description: 'RTA「レベル 01〜09」を完走する' },
  { id: 'fortress.l9flawless', game: 'fortress', no: 66, name: '死せる孔明生ける仲達を走らす', nameFrom: '諸葛亮のパッシブスキル', avatar: 'hero:5015', avatarName: '諸葛亮', description: 'レベル 09 をダメージを受けずにクリアする' },
  // 10buy
  { id: '10buy.tutorial', game: '10buy', no: 67, name: 'シャーロック・ホームズ', nameFrom: 'コナン・ドイルのパッシブスキル', avatar: 'hero:1001', avatarName: 'コナン・ドイル', description: 'チュートリアルを終える' },
  { id: '10buy.stage2', game: '10buy', no: 68, name: 'ライトフライヤー号', nameFrom: 'ライト兄弟のパッシブスキル', avatar: 'hero:2001', avatarName: 'ライト兄弟', description: 'ステージ 2 に上がる' },
  { id: '10buy.debtfree', game: '10buy', no: 69, name: '大政奉還', nameFrom: '徳川慶喜のパッシブスキル', avatar: 'hero:2014', avatarName: '徳川慶喜', description: '借金を返し終える', formerAvatars: ['hero:4053'] },
  { id: '10buy.quest10', game: '10buy', no: 70, name: 'うさぎとかめ', nameFrom: 'イソップのパッシブスキル', avatar: 'hero:2027', avatarName: 'イソップ', description: 'ミッションを 10 個達成する' },
  { id: '10buy.stage3', game: '10buy', no: 71, name: 'ワンフォーオール・オールフォーワン', nameFrom: 'ダルタニャンのパッシブスキル', avatar: 'hero:3002', avatarName: 'ダルタニャン', description: 'ステージ 3（専業）に上がる' },
  { id: '10buy.stage4', game: '10buy', no: 72, name: '天下の草創', nameFrom: '源頼朝のパッシブスキル', avatar: 'hero:3051', avatarName: '源頼朝', description: 'ステージ 4（法人化）に上がる' },
  { id: '10buy.sold1000', game: '10buy', no: 73, name: '受け継がれた世界一周', nameFrom: 'マゼランのパッシブスキル', avatar: 'hero:3037', avatarName: 'マゼラン', description: '累計 1,000 個売る', formerAvatars: ['ext:3131'] },
  { id: '10buy.stage5', game: '10buy', no: 74, name: '一騎当千', nameFrom: '張飛のパッシブスキル', avatar: 'hero:4001', avatarName: '張飛', description: 'ステージ 5 に上がる', formerAvatars: ['ext:4096'] },
  { id: '10buy.clear', game: '10buy', no: 75, name: '資本論', nameFrom: 'マルクスのパッシブスキル', avatar: 'hero:4011', avatarName: 'マルクス', description: '10 年を走り切る（事業売却での引退も含む）', clear: true, formerAvatars: ['hero:2027'] },
  { id: '10buy.museum', game: '10buy', no: 76, name: 'ブリオッシュート', nameFrom: 'マリー・アントワネットのパッシブスキル', avatar: 'hero:4014', avatarName: 'マリー・アントワネット', description: '私設美術館を開く' },
  { id: '10buy.rank_s', game: '10buy', no: 77, name: '龍顔の高祖', nameFrom: '劉邦のパッシブスキル', avatar: 'hero:5026', avatarName: '劉邦', description: 'S ランク（純資産 5,000 万円以上）で 10 年を終える', formerAvatars: ['hero:2026'] },
  // deckbattle
  { id: 'deckbattle.area1', game: 'deckbattle', no: 78, name: '大日本沿海輿地全図', nameFrom: '伊能忠敬のパッシブスキル', avatar: 'hero:1005', avatarName: '伊能忠敬', description: '最初のノード（近代・日本）を制覇する', formerAvatars: ['ext:4031'] },
  { id: 'deckbattle.quest', game: 'deckbattle', no: 79, name: '長沙桓王', nameFrom: '孫策のパッシブスキル', avatar: 'hero:2037', avatarName: '孫策', description: 'フリーバトルで 10 勝してクリアする' },
  { id: 'deckbattle.europe', game: 'deckbattle', no: 80, name: '鉄血演説', nameFrom: 'ビスマルクのパッシブスキル', avatar: 'hero:2031', avatarName: 'ビスマルク', description: '近代・ヨーロッパを制覇する' },
  { id: 'deckbattle.machine2', game: 'deckbattle', no: 81, name: 'イデア論', nameFrom: 'プラトンのパッシブスキル', avatar: 'hero:2034', avatarName: 'プラトン', description: 'タイムマシンを Lv.2 にする' },
  { id: 'deckbattle.corsica', game: 'deckbattle', no: 82, name: '七年戦争', nameFrom: 'マリア・テレジアのパッシブスキル', avatar: 'hero:3046', avatarName: 'マリア・テレジア', description: 'コルシカの特異点を制覇する' },
  { id: 'deckbattle.heroes50', game: 'deckbattle', no: 83, name: '威風凛々', nameFrom: '楊端和のパッシブスキル', avatar: 'hero:3027', avatarName: '楊端和', description: '仲間を 50 人集める' },
  { id: 'deckbattle.abyss', game: 'deckbattle', no: 84, name: '一閃のカットラス', nameFrom: 'メアリ・リードのパッシブスキル', avatar: 'hero:3029', avatarName: 'メアリ・リード', description: '深海の特異点を制覇する' },
  { id: 'deckbattle.machine5', game: 'deckbattle', no: 85, name: '国士無双', nameFrom: '韓信のパッシブスキル', avatar: 'hero:4040', avatarName: '韓信', description: 'タイムマシンを Lv.5 にする' },
  { id: 'deckbattle.clear', game: 'deckbattle', no: 86, name: '冥府への旅', nameFrom: 'ブリュンヒルドのパッシブスキル', avatar: 'hero:4038', avatarName: 'ブリュンヒルド', description: '最後のノード「時空のはざま」を制覇する', clear: true, formerAvatars: ['ext:5136'] },
  { id: 'deckbattle.maou', game: 'deckbattle', no: 87, name: 'マハー・アヴァターラ', nameFrom: 'ラーマのパッシブスキル', avatar: 'hero:4051', avatarName: 'ラーマ', description: '魔王の特異点で覚醒魔王ファオを倒す' },
  { id: 'deckbattle.allstages', game: 'deckbattle', no: 88, name: 'エクスカリバー', nameFrom: 'アーサー王のパッシブスキル', avatar: 'hero:5006', avatarName: 'アーサー王', description: 'すべてのノードのすべてのステージをクリアする' },
  // cross
  { id: 'cross.two', game: 'cross', no: 89, name: '姉妹の反乱', nameFrom: 'チュン姉妹のパッシブスキル', avatar: 'hero:2028', avatarName: 'チュン姉妹', description: '2 タイトルでヒーローを呼び戻す', formerAvatars: ['ext:4151'], titles: 2 },
  { id: 'cross.book10', game: 'cross', no: 90, name: 'ムーラン・ド・ラ・ギャレットの舞踏会', nameFrom: 'ルノワールのパッシブスキル', avatar: 'hero:2048', avatarName: 'ルノワール', description: 'ヒーロー名鑑を 10 枚埋める', book: 10 },
  { id: 'cross.four', game: 'cross', no: 91, name: 'おくのほそ道', nameFrom: '松尾芭蕉のパッシブスキル', avatar: 'hero:3016', avatarName: '松尾芭蕉', description: '4 タイトルでヒーローを呼び戻す', titles: 4 },
  { id: 'cross.clear2', game: 'cross', no: 92, name: '連環の計', nameFrom: '貂蝉のパッシブスキル', avatar: 'hero:3020', avatarName: '貂蝉', description: '2 タイトルでゲームクリア', clears: 2 },
  { id: 'cross.book30', game: 'cross', no: 93, name: '西廻り航路の夢', nameFrom: 'コロンブスのパッシブスキル', avatar: 'hero:3042', avatarName: 'コロンブス', description: 'ヒーロー名鑑を 30 枚埋める', book: 30 },
  { id: 'cross.eight', game: 'cross', no: 94, name: 'ママラホエ・カナヴィ', nameFrom: 'カメハメハ大王のパッシブスキル', avatar: 'hero:4019', avatarName: 'カメハメハ大王', description: '8 タイトルでヒーローを呼び戻す', titles: 8 },
  { id: 'cross.clear4', game: 'cross', no: 95, name: '豊穣神バアルの雷光', nameFrom: 'ハンニバルのパッシブスキル', avatar: 'hero:4047', avatarName: 'ハンニバル', description: '4 タイトルでゲームクリア', clears: 4 },
  { id: 'cross.book60', game: 'cross', no: 96, name: '天満大自在天神', nameFrom: '菅原道真のパッシブスキル', avatar: 'hero:4054', avatarName: '菅原道真', description: 'ヒーロー名鑑を 60 枚埋める', book: 60 },
  { id: 'cross.crossrta', game: 'cross', no: 97, name: '燕返し', nameFrom: '佐々木小次郎のパッシブスキル', avatar: 'hero:4004', avatarName: '佐々木小次郎', description: 'タイトルをまたぐ RTA を完走する', judge: 'crossrta' },
  { id: 'cross.allclear', game: 'cross', no: 98, name: '征服王の偉業', nameFrom: 'アレキサンダーのパッシブスキル', avatar: 'hero:5017', avatarName: 'アレキサンダー', description: '対応しているすべてのタイトルでゲームクリア', allClear: true },
  { id: 'cross.allext', game: 'cross', no: 99, name: '富嶽三十六景', nameFrom: '葛飾北斎のパッシブスキル', avatar: 'hero:5024', avatarName: '葛飾北斎', description: 'エクステンションのアチーブメントをすべて集める', allExt: true },
  { id: 'cross.book99', game: 'cross', no: 100, name: '中国統一', nameFrom: '始皇帝のパッシブスキル', avatar: 'hero:5018', avatarName: '始皇帝', description: 'ヒーロー名鑑のほかの 99 枚をすべて埋める', book: 99, trueClear: true },

  // ---- エクステンション（すべて Epic 以上。SPEC-008 2.3）
  { id: 'tactics.visit', game: 'tactics', name: '五事七計', nameFrom: 'エクステンション「兵法書」のスキル', avatar: 'ext:4016', avatarName: '兵法書', description: 'MyCryptoTactics を遊ぶ', visit: true },
  { id: 'tactics.elite', game: 'tactics', name: '剣豪の一撃', nameFrom: 'エクステンション「和泉守兼定」のスキル', avatar: 'ext:4006', avatarName: '和泉守兼定', description: 'エリートに初めて勝つ' },
  { id: 'tactics.llext', game: 'tactics', name: 'インペリアルチャージ', nameFrom: 'エクステンション「インペリアルブレード」のスキル', avatar: 'ext:4001', avatarName: 'インペリアルブレード', description: 'LL エクステを初めて手に入れる' },
  { id: 'tactics.allalive', game: 'tactics', name: '古今独歩の一突き', nameFrom: 'エクステンション「蜻蛉切」のスキル', avatar: 'ext:5014', avatarName: '蜻蛉切', description: '味方を 1 人も倒されずにボスに勝つ' },
  { id: 'factory.visit', game: 'factory', name: '日月星辰', nameFrom: 'エクステンション「古代機工三球儀」のスキル', avatar: 'ext:4143', avatarName: '古代機工三球儀', description: 'MyCryptoFactory を遊ぶ', visit: true },
  { id: 'factory.firstcraft', game: 'factory', name: '蒸着', nameFrom: 'エクステンション「フリューテッドアーマー」のスキル', avatar: 'ext:4004', avatarName: 'フリューテッドアーマー', description: '初めてクラフトする' },
  { id: 'factory.firstquest', game: 'factory', name: '一日千里', nameFrom: 'エクステンション「赤兎馬」のスキル', avatar: 'ext:4005', avatarName: '赤兎馬', description: '初めてクエストに成功する' },
  { id: 'factory.crafts50', game: 'factory', name: '万能人の遺稿', nameFrom: 'エクステンション「アトランティコ手稿」のスキル', avatar: 'ext:5008', avatarName: 'アトランティコ手稿', description: 'クラフトを通算 50 回する' },
  { id: 'survivor.visit', game: 'survivor', name: '慈愛の雪崩', nameFrom: 'エクステンション「慈愛の氷雪王妃クイーンスノー&ベビー」のスキル', avatar: 'ext:4126', avatarName: '慈愛の氷雪王妃クイーンスノー&ベビー', description: 'MyCryptoSurvivor を遊ぶ', visit: true },
  { id: 'survivor.firstboss', game: 'survivor', name: 'タイガーシュート', nameFrom: 'エクステンション「アムールタイガー」のスキル', avatar: 'ext:4021', avatarName: 'アムールタイガー', description: '初めてボスを倒す' },
  { id: 'survivor.chest', game: 'survivor', name: '世界を駆けたドラムライン', nameFrom: 'エクステンション「ドレークの遺産」のスキル', avatar: 'ext:4071', avatarName: 'ドレークの遺産', description: '宝箱を初めて開ける' },
  { id: 'survivor.runs10', game: 'survivor', name: '黄金氷河期', nameFrom: 'エクステンション「絶対零度ゴールデンスノーマン」のスキル', avatar: 'ext:5126', avatarName: '絶対零度ゴールデンスノーマン', description: '挑戦を通算 10 回終える' },
  { id: 'education.visit', game: 'education', name: 'ヒエログリフ', nameFrom: 'エクステンション「ロゼッタ・ストーン」のスキル', avatar: 'ext:4050', avatarName: 'ロゼッタ・ストーン', description: 'MyCryptoEducation を遊ぶ', visit: true },
  { id: 'education.firstcraft', game: 'education', name: 'ムジカノーヴァ', nameFrom: 'エクステンション「楽聖の羽ペン」のスキル', avatar: 'ext:4003', avatarName: '楽聖の羽ペン', description: '初めてエクステンションを作る' },
  { id: 'education.crystal', game: 'education', name: '不思議な光', nameFrom: 'エクステンション「奇石の輝き」のスキル', avatar: 'ext:4009', avatarName: '奇石の輝き', description: '初めてクリスタルを手に入れる' },
  { id: 'education.right100', game: 'education', name: '求法の旅', nameFrom: 'エクステンション「大唐西域記」のスキル', avatar: 'ext:5016', avatarName: '大唐西域記', description: '通算 100 問に正解する' },
  { id: 'workshop.visit', game: 'workshop', name: '名工の一振り', nameFrom: 'エクステンション「石槌」のスキル', avatar: 'ext:4034', avatarName: '石槌', description: 'MyCryptoWorkshop を遊ぶ', visit: true },
  { id: 'workshop.firstsale', game: 'workshop', name: '分け入っても分け入っても白い山', nameFrom: 'エクステンション「デカ盛りもやしラーメン」のスキル', avatar: 'ext:4154', avatarName: 'デカ盛りもやしラーメン', description: '初めて販売する' },
  { id: 'workshop.caught', game: 'workshop', name: 'ドッグファイト', nameFrom: 'エクステンション「モロッサス」のスキル', avatar: 'ext:4027', avatarName: 'モロッサス', description: '泥棒を初めて捕まえる' },
  { id: 'workshop.sold1000', game: 'workshop', name: '千載一遇の至杯', nameFrom: 'エクステンション「絶品龍骨ラーメン」のスキル', avatar: 'ext:5154', avatarName: '絶品龍骨ラーメン', description: '通算 1,000 個販売する' },
  { id: 'fortress.visit', game: 'fortress', name: '静寂の雷撃', nameFrom: 'エクステンション「聖域の守護者」のスキル', avatar: 'ext:4108', avatarName: '聖域の守護者', description: 'MyCryptoFortress を遊ぶ', visit: true },
  { id: 'fortress.panel', game: 'fortress', name: '樹の種火', nameFrom: 'エクステンション「草樹の守護」のスキル', avatar: 'ext:4092', avatarName: '草樹の守護', description: 'スキルパネルを初めて取る' },
  { id: 'fortress.firstboss', game: 'fortress', name: '砲尾装填式砲', nameFrom: 'エクステンション「国崩し」のスキル', avatar: 'ext:4074', avatarName: '国崩し', description: '初めてボスを倒す' },
  { id: 'fortress.kills1000', game: 'fortress', name: '天地開闢の守護', nameFrom: 'エクステンション「アメノミナカヌシ」のスキル', avatar: 'ext:5147', avatarName: 'アメノミナカヌシ', description: '敵を通算 1,000 体倒す' },
  { id: '10buy.visit', game: '10buy', name: 'すくわ〜る', nameFrom: 'エクステンション「ぴっぴ教 一攫千金壺」のスキル', avatar: 'ext:4600', avatarName: 'ぴっぴ教 一攫千金壺', description: '10 buy year！ を遊ぶ', visit: true },
  { id: '10buy.firstsale', game: '10buy', name: '春ルンルン', nameFrom: 'エクステンション「華やか二段重箱」のスキル', avatar: 'ext:4142', avatarName: '華やか二段重箱', description: '初めて売る' },
  { id: '10buy.quest1', game: '10buy', name: '空と海に響く号令', nameFrom: 'エクステンション「アドミラルパロット」のスキル', avatar: 'ext:4113', avatarName: 'アドミラルパロット', description: 'ミッションを初めて達成する' },
  { id: '10buy.collection', game: '10buy', name: 'サラブーエ伯爵のコレクション', nameFrom: 'エクステンション「メサイア」のスキル', avatar: 'ext:5069', avatarName: 'メサイア', description: 'コレクションを 1 点買う' },
  { id: 'deckbattle.visit', game: 'deckbattle', name: '不思議への誘い', nameFrom: 'エクステンション「白兎の魔法時計」のスキル', avatar: 'ext:4111', avatarName: '白兎の魔法時計', description: 'MyCryptoDeckBattle を遊ぶ', visit: true },
  { id: 'deckbattle.firstwin', game: 'deckbattle', name: '開拓者の一歩', nameFrom: 'エクステンション「大西部のブーツ」のスキル', avatar: 'ext:4031', avatarName: '大西部のブーツ', description: '初めてバトルに勝つ' },
  { id: 'deckbattle.merge', game: 'deckbattle', name: '無限の循環', nameFrom: 'エクステンション「帝国式機光戦輪ウロボロス」のスキル', avatar: 'ext:4192', avatarName: '帝国式機光戦輪ウロボロス', description: '初めてヒーローを合成する' },
  { id: 'deckbattle.heroes100', game: 'deckbattle', name: '十二の功業', nameFrom: 'エクステンション「キングヘラクレス」のスキル', avatar: 'ext:5136', avatarName: 'キングヘラクレス', description: '仲間を 100 人集める' },
  { id: 'cross.welcome', game: 'cross', name: 'シューティング・スター', nameFrom: 'エクステンション「流星のホーキ」のスキル', avatar: 'ext:4080', avatarName: '流星のホーキ', description: 'マインの話を聞く', judge: 'welcome' },
  { id: 'cross.login', game: 'cross', name: 'クレイジーMaster Nobの御加護', nameFrom: 'エクステンション「クレイジーMCHメダル」のスキル', avatar: 'ext:4033', avatarName: 'クレイジーMCHメダル', description: 'Google でログインする', judge: 'login' },
  { id: 'cross.avatar', game: 'cross', name: '奉神礼', nameFrom: 'エクステンション「宝冠」のスキル', avatar: 'ext:4036', avatarName: '宝冠', description: 'アイコンを変える', judge: 'avatar' },
  { id: 'cross.chat', game: 'cross', name: 'リーガルハープ・ラプソディ', nameFrom: 'エクステンション「ハープを弾く貴婦人」のスキル', avatar: 'ext:4165', avatarName: 'ハープを弾く貴婦人', description: 'チャットで初めて発言する', judge: 'chat' },
  { id: 'cross.visit2', game: 'cross', name: '二倍楽しむ、猫型バーガー！', nameFrom: 'エクステンション「ダブルにゃんバーガー」のスキル', avatar: 'ext:4151', avatarName: 'ダブルにゃんバーガー', description: '2 タイトルを遊ぶ', visits: 2 },
  { id: 'cross.rtarun', game: 'cross', name: '命の刻限', nameFrom: 'エクステンション「王妃の黄金時計」のスキル', avatar: 'ext:5111', avatarName: '王妃の黄金時計', description: 'RTA を 1 回完走する', judge: 'rtarun' },
  { id: 'cross.visitall', game: 'cross', name: 'マゼラン海峡', nameFrom: 'エクステンション「ビクトリア号」のスキル', avatar: 'ext:5047', avatarName: 'ビクトリア号', description: '対応しているすべてのタイトルを遊ぶ', visitsAll: true },

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

/** そのアイコンを使えるか（最初からの 3 体か、そのアイコンのアチーブメント（差し替え前の絵も）を持っている）。null は既定の絵 */
export function canUseAvatar(id, ownedTrophyIds) {
  if (id == null) return true;
  if (STARTER_AVATARS.some((a) => a.id === id)) return true;
  const owned = new Set(ownedTrophyIds || []);
  return TROPHIES.some((t) => owned.has(t.id) && (t.avatar === id || (t.formerAvatars || []).includes(id)));
}

// ---- SPEC-008：来訪（タイトル → アチーブメント ID）・名鑑・横断の判定 ----
export const VISIT_TROPHY = Object.fromEntries(TROPHIES.filter((t) => t.visit).map((t) => [t.game, t.id]));
export const HERO_TROPHIES = TROPHIES.filter((t) => kindOf(t.avatar) === 'hero');
/** 名鑑の章（SPEC-008 5.2）。書いていなければ第 1 章 */
export function chapterOf(t) {
  return t.chapter || 1;
}
export const EXT_TROPHIES = TROPHIES.filter((t) => kindOf(t.avatar) === 'ext');

// 持っているトロフィー ID から、新たに得られる横断のアチーブメントを返す（judge のものは出来事で渡すので、ここでは見ない）
// list を渡すと、その定義で判定する（テストで第 2 章を試すため。ふだんは TROPHIES）
export function crossTrophiesFor(ownedIds, list = TROPHIES) {
  const byId = list === TROPHIES ? TROPHY_BY_ID : Object.fromEntries(list.map((t) => [t.id, t]));
  const exts = list.filter((t) => kindOf(t.avatar) === 'ext');
  const owned = new Set(ownedIds);
  const heroTitles = new Set();   // ヒーロー（節目）を呼び戻したタイトル
  const clearedTitles = new Set();
  const visited = new Set();
  const heroes = {};   // 章 → 持っているヒーローの数
  for (const id of owned) {
    const t = byId[id];
    if (!t) continue;
    if (kindOf(t.avatar) === 'hero') heroes[chapterOf(t)] = (heroes[chapterOf(t)] || 0) + 1;
    if (t.game === 'cross') continue;
    if (kindOf(t.avatar) === 'hero') heroTitles.add(t.game);
    if (t.clear) clearedTitles.add(t.game);
    if (t.visit) visited.add(t.game);
  }
  const clearTitles = new Set(list.filter((t) => t.clear).map((t) => t.game));
  const visitTitles = [...new Set(list.filter((t) => t.visit).map((t) => t.game))];
  const earned = [];
  // この回で増えた横断のものも数えに入れる（名鑑の枚数・すべてのエクステンション）。増えなくなるまで回す
  for (let more = true; more;) {
    more = false;
    for (const t of list) {
      if (t.game !== 'cross' || owned.has(t.id) || t.judge) continue;
      let ok = false;
      if (t.titles) ok = heroTitles.size >= t.titles;
      else if (t.clears) ok = clearedTitles.size >= t.clears;
      else if (t.allClear) ok = clearTitles.size > 0 && [...clearTitles].every((g) => clearedTitles.has(g));
      else if (t.visits) ok = visited.size >= t.visits;
      else if (t.visitsAll) ok = visitTitles.every((g) => visited.has(g));
      else if (t.allExt) ok = exts.every((e) => owned.has(e.id));
      else if (t.book) ok = (heroes[chapterOf(t)] || 0) >= t.book;   // 同じ章のヒーローだけを数える。book99 は自分を除く 99 枚＝ほかのすべて
      if (ok) {
        earned.push(t.id);
        owned.add(t.id);
        if (kindOf(t.avatar) === 'hero') heroes[chapterOf(t)] = (heroes[chapterOf(t)] || 0) + 1;
        more = true;
      }
    }
  }
  return earned;
}
