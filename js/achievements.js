// アチーブメントの画面（SPEC-008 3 章）。定義は /api/trophies、獲得は /api/me/trophies（未ログインなら仮アカウントのもの）
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ASSET = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/';
  var ORDER = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common', 'Replica'];   // 上の棚ほど貴重
  var KIND_LABEL = { hero: 'ヒーロー', ext: 'エクステンション' };
  var data = { defs: [], owned: {}, games: {}, urls: {}, account: null };
  var view = { kind: 'hero', game: '', chapter: 1 };
  var fresh = {};   // 前に開いたときから増えたもの（額縁へ飾る演出。SPEC-008 6 章）

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function imgUrl(avatar) {
    var m = /^(hero|ext):(\d+)$/.exec(avatar || '');
    return m ? ASSET + (m[1] === 'hero' ? 'Image/Heroes/' : 'Image/Extensions/') + m[2] + '.png' : '';
  }
  function gameName(g) { return g === 'cross' ? 'タイトル横断' : (data.games[g] || g); }
  function shortName(g) { return gameName(g).replace(/^MyCrypto/, ''); }
  function numLabel(n) { return 'No.' + ('00' + n).slice(-3); }
  function date(ms) { return new Date(ms).toLocaleDateString('ja-JP'); }
  function ofKind(kind) { return data.defs.filter(function (d) { return d.kind === kind && (kind !== 'hero' || (d.chapter || 1) === view.chapter); }); }
  function chapters() {
    var cs = [];
    data.defs.forEach(function (d) { if (d.kind === 'hero' && cs.indexOf(d.chapter || 1) < 0) cs.push(d.chapter || 1); });
    return cs.sort(function (a, b) { return a - b; });
  }
  // その章の真のゲームクリア（最後の 1 枚）。一度得たら、章が増えても記録として残る（SPEC-008 2.4・5.2）
  function trueClearOf(chapter) { return data.defs.filter(function (d) { return d.trueClear && (d.chapter || 1) === chapter; })[0]; }
  function countOwned(list) { return list.filter(function (d) { return data.owned[d.id]; }).length; }

  // ---------------------------------------------------------------- 読み込み
  function load() {
    return Promise.all([
      fetch('/api/trophies').then(function (r) { return r.json(); }),
      fetch('/api/me/trophies', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return { account: null, trophies: [] }; }),
    ]).then(function (x) {
      data.defs = x[0].trophies || [];
      data.games = x[0].games || {};
      data.urls = x[0].gameUrls || {};
      data.account = x[1].account || null;
      data.owned = {};
      (x[1].trophies || []).forEach(function (t) { data.owned[t.id] = t; });
    });
  }

  // ---------------------------------------------------------------- 描画
  function renderTabs() {
    ['hero', 'ext'].forEach(function (k) {
      var list = ofKind(k);
      $('count-' + k).textContent = countOwned(list) + ' / ' + list.length;
      var tab = $('tab-' + k);
      tab.setAttribute('aria-selected', String(view.kind === k));
      tab.tabIndex = view.kind === k ? 0 : -1;
    });
    $('panel').setAttribute('aria-labelledby', 'tab-' + view.kind);
  }

  function renderProgress(list) {
    var got = countOwned(list), total = list.length;
    $('got').textContent = got;
    $('total').textContent = total;
    var pct = total ? Math.round(got / total * 100) : 0;
    $('bar-fill').style.width = pct + '%';
    $('bar').setAttribute('aria-valuenow', String(pct));
    $('bar').setAttribute('aria-label', KIND_LABEL[view.kind] + ' ' + got + ' / ' + total);
    var ul = $('by-rarity');
    ul.textContent = '';
    ORDER.forEach(function (r) {
      var inR = list.filter(function (d) { return d.rarity === r; });
      if (!inR.length) return;
      var li = el('li', 'r-' + r);
      li.style.setProperty('--rc', 'var(--r-' + r.toLowerCase() + ')');
      li.appendChild(el('b', null, r.toUpperCase()));
      li.appendChild(document.createTextNode(countOwned(inR) + '/' + inR.length));
      ul.appendChild(li);
    });
    // 真のゲームクリア：その章の最後の 1 枚を持っている（SPEC-008 2.4）
    var tc = trueClearOf(view.chapter);
    var done = view.kind === 'hero' && tc && data.owned[tc.id];
    $('complete').hidden = !done;
    if (done) {
      $('complete-n').textContent = '第 ' + view.chapter + ' 章 完成 — 真のゲームクリア';
      $('complete-date').textContent = date(data.owned[tc.id].at) + ' 達成';
    }
    var cl = $('chapter');
    cl.hidden = view.kind !== 'hero' || chapters().length < 2;
    cl.textContent = '第 ' + view.chapter + ' 章';
  }

  function renderFilters(list) {
    var nav = $('filters');
    nav.textContent = '';
    var games = [];
    list.forEach(function (d) { if (games.indexOf(d.game) < 0) games.push(d.game); });
    if (view.game && games.indexOf(view.game) < 0) view.game = '';
    if (view.kind === 'hero' && chapters().length > 1) {
      chapters().forEach(function (c) {
        var cb = el('button', 'chap', '第 ' + c + ' 章');
        cb.type = 'button';
        cb.setAttribute('aria-pressed', String(view.chapter === c));
        cb.addEventListener('click', function () { view.chapter = c; view.game = ''; render(); });
        nav.appendChild(cb);
      });
    }
    [''].concat(games).forEach(function (g) {
      var b = el('button', null, g ? shortName(g) : 'すべて');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(view.game === g));
      if (g) {
        var n = list.filter(function (d) { return d.game === g; });
        b.textContent += ' ' + countOwned(n) + '/' + n.length;
      }
      b.addEventListener('click', function () { view.game = g; render(); });
      nav.appendChild(b);
    });
  }

  function niche(d, i) {
    var got = !!data.owned[d.id];
    var b = el('button', 'niche r-' + d.rarity + (got ? ' got' : ' locked') + (fresh[d.id] ? ' placed' : ''));
    b.type = 'button';
    b.dataset.id = d.id;
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-label', (got ? d.avatarName : '未獲得の' + KIND_LABEL[d.kind]) + '（' + d.rarity + '）' + (got ? '「' + d.name + '」獲得済み' : '：' + gameName(d.game) + ' — ' + d.description));
    var frame = el('span', 'frame');
    var img = el('img');
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = imgUrl(d.avatar);
    frame.appendChild(img);
    if (d.no) frame.appendChild(el('span', 'no', numLabel(d.no)));   // 名鑑の番号
    var plaque = el('span', 'plaque');
    plaque.appendChild(el('span', 'rlabel', d.rarity.toUpperCase()));
    plaque.appendChild(el('b', null, got ? d.avatarName : '？？？'));
    plaque.appendChild(el('small', null, shortName(d.game)));
    if (fresh[d.id]) frame.appendChild(el('span', 'new', 'NEW'));
    b.appendChild(frame);
    b.appendChild(plaque);
    b.addEventListener('click', function () { openRelic(d); });
    return b;
  }

  function renderShelves(list) {
    var root = $('shelves');
    root.textContent = '';
    root.className = view.kind;
    var shown = view.game ? list.filter(function (d) { return d.game === view.game; }) : list;
    var i = 0;
    ORDER.forEach(function (r) {
      var inR = shown.filter(function (d) { return d.rarity === r; });
      if (!inR.length) return;
      var sec = el('section', 'shelf r-' + r);
      var h = el('h2', 'plate');
      h.appendChild(el('span', 'gem'));
      h.appendChild(document.createTextNode(r.toUpperCase()));
      h.appendChild(el('small', null, countOwned(inR) + ' / ' + inR.length));
      var grid = el('div', 'niches');
      inR.forEach(function (d) { grid.appendChild(niche(d, i++)); });
      sec.appendChild(h);
      sec.appendChild(grid);
      root.appendChild(sec);
    });
  }

  // 図鑑は Google ログインが要る（SPEC-008 3.4）。未ログインでも記録は仮アカウントに貯まっている
  function renderGate() {
    var locked = data.account !== 'login';
    $('gate').hidden = !locked;
    $('tabs').hidden = locked;
    $('panel').hidden = locked;
    if (!locked) return false;
    var n = Object.keys(data.owned).length;
    var d = $('gate-d');
    d.textContent = '';
    if (n) {
      d.appendChild(document.createTextNode('この端末に、まだ登録していないアチーブメントが '));
      d.appendChild(el('b', null, n + ' 個'));
      d.appendChild(document.createTextNode(' あります。ログインすると、まとめてアカウントに登録されます。'));
    } else {
      d.textContent = 'ログインしなくてもゲームは最後まで遊べ、アチーブメントもこの端末に記録されます。';
    }
    return true;
  }

  function render() {
    if (renderGate()) return;
    var list = ofKind(view.kind);
    renderTabs();
    renderProgress(list);
    renderFilters(list);
    renderShelves(list);
    renderNews();
  }

  // ---------------------------------------------------------------- 前に開いたときから増えたもの（SPEC-008 6.2）
  // この端末で最後に見た獲得の一覧を、アカウントごとに localStorage に置く。初めて開いたときは何も「新しい」にしない
  function seenKey() { var u = window.BearkoGames && window.BearkoGames.getUser(); return u ? 'bg.ach.seen.' + u.id : null; }
  var notedKey = null;   // 1 回の表示で 1 度だけ比べる（ログインの確認で描き直しても、増えた印を消さない）
  function noteFresh() {
    var key = seenKey();
    if (!key || key === notedKey) return;
    notedKey = key;
    fresh = {};
    var ids = Object.keys(data.owned), seen = null;
    try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { seen = null; }
    if (Array.isArray(seen)) ids.forEach(function (id) { if (seen.indexOf(id) < 0) fresh[id] = true; });
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) { /* 次も同じものが「新しい」に出るだけ */ }
  }
  function renderNews() {
    var n = $('news');
    var h = 0, x = 0;
    Object.keys(fresh).forEach(function (id) {
      var d = data.defs.filter(function (t) { return t.id === id; })[0];
      if (d) { if (d.kind === 'hero') h++; else x++; }
    });
    n.hidden = !(h || x);
    n.textContent = '前に見たときから、' + [h ? 'ヒーロー ' + h + ' 人' : '', x ? 'エクステンション ' + x + ' 個' : ''].filter(Boolean).join('・') + ' が飾られました';
  }

  // ---------------------------------------------------------------- 詳細
  function openRelic(d) {
    var got = data.owned[d.id];
    var dlg = $('relic'), body = $('relic-body');
    dlg.style.setProperty('--rc', 'var(--r-' + d.rarity.toLowerCase() + ')');
    dlg.classList.toggle('is-locked', !got);
    body.textContent = '';
    var x = el('button', 'x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '閉じる');
    x.addEventListener('click', function () { dlg.close(); });
    var big = el('div', 'big'); var img = el('img'); img.alt = ''; img.src = imgUrl(d.avatar); big.appendChild(img);
    var h = el('h2', null, got ? d.avatarName : '？？？'); h.id = 'relic-name';
    body.appendChild(x);
    body.appendChild(big);
    body.appendChild(el('span', 'ribbon', (d.no ? numLabel(d.no) + '　' : '') + d.rarity.toUpperCase()));
    body.appendChild(h);
    body.appendChild(el('p', 'ach', 'アチーブメント「' + d.name + '」'));
    var dl = el('dl');
    function row(k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    row('タイトル', gameName(d.game));
    row('条件', d.description);
    if (got) row('獲得', date(got.at));
    if (got && d.nameFrom) row('名前の由来', d.nameFrom);
    body.appendChild(dl);
    var acts = el('div', 'acts');
    if (data.urls[d.game]) {
      var play = el('a', 'btn', gameName(d.game) + ' を遊ぶ ↗');
      play.href = data.urls[d.game]; play.target = '_blank'; play.rel = 'noopener';
      acts.appendChild(play);
    }
    if (got && window.BearkoGames) {
      var av = el('button', 'btn sub', 'アイコン図鑑');
      av.type = 'button';
      av.addEventListener('click', function () { dlg.close(); window.BearkoGames.openAvatarPicker(); });
      acts.appendChild(av);
    }
    if (acts.childNodes.length) body.appendChild(acts);
    dlg.showModal();
  }
  $('relic').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // ---------------------------------------------------------------- タブ（←→ でも動く）
  function selectKind(k, focus) {
    view.kind = k;
    view.game = '';
    history.replaceState(null, '', k === 'hero' ? location.pathname : '?tab=' + k);
    render();
    if (focus) $('tab-' + k).focus();
  }
  ['hero', 'ext'].forEach(function (k) {
    $('tab-' + k).addEventListener('click', function () { selectKind(k); });
    $('tab-' + k).addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); selectKind(k === 'hero' ? 'ext' : 'hero', true); }
    });
  });
  if (new URLSearchParams(location.search).get('tab') === 'ext') view.kind = 'ext';

  // SDK はチャット・アイコン図鑑のため（読めなくても一覧は出す）。棚が横に広いので、PC でも右のドックではなく 💬 の窓
  var ready = window.BearkoGames ? window.BearkoGames.init({ game: 'portal', apiBase: location.origin, chat: { layout: 'float' } }).catch(function () {}) : Promise.resolve();
  // マインの案内から来たとき（?hello=<ID>）：呼び戻したヒーローの額縁を光らせる（SPEC-008 4.3）
  var hello = new URLSearchParams(location.search).get('hello');
  function greet() {
    if (!hello || data.account !== 'login') return;
    var card = document.querySelector('.niche[data-id="' + hello.replace(/[^a-z0-9._]/gi, '') + '"]');
    if (!card) return;
    card.classList.add('hello');
    card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    hello = null;
  }

  function show() {
    return load().then(function () {
      $('loading').hidden = true;
      if (data.account === 'login') noteFresh();
      render();
      greet();
      celebrate();
    });
  }
  // ---------------------------------------------------------------- 真のゲームクリアの演出（SPEC-008 6.1）。章ごとに 1 回（この端末）
  function celebrate() {
    if (data.account !== 'login') return;
    chapters().forEach(function (c) {
      var tc = trueClearOf(c);
      if (!tc || !data.owned[tc.id]) return;
      var key = 'bg.ach.cleared.' + tc.id;
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { return; }
      openFinale(c, tc);
    });
  }
  function openFinale(chapter, tc) {
    var dlg = $('finale'), body = $('finale-body');
    body.textContent = '';
    body.appendChild(el('p', 'fin-k', 'TRUE GAME CLEAR'));
    body.appendChild(el('h2', 'fin-t', 'ヒーロー名鑑 第 ' + chapter + ' 章 完成'));
    var parade = el('div', 'parade');
    var track = el('div', 'parade-track');
    var heroes = data.defs.filter(function (d) { return d.kind === 'hero' && (d.chapter || 1) === chapter; });
    [0, 1].forEach(function (k) {
      heroes.forEach(function (d) {
        var im = el('img'); im.alt = ''; im.src = imgUrl(d.avatar);
        if (k) im.setAttribute('aria-hidden', 'true');
        track.appendChild(im);
      });
    });
    track.style.setProperty('--n', String(heroes.length));
    parade.appendChild(track);
    body.appendChild(parade);
    var talk = el('div', 'fin-talk');
    var mine = el('img', 'fin-mine'); mine.alt = 'マイン'; mine.src = ASSET + 'Image/Characters/navi_ain_02_both_arms_up.png';
    var words = el('div');
    words.appendChild(el('p', null, 'みんな戻ってきた……！ ' + heroes.length + ' 人のヒーローが、君の情熱で呼び戻されたよ。'));
    words.appendChild(el('p', null, '本当にありがとう！ これが真のゲームクリアよ。'));
    talk.appendChild(mine); talk.appendChild(words);
    body.appendChild(talk);
    body.appendChild(el('p', 'fin-d', date(data.owned[tc.id].at) + ' 達成'));
    var acts = el('div', 'acts');
    var share = el('button', 'btn', '名鑑を共有'); share.type = 'button';
    share.addEventListener('click', function () { dlg.close(); openShare(); });
    var ok = el('button', 'btn sub', '閉じる'); ok.type = 'button';
    ok.addEventListener('click', function () { dlg.close(); });
    acts.appendChild(share); acts.appendChild(ok);
    body.appendChild(acts);
    dlg.showModal();
  }
  $('finale').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // ---------------------------------------------------------------- 名鑑の共有（SPEC-008 6.3）。画像はこの場でキャンバスに描く（サーバーに個人のページは作らない）
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  function shareCard() {
    var W = 1200, H = 630;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var heroes = data.defs.filter(function (d) { return d.kind === 'hero' && (d.chapter || 1) === view.chapter; });
    var exts = data.defs.filter(function (d) { return d.kind === 'ext'; });
    var mine = heroes.filter(function (d) { return data.owned[d.id]; });
    var rank = { Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };
    var show = mine.slice().sort(function (a, b) { return (rank[b.rarity] || 0) - (rank[a.rarity] || 0) || a.no - b.no; }).slice(0, 30);
    return Promise.all([document.fonts ? document.fonts.ready : null, loadImg(ASSET + 'Image/Icons/emblem.webp')].concat(show.map(function (d) { return loadImg(imgUrl(d.avatar)); }))).then(function (imgs) {
      var bg = g.createRadialGradient(W / 2, -80, 40, W / 2, -80, 760);
      bg.addColorStop(0, '#4a3a1c'); bg.addColorStop(1, '#0a0a0f');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(232,196,106,.55)'; g.lineWidth = 4; g.strokeRect(18, 18, W - 36, H - 36);
      if (imgs[1]) g.drawImage(imgs[1], 60, 52, 88, 88);
      g.fillStyle = '#e8c46a'; g.font = '700 22px Cinzel, serif'; g.fillText('HALL OF HEROES', 166, 82);
      g.fillStyle = '#fff1c2'; g.font = '800 46px "Shippori Mincho B1", serif'; g.fillText('ヒーロー名鑑' + (chapters().length > 1 ? ' 第 ' + view.chapter + ' 章' : ''), 166, 136);
      g.textAlign = 'right';
      g.fillStyle = '#fff1c2'; g.font = '700 96px Cinzel, serif'; g.fillText(String(mine.length), W - 220, 140);
      g.fillStyle = '#a8a196'; g.font = '700 46px Cinzel, serif'; g.fillText('/ ' + heroes.length, W - 70, 140);
      g.font = '700 22px "M PLUS 1p", sans-serif';
      g.fillText('エクステンション ' + exts.filter(function (d) { return data.owned[d.id]; }).length + ' / ' + exts.length, W - 70, 182);
      g.textAlign = 'left';
      // 帯
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(60, 210, W - 120, 10);
      g.fillStyle = '#e8c46a'; g.fillRect(60, 210, (W - 120) * (heroes.length ? mine.length / heroes.length : 0), 10);
      // 飾ったヒーロー
      g.imageSmoothingEnabled = false;
      var cols = 10, size = 96, gap = 12, x0 = (W - (cols * size + (cols - 1) * gap)) / 2;
      imgs.slice(2).forEach(function (im, i) {
        var x = x0 + (i % cols) * (size + gap), y = 244 + Math.floor(i / cols) * (size + gap);
        g.fillStyle = 'rgba(232,196,106,.10)'; g.fillRect(x, y, size, size);
        if (im) g.drawImage(im, x, y, size, size);
      });
      if (!show.length) { g.fillStyle = '#a8a196'; g.font = '700 28px "M PLUS 1p", sans-serif'; g.fillText('まだ名鑑は空っぽ。これから呼び戻す！', 60, 320); }
      g.fillStyle = '#a8a196'; g.font = '700 22px "M PLUS 1p", sans-serif'; g.fillText('bearko.games — マイクリのヒーローを呼び戻そう', 60, H - 52);
      var tc = trueClearOf(view.chapter);
      if (tc && data.owned[tc.id]) { g.textAlign = 'right'; g.fillStyle = '#ffc94d'; g.font = '800 30px "Shippori Mincho B1", serif'; g.fillText('真のゲームクリア', W - 70, H - 52); g.textAlign = 'left'; }
      return new Promise(function (res) { cv.toBlob(function (b) { res({ blob: b, url: cv.toDataURL('image/png'), got: mine.length, total: heroes.length }); }, 'image/png'); });
    });
  }
  function openShare() {
    var dlg = $('share'), body = $('share-body');
    body.textContent = '';
    body.appendChild(el('p', 'note', '画像を作っています…'));
    dlg.showModal();
    shareCard().then(function (c) {
      body.textContent = '';
      var x = el('button', 'x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '閉じる');
      x.addEventListener('click', function () { dlg.close(); });
      body.appendChild(x);
      body.appendChild(el('h2', 'share-t', '名鑑を共有'));
      var pv = el('img', 'share-img'); pv.alt = 'ヒーロー名鑑 ' + c.got + ' / ' + c.total; pv.src = c.url;
      body.appendChild(pv);
      var text = 'ヒーロー名鑑 ' + c.got + ' / ' + c.total + '　マイクリのヒーローを呼び戻しています #bearkogames';
      var link = 'https://bearko.games/achievements/';
      var acts = el('div', 'acts');
      var file = c.blob ? new File([c.blob], 'hero-book.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        var sh = el('button', 'btn', '共有…'); sh.type = 'button';
        sh.addEventListener('click', function () { navigator.share({ files: [file], text: text, url: link }).catch(function () {}); });
        acts.appendChild(sh);
      }
      var xp = el('a', 'btn' + (acts.childNodes.length ? ' sub' : ''), 'X に投稿 ↗');
      xp.href = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(link);
      xp.target = '_blank'; xp.rel = 'noopener';
      acts.appendChild(xp);
      var dl = el('a', 'btn sub', '画像を保存'); dl.href = c.url; dl.download = 'hero-book.png';
      acts.appendChild(dl);
      body.appendChild(acts);
      body.appendChild(el('p', 'note', 'X に投稿するときは、保存した画像を添えてください。'));
    }).catch(function () { body.textContent = ''; body.appendChild(el('p', 'note', '画像を作れませんでした。時間をおいてもう一度試してください。')); });
  }
  $('share').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('share-btn').addEventListener('click', openShare);

  $('gate-login').addEventListener('click', function () {
    if (!window.BearkoGames) return;
    window.BearkoGames.login().then(function (r) { if (r && r.ok) show(); });
  });
  if (window.BearkoGames) window.BearkoGames.onChange(function () { show(); });
  ready.then(show).catch(function () {
    $('loading').hidden = true;
    $('error').textContent = 'アチーブメントを読み込めませんでした。時間をおいて開き直してください。';
    $('error').hidden = false;
  });
})();
