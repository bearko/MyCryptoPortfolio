// KPI（SPEC-010 4 章）とチュートリアルの漏斗（6.2）の計算。DB にも画面にも触れない（テストしやすいように）。
// 日はすべて日本時間の日付（YYYY-MM-DD）。人の ID は数えるためだけに使い、結果には出さない。
import { jstDay } from './portal-stats.js';

const DAY_MS = 86400e3;
export const RR_DAYS = [1, 3, 7];

/** 日付に n 日を足す（YYYY-MM-DD） */
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** from から to まで（両端を含む）の日付 */
export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * 遊んだ日の行 [{ user, day }]（タイトル別ならそのゲームの行だけ。同じ人・日が重なってよい）から、
 * from〜to の日ごとの NUU・DAU・WAU・MAU・RR1/3/7 と、期間のまとめを出す。
 * 初めて遊んだ日を決めるため、行は to より前のすべてを渡す。today（いまの日）より前に終わった日だけを RR に数える
 */
export function kpi(rows, { from, to, today }) {
  const daysOf = new Map(); // 人 → 遊んだ日
  const usersOn = new Map(); // 日 → 遊んだ人
  for (const { user, day } of rows) {
    if (day > to) continue;
    if (!daysOf.has(user)) daysOf.set(user, new Set());
    daysOf.get(user).add(day);
    if (!usersOn.has(day)) usersOn.set(day, new Set());
    usersOn.get(day).add(user);
  }
  const newOn = new Map(); // 日 → その日が初めての人
  for (const [user, days] of daysOf) {
    let first = null;
    for (const d of days) if (first === null || d < first) first = d;
    if (!newOn.has(first)) newOn.set(first, []);
    newOn.get(first).push(user);
  }
  const activeIn = (end, span) => {
    const s = new Set();
    for (let i = 0; i < span; i++) for (const u of usersOn.get(addDays(end, -i)) || []) s.add(u);
    return s.size;
  };
  const pooled = Object.fromEntries(RR_DAYS.map((n) => [n, { kept: 0, of: 0 }]));
  const days = dayRange(from, to).map((day) => {
    const cohort = newOn.get(day) || [];
    const rr = {};
    for (const n of RR_DAYS) {
      const target = addDays(day, n);
      if (target >= today || !cohort.length) { rr[n] = target >= today ? null : { kept: 0, of: 0 }; continue; }
      const kept = cohort.filter((u) => daysOf.get(u).has(target)).length;
      rr[n] = { kept, of: cohort.length };
      pooled[n].kept += kept;
      pooled[n].of += cohort.length;
    }
    return { day, nuu: cohort.length, dau: (usersOn.get(day) || new Set()).size, wau: activeIn(day, 7), mau: activeIn(day, 30), rr };
  });
  const sum = (k) => days.reduce((a, d) => a + d[k], 0);
  const last = days[days.length - 1];
  return {
    days,
    summary: {
      nuu: sum('nuu'),
      dauAvg: days.length ? Math.round((sum('dau') / days.length) * 10) / 10 : 0,
      wau: last ? last.wau : 0,
      mau: last ? last.mau : 0,
      rr: Object.fromEntries(RR_DAYS.map((n) => [n, pooled[n].of ? pooled[n] : null])),
    },
  };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * チュートリアルの漏斗。rows：1 ゲームぶんの [{ user, step, stepId, at }]（at はミリ秒）。
 * 「始めた」（step 0）の時刻が fromMs〜toMs（toMs は含まない）の人を数える。
 * ある段に「着いた」は、その段かそれより先の段の記録があること（途中の段の記録が抜けていても、先へ進んだ人は通ったとみなす）。
 * activeDays（人 → 遊んだ日の Set。アカウントと結びつく人だけ）を渡すと、終えた人・終えなかった人の RR1・RR7 も出す（today より前に終わった日だけ）
 */
export function tutorialFunnel(rows, { fromMs, toMs, activeDays = null, today = null }) {
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user)) byUser.set(r.user, new Map());
    const m = byUser.get(r.user);
    if (!m.has(r.step) || r.at < m.get(r.step).at) m.set(r.step, r);
  }
  const cohort = [];
  for (const [user, m] of byUser) {
    const start = m.get(0);
    if (start && start.at >= fromMs && start.at < toMs) cohort.push({ user, steps: m, start: start.at, max: Math.max(...m.keys()) });
  }
  const stepNums = [...new Set(cohort.flatMap((c) => [...c.steps.keys()]))].sort((a, b) => a - b);
  const labelOf = (s) => {
    const n = new Map();
    for (const c of cohort) { const r = c.steps.get(s); if (r) n.set(r.stepId, (n.get(r.stepId) || 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? String(s);
  };
  let prev = cohort.length;
  const steps = stepNums.map((s) => {
    const reached = cohort.filter((c) => c.max >= s).length;
    const secs = cohort.filter((c) => c.steps.has(s)).map((c) => Math.round((c.steps.get(s).at - c.start) / 1000));
    const out = { step: s, id: labelOf(s), reached, ofStart: cohort.length ? reached / cohort.length : 0, ofPrev: prev ? reached / prev : 0, lost: prev - reached, medianSec: median(secs) };
    prev = reached;
    return out;
  });
  // いちばん人が減った段（始めた段は除く。同じ数なら手前）
  let worst = null;
  for (const st of steps) if (st.step > 0 && st.lost > 0 && (!worst || st.lost > worst.lost)) worst = st;
  // 終えた：'done' の段があればそこまで、なければいちばん先の段まで着いた
  const doneStep = steps.find((s) => s.id === 'done')?.step ?? (stepNums.length ? stepNums[stepNums.length - 1] : 0);
  const finished = (c) => c.max >= doneStep && stepNums.length > 1;
  const daily = new Map();
  for (const c of cohort) {
    const d = jstDay(c.start);
    const x = daily.get(d) || { day: d, started: 0, finished: 0 };
    x.started++;
    if (finished(c)) x.finished++;
    daily.set(d, x);
  }
  let retention = null;
  if (activeDays && today) {
    const rr = (group, n) => {
      let kept = 0, of = 0;
      for (const c of group) {
        const days = activeDays.get(c.user);
        if (!days) continue; // アカウントと結びつかない人（移した過去の分）
        const target = addDays(jstDay(c.start), n);
        if (target >= today) continue;
        of++;
        if (days.has(target)) kept++;
      }
      return of ? { kept, of } : null;
    };
    const done = cohort.filter(finished), notDone = cohort.filter((c) => !finished(c));
    retention = { finished: { 1: rr(done, 1), 7: rr(done, 7) }, unfinished: { 1: rr(notDone, 1), 7: rr(notDone, 7) } };
  }
  return {
    started: cohort.length,
    finished: cohort.filter(finished).length,
    doneStep,
    worstStep: worst ? worst.step : null,
    steps,
    daily: [...daily.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    retention,
  };
}
