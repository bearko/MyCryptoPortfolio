// アチーブメントの画面（SPEC-008 3 章）。定義は /api/trophies、獲得は /api/me/trophies（未ログインなら仮アカウントのもの）
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ASSET = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/';
  var ORDER = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common', 'Replica'];   // 上の棚ほど貴重
  var KIND_LABEL = { hero: 'ヒーロー', ext: 'エクステンション' };
  var data = { defs: [], owned: {}, games: {}, urls: {}, account: null };
  var view = { kind: 'hero', game: '' };

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
  function ofKind(kind) { return data.defs.filter(function (d) { return d.kind === kind; }); }
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
    // 真のゲームクリア：ヒーロー名鑑がすべて埋まった（SPEC-008 2.4）
    var heroes = ofKind('hero');
    var done = heroes.length > 0 && countOwned(heroes) === heroes.length;
    $('complete').hidden = !(done && view.kind === 'hero');
    if (done) {
      var last = Math.max.apply(null, heroes.map(function (d) { return data.owned[d.id].at; }));
      $('complete-date').textContent = date(last) + ' 達成';
    }
  }

  function renderFilters(list) {
    var nav = $('filters');
    nav.textContent = '';
    var games = [];
    list.forEach(function (d) { if (games.indexOf(d.game) < 0) games.push(d.game); });
    if (view.game && games.indexOf(view.game) < 0) view.game = '';
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
    var b = el('button', 'niche r-' + d.rarity + (got ? ' got' : ' locked'));
    b.type = 'button';
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
  function show() {
    return load().then(function () {
      $('loading').hidden = true;
      render();
    });
  }
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
