// Survivor をヘッドレスの Chromium で自動プレイし、活動レポートのスコアを測る（総合スコアの係数の実測。SPEC-002 3.2）
//   (cd ../mycryptosurvivor && python3 -m http.server 8790)
//   node tools/e2e/survivor-autoplay.mjs <port> <ヒーローの番号 0〜9> <seed> <bot: circle|kite|still> <pick: owned|random> <ABSOLUTE の倍率 1|2|…>
//   1 行の JSON（score・kills・lv・ext・sec・ステージごと）を出す。時計は page.clock で早回しするので、1 回 1 分ほど
//   ゲームのファイルは配信のときに 3 か所だけ書き換える（state・levelup を window に出す、入力をボットに差し替える）
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [port = '8790', heroIdx = '0', seed = '1', bot = 'kite', pick = 'owned', abs = '1'] = process.argv.slice(2);
const BASE = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

// 外部への通信は止める（画像・音・SDK は無くても遊べる）
await page.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
const patch = (path, fn) => page.route(`${BASE}/js/${path}`, async (r) => {
  const res = await r.fetch();
  r.fulfill({ response: res, body: fn(await res.text()) });
});
await patch('state.js', (s) => s + '\nwindow.__state = state;\n');
await patch('battle/levelup.js', (s) => s + '\nwindow.__applyPick = applyPick;\n');
await patch('battle/input.js', (s) => s.replace('export function getInputVector() {',
  'export function getInputVector() {\n  if (window.__bot) return window.__bot();'));

await page.addInitScript(({ seed, bot }) => {
  // 乱数を固定（同じ seed なら同じプレイ）
  let x = (Number(seed) * 2654435761) >>> 0 || 1;
  Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  window.__botKind = bot;
  window.__bot = () => {
    const s = window.__state; if (!s || window.__botKind === 'still') return { x: 0, y: 0 };
    const b = s.battle, p = b.player;
    if (window.__botKind === 'circle') {
      // 世界の中を楕円に回り続ける（定番の動き）。近すぎる敵・弾だけ避け、近くの宝石は拾う
      const RX = 360, RY = 580;
      const a = Math.atan2(p.y / RY, p.x / RX);
      const rr = Math.hypot(p.x / RX, p.y / RY);
      let fx = -Math.sin(a) * RX / RY, fy = Math.cos(a);
      const tn = Math.hypot(fx, fy); fx /= tn; fy /= tn;
      fx += -Math.cos(a) * (rr - 1) * 2; fy += -Math.sin(a) * (rr - 1) * 2;
      // Survivor v1.2（SPEC-062〜064）：撃ってくる敵の弾・珠の列・パンチの印も避ける。木馬は止まっているので避けない
      const g12 = b.gimmick || { rows: [], punches: [] };
      const hazards = [];
      for (const row of g12.rows || []) {
        // Survivor SPEC-075：珠の列は横・縦・斜め。列のいちばん近い点から、列に直角な向きへ離れる（横の列は前と同じ）
        const ux = row.ux ?? 1, uy = row.uy ?? 0, x0 = row.x0, y0 = row.y0 ?? row.y;
        const sx = (p.x - x0) * ux + (p.y - y0) * uy;
        hazards.push({ x: x0 + ux * sx, y: y0 + uy * sx, r: 30, row: true, nx: -uy, ny: ux });
      }
      for (const pu of g12.punches || []) if (!pu.done) for (const h of pu.holes) hazards.push({ x: h.x, y: h.y, r: 40 });
      for (const hz of hazards) {
        const dx = p.x - hz.x, dy = p.y - hz.y, d = Math.hypot(dx, dy) || 1;
        const lim = hz.r + 40;
        if (d < lim) { const w = ((lim - d) / lim) * 6; if (hz.row) { const side = Math.sign(dx * hz.nx + dy * hz.ny) || 1; fx += hz.nx * side * w; fy += hz.ny * side * w; } else { fx += dx / d * w; fy += dy / d * w; } }
      }
      for (const e of [...b.enemies.filter((q) => !q.isProp && q.behavior !== 'trojan'), ...(b.bossProjectiles || []), ...(b.enemyShots || [])]) {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        const lim = (e.r || 8) + Number(window.__avoid || 34) + (e.isBoss ? 50 : 0);
        if (d < lim) { const w = ((lim - d) / lim) * 4; fx += dx / d * w; fy += dy / d * w; }
      }
      let g = null, gd = 1e9;
      for (const m of [...b.gems, ...(b.items || [])]) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < gd) { gd = d; g = m; } }
      if (g && gd < 140) { fx += (g.x - p.x) / gd * 0.8; fy += (g.y - p.y) / gd * 0.8; }
      for (const c of b.enemies) { if (c.propKind !== 'chest') continue; const d = Math.hypot(c.x - p.x, c.y - p.y) || 1; if (d < 450) { fx += (c.x - p.x) / d * 1.2; fy += (c.y - p.y) / d * 1.2; } }
      const n = Math.hypot(fx, fy) || 1; return { x: fx / n, y: fy / n };
    }
    // 近い敵から離れ（距離の 2 乗で重み）、横へも回る。安全なら一番近い宝石へ
    let fx = 0, fy = 0, near = 0;
    for (const e of b.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
      if (d > 260) continue;
      const w = (e.isBoss ? 3 : 1) / Math.max(d2, 100);
      fx += dx / d * w * 1e4; fy += dy / d * w * 1e4; if (d < 120) near++;
    }
    // ボスの弾も避ける
    for (const q of (b.bossProjectiles || [])) {
      const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
      if (d > 140) continue; const w = 1 / Math.max(d2, 100);
      fx += dx / d * w * 2e4; fy += dy / d * w * 2e4;
    }
    let tx = -fy * 0.6, ty = fx * 0.6; // 横へ回る成分
    fx += tx; fy += ty;
    if (near < 3) {
      let g = null, gd = 1e9;
      for (const m of [...b.gems, ...(b.items || [])]) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < gd) { gd = d; g = m; } }
      if (g && gd < 400) { fx += (g.x - p.x) / gd * 1.2; fy += (g.y - p.y) / gd * 1.2; }
    }
    // 世界の中心へ戻る弱い力（端に追い詰められない）
    fx += -p.x / 3000; fy += -p.y / 3000;
    const n = Math.hypot(fx, fy);
    return n < 0.05 ? { x: 0, y: 0 } : { x: fx / n, y: fy / n };
  };
}, { seed, bot });

await page.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
await page.goto(`${BASE}/index.html`);
for (let i = 0; i < 100 && !(await page.isVisible('#btnPressStart')); i++) {
  await page.clock.runFor(200);
  // Survivor SPEC-069：音を止められる環境では、読み込みのあとに「タップしてはじめる」が出る
  if (await page.isVisible('#splashTap')) await page.evaluate(() => document.getElementById('splash').click());
}
await page.evaluate(() => document.getElementById('btnPressStart').click());
await page.clock.runFor(900);   // 画面の切り替えのワイプ（640ms）を待つ
await page.evaluate(() => document.getElementById('btnModeNormal').click());
if (Number(abs) !== 1) await page.evaluate((m) => { const s = window.__state; s.regulation = 'ABSOLUTE'; s.absolute = { spawnMul: m, hpMul: m, dmgMul: m, speedMul: m }; }, Number(abs));
await page.clock.runFor(900);   // 画面の切り替えのワイプ（640ms）を待つ
const tiles = page.locator('#heroSelectGrid .hero-tile');
const nHero = await tiles.count();
await page.evaluate((i) => document.querySelectorAll('#heroSelectGrid .hero-tile')[i].click(), Number(heroIdx) % nHero);
const heroName = await page.evaluate(() => {
  const h = window.__state.pendingHeroPick; return String(h);
});
await page.clock.runFor(100);
await page.evaluate(() => document.getElementById('heroSelectCta').click());

let result = null;
for (let step = 0; step < 4000; step++) {
  await page.clock.runFor(1000);
  const st = await page.evaluate(({ pick }) => {
    const s = window.__state;
    const vis = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
    if (vis('levelUpModal')) {
      // owned：持っている物の強化を優先、random：無作為
      let i = 0; let n = 0;
      while (vis('levelUpModal') && n++ < 20) {
        const opts = s.pendingPickOptions || [];
        if (!opts.length) break;
        const ownedIds = new Set(s.ownedExtensions.map((o) => String(o.extId)));
        let o = opts[Math.floor(Math.random() * opts.length)];
        if (pick === 'owned') o = opts.find((x) => ownedIds.has(String(x.extId))) || o;
        window.__applyPick(o.extId); i++;
      }
      return { kind: 'levelup', i };
    }
    if (vis('stageTransitionModal')) { document.getElementById('stageTransitionProceed').click(); return { kind: 'next', stages: s.run.stages.length }; }
    if (vis('activityReportModal')) return { kind: 'clear', run: JSON.parse(JSON.stringify(s.run)) };
    if (vis('gameOverModal')) return { kind: 'dead', run: JSON.parse(JSON.stringify(s.run)), stage: s.currentStageIdx, el: s.battle.stageElapsedMs, kills: s.killCount, level: s.level };
    return { kind: 'run' };
  }, { pick });
  if (st.kind === 'clear' || st.kind === 'dead') { result = st; break; }
}

function computeScore(run) { // js/battle/activity-report.js と同じ式
  const kills = run.totalKills ?? 0, sec = (run.totalElapsedMs ?? 0) / 1000;
  const ext = new Set(); let lv = 1;
  for (const s of run.stages) { if ((s.level ?? 1) > lv) lv = s.level; for (const o of s.ownedExtensions ?? []) ext.add(String(o.extId)); }
  const speed = Math.max(0, 60000 - Math.round(sec * 50));
  return { score: kills * 100 + lv * 500 + ext.size * 300 + speed + 5000, kills, lv, ext: ext.size, sec: Math.round(sec), speed };
}
const out = { hero: heroName, heroIdx: Number(heroIdx), seed, bot, pick, abs: Number(abs), kind: result?.kind ?? 'timeout' };
if (result?.run) {
  Object.assign(out, computeScore(result.run));
  out.stages = result.run.stages.map((s) => ({ ms: Math.round(s.elapsedMs), kills: s.kills, lv: s.level, ext: s.ownedExtensions.length }));
  if (result.kind === 'dead') out.deadAt = { stage: result.stage, sec: Math.round(result.el / 1000), kills: result.kills, lv: result.level };
}
console.log(JSON.stringify(out));
await browser.close();
