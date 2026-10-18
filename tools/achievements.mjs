// アチーブメントの台帳（SPEC-008）の道具。デプロイには含めない（.assetsignore の tools）
//   node tools/achievements.mjs table              → docs/ACHIEVEMENT_CATALOG.md を書き直す
//   node tools/achievements.mjs check <資産リポジトリ> → 名前・絵の名前・レアリティを資産リポジトリの Data と照らし合わせる
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TROPHIES, GAME_NAMES, kindOf, rarityOf } from '../platform/trophies.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, repo] = process.argv.slice(2);

if (cmd === 'check') {
  if (!repo) throw new Error('資産リポジトリの場所を渡してください（例: ../mycryptoheroes）');
  const load = (p) => Object.fromEntries(JSON.parse(readFileSync(join(repo, p), 'utf8')).map((x) => [String(x.id), x]));
  const H = load('Data/Heroes/heroes.json');
  const E = load('Data/Extensions/extensions.json');
  let bad = 0;
  for (const t of TROPHIES) {
    const [kind, id] = t.avatar.split(':');
    const d = (kind === 'hero' ? H : E)[id];
    const skill = d && (kind === 'hero' ? d.passive?.name?.ja : d.active_skill?.name?.ja);
    const problems = [];
    if (!d) problems.push('資産リポジトリに無い');
    else {
      if (d.name.ja !== t.avatarName) problems.push(`avatarName ${t.avatarName} ≠ ${d.name.ja}`);
      if (skill !== t.name) problems.push(`name ${t.name} ≠ ${skill}`);
      if (d.rarity.name !== rarityOf(t.avatar)) problems.push(`rarity ${rarityOf(t.avatar)} ≠ ${d.rarity.name}`);
    }
    if (problems.length) { bad++; console.log(`✗ ${t.id}: ${problems.join(' / ')}`); }
  }
  console.log(bad ? `${bad} 件の食い違い` : `✓ ${TROPHIES.length} 件すべて資産リポジトリと合っている`);
  process.exit(bad ? 1 : 0);
}

if (cmd === 'table') {
  const row = (t) => `| ${t.no ? String(t.no).padStart(3, '0') : ''} | \`${t.id}\` | ${rarityOf(t.avatar)} | ${t.avatarName} | ${t.name} | ${t.description} |`;
  const head = '| No. | ID | レアリティ | 絵 | 名前 | 条件 |\n|---|---|---|---|---|---|';
  const out = ['# アチーブメントの一覧（SPEC-008）', '', '`node tools/achievements.mjs table` で `platform/trophies.js` から作る。手で直さない。', ''];
  const rar = (list) => ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map((r) => `${r} ${list.filter((t) => rarityOf(t.avatar) === r).length}`).join('・');
  const heroes = TROPHIES.filter((t) => kindOf(t.avatar) === 'hero');
  const exts = TROPHIES.filter((t) => kindOf(t.avatar) === 'ext');
  out.push(`## ヒーロー名鑑（${heroes.length} 枚：${rar(heroes)}）`, '');
  for (const g of [...new Set(heroes.map((t) => t.game))]) out.push(`### ${GAME_NAMES[g] || g}`, '', head, ...heroes.filter((t) => t.game === g).map(row), '');
  out.push(`## エクステンション（${exts.length} 個：${rar(exts)}）`, '', head, ...exts.map(row), '');
  writeFileSync(join(ROOT, 'docs/ACHIEVEMENT_CATALOG.md'), out.join('\n'));
  console.log('docs/ACHIEVEMENT_CATALOG.md');
  process.exit(0);
}
console.log('使い方: node tools/achievements.mjs table | check <資産リポジトリ>');
