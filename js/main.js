import { GAMES, ASSETS } from './games.js';

const ALL = [...GAMES, ASSETS];
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const sheet = $('sheet');
const body = $('sheet-body');
const lightbox = $('lightbox');
const lightboxImg = $('lightbox-img');

const esc = (s) => String(s).replace(/[&<>"']/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const thumb = (g) => `assets/thumbs/${g.id}.webp`;
const shot = (g, i) => `assets/shots/${g.id}-${i}.webp`;
// 丸数字は ⓪①②… の並び（U+24EA と U+2460〜）
const circled = (n) => (n === 0 ? '⓪' : String.fromCodePoint(0x245f + n));

// ───────── 一覧 ─────────
$('count').textContent = GAMES.length;
grid.innerHTML = ALL.map((g) => `
  <button class="card${g === ASSETS ? ' asset' : ''}" style="--c:${g.accent}" data-id="${g.id}"
          aria-label="${esc(g.title)}（${esc(g.genre)}）の詳細">
    <span class="thumb">
      <img src="${thumb(g)}" alt="" loading="${g.no <= 4 ? 'eager' : 'lazy'}" decoding="async">
      ${g.status !== '公開中' ? `<span class="badge">${esc(g.status)}</span>` : ''}
    </span>
    <span class="meta">
      <span class="no">${g.no}</span>
      <span class="names">
        <span class="name">${esc(g.title)}</span>
        <span class="genre">${esc(g.genre)}</span>
      </span>
    </span>
  </button>`).join('');

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) open(card.dataset.id);
});

// ───────── 詳細シート ─────────
let current = null;

function render(g) {
  const isAsset = g === ASSETS;
  const shots = Array.from({ length: g.shots }, (_, i) => shot(g, i + 1));
  sheet.style.setProperty('--accent', g.accent);
  body.innerHTML = `
    <div class="sh-bar">
      <span class="grab" aria-hidden="true"></span>
      <div class="sh-nav">
        <button class="icon-btn" data-step="-1" aria-label="前の作品">‹</button>
        <button class="icon-btn" data-step="1" aria-label="次の作品">›</button>
      </div>
      <button class="icon-btn" data-close aria-label="閉じる">✕</button>
    </div>

    <div class="app-row">
      <div class="app-icon"><img src="${g.icon}" alt=""></div>
      <div>
        <h2 class="app-title" id="sheet-title">${circled(g.no)} ${esc(g.title)}</h2>
        <p class="app-genre">${esc(g.genre)}</p>
        <p class="app-origin">${isAsset ? '原作' : '元ネタ'}：${esc(g.origin)}</p>
      </div>
    </div>

    <div class="stats">
      <div class="${g.status === '公開中' ? '' : 'st-wip'}"><b>${esc(g.status)}</b>状態</div>
      <div><b>${isAsset ? 'GitHub' : '無料'}</b>${isAsset ? '公開先' : 'ブラウザ'}</div>
      <div><b>${isAsset ? '402体' : 'スマホ / PC'}</b>${isAsset ? 'ヒーロー' : '対応'}</div>
    </div>

    <div class="actions">
      <a class="btn play" href="${g.url}" target="_blank" rel="noopener">${esc(g.playLabel || 'プレイする')} ↗</a>
      ${isAsset ? '' : `<a class="btn sub" href="${g.repo}" target="_blank" rel="noopener">GitHub</a>`}
    </div>

    <div class="shots" aria-label="スクリーンショット">
      ${shots.map((src, i) => `<button class="tall" data-zoom="${src}">
        <img src="${src}" alt="${esc(g.title)} のスクリーンショット ${i + 1}"></button>`).join('')}
      <button class="wide" data-zoom="${thumb(g)}"><img src="${thumb(g)}" alt="${esc(g.title)} のサムネイル"></button>
    </div>

    <section class="about">
      <h3>${isAsset ? 'このリポジトリについて' : 'このゲームについて'}</h3>
      <p class="lead">${esc(g.lead)}</p>
      <p>${esc(g.body)}</p>
      <div class="tags">${g.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    </section>`;
  body.scrollTop = 0;
}

function open(id, { push = true } = {}) {
  const g = ALL.find((x) => x.id === id);
  if (!g) return;
  current = g;
  render(g);
  if (!sheet.open) sheet.showModal();
  if (push && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}

function close() {
  if (sheet.open) sheet.close();
}

function step(d) {
  const i = ALL.indexOf(current);
  open(ALL[(i + d + ALL.length) % ALL.length].id);
}

sheet.addEventListener('close', () => {
  current = null;
  lightbox.hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
});

sheet.addEventListener('click', (e) => {
  if (e.target === sheet) return close();          // 背景（::backdrop）を押したら閉じる
  if (e.target.closest('[data-close]')) return close();
  const s = e.target.closest('[data-step]');
  if (s) return step(Number(s.dataset.step));
  const z = e.target.closest('[data-zoom]');
  if (z) { lightboxImg.src = z.dataset.zoom; lightbox.hidden = false; return; }
  if (e.target.closest('#lightbox')) lightbox.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (!sheet.open) return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'Escape' && !lightbox.hidden) { e.preventDefault(); lightbox.hidden = true; }
});

// #tactics のようなリンクで直接その作品を開ける
const fromHash = () => {
  const id = location.hash.slice(1);
  if (id) open(id, { push: false }); else close();
};
window.addEventListener('hashchange', fromHash);
fromHash();
