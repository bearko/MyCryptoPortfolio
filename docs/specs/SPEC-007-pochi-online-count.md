# SPEC-007 ポチゲーポータルへの同時接続数の送信

| 項目 | 内容 |
|---|---|
| 状態 | **Accepted（1.0、2026-10-18）**。作者の依頼（運営の指示）どおりに作った。送り始めるのは作者が `POCHI_API_KEY` を登録してから |
| 作成 | 2026-10-18 |
| 親 | [SPEC-001](SPEC-001-bearko-games-platform.md) 4.7（Cookie）・11 章（データ量と費用） |
| 置き場所 | 数える部屋 `platform/presence.js`（Durable Object「Presence」）、API `platform/api.js`、定期実行 `platform/worker.js`、SDK `sdk/v1.js`（1.9.0） |

## 1. 背景（作者の依頼 2026-10-18）

bearko.games を「ポチゲーポータル」（合同会社あるけみすと）に載せる。掲載の条件のひとつが **同時接続数の送信** で、運営から次のように指示があった。

- 過去 5 分以内に操作した人数を目安に、**サーバー側から 5 分ごとに** GET で送る
  `https://games-alchemist.com/api/portal/online-count/?game_key=mycryptgames&api_key=<APIキー>&online_count=<人数>`
- **複数のゲームを同時に開いている人を重ねて数えず**、ゲーム集全体の人数として送る
- API キーは掲載情報の編集にも使うので、**ブラウザ側や公開コードに置かない**
- 送ってよいのは個人を識別できない数値だけ（IP・ブラウザ ID などは送らない。掲載規約 第 5 条）。実際と大きく違う数や、多すぎる回数の送信はしない

## 2. 仕様

### 2.1 全体の流れ

```
各ゲーム・ポータル（SDK）──「操作あり」── POST /api/presence ──▶ Presence（Durable Object・SQLite）
                                                                   （番号 → 最後に操作のあった時刻）
定期実行（5 分ごと）── 直近 5 分の番号の数 ──▶ GET games-alchemist.com/api/portal/online-count/
```

### 2.2 SDK 1.9.0：「操作あり」を送る

- `init()` のあと、ページで操作（`keydown` / `pointerdown` / `pointermove` / `touchstart` / `wheel`）があったら印を付ける
- **最初の操作ですぐ 1 回** 送り、そのあとは **3 分ごと** に「前に送ってから操作があり、ページが見えている」ときだけ送る
- 送り先は `POST /api/presence { game, page }`。`page` はページを開くたびに作る使い捨ての番号（22 文字）で、メモリにだけ持つ（localStorage・Cookie に書かない）
- **仮アカウントは作らない**（`call()` の順番待ちを通さず、返事も見ない）。失敗しても何もしない
- `init({ presence: false })` で送らない（試験用）
- ゲーム側の変更は要らない（どのゲームも `https://bearko.games/sdk/v1.js` を読んで `init()` している）。ポータルの画面も数に入る

### 2.3 API：`POST /api/presence`

- 書き込みと同じく、受け付ける Origin はポータルと `GAME_HOSTS` のタイトルだけ（4.7）
- 誰かを見分ける番号は、次の順に決める
  1. Cookie `__Host-bg_presence` が正しい形（英数字と `-` `_` で 16〜32 文字）ならそれ
  2. なければ SDK が送った `page`（同じ形）。初めての人が 2 回目から Cookie の番号に変わって二重に数えられないよう、**Cookie にも同じ値を入れる**
  3. どちらもなければ新しく作る
- 返事は 204 と Cookie `__Host-bg_presence=<番号>; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`
  - Cookie は bearko.games だけに付く（4.7 と同じ）。ゲームのサブドメインからの `fetch(credentials: 'include')` は same-site なので付く。**どのゲームから送っても同じ番号になる** ので、同時に開いても 1 人と数える
  - アカウントとは結びつけない（ログイン・仮アカウントの Cookie は見ない。D1 も読まない・書かない）。30 分操作がなければ消える
- 回数の上限：IP ごとに **1 分 30 回**（`PRESENCE_LIMIT`）。超えたら 429 を返し、数えない（偽の人数で水増しされないように。家族などで IP を共有していても 1 分 30 回 ≒ 90 人ぶん）
- 部屋（binding `PRESENCE`）が無い構成（プレビュー）では、何もせず 204

### 2.4 数える部屋：Durable Object「Presence」

- SQLite つき（無料プランで使える種類）。部屋は 1 つ（`idFromName('global')`）
- 表は `seen (k TEXT PRIMARY KEY, at INTEGER NOT NULL)` だけ。索引は付けない（行が少なく、索引の分だけ書き込みが増えるため）
- `/beat`：番号の時刻を今にする（あれば上書き）
- `/count`：10 分より古い行を消してから、**直近 5 分** の行を数える
- 番号のほかには何も置かない（どのゲームかも、IP も置かない）

### 2.5 定期実行と送信

- 定期実行は **5 分ごとの 1 つ**（`*/5 * * * *`）にまとめる。無料プランは定期実行がアカウント全体で 5 つまでのため、毎日の掃除（日本時間 4:00 = UTC 19:00）も同じ定期実行で、その時刻のときだけ行う
- 毎回 `/count` の数を、次の URL に GET で送る（タイムアウト 10 秒・やり直しはしない。次の 5 分で送り直る）
  - 送り先 `POCHI_ENDPOINT` と `game_key`（`POCHI_GAME_KEY` = `mycryptgames`）は `wrangler.jsonc` の vars（公開してよい値）
  - **API キーは Worker のシークレット `POCHI_API_KEY`**。コード・リポジトリ・ログには出さない。シークレットが無いとき（プレビュー・未設定）は送らない
- 0 人でも送る
- ログには人数と返事の状態（HTTP の番号）だけを書く。**URL はログに書かない**（API キーが入っているため）

### 2.6 純関数とテスト

- `presenceKey(cookieValue, page)`・`pochiUrl(endpoint, gameKey, apiKey, n)`・`isCleanupTick(scheduledTime)` を純関数にして `node --test` で確かめる
- Presence の部屋は Node の SQLite で真似て、`/beat` が重ねて数えないこと・5 分で外れること・10 分で消えることを確かめる

## 3. 量と費用（SPEC-001 11 章への追記）

1 人が 1 時間遊ぶと、「操作あり」が 20 回（3 分ごと）。1 回で、Worker の呼び出し 1 回・Durable Object の呼び出し 1 回・SQLite の書き込み 1 行。

| 項目 | 1 時間 1 人 | 無料プランの上限（1 日） | 目安 |
|---|---|---|---|
| Worker の呼び出し | 20 回 | 10 万回（アカウント全体。ほかの API と分け合う） | 遊ばれる時間が 1 日 合計 2,000 時間を超えるあたりで、ほかの API と合わせて上限に近づく |
| Durable Object の呼び出し | 20 回 | 10 万回（チャットと分け合う） | 同上 |
| Durable Object の SQLite の書き込み | 20 行 | 10 万行 | D1 とは別の枠。D1 の書き込みは増えない |
| 定期実行 | — | — | 1 日 288 回（5 分ごと） |

上限の 7 割を超えたら、送る間隔を延ばすか有料プランを検討する（SPEC-001 11 章と同じ）。

## 4. 作者の作業

- Cloudflare のダッシュボードで、Worker `mycryptoportfolio` にシークレット `POCHI_API_KEY` を登録する（Claude はシークレットを登録できない）

## 5. 非ゴール

- タイトルごとの人数（運営の指示はゲーム集全体の 1 つの数）
- ポータルやゲームの画面に同時接続数を出すこと
- 端末をまたいだ重なりをなくすこと（同じ人が PC とスマホで遊ぶと 2 人。運営の指示は「複数のゲームを同時に開いている人」）

## 6. 改訂履歴

| 日付 | 版 | 内容 |
|---|---|---|
| 2026-10-18 | 0.1 | 下書き（運営の指示と、送り方・数え方・費用） |
| 2026-10-18 | 1.0 | 作った（`platform/presence.js`・`POST /api/presence`・5 分ごとの定期実行・SDK 1.9.0）。テスト `platform/test/presence.test.mjs` |
