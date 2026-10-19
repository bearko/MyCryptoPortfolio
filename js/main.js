import { GAMES, ASSETS, MOODS, FEATURED } from './games.js';

const ALL = [...GAMES, ASSETS];
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const sheet = $('sheet');
const body = $('sheet-body');
const lightbox = $('lightbox');
const lightboxImg = $('lightbox-img');
const MCH = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const esc = (s) => String(s).replace(/[&<>"']/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const thumb = (g) => `assets/thumbs/${g.id}.webp`;
const shot = (g, i) => `assets/shots/${g.id}-${i}.webp`;
const short = (t) => t.replace(/^MyCrypto/, '');
// 丸数字は ⓪①②… の並び（U+24EA と U+2460〜）
const circled = (n) => (n === 0 ? '⓪' : String.fromCodePoint(0x245f + n));
// トロフィーの絵（'hero:1003' / 'ext:20010'）→ 画像の URL
const avatarSrc = (a) => {
  const [kind, id] = String(a || '').split(':');
  if (!id) return null;
  return MCH + (kind === 'hero' ? 'Image/Heroes/' : 'Image/Extensions/') + id + '.png';
};

// ───────── 一覧 ─────────
// カードには「どう遊ぶか」を一言で出す。マウスを乗せる（スマホは画面の真ん中に来る）と、
// スクリーンショットが順に流れて、中身がひと目で分かる（デモの代わり）
$('count').textContent = GAMES.length;
grid.innerHTML = ALL.map((g, i) => `
  <button class="card${g === ASSETS ? ' asset' : ''}${g.playable === false ? ' wip' : ''}" style="--c:${g.accent};--i:${i}" data-id="${g.id}"
          aria-label="${esc(g.title)}（${esc(g.genre)}）の詳細">
    <span class="thumb">
      <img src="${thumb(g)}" alt="" loading="${g.no <= 4 ? 'eager' : 'lazy'}" decoding="async">
      ${g.shots ? '<span class="peek" aria-hidden="true"></span>' : ''}
      ${g.status !== '公開中' ? `<span class="badge">${esc(g.status)}</span>` : ''}
    </span>
    <span class="meta">
      <span class="no">${g.no}</span>
      <span class="names">
        <span class="name">${esc(g.title)}</span>
        <span class="genre">${esc(g.genre)}</span>
      </span>
    </span>
    ${g.play ? `<span class="play-how">${esc(g.play)}</span>` : ''}
  </button>`).join('');

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) open(card.dataset.id);
});

// スクリーンショットを順に流す（はじめて見るときに画像を読む）
function peek(card, on) {
  const box = card.querySelector('.peek');
  if (!box) return;
  if (on && !box.childElementCount) {
    const g = ALL.find((x) => x.id === card.dataset.id);
    // 背景はサムネイルをぼかしたもの。url() は CSS の変数に入れず、要素の style に直接書く（変数に入れると css/ からの相対パスになる）
    box.innerHTML = `<i class="peek-bg" style="background-image:url(${thumb(g)})"></i><img class="base" src="${shot(g, 1)}" alt="" decoding="async">` +
      Array.from({ length: g.shots }, (_, i) => `<img src="${shot(g, i + 1)}" alt="" decoding="async" style="--k:${i}">`).join('');
    box.style.setProperty('--n', g.shots);
  }
  card.classList.toggle('peeking', on);
}
if (!reduced) {
  if (matchMedia('(hover: hover)').matches) {
    grid.addEventListener('pointerover', (e) => { const c = e.target.closest('.card'); if (c) peek(c, true); });
    grid.addEventListener('pointerout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) peek(c, false); });
  } else if ('IntersectionObserver' in window) {
    // スマホ：画面の真ん中の帯にかかっているカードだけ流す（全部を同時に動かさない）
    const io = new IntersectionObserver((list) => list.forEach((x) => peek(x.target, x.isIntersecting)), { rootMargin: '-42% 0px -42% 0px' });
    grid.querySelectorAll('.card').forEach((c) => io.observe(c));
  }
  grid.addEventListener('focusin', (e) => { const c = e.target.closest('.card'); if (c) peek(c, true); });
  grid.addEventListener('focusout', (e) => { const c = e.target.closest('.card'); if (c) peek(c, false); });
}

// 遊び方で絞る（すべて・サクッと・アクション…）。合わないカードは隠す
const moods = $('moods');
moods.innerHTML = [{ id: '', label: 'すべて' }, ...MOODS]
  .map((m) => `<button type="button" class="mood" data-mood="${m.id}" aria-pressed="${m.id === ''}">${esc(m.label)}</button>`).join('');
moods.addEventListener('click', (e) => {
  const b = e.target.closest('.mood');
  if (!b) return;
  const id = b.dataset.mood;
  moods.querySelectorAll('.mood').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  grid.querySelectorAll('.card').forEach((c) => {
    const g = ALL.find((x) => x.id === c.dataset.id);
    c.hidden = !!id && !(g.moods || []).includes(id);
  });
});

// ───────── はじめての人に（カルーセル） ─────────
// 1 枚ずつ大きく：背景にサムネイル、右に縦のスクリーンショットを流す「スマホの画面」、
// 左に名前・一言・遊び方と「遊ぶ」。7 秒ごとに次へ（触っている間・見えていない間・動きを減らす設定では止める）
const track = $('feat-track');
const dots = $('feat-dots');
const feats = FEATURED.map((f) => ({ ...f, g: GAMES.find((x) => x.id === f.id) })).filter((f) => f.g);
track.innerHTML = feats.map(({ g, hook }, i) => `
  <article class="slide" style="--c:${g.accent}" data-id="${g.id}" aria-roledescription="スライド" aria-label="${i + 1} / ${feats.length}：${esc(g.title)}">
    <img class="slide-bg" src="${thumb(g)}" alt="" decoding="async">
    <div class="slide-tx">
      <img class="slide-hero" src="${g.icon}" alt="">
      <p class="slide-genre">${esc(g.genre)}</p>
      <h3 class="slide-title">${esc(short(g.title))}</h3>
      <p class="slide-hook">${esc(hook)}</p>
      <p class="slide-reward" data-reward="${g.id}" hidden></p>
      <div class="slide-acts">
        <a class="btn play" href="${g.url}" target="_blank" rel="noopener">今すぐ遊ぶ ↗</a>
        <button type="button" class="btn sub" data-open="${g.id}">どんなゲーム？</button>
      </div>
    </div>
    <div class="phone" aria-hidden="true" style="--n:${g.shots}">
      <img class="base" src="${shot(g, 1)}" alt="" loading="${i ? 'lazy' : 'eager'}" decoding="async">
      ${Array.from({ length: g.shots }, (_, k) => `<img src="${shot(g, k + 1)}" alt="" loading="${i ? 'lazy' : 'eager'}" decoding="async" style="--k:${k}">`).join('')}
    </div>
  </article>`).join('');
dots.innerHTML = feats.map(({ g }, i) => `<button type="button" class="dot" data-to="${i}" aria-label="${esc(short(g.title))}" aria-current="${i === 0}"></button>`).join('');

let featAt = 0;
const slides = () => [...track.children];
function featGo(i, smooth = true) {
  const n = feats.length;
  featAt = (i + n) % n;
  track.scrollTo({ left: slides()[featAt].offsetLeft - track.offsetLeft, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}
track.addEventListener('scroll', () => {
  const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  featAt = Math.min(feats.length - 1, Math.max(0, i));
  dots.querySelectorAll('.dot').forEach((d, k) => d.setAttribute('aria-current', String(k === featAt)));
  slides().forEach((s, k) => s.classList.toggle('on', k === featAt));
}, { passive: true });
slides()[0]?.classList.add('on');
dots.addEventListener('click', (e) => { const d = e.target.closest('.dot'); if (d) featGo(Number(d.dataset.to)); });
track.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) open(b.dataset.open); });

let hold = false; // 触っている・フォーカスがある間は送らない
const feat = $('feat');
['pointerenter', 'focusin', 'touchstart'].forEach((ev) => feat.addEventListener(ev, () => { hold = true; }, { passive: true }));
['pointerleave', 'focusout'].forEach((ev) => feat.addEventListener(ev, () => { hold = false; }));
let featSeen = true;
if ('IntersectionObserver' in window) new IntersectionObserver(([x]) => { featSeen = x.isIntersecting; }).observe(feat);
if (!reduced && feats.length > 1) {
  setInterval(() => { if (!hold && featSeen && !document.hidden && !sheet.open) featGo(featAt + 1); }, 7000);
}

// ───────── トロフィー（つづきから・おすすめの「最初のごほうび」） ─────────
// トロフィー 1 つが、呼び戻せるヒーロー／エクステンション 1 つ（SPEC-008）。
// 「次の節目」を見せて、もう一歩進みたくなるようにする（未ログインでも、この端末の記録で出る）
const ICON = Object.fromEntries(GAMES.map((g) => [g.id === 'tenbuy' ? '10buy' : g.id, g]));
const isGoal = (t) => !/\.visit$/.test(t.id);   // 「起動した」だけのものは節目に数えない

Promise.all([
  fetch('/api/trophies').then((r) => r.json()),
  fetch('/api/me/trophies', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({ trophies: [] })),
]).then(([defs, mine]) => {
  const byGame = {};
  for (const t of defs.trophies || []) if (t.game !== 'cross') (byGame[t.game] ||= []).push(t);
  const owned = new Map((mine.trophies || []).map((t) => [t.id, t.at]));

  // おすすめの各スライドに「最初の節目 → 戻ってくる仲間」を出す
  for (const el of track.querySelectorAll('[data-reward]')) {
    const gid = el.dataset.reward === 'tenbuy' ? '10buy' : el.dataset.reward;
    const first = (byGame[gid] || []).find(isGoal);
    if (!first || !first.avatarName) continue;
    const src = avatarSrc(first.avatar);
    el.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}<span><b>「${esc(first.avatarName)}」</b>が仲間になる：${esc(first.description)}</span>`;
    el.hidden = false;
  }

  // つづきから：最近トロフィーを取ったゲームから順に 3 本
  const recent = Object.entries(byGame)
    .map(([gid, list]) => ({ gid, list, last: Math.max(0, ...list.map((t) => owned.get(t.id) || 0)) }))
    .filter((x) => x.last > 0 && ICON[x.gid])
    .sort((a, b) => b.last - a.last)
    .slice(0, 3);
  if (!recent.length) return;
  $('cont-list').innerHTML = recent.map(({ gid, list }) => {
    const g = ICON[gid];
    const goals = list.filter(isGoal);
    const got = goals.filter((t) => owned.has(t.id)).length;
    const next = goals.find((t) => !owned.has(t.id));
    const src = next && avatarSrc(next.avatar);
    return `
      <a class="cont-card" href="${g.url}" target="_blank" rel="noopener" style="--c:${g.accent}">
        <img class="cont-icon" src="${g.icon}" alt="">
        <span class="cont-tx">
          <b>${esc(short(g.title))}</b>
          <span class="bar" role="img" aria-label="トロフィー ${got} / ${goals.length}"><i style="width:${Math.round((got / Math.max(1, goals.length)) * 100)}%"></i></span>
          <small>${next ? `次：${esc(next.description)}` : 'すべての節目を達成！'}</small>
        </span>
        ${next && src ? `<span class="cont-next" title="${esc(next.avatarName || '')}"><img src="${src}" alt="次に戻ってくる：${esc(next.avatarName || '')}"></span>` : ''}
        <span class="cont-go">つづける ↗</span>
      </a>`;
  }).join('');
  $('cont').hidden = false;
}).catch(() => { /* つづきから・ごほうびが出ないだけ */ });

// ───────── 背景をゆっくり流れるヒーロー ─────────
// ゲームのアイコンに使っているヒーローを数体、薄く下から上へ流す（飾り）
if (!reduced) {
  const drift = $('drift');
  const heroes = ['1001', '1002', '1003', '1004', '1006', '1007', '2001', '3002', '4003', '5001'];
  drift.innerHTML = heroes.map((h, i) => `<img src="${MCH}Image/Heroes/${h}.png" alt="" loading="lazy"
    style="--x:${(i * 37 + 7) % 100}%;--d:${28 + (i * 7) % 18}s;--delay:${-((i * 5.3) % 30)}s;--s:${0.7 + ((i * 3) % 5) / 10}">`).join('');
}

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
      </div>
    </div>

    <div class="stats">
      <div class="${g.status === '公開中' ? '' : 'st-wip'}"><b>${esc(g.status)}</b>状態</div>
      <div><b>${isAsset ? 'GitHub' : '無料'}</b>${isAsset ? '公開先' : 'ブラウザ'}</div>
      <div><b>${isAsset ? '402体' : 'スマホ / PC'}</b>${isAsset ? 'ヒーロー' : '対応'}</div>
    </div>

    <div class="actions">
      ${g.playable === false
        ? `<span class="btn play" role="link" aria-disabled="true">${esc(g.status)}のため、まだ遊べません</span>`
        : `<a class="btn play" href="${g.url}" target="_blank" rel="noopener">${esc(g.playLabel || 'プレイする')} ↗</a>`}
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
