# 共通基盤へのつなぎ込みガイド（引き継ぎ用）

bearko.games 共通基盤（共通ログイン・トロフィー・RTA・総合スコア）の作業を、新しいセッションが続けられるようにまとめたもの。**仕様（なぜそうするか）は SPEC、手順と注意点はこのファイル**。

- 仕様：[SPEC-001](specs/SPEC-001-bearko-games-platform.md)（全体・決定 D1〜D11）、[SPEC-002](specs/SPEC-002-total-score.md)（総合スコアの計算式）
- 最終更新：2026-10-17

## 1. いまの状態

| タイトル | リポジトリ（本番のブランチ） | 本番の URL | トロフィー | RTA | 総合スコア | ゲーム側の説明 |
|---|---|---|---|---|---|---|
| ポータル・共通基盤 | bearko/MyCryptoPortfolio（`claude/game-portfolio-page-4afqbc`） | bearko.games | — | — | — | このファイル |
| Tactics | bearko/mycryptotactics（`main`） | tactics.bearko.games | 対応 | 対応 | 対応（v2） | SPEC-008・SPEC-009・SPEC-015 |
| Survivor | bearko/MyCryptoSurvivor（`main`） | survivor.bearko.games | 対応 | 対応 | 対応 | SPEC-039・040・041 |
| Fortress | bearko/mycryptofortress（`main`、ゲームは `web/`） | fortress.bearko.games | 対応 | 未対応 | 対応 | SPEC-120・121 |
| DeckBattle | bearko/mycryptodeckbattle（`main`） | deckbattle.bearko.games | 対応 | 未対応 | 対応 | `docs/platform.md` |
| Factory | bearko/mycryptofactory（`main`） | factory.bearko.games | 未対応 | 未対応 | 対応 | `docs/platform-score.md` |
| Workshop | bearko/MyCryptoWorkshop（`claude/mycryptoheroes-craft-game-vsfplv`） | workshop.bearko.games | 対応 | 対応 | 対応 | `docs/platform-score.md`・`docs/ROADMAP.md` 8.4 |
| 10 buy year | bearko/10buy-year（`claude/resale-game-mvp-mzm460`） | 10-buy-year.bearko.games | 未対応 | 未対応 | 対応 | `docs/17_platform_score.md` |
| Education | bearko/MyCryptoEducation（`main`） | education.bearko.games | 未対応 | 区切りだけ（`hero1` → `clear`。入口は未対応） | 対応（v2：クリアと加点） | `docs/platform-score.md`・`docs/game-clear.md` |
| TCG | bearko/MyCryptoTCG（`main`） | tcg.bearko.games | 未対応 | 未対応 | 保留 | — |

本番のブランチにマージすると、Cloudflare の Workers Builds が自動で本番に公開する（どのリポジトリも同じ）。

## 2. 共通基盤の中身（このリポジトリ）

| ファイル | 中身 |
|---|---|
| `platform/worker.js` | Worker の入口。`/api/*` は API、それ以外はポータルの静的ファイル。毎日の掃除（cron） |
| `platform/api.js` | API 全部（ログイン・仮アカウント・トロフィー・RTA・総合スコア）。上のコメントに一覧 |
| `platform/trophies.js` | トロフィーの定義と、タイトル ID → サブドメイン（`GAME_HOSTS`） |
| `platform/rta.js` | RTA のレギュレーションと区切り・最短時間 |
| `platform/scoring/<タイトル>.v1.js` | 総合スコアの計算式（1 タイトル 1 ファイル）。一覧は `scoring/index.js` |
| `platform/test/*.test.mjs` | テスト（`npm test`。Node 22 以上） |
| `migrations/*.sql` | D1（`bearko-platform`）の表 |
| `sdk/v1.js` | ゲームが読む SDK（`window.BearkoGames`）。版は `api.version` |
| `rta/` `score/` `me/` `login/` | ポータルの画面（RTA ランキング・総合ランキング・マイページ・ログイン） |
| `tools/e2e/` | ローカルで通して確かめる道具（6 章） |

## 3. ゲームを共通基盤につなぐ手順

### 3.1 どのゲームでも（最初の 1 回）

1. ゲームの HTML で SDK を読み込む：`<script defer src="https://bearko.games/sdk/v1.js"></script>`
   - **ゲーム本体（module）より先に置く**。Vite でビルドするゲーム（Fortress・Workshop）は、Vite が本体を `<head>` に入れるので、SDK も `<head>` の中に置く（body の最後だと本体が先に動き、`init` が空振りする。実際に起きた）
2. ゲームに窓口のファイル（`platform.js` など）を作り、起動時に `BearkoGames.init({ game: '<タイトル ID>', version })` を呼ぶ
   - タイトル ID は `platform/trophies.js` の `GAME_HOSTS` のキー（`tactics` `survivor` `fortress` `deckbattle` `factory` `workshop` `10buy` `education` `tcg`）
   - SDK が遅れて読まれる可能性があるなら、`load` で読めたら `init` する（Fortress・Workshop の窓口が例）
3. 守ること
   - **SDK が読めない・通信に失敗しても、ゲームは最後まで遊べる**（例外を出さない。失敗は `console.warn` だけ）
   - ログイン状態は共通基盤が持つ。ゲーム側で Cookie を触らない（Tactics は localStorage も使わない）
   - 1 回の挑戦で同じ成績を何度も送らない（フラグで 1 回だけ）

### 3.2 トロフィー

1. 共通基盤：`platform/trophies.js` の `TROPHIES` に足す（ID は `<タイトル>.<名前>`。名前はマイクリのスキル名を優先：D9）
2. ゲーム：条件を満たしたときに `BearkoGames.unlockTrophy(id)`。通知は SDK が出す
3. 受け付けるのはそのゲームのサブドメインから送られたものだけ。横断トロフィー（`cross.*`）は共通基盤が自動で判定

### 3.3 総合スコア

1. 共通基盤：`platform/scoring/<タイトル>.v1.js` を作る
   - `KIND`：`'run'`（1 回の挑戦ごとに送る）か `'progress'`（積み上げ。いまの値を送る）
   - `score(metrics)` → `{ score, milestone, performance }`。ありえない値は `null`（受け付けない）
   - 形は SPEC-002 2 章：**節目の点**（最初の節目 1,000・ゲームクリア 5,000）＋ **成績 × 係数**（上限・頭打ちなし。D11）
   - `scoring/index.js` に足し、`platform/test/scoring.test.mjs` の基準プレイ（A ≒ 1,000・B ≒ 10,000）に 1 行足す
2. ゲーム：終わったとき（積み上げなら増えたとき）に `BearkoGames.submitScore(metrics, { quiet })`
   - こまめに送るゲームは `{ quiet: true }`（通知なし）で、1 分に 1 回まで
   - 将来の「難易度ごとのレギュレーション」用に、難易度・レギュレーションも `metrics` に入れておく（今は点に効かない）
3. **係数を変えたら、ファイルの版を上げる**（例：`tactics.v2.js` を作り、`index.js` で `v(tactics, 'v2')` に差し替え。古い版のファイルは残す）。毎日の掃除で、保存してある生の成績から全員を計算し直す

### 3.4 RTA

1. 共通基盤：`platform/rta.js` の `REGULATIONS` に足す（区切りの順番・種類・最短時間）。最短時間は「どう頑張っても越えられない時間」から少し引いた値（根拠を SPEC に書く）
2. ゲーム：「RTA で始める」を選んだときだけ `rta.start({ regulation, timerOffset })`、区切りで `rta.checkpoint(id, { igtMs })`、やめたら `rta.abort()`
   - IGT がゲーム内時間でないとき（Tactics のターン数）は、レギュレーションに `igt: 'turns'` を書き、`igtMs` の欄にその値を入れる
   - 経過時間の表示・区間タイム・結果の通知・15 分の無操作（参考記録）は SDK と共通基盤が受け持つ
   - Survivor（SPEC-040）が例

## 4. 本番の D1（データベース）

- データベース：`bearko-platform`（ID `387e2f22-d55e-4ddd-bcc1-bdb072f68a55`）
- 表を足すときは `migrations/000N_*.sql` を作り、**マージの前に本番に適用する**（Worker が新しい表を使う前に）
- これまでの 0001〜0004 は、Cloudflare の連携（D1 にクエリを送るツール）で SQL を直接流して適用した。そのため `wrangler d1 migrations apply` の記録の表はない。どの SQL も `IF NOT EXISTS` なので、wrangler で適用し直しても壊れない
- 本番のデータを消す・書き換える SQL は、作者に確認してから

## 5. 進め方の決まり

- **1 セッション 1 タイトル・1 課題**。課題は各リポジトリの Issue にする
- 各リポジトリのルール（CLAUDE.md / AGENTS.md）に従う。とくに：
  - Tactics：SPEC の PR を先にマージしてから実装の PR。憲章（`docs/charters/`）は人の確認なしに変えない。localStorage・Cookie を使わない
  - Survivor：`package.json` を作らない。`docs/specs/SPEC-INDEX.md` と `CHANGELOG.md` の自動生成区間に触れない（`docs/changelog/SPEC-NNN.md` に断片を書く）
  - Fortress：`meta/` `sim/` `data/` から Phaser を読まない
  - Education：報酬（GUM・知識カード・クリスタル）を速さで変えない。新しいモジュールは `scripts/build.mjs` の `ORDER` に足す（単一ファイル版が結合するため）
- 共通基盤（このリポジトリ）を先にマージ・公開し、そのあとゲーム側をマージする（ゲームが送るものを API が知らないと 400 になる）
- 文章・コメント・PR は日本語。PR には実行したテストの結果を貼る

## 6. 確かめ方

### 6.1 自動テスト

```
npm test        # 共通基盤（Node 22 以上）
```

### 6.2 ローカルで通す（ブラウザ）

```
node tools/e2e/server.mjs                     # 共通基盤（http://localhost:8788）
(cd ../mycryptosurvivor && python3 -m http.server 8790)   # ゲームを 8790 で（Vite のゲームは dist を）
npm i --no-save playwright                    # 初回だけ。依存には入れない
node tools/e2e/game-check.mjs survivor / "BearkoGames.submitScore({ stagesCleared: 1, cleared: false })"
```

- ブラウザの中で `https://bearko.games` と `https://<game>.bearko.games` をローカルに向けるので、Cookie・CORS・サブドメインの判定が本番と同じに動く
- SDK が読めない場合（offline）と読める場合（online）の両方を開き、エラー・SDK の有無・送った結果・通知の文字を出す
- RTA の最短時間を待たずに確かめるときは `curl "localhost:8788/__skew?add=300000"` でサーバーの時計を進める
- Google ログインは偽物：`POST /api/auth/google` に `{"credential":"ok:<好きな文字>"}` を送るとログインできる

### 6.3 本番

- マージ後、そのコミットの Workers Builds（GitHub のチェック）が成功したか見る
- `https://bearko.games/api/score/games` などを開いて、新しい定義が出ているか見る（キャッシュに注意。`?v=` を付ける）

## 7. はまりどころ

- **PR を作るとき**：この環境では `gh pr create` が使えない（GraphQL）。`gh api repos/<owner>/<repo>/pulls -f title=… -f head=… -f base=…` で作り、`gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=squash` でマージする
- **プレビュービルド**：本番以外のブランチは `npx wrangler preview` でビルドされ、設定ファイルに空の `"previews": {}` がないと失敗する。設定ファイル（`wrangler.jsonc`）がない Tactics・Survivor・TCG はプレビューが失敗したまま（本番は成功）。Fortress は別の原因でプレビューが失敗している（未調査）
- **Cloudflare の本番のブランチ**：ダッシュボードの Worker → Settings → Build → Branch control の「Production branch」。プレビューの設定画面（Tracking branch）と間違えやすい
- **サンドボックスから本番のサイトに curl できない**（プロキシで 403）。本番の確認は WebFetch か、作者に見てもらう
- **成績はゲームの自己申告**：範囲の確認はしているが改ざんは防げない（カジュアルなランキングとして割り切っている）

## 8. 残っている課題

タイトル別の課題と改善点は作者のドキュメント「タイトル別：RTA・総合スコアに向けた課題と改善点」にまとめてある。主なもの：

- 係数の確認（作者の通しプレイで「ふつうにクリア」の成績を確かめる）
- Fortress を「レベルごとの自己ベストの合計」にするか
- Fortress・DeckBattle の RTA、タイトルをまたぐ RTA
- 難易度ごとのレギュレーションと、積み上げ（スキルツリー・継承・周回）の扱い
- Factory のセーブとクリアの条件（#94）、TCG の連戦（#5）、Education のゲームクリア（#1）
