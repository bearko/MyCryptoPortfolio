// サムネイル（1200×630・WebP）を tools/thumbs/ のテンプレートから書き出す。手動実行。
//
//   npx http-server -p 4200 .          # リポジトリのルートで
//   node tools/make-thumbs.mjs          # thumbs.json の全件 + og-image.jpg
//   node tools/make-thumbs.mjs tcg      # 1件だけ
//
// 素材は bearko/mycryptoheroes などの raw URL から読むので、ネットワークが要ります。
// workshop / fortress / tenbuy は各作品の OGP 画像をそのまま使っているので、ここでは作りません。
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const base = process.env.BASE || 'http://127.0.0.1:4200';
const conf = JSON.parse(await readFile(join(here, 'thumbs/thumbs.json'), 'utf8'));
const args = process.argv.slice(2);
const ids = args.length ? args.filter((a) => a !== 'og') : Object.keys(conf);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

// Playwright は WebP を直接書けないので、撮った PNG をページの canvas で変換する
const toFormat = (png, type, quality) => page.evaluate(async ({ b64, type, quality }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL(type, quality).split(',')[1];
}, { b64: png.toString('base64'), type, quality });

const shoot = async (url, out, type = 'image/webp', quality = 0.82) => {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  await writeFile(out, Buffer.from(await toFormat(png, type, quality), 'base64'));
  console.log('wrote', out);
};

for (const id of ids) {
  await shoot(`${base}/tools/thumbs/template.html#${encodeURIComponent(JSON.stringify(conf[id]))}`,
    join(root, `assets/thumbs/${id}.webp`));
}
if (!args.length || args.includes('og')) {
  await shoot(`${base}/tools/thumbs/og.html`, join(root, 'og-image.jpg'), 'image/jpeg', 0.86);
}
await browser.close();
