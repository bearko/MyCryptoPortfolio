// SPEC-005 5.3：アイコン選びの一覧（assets/avatars.json）を資産リポジトリから作る。
//   node tools/make-avatars.mjs <bearko/mycryptoheroes の clone>
// Data/Heroes/heroes.json（2 MB）と Data/Extensions/extensions.json（7 MB）は画面で読むには大きいので、
// 図鑑に出るもの（is_dictionary_visible）の id と名前だけを抜く（60 KB ほど）。絵は raw URL（Image/Heroes/<id>.png 等）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('使い方: node tools/make-avatars.mjs <mycryptoheroes の clone>'); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pick = (file) => JSON.parse(readFileSync(join(src, file), 'utf8'))
  .filter((x) => String(x.is_dictionary_visible).toLowerCase() === 'true')
  .map((x) => [Number(x.id), (x.name && x.name.ja) || '', (x.name && x.name.en) || ''])
  .sort((a, b) => a[0] - b[0]);
const out = { generated: new Date().toISOString().slice(0, 10), heroes: pick('Data/Heroes/heroes.json'), exts: pick('Data/Extensions/extensions.json') };
writeFileSync(join(ROOT, 'assets/avatars.json'), JSON.stringify(out));
console.log(`heroes ${out.heroes.length} / exts ${out.exts.length} → assets/avatars.json (${readFileSync(join(ROOT, 'assets/avatars.json')).length} bytes)`);
