# MyCrypto Games — ゲームポートフォリオ

[My Crypto Heroes](https://www.mycryptoheroes.net/)（マイクリ）のアセットで作ってきたブラウザゲームを、
Google Play のストアページ風に紹介する1枚のページです。

- **スマホでもスクロールなしで全体が見える**一覧（縦は 2×5、横長は 5×2 / 4×3）
- カードを押すと、スクリーンショット・元ネタ・概要・プレイ／GitHub へのリンクが並ぶ詳細シート
- `#tactics` のように作品 ID を付けた URL で、その作品の詳細を直接開けます

## 掲載作品

| # | 作品 | ジャンル | 元ネタ | URL |
|---|---|---|---|---|
| ⓪ | mycryptoheroes | アセットデータベース（運営会社の許諾済み） | My Crypto Heroes | https://github.com/bearko/mycryptoheroes |
| ① | MyCryptoTactics | デッキ構築型ローグライク | 参考作 | https://mycryptotactics.vercel.app/ |
| ② | MyCryptoFactory | 経営シミュレーション | 箱庭経営シム | https://mycryptofactory.vercel.app/ |
| ③ | MyCryptoSurvivor | サバイバルアクション | サバイバー系アクション | https://my-crypto-survivor.vercel.app/ |
| ④ | MyCryptoTCG（開発中） | カードゲーム | 高速カードバトル 参考作 | https://my-crypto-tcg.vercel.app/ |
| ⑤ | MyCryptoEducation | 教育クイズ | クイズRPG 参考作 | https://my-crypto-education.vercel.app/ |
| ⑥ | MyCryptoWorkshop | 経営シミュ × インクリメンタル | 参考作 | https://my-crypto-workshop.vercel.app/ |
| ⑦ | MyCryptoFortress | タワーディフェンス × インクリメンタル | 参考作 | https://mycryptofortress.vercel.app/ |
| ⑧ | 10 buy year！ | 育成シミュ × インクリメンタル | 野球ゲームの育成モード | https://10buy-year.vercel.app/ |
| ⑨ | MyCryptoDeckBattle | デッキ構築型RPG | 参考作 | https://mycryptodeckbattle.vercel.app/ |

文言・リンク・元ネタは `js/games.js` の台帳1か所にまとまっています。作品を足すときはここに1件足し、
`assets/thumbs/<id>.webp` と `assets/shots/<id>-1..3.webp` を置いてください。

## 構成

```
index.html          ページ本体（ビルドなし・素の ES Modules）
css/style.css
js/games.js         作品の台帳
js/main.js          一覧と詳細シートの描画
assets/thumbs/      サムネイル 1200×630（WebP）
assets/shots/       スクリーンショット 540×960（9:16・WebP）
og-image.jpg        このページ自体の OGP
tools/              サムネイルの生成（デプロイには含めない。.vercelignore）
```

## デプロイ（Vercel）

ビルドステップはありません。Vercel でこのリポジトリをインポートし、Framework Preset は **Other**、
Build Command は空、Output Directory は `.` のままで公開できます（`vercel.json` に書いてあります）。

`og:image` は `/og-image.jpg` の相対パスです。X（Twitter）など絶対 URL を要求するサービス向けには、
公開ドメインが決まったら `index.html` の `og:image` を `https://<ドメイン>/og-image.jpg` に書き換えてください。

## サムネイル

| 作品 | 出どころ |
|---|---|
| workshop / fortress / tenbuy | 各リポジトリの OGP 画像をそのまま WebP にしたもの |
| tactics / factory / survivor | 旧サムネイル（日付入りの「α版」帯・二次創作注記の帯・低解像度の切り抜き）を、このページ用に作り直したもの |
| tcg / education / deckbattle / heroes | 新規作成 |

作り直し・新規の7枚とこのページの OGP は、`tools/thumbs/template.html`（と `og.html`）を
Playwright で撮って書き出しています。設定は `tools/thumbs/thumbs.json` です。

```bash
npm i --no-save playwright
npx http-server -p 4200 .            # リポジトリのルートで
node tools/make-thumbs.mjs           # 全件 + og-image.jpg
node tools/make-thumbs.mjs tcg       # 1件だけ
```

素材は `bearko/mycryptoheroes` などの raw URL から読むのでネットワークが要ります。
各作品のリポジトリの OGP を差し替えたいときも、ここで作った画像をそのまま使えます。

## スクリーンショット

各作品をローカルで起動し、Playwright で **390×693（9:16）・deviceScaleFactor 2** で撮って
540px 幅の WebP にしています（2026-10 時点の各リポジトリのデフォルトブランチ）。

| 作品 | 1枚目 | 2枚目 | 3枚目 |
|---|---|---|---|
| tactics | バトル | マップ | ヒーロー編成 |
| factory | 工房（クラフト進行中） | エクステンション選択 | クラフト確認 |
| survivor | 戦闘 | レベルアップ | ヒーロー選択 |
| tcg | バトル（スキル選択） | 盤面 | タイトル |
| education | 消去法の出題 | 接敵 | ホーム |
| workshop | お店（来店中） | スキルツリー | タイトル |
| fortress | ウェーブ進行中 | 幻獣選択 | ヒーロー配置 |
| tenbuy | メイン画面 | ステージ目標 | タイトル |
| deckbattle | オートバトル | マーケット | タイトル |

## 権利表記

キャラクター画像・BGM/SE は My Crypto Heroes（MCH Co., Ltd.）に帰属し、許諾のもとで利用しています。
各作品は非公式のファン制作です。
