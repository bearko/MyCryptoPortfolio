// ゲームを本番と同じ形（https://<game>.bearko.games ＋ https://bearko.games）でブラウザに開き、
// SDK が読めること・エラーがないこと・送った成績が共通基盤に届くことを確かめる。
//
//   1) node tools/e2e/server.mjs                          （共通基盤。8788）
//   2) ゲームを 8790 で配信（例：cd ../mycryptosurvivor && python3 -m http.server 8790。Vite のゲームは dist を配信）
//   3) node tools/e2e/game-check.mjs <game のサブドメイン> [ページのパス] [ブラウザで実行する式]
//      例：node tools/e2e/game-check.mjs survivor / "BearkoGames.submitScore({ stagesCleared: 1, cleared: false })"
//
// Playwright が要る：npm i --no-save playwright（このリポジトリの依存には入れない）。
// ブラウザの場所を変えるときは CHROMIUM_PATH、Playwright の場所を変えるときは PLAYWRIGHT_MODULE。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [sub = 'survivor', path = '/', expr = ''] = process.argv.slice(2);
const PLATFORM = process.env.PLATFORM_URL || 'http://localhost:8788';
const GAME = process.env.GAME_URL || 'http://localhost:8790';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const result = {};
for (const mode of ['offline', 'online']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await ctx.route('https://bearko.games/**', async (r) => {
    if (mode === 'offline') return r.abort(); // SDK が読めなくても遊べるか
    const u = new URL(r.request().url());
    await r.fulfill({ response: await r.fetch({ url: PLATFORM + u.pathname + u.search }) });
  });
  await ctx.route(`https://${sub}.bearko.games/**`, async (r) => {
    const u = new URL(r.request().url());
    await r.fulfill({ response: await r.fetch({ url: GAME + u.pathname + u.search }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`https://${sub}.bearko.games${path}`);
  await page.waitForTimeout(3000);
  const out = { title: await page.title(), sdk: await page.evaluate(() => typeof window.BearkoGames), errors };
  if (mode === 'online' && expr) {
    out.result = await page.evaluate((e) => Promise.resolve((0, eval)(e)), expr).catch((e) => String(e));
    await page.waitForTimeout(1000);
    out.toast = await page.evaluate(() => document.querySelector('[data-bearko-games="toast"]')?.shadowRoot?.querySelector('.wrap')?.innerText || null);
  }
  result[mode] = out;
  await ctx.close();
}
console.log(JSON.stringify(result, null, 1));
await browser.close();
