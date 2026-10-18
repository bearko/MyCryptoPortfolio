# アチーブメントの一覧（SPEC-008）

`node tools/achievements.mjs table` で `platform/trophies.js` から作る。手で直さない。

## ヒーロー名鑑（100 枚：Common 8・Uncommon 26・Rare 27・Epic 28・Legendary 11）

### MyCryptoTactics

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 001 | `tactics.ch1` | Common | 張遼 | 遼来遼来 | 第 1 章のボスを倒す |
| 002 | `tactics.ch2` | Uncommon | 孫子 | 兵は詭道なり | 第 2 章のボスを倒す |
| 003 | `tactics.party3` | Uncommon | スパルタクス | 剣闘士の反乱 | 3 人パーティで第 1 章のボスを倒す |
| 004 | `tactics.ch3` | Uncommon | 高杉晋作 | 奇兵隊 | 第 3 章のボスを倒す |
| 005 | `tactics.ch4` | Rare | 真田幸村 | 真田丸 | 第 4 章のボスを倒す |
| 006 | `tactics.llfull` | Rare | 前田 慶次 | 戦国一の傾奇者 | LL エクステの枠を 2 つとも埋める |
| 007 | `tactics.rta1` | Rare | 服部半蔵 | 伊賀越え | RTA「第 1 章」を完走する |
| 008 | `tactics.clear` | Epic | 武田信玄 | 風林火山 | 全 5 章をクリアする |
| 009 | `tactics.egg` | Epic | 伊達政宗 | 独眼竜 | Dragon Egg で全 5 章をクリアする |
| 010 | `tactics.rta5` | Epic | 沖田総司 | 三段突き | RTA「全 5 章」を完走する |
| 011 | `tactics.red` | Legendary | 織田信長 | 天下布武 | Red Dragon で全 5 章をクリアする |

### MyCryptoFactory

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 012 | `factory.lv2` | Common | ジョン・L・サリバン | ボストン・ストロング・ボーイ | 工房 Lv.2 になる |
| 013 | `factory.lv3` | Uncommon | ベンジャミン・フランクリン | 凧とライデン瓶の雷実験 | 工房 Lv.3 になる |
| 014 | `factory.rank3` | Uncommon | 金太郎 | けだものあつめて すもうのけいこ | ヒーローをランク 3 まで育てる |
| 015 | `factory.passes` | Uncommon | ヴァスコ・ダ・ガマ | サン・ガブリエル | ランド通行証を 9 つすべてそろえる |
| 016 | `factory.lv4` | Rare | 平賀源内 | エレキテル | 工房 Lv.4 になる |
| 017 | `factory.rank5` | Rare | 斎藤一 | 無敵の剣 | ヒーローをランク 5 まで育てる |
| 018 | `factory.masterpiece` | Rare | モネ | 睡蓮 | 品評会で傑作（45 点以上）を出す |
| 019 | `factory.clear` | Epic | トーマス・エジソン | エジソン・エフェクト | 期限（8 年）内に工房 Lv.5 になる |
| 020 | `factory.legendary` | Epic | ニコラ・テスラ | テスラコイル | Legendary のエクステンションをクラフトする（打ち直しで Legendary にしたものも含む） |
| 021 | `factory.clear3y` | Epic | カエサル | 来た、見た、勝った | 3 年（144 週）以内に工房 Lv.5 になる |
| 022 | `factory.y50` | Legendary | 武則天 | 聖神皇帝 | 工房を 50 年続ける |

### MyCryptoSurvivor

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 023 | `survivor.stage1` | Common | シートン | 狼王ロボ | 最初のステージをクリアする（ボス撃破か 5 分耐久） |
| 024 | `survivor.awaken` | Uncommon | ジェロニモ | 荒野の復讐者 | スキルツリーの「サバイバーの覚醒」を解放する |
| 025 | `survivor.stage2` | Uncommon | アナスタシア | 幻の生存者 | ステージ 2 をクリアする |
| 026 | `survivor.tree5` | Uncommon | カフカ | 変身 | スキルツリーの節を 5 つ取る |
| 027 | `survivor.stage3` | Rare | ワイアット・アープ | 不屈のガンマン | ステージ 3 にたどり着く |
| 028 | `survivor.fao` | Rare | ギルガメッシュ | フンババとの戦い | 覚醒魔王ファオを倒す |
| 029 | `survivor.capstone` | Rare | 太公望 | 六韜 | スキルツリーの奥義をひとつ解放する |
| 030 | `survivor.clear` | Epic | ラスプーチン | ロシアの怪僧 | 全 3 ステージをクリアする |
| 031 | `survivor.allboss` | Epic | 呂布 | 人中に呂布あり | 3 体のボスをすべて倒して全ステージをクリアする |
| 032 | `survivor.rta` | Epic | ビリー・ザ・キッド | ワンホールショット | RTA で全ステージを完走する |
| 033 | `survivor.absolute` | Legendary | チンギス・ハン | 蒼狼 | ABSOLUTE の 4 軸すべて ×2.0 以上で全ステージをクリアする |

### MyCryptoEducation

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 034 | `education.hero1` | Common | ピタゴラス | テトラクテュス | チャレンジで最初の英雄を仲間にする |
| 035 | `education.crew6` | Uncommon | アルキメデス | ヘウレーカ！ヘウレーカ！ | 仲間を 6 人にする |
| 036 | `education.six` | Uncommon | アリストテレス | アイテール | 6 教科すべてで正解する |
| 037 | `education.map24` | Uncommon | ソクラテス | アレテー | 知識マップのマスを 24 埋める |
| 038 | `education.heroes5` | Rare | ニュートン | 万有引力 | チャレンジで英雄を 5 人仲間にする |
| 039 | `education.edison` | Rare | 三蔵法師 | 大唐西域記 | エジソンのチャレンジに勝ち、新しい課程の扉を開く |
| 040 | `education.chuden` | Rare | シェイクスピア | エイボンの吟遊詩人 | 中伝のエクステンションを作る |
| 041 | `education.clear` | Epic | 楊貴妃 | 傾国の美女 | クレオパトラのチャレンジに勝つ |
| 042 | `education.cards300` | Epic | ダーウィン | 種の起源 | 知識カードを 300 枚集める |
| 043 | `education.heroes9` | Epic | ナイチンゲール | 白衣の天使 | チャレンジの英雄 9 人をすべて仲間にする |
| 044 | `education.map` | Legendary | アインシュタイン | 相対性理論 | 知識マップのマスをすべて埋める |

### MyCryptoWorkshop

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 045 | `workshop.day1` | Common | 大長今 | 李氏朝鮮、宮廷医女 | 1 日目の営業を終える |
| 046 | `workshop.brave` | Uncommon | 花木蘭 | 三綱五常 | 「ブレイブ製法」を習得する |
| 047 | `workshop.capsule` | Uncommon | シュレディンガー | シュレディンガーの猫 | 具現化カプセルを動かす |
| 048 | `workshop.day30` | Uncommon | サンタクロース | プレゼント・フォー・ユー | 30 日目の営業を終える |
| 049 | `workshop.imperial` | Rare | ラファエロ | システィーナの聖母 | 「インペリアル製法」を習得する |
| 050 | `workshop.legendhall` | Rare | パーシヴァル | 聖杯探索 | 伝説の間を開く |
| 051 | `workshop.legendary` | Rare | ルーベンス | 黄金の工房 | 「MCH製法」を習得して Legendary をクラフトできるようにする |
| 052 | `workshop.clear` | Epic | ゴッホ | ひまわり | 黄金のエクステンションを作る |
| 053 | `workshop.relocate` | Epic | マルコ・ポーロ | 東方見聞録 | ランド移転して 2 周目を始める |
| 054 | `workshop.loop3` | Epic | フランシス・ドレーク | 女王直属海賊 | 3 周目を始める |
| 055 | `workshop.versepass` | Legendary | レオナルド・ダ・ビンチ | モナリザ | 「MCH Verse Pass」を習得する |

### MyCryptoFortress

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 056 | `fortress.level01` | Common | 甲斐姫 | 浪切 | レベル 01 をクリアする |
| 057 | `fortress.level03` | Uncommon | 茶々 | 錦城の女主 | レベル 03 をクリアする |
| 058 | `fortress.heroes5` | Uncommon | グリム兄弟 | ブレーメンの音楽隊 | 5 種類のヒーローをすべて使えるようにする |
| 059 | `fortress.boss10` | Uncommon | 許褚 | 虎痴 | ボスを通算 10 体倒す |
| 060 | `fortress.level05` | Rare | 馬超 | 五虎・左将軍 | レベル 05 をクリアする |
| 061 | `fortress.flawless` | Rare | 武蔵坊弁慶 | 弁慶の立往生 | ダメージを受けずにレベルをクリアする |
| 062 | `fortress.level07` | Rare | 徳川家康 | 東照大権現 | レベル 07 をクリアする |
| 063 | `fortress.clear` | Epic | 上杉謙信 | 毘沙門天の化身 | レベル 09 までクリアする |
| 064 | `fortress.boss25` | Epic | 関羽 | 過五関斬六将 | ボスを通算 25 体倒す |
| 065 | `fortress.rta` | Epic | 趙雲 | 虎威将軍 | RTA「レベル 01〜09」を完走する |
| 066 | `fortress.l9flawless` | Legendary | 諸葛亮 | 死せる孔明生ける仲達を走らす | レベル 09 をダメージを受けずにクリアする |

### 10 buy year！

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 067 | `10buy.tutorial` | Common | コナン・ドイル | シャーロック・ホームズ | チュートリアルを終える |
| 068 | `10buy.stage2` | Uncommon | ライト兄弟 | ライトフライヤー号 | ステージ 2 に上がる |
| 069 | `10buy.debtfree` | Uncommon | 徳川慶喜 | 大政奉還 | 借金を返し終える |
| 070 | `10buy.quest10` | Uncommon | イソップ | うさぎとかめ | ミッションを 10 個達成する |
| 071 | `10buy.stage3` | Rare | ダルタニャン | ワンフォーオール・オールフォーワン | ステージ 3（専業）に上がる |
| 072 | `10buy.stage4` | Rare | 源頼朝 | 天下の草創 | ステージ 4（法人化）に上がる |
| 073 | `10buy.sold1000` | Rare | マゼラン | 受け継がれた世界一周 | 累計 1,000 個売る |
| 074 | `10buy.stage5` | Epic | 張飛 | 一騎当千 | ステージ 5 に上がる |
| 075 | `10buy.clear` | Epic | マルクス | 資本論 | 10 年を走り切る（事業売却での引退も含む） |
| 076 | `10buy.museum` | Epic | マリー・アントワネット | ブリオッシュート | 私設美術館を開く |
| 077 | `10buy.rank_s` | Legendary | 劉邦 | 龍顔の高祖 | S ランク（純資産 5,000 万円以上）で 10 年を終える |

### MyCryptoDeckBattle

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 078 | `deckbattle.area1` | Common | 伊能忠敬 | 大日本沿海輿地全図 | 最初のノード（近代・日本）を制覇する |
| 079 | `deckbattle.quest` | Uncommon | 孫策 | 長沙桓王 | フリーバトルで 10 勝してクリアする |
| 080 | `deckbattle.europe` | Uncommon | ビスマルク | 鉄血演説 | 近代・ヨーロッパを制覇する |
| 081 | `deckbattle.machine2` | Uncommon | プラトン | イデア論 | タイムマシンを Lv.2 にする |
| 082 | `deckbattle.corsica` | Rare | マリア・テレジア | 七年戦争 | コルシカの特異点を制覇する |
| 083 | `deckbattle.heroes50` | Rare | 楊端和 | 威風凛々 | 仲間を 50 人集める |
| 084 | `deckbattle.abyss` | Rare | メアリ・リード | 一閃のカットラス | 深海の特異点を制覇する |
| 085 | `deckbattle.machine5` | Epic | 韓信 | 国士無双 | タイムマシンを Lv.5 にする |
| 086 | `deckbattle.clear` | Epic | ブリュンヒルド | 冥府への旅 | 最後のノード「時空のはざま」を制覇する |
| 087 | `deckbattle.maou` | Epic | ラーマ | マハー・アヴァターラ | 魔王の特異点で覚醒魔王ファオを倒す |
| 088 | `deckbattle.allstages` | Legendary | アーサー王 | エクスカリバー | すべてのノードのすべてのステージをクリアする |

### タイトル横断

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
| 089 | `cross.two` | Uncommon | チュン姉妹 | 姉妹の反乱 | 2 タイトルでヒーローを呼び戻す |
| 090 | `cross.book10` | Uncommon | ルノワール | ムーラン・ド・ラ・ギャレットの舞踏会 | ヒーロー名鑑を 10 枚埋める |
| 091 | `cross.four` | Rare | 松尾芭蕉 | おくのほそ道 | 4 タイトルでヒーローを呼び戻す |
| 092 | `cross.clear2` | Rare | 貂蝉 | 連環の計 | 2 タイトルでゲームクリア |
| 093 | `cross.book30` | Rare | コロンブス | 西廻り航路の夢 | ヒーロー名鑑を 30 枚埋める |
| 094 | `cross.eight` | Epic | カメハメハ大王 | ママラホエ・カナヴィ | 8 タイトルでヒーローを呼び戻す |
| 095 | `cross.clear4` | Epic | ハンニバル | 豊穣神バアルの雷光 | 4 タイトルでゲームクリア |
| 096 | `cross.book60` | Epic | 菅原道真 | 天満大自在天神 | ヒーロー名鑑を 60 枚埋める |
| 097 | `cross.crossrta` | Epic | 佐々木小次郎 | 燕返し | タイトルをまたぐ RTA を完走する |
| 098 | `cross.allclear` | Legendary | アレキサンダー | 征服王の偉業 | 対応しているすべてのタイトルでゲームクリア |
| 099 | `cross.allext` | Legendary | 葛飾北斎 | 富嶽三十六景 | エクステンションのアチーブメントをすべて集める |
| 100 | `cross.book99` | Legendary | 始皇帝 | 中国統一 | ヒーロー名鑑のほかの 99 枚をすべて埋める |

## エクステンション（39 個：Common 0・Uncommon 0・Rare 0・Epic 29・Legendary 10）

| No. | ID | レアリティ | 絵 | 名前 | 条件 |
|---|---|---|---|---|---|
|  | `tactics.visit` | Epic | 兵法書 | 五事七計 | MyCryptoTactics を遊ぶ |
|  | `tactics.elite` | Epic | 和泉守兼定 | 剣豪の一撃 | エリートに初めて勝つ |
|  | `tactics.llext` | Epic | インペリアルブレード | インペリアルチャージ | LL エクステを初めて手に入れる |
|  | `tactics.allalive` | Legendary | 蜻蛉切 | 古今独歩の一突き | 味方を 1 人も倒されずにボスに勝つ |
|  | `factory.visit` | Epic | 古代機工三球儀 | 日月星辰 | MyCryptoFactory を遊ぶ |
|  | `factory.firstcraft` | Epic | フリューテッドアーマー | 蒸着 | 初めてクラフトする |
|  | `factory.firstquest` | Epic | 赤兎馬 | 一日千里 | 初めてクエストに成功する |
|  | `factory.crafts50` | Legendary | アトランティコ手稿 | 万能人の遺稿 | クラフトを通算 50 回する |
|  | `survivor.visit` | Epic | 慈愛の氷雪王妃クイーンスノー&ベビー | 慈愛の雪崩 | MyCryptoSurvivor を遊ぶ |
|  | `survivor.firstboss` | Epic | アムールタイガー | タイガーシュート | 初めてボスを倒す |
|  | `survivor.chest` | Epic | ドレークの遺産 | 世界を駆けたドラムライン | 宝箱を初めて開ける |
|  | `survivor.runs10` | Legendary | 絶対零度ゴールデンスノーマン | 黄金氷河期 | 挑戦を通算 10 回終える |
|  | `education.visit` | Epic | ロゼッタ・ストーン | ヒエログリフ | MyCryptoEducation を遊ぶ |
|  | `education.firstcraft` | Epic | 楽聖の羽ペン | ムジカノーヴァ | 初めてエクステンションを作る |
|  | `education.crystal` | Epic | 奇石の輝き | 不思議な光 | 初めてクリスタルを手に入れる |
|  | `education.right100` | Legendary | 大唐西域記 | 求法の旅 | 通算 100 問に正解する |
|  | `workshop.visit` | Epic | 石槌 | 名工の一振り | MyCryptoWorkshop を遊ぶ |
|  | `workshop.firstsale` | Epic | デカ盛りもやしラーメン | 分け入っても分け入っても白い山 | 初めて販売する |
|  | `workshop.caught` | Epic | モロッサス | ドッグファイト | 泥棒を初めて捕まえる |
|  | `workshop.sold1000` | Legendary | 絶品龍骨ラーメン | 千載一遇の至杯 | 通算 1,000 個販売する |
|  | `fortress.visit` | Epic | 聖域の守護者 | 静寂の雷撃 | MyCryptoFortress を遊ぶ |
|  | `fortress.panel` | Epic | 草樹の守護 | 樹の種火 | スキルパネルを初めて取る |
|  | `fortress.firstboss` | Epic | 国崩し | 砲尾装填式砲 | 初めてボスを倒す |
|  | `fortress.kills1000` | Legendary | アメノミナカヌシ | 天地開闢の守護 | 敵を通算 1,000 体倒す |
|  | `10buy.visit` | Epic | ぴっぴ教 一攫千金壺 | すくわ〜る | 10 buy year！ を遊ぶ |
|  | `10buy.firstsale` | Epic | 華やか二段重箱 | 春ルンルン | 初めて売る |
|  | `10buy.quest1` | Epic | アドミラルパロット | 空と海に響く号令 | ミッションを初めて達成する |
|  | `10buy.collection` | Legendary | メサイア | サラブーエ伯爵のコレクション | コレクションを 1 点買う |
|  | `deckbattle.visit` | Epic | 白兎の魔法時計 | 不思議への誘い | MyCryptoDeckBattle を遊ぶ |
|  | `deckbattle.firstwin` | Epic | 大西部のブーツ | 開拓者の一歩 | 初めてバトルに勝つ |
|  | `deckbattle.merge` | Epic | 帝国式機光戦輪ウロボロス | 無限の循環 | 初めてヒーローを合成する |
|  | `deckbattle.heroes100` | Legendary | キングヘラクレス | 十二の功業 | 仲間を 100 人集める |
|  | `cross.welcome` | Epic | 流星のホーキ | シューティング・スター | マインの話を聞く |
|  | `cross.login` | Epic | クレイジーMCHメダル | クレイジーMaster Nobの御加護 | Google でログインする |
|  | `cross.avatar` | Epic | 宝冠 | 奉神礼 | アイコンを変える |
|  | `cross.chat` | Epic | ハープを弾く貴婦人 | リーガルハープ・ラプソディ | チャットで初めて発言する |
|  | `cross.visit2` | Epic | ダブルにゃんバーガー | 二倍楽しむ、猫型バーガー！ | 2 タイトルを遊ぶ |
|  | `cross.rtarun` | Legendary | 王妃の黄金時計 | 命の刻限 | RTA を 1 回完走する |
|  | `cross.visitall` | Legendary | ビクトリア号 | マゼラン海峡 | 対応しているすべてのタイトルを遊ぶ |
