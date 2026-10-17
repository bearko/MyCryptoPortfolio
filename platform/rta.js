// RTA の定義（SPEC-001 6 章）。チェックポイントとレギュレーション。
// ID は変えない。区切りが変わったときは新しい ID を足し、古いものは deprecated: true にする（過去の記録は消さない）。
//   checkpoints：レギュレーションが通る区切り（決めた順番どおりに送る）
//     minMs：計測の開始からこれより速く着くのはありえない、という最短時間（6.5）
//   igt：IGT の単位。省略すると 'ms'（ゲーム内時間）。'turns' はターン数を igtMs の欄にそのまま入れる（Tactics。6.9）

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
];

export const REGULATION_BY_ID = Object.fromEntries(REGULATIONS.map((r) => [r.id, r]));

// 公開用（GET /api/rta/regulations）
export function publicRegulations() {
  return REGULATIONS.filter((r) => !r.deprecated).map(({ id, game, name, rule, igt, checkpoints }) => ({
    id,
    game,
    name,
    rule,
    igt: igt || 'ms',
    checkpoints: checkpoints.map(({ id: cid, kind, label }) => ({ id: cid, kind, label })),
  }));
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

/** 「操作あり」・区切りを受け取ったときの、参考記録の判定（純関数） */
export function judgeActivity(run, at, idleMs) {
  const reported = Number.isFinite(idleMs) && idleMs > 0 ? Math.min(idleMs, at - run.started_at) : 0;
  const gap = at - run.last_active;
  const maxIdleMs = Math.max(run.max_idle_ms || 0, reported);
  const reference = !!run.reference || maxIdleMs >= IDLE_LIMIT_MS || gap > SERVER_GAP_MS;
  return { reference, maxIdleMs };
}
