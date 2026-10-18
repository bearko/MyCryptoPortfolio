// RTA の定義（SPEC-001 6 章）。チェックポイントとレギュレーション。
// ID は変えない。区切りが変わったときは新しい ID を足し、古いものは deprecated: true にする（過去の記録は消さない）。
//   checkpoints：レギュレーションが通る区切り（決めた順番どおりに送る）
//     minMs：計測の開始からこれより速く着くのはありえない、という最短時間（6.5）
//   igt：IGT の単位。省略すると 'ms'（ゲーム内時間）。'turns' はターン数を igtMs の欄にそのまま入れる（Tactics。6.9）。'weeks' はゲームの通算の週（10 buy year。6.18）
//   rank：'igt' なら IGT の少ない順に並べる（同じなら実時間）。省略すると実時間
//     minIgt：区切りの IGT がこれより小さいのはありえない（rank: 'igt' のとき。前の区切りより小さいのもはじく）

export const IDLE_LIMIT_MS = 15 * 60e3; // これ以上操作がなければ参考記録（6.4）
export const SERVER_GAP_MS = 20 * 60e3; // 「操作あり」の間隔がこれを超えたら参考記録（15 分＋送信の間隔 5 分）
export const RANKING_LIMIT = 100;

export const REGULATIONS = [
  {
    id: 'survivor-normal',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ',
    rule: 'NORMAL（難易度の調整なし）・ヒーロー自由。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 235e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 470e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 705e3 },
    ],
  },
  {
    id: 'survivor-absolute-2x',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（ABSOLUTE ×2.0）',
    rule: 'ABSOLUTE の 4 軸（出現数・HP・攻撃力・速さ）をすべて ×2.0 に固定・ヒーロー自由。ステージ 1 の開始から、全 3 ステージクリアまで',
    // ABSOLUTE はボスに効かず、ボスはゲーム内の 4 分で出る。最短時間は survivor-normal と同じ
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 235e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 470e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 705e3 },
    ],
  },
  // 懐中時計あり（Survivor SPEC-054。SPEC-001 6.15）。RTA のときだけ宝箱から出て、10 秒間ゲーム全体が 2 倍速になる。
  // 宝箱は 1 ステージ 4 つ（ゲーム内 0:30・1:30・2:30・3:30）なので、ボスまでに縮む実時間は 1 ステージ 40 秒まで（4 分 → 3 分 20 秒）。
  // ゲームがこちらで計測を始めるようになったら、古い 2 つ（懐中時計なし）を deprecated にする
  {
    id: 'survivor-normal-v2',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（懐中時計あり）',
    rule: 'NORMAL（難易度の調整なし）・ヒーロー自由。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  {
    id: 'survivor-absolute-2x-v2',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（ABSOLUTE ×2.0・懐中時計あり）',
    rule: 'ABSOLUTE の 4 軸（出現数・HP・攻撃力・速さ）をすべて ×2.0 に固定・ヒーロー自由。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  // Survivor v1.2（Survivor SPEC-062〜066。SPEC-001 6.16）：撃ってくる敵・雷鼓（ボスにも最大 HP の 20%）・ステージの仕掛け・
  // トロイの大群・レベルアップの速さが入り、遊びの中身が変わったので、記録を分ける（作者の決定 2026-10-17）。
  // ボスはゲーム内の 4 分、宝箱は 1 ステージ 4 つのまま。木馬を壊したときの中身に懐中時計は出ないので、最短時間は v2 と同じ
  {
    id: 'survivor-normal-v3',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（v1.2）',
    rule: 'NORMAL（難易度の調整なし）・ヒーロー自由。ゲーム v1.2 から（撃ってくる敵・雷鼓・ステージの仕掛け・トロイの大群）。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  {
    id: 'survivor-absolute-2x-v3',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（ABSOLUTE ×2.0・v1.2）',
    rule: 'ABSOLUTE の 4 軸（出現数・HP・攻撃力・速さ）をすべて ×2.0 に固定・ヒーロー自由。ゲーム v1.2 から（撃ってくる敵・雷鼓・ステージの仕掛け・トロイの大群）。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  // Survivor v1.3（Survivor SPEC-078〜081・084。SPEC-001 6.17）：敵の大群（ボスの直前に画面の半分〜9 割）・ボス戦の枠（敵が消え、1/4 の枠）・
  // ボスの強化（HP 15〜20 倍・突進などの型）・ボス戦の宝箱が入り、遊びの中身が変わったので、記録を分ける（作者の決定 2026-10-17）。
  // ボスはゲーム内の 4 分に出る・宝箱は 1 ステージ 4 つのままで、ボス戦の宝箱から懐中時計は出ない。最短時間は v2・v3 と同じ
  {
    id: 'survivor-normal-v4',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（v1.3）',
    rule: 'NORMAL（難易度の調整なし）・ヒーロー自由。ゲーム v1.3 から（敵の大群・ボス戦の枠・ボスの強化・ボス戦の宝箱）。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  {
    id: 'survivor-absolute-2x-v4',
    game: 'survivor',
    name: 'Survivor 全 3 ステージ（ABSOLUTE ×2.0・v1.3）',
    rule: 'ABSOLUTE の 4 軸（出現数・HP・攻撃力・速さ）をすべて ×2.0 に固定・ヒーロー自由。ゲーム v1.3 から（敵の大群・ボス戦の枠・ボスの強化・ボス戦の宝箱）。宝箱から懐中時計（10 秒間 2 倍速）が出る。ステージ 1 の開始から、全 3 ステージクリアまで',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: 'ステージ 1 クリア', minMs: 195e3 },
      { id: 'stage2', kind: 'stage', label: 'ステージ 2 クリア', minMs: 390e3 },
      { id: 'clear', kind: 'clear', label: '全 3 ステージクリア', minMs: 585e3 },
    ],
  },
  {
    id: 'workshop-golden',
    game: 'workshop',
    name: 'Workshop 黄金のエクステンション',
    rule: '1 周目（リセット直後・引き継ぎなし）。Day 1 の開店から、黄金のエクステンションの習得まで。再読み込みすると計測は消える',
    checkpoints: [
      { id: 'epic', kind: 'stage', label: 'Epic 解放（インペリアル製法）', minMs: 20 * 60e3 },
      { id: 'legendary', kind: 'stage', label: 'Legendary 解放（MCH製法）', minMs: 30 * 60e3 },
      { id: 'clear', kind: 'clear', label: '黄金のエクステンション', minMs: 50 * 60e3 },
    ],
  },
  {
    id: 'tactics-ch1',
    game: 'tactics',
    name: 'Tactics 第 1 章',
    rule: 'Common・ヒーロー自由。章選択で第 1 章を始めてから、第 1 章のボスを倒すまで。IGT はターン数',
    igt: 'turns',
    checkpoints: [{ id: 'ch1', kind: 'clear', label: '第 1 章クリア', minMs: 30e3 }],
  },
  {
    id: 'tactics-all5',
    game: 'tactics',
    name: 'Tactics 全 5 章',
    rule: 'Common・ヒーロー自由。章選択で第 1 章を始めてから、第 5 章のボスを倒すまで。IGT はターン数',
    igt: 'turns',
    checkpoints: [
      { id: 'ch1', kind: 'stage', label: '第 1 章クリア', minMs: 30e3 },
      { id: 'ch2', kind: 'stage', label: '第 2 章クリア', minMs: 50e3 },
      { id: 'ch3', kind: 'stage', label: '第 3 章クリア', minMs: 70e3 },
      { id: 'ch4', kind: 'stage', label: '第 4 章クリア', minMs: 90e3 },
      { id: 'clear', kind: 'clear', label: '全 5 章クリア', minMs: 120e3 },
    ],
  },
  {
    id: 'factory-lv5',
    game: 'factory',
    name: 'Factory 工房 Lv.5',
    rule: 'はじめから（セーブなし）。2018 年 12 月 1 週の開始から、期限（8 年）内に工房 Lv.5 まで。速さは 2 倍速まで。再読み込みすると計測は消える',
    checkpoints: [
      { id: 'lv2', kind: 'milestone', label: '工房 Lv.2', minMs: 4e3 },
      { id: 'lv3', kind: 'milestone', label: '工房 Lv.3', minMs: 6e3 },
      { id: 'lv4', kind: 'milestone', label: '工房 Lv.4', minMs: 10e3 },
      { id: 'clear', kind: 'clear', label: '工房 Lv.5（クリア）', minMs: 15e3 },
    ],
  },
  {
    id: '10buy-stage5',
    game: '10buy',
    name: '10 buy year ステージ 5（週数）',
    rule: '今週のチャレンジ（ふつう・継承なし・師匠なし・キャリアの型なし）を「RTA で挑む」で始めて、ステージ 5（事業化・多角化）まで。順位はステージ 5 に着いた週（ゲーム内）の少ない順、同じ週なら実時間。ゲームオーバー・事業売却で終わったら中断',
    igt: 'weeks',
    rank: 'igt',
    checkpoints: [
      { id: 'stage2', kind: 'stage', label: 'ステージ 2（副業安定）', minMs: 30e3, minIgt: 7 },
      { id: 'stage3', kind: 'stage', label: 'ステージ 3（専業）', minMs: 60e3, minIgt: 11 },
      { id: 'stage4', kind: 'stage', label: 'ステージ 4（法人化・拡大）', minMs: 120e3, minIgt: 47 },
      { id: 'clear', kind: 'clear', label: 'ステージ 5（事業化・多角化）', minMs: 180e3, minIgt: 51 },
    ],
  },
  {
    id: 'fortress-all',
    game: 'fortress',
    name: 'Fortress レベル 01〜09',
    rule: '新しいセーブ（引き継ぎなし）・3 倍速に固定（5 倍速は使えない）。RTA で始めてから、レベル 01〜09 を順にクリアするまで（負けてもやり直せる）。IGT はレベルを遊んだ時間の合計',
    checkpoints: [
      { id: 'L1', kind: 'stage', label: 'レベル 01 クリア', minMs: 20e3 },
      { id: 'L2', kind: 'stage', label: 'レベル 02 クリア', minMs: 35e3 },
      { id: 'L3', kind: 'stage', label: 'レベル 03 クリア', minMs: 50e3 },
      { id: 'L4', kind: 'stage', label: 'レベル 04 クリア', minMs: 65e3 },
      { id: 'L5', kind: 'stage', label: 'レベル 05 クリア', minMs: 85e3 },
      { id: 'L6', kind: 'stage', label: 'レベル 06 クリア', minMs: 105e3 },
      { id: 'L7', kind: 'stage', label: 'レベル 07 クリア', minMs: 120e3 },
      { id: 'L8', kind: 'stage', label: 'レベル 08 クリア', minMs: 140e3 },
      { id: 'clear', kind: 'clear', label: 'レベル 09 クリア（全レベル）', minMs: 160e3 },
    ],
  },
  {
    id: 'deckbattle-node1',
    game: 'deckbattle',
    name: 'DeckBattle 近代・日本',
    rule: 'RTA 用の新しいストーリー（本編のセーブとは別。プロローグ・操作の案内なし）。1-1 の出撃から、近代・日本の制覇（1-3 のレイドボス）まで。戦闘は ×4 固定・SKIP あり',
    checkpoints: [
      { id: 'stage1', kind: 'stage', label: '1-1 クリア', minMs: 5e3 },
      { id: 'stage2', kind: 'stage', label: '1-2 クリア', minMs: 12e3 },
      { id: 'clear', kind: 'clear', label: '近代・日本 制覇', minMs: 20e3 },
    ],
  },
  {
    id: 'deckbattle-quest',
    game: 'deckbattle',
    name: 'DeckBattle 10 勝でクリア',
    rule: 'フリーバトル（10 勝でクリア）。プレイヤー自由。プレイヤーを選んでから 10 勝まで。戦闘は ×4 固定・SKIP あり。再読み込みすると計測は消える',
    checkpoints: [
      { id: 'win5', kind: 'stage', label: '5 勝', minMs: 7e3 },
      { id: 'clear', kind: 'clear', label: '10 勝（クリア）', minMs: 15e3 },
    ],
  },
];

export const REGULATION_BY_ID = Object.fromEntries(REGULATIONS.map((r) => [r.id, r]));

// タイトルをまたぐ RTA（6.2・6.3・6.14）。各区間は、上のレギュレーションの区切り 1 つ。
// 公式タイムは各区間のタイム（その計測の開始から、その区切りまで）の合計。区間と区間のあいだの時間は数えない
//   windowMs：挑戦を始めてから、全区間を終えるまでの期限。各区間は、挑戦を始めたあとに始めて、期限までに終えた最初の記録を使う
//   segments[].regulations：その区間に数えるレギュレーション（同じ条件で同じ区切りを通るもの）
export const CROSS_WINDOW_MS = 24 * 3600e3;

export const CROSS_REGULATIONS = [
  {
    id: 'cross-first6',
    name: '6 タイトル 最初の区切り',
    rule: 'Survivor・Tactics・Workshop・Factory・Fortress・DeckBattle の RTA を、好きな順に、最初の区切りまで走る。各タイトルのルールはそのタイトルの RTA と同じ。公式タイムは 6 区間のタイムの合計（タイトルを移る時間は数えない）。挑戦を始めてから 24 時間以内に、6 区間とも終える',
    windowMs: CROSS_WINDOW_MS,
    segments: [
      { game: 'survivor', regulations: ['survivor-normal', 'survivor-normal-v2', 'survivor-normal-v3', 'survivor-normal-v4'], checkpoint: 'stage1', label: 'Survivor ステージ 1 クリア' },
      { game: 'tactics', regulations: ['tactics-ch1', 'tactics-all5'], checkpoint: 'ch1', label: 'Tactics 第 1 章クリア' },
      { game: 'workshop', regulations: ['workshop-golden'], checkpoint: 'epic', label: 'Workshop Epic 解放' },
      { game: 'factory', regulations: ['factory-lv5'], checkpoint: 'lv2', label: 'Factory 工房 Lv.2' },
      { game: 'fortress', regulations: ['fortress-all'], checkpoint: 'L1', label: 'Fortress レベル 01 クリア' },
      { game: 'deckbattle', regulations: ['deckbattle-node1'], checkpoint: 'stage1', label: 'DeckBattle 1-1 クリア' },
    ],
  },
];

export const CROSS_BY_ID = Object.fromEntries(CROSS_REGULATIONS.map((r) => [r.id, r]));

/** その計測の区切りが、横断 RTA のどの区間にあたるか（純関数）。あたらなければ -1 */
export function crossSegmentOf(cross, regulation, checkpointId) {
  return cross.segments.findIndex((sg) => sg.checkpoint === checkpointId && sg.regulations.includes(regulation));
}

/**
 * 区切りを受け取ったとき、横断 RTA の挑戦に区間として数えるか（純関数）。
 *   attempt：{ started_at, window_ms }、run：{ started_at }、filled：もう埋まっている区間の番号、at：受信時刻
 * 返り値：区間の番号か -1
 */
export function judgeCrossSegment(cross, attempt, run, regulation, checkpointId, at, filled) {
  if (at > attempt.started_at + cross.windowMs) return -1; // 期限切れ
  if (run.started_at < attempt.started_at) return -1; // 挑戦を始める前に始めた計測は数えない
  const seg = crossSegmentOf(cross, regulation, checkpointId);
  if (seg < 0 || filled.includes(seg)) return -1; // 埋まっている区間は最初の記録のまま
  return seg;
}

// 公開用（GET /api/rta/regulations）。横断 RTA は kind: 'cross'（game は 'cross'、区間を segments に）
export function publicRegulations() {
  return [
    ...REGULATIONS.filter((r) => !r.deprecated).map(({ id, game, name, rule, igt, rank, checkpoints }) => ({
      id,
      game,
      name,
      rule,
      igt: igt || 'ms',
      rank: rank || 'time',
      checkpoints: checkpoints.map(({ id: cid, kind, label }) => ({ id: cid, kind, label })),
    })),
    ...CROSS_REGULATIONS.filter((r) => !r.deprecated).map(({ id, name, rule, windowMs, segments }) => ({
      id,
      game: 'cross',
      kind: 'cross',
      name,
      rule,
      igt: null,
      windowMs,
      checkpoints: [],
      segments: segments.map(({ game, regulations, checkpoint, label }) => ({ game, regulation: regulations[0], regulations, checkpoint, label })),
    })),
  ];
}

/**
 * 区切りを受け取ったときの判定（純関数）。
 *   run：{ next_cp, started_at, last_active, max_idle_ms, reference }
 *   at：サーバーの受信時刻、idleMs：SDK が送る「ここまでで一番長かった無操作の時間」
 * 返り値：{ error } か { ord, elapsedMs, last, rejected, reference, maxIdleMs }
 */
export function judgeCheckpoint(reg, run, checkpointId, at, idleMs) {
  const ord = run.next_cp;
  const cp = reg.checkpoints[ord];
  if (!cp) return { error: 'finished' };
  if (cp.id !== checkpointId) return { error: 'order' };
  const elapsedMs = at - run.started_at;
  const activity = judgeActivity(run, at, idleMs);
  return {
    ord,
    elapsedMs,
    last: ord === reg.checkpoints.length - 1,
    rejected: elapsedMs < cp.minMs,
    ...activity,
  };
}

/** IGT で並べるレギュレーションの区切りの IGT が、ありえない値か（純関数。6.18）。prevIgt は前の区切りの IGT（なければ null） */
export function igtRejected(reg, ord, igt, prevIgt) {
  const cp = reg.checkpoints[ord];
  if (!cp || reg.rank !== 'igt') return false;
  if (igt == null) return true;
  if (cp.minIgt != null && igt < cp.minIgt) return true;
  return prevIgt != null && igt < prevIgt;
}

/** 「操作あり」・区切りを受け取ったときの、参考記録の判定（純関数） */
export function judgeActivity(run, at, idleMs) {
  const reported = Number.isFinite(idleMs) && idleMs > 0 ? Math.min(idleMs, at - run.started_at) : 0;
  const gap = at - run.last_active;
  const maxIdleMs = Math.max(run.max_idle_ms || 0, reported);
  const reference = !!run.reference || maxIdleMs >= IDLE_LIMIT_MS || gap > SERVER_GAP_MS;
  return { reference, maxIdleMs };
}
