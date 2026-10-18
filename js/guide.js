// マインの案内（SPEC-008 4 章）。説明は段階に分け、遊ぶ前には「何を遊ぶか」だけを言う。
//   4.1 初めて来たとき：すぐ遊べる 3 本を紹介
//   4.3 ヒーローを 1 人でも呼び戻して戻ってきたとき：ヒーローの話 → 記念のエクステンション → アチーブメントの画面へ
// どこまで聞いたかはこの端末の localStorage（bg.guide）。ログインしなくても最後まで聞ける
(function () {
  'use strict';
  var KEY = 'bg.guide';
  var ASSET = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/';
  var mine = function (pose) { return ASSET + 'Image/Characters/navi_ain_' + pose + '.png'; };
  var dlg = document.getElementById('mine');
  if (!dlg || typeof dlg.showModal !== 'function') return;

  function read() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* 次に来たときもう一度出るだけ */ } }

  var PICKS = [
    { id: 'survivor', name: 'MyCryptoSurvivor', url: 'https://survivor.bearko.games/', img: 'Image/Heroes/1004.png', text: '逃げて、倒して、強くなる。最初のステージは 5 分' },
    { id: 'fortress', name: 'MyCryptoFortress', url: 'https://fortress.bearko.games/', img: 'Image/Heroes/1002.png', text: 'ヒーローを並べて、押し寄せる敵から守り抜く' },
    { id: 'workshop', name: 'MyCryptoWorkshop', url: 'https://workshop.bearko.games/', img: 'Image/Heroes/1007.png', text: 'エクステンションを作って売るお店。1 日は 1〜3 分' },
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 吹き出し 1 つぶんの画面。extra は吹き出しの下に置くもの、acts はボタン
  function scene(pose, lines, extra, acts) {
    dlg.textContent = '';
    var box = el('div', 'mine-in');
    var fig = el('img', 'mine-fig'); fig.alt = 'マイン'; fig.src = mine(pose);
    var talk = el('div', 'mine-talk');
    talk.appendChild(el('p', 'mine-who', 'マイン'));
    lines.forEach(function (l) { talk.appendChild(el('p', 'mine-line', l)); });
    box.appendChild(fig); box.appendChild(talk);
    dlg.appendChild(box);
    if (extra) dlg.appendChild(extra);
    var row = el('div', 'mine-acts');
    acts.forEach(function (a) {
      var b = el(a.href ? 'a' : 'button', 'mine-btn' + (a.sub ? ' sub' : ''), a.label);
      if (a.href) { b.href = a.href; if (a.blank) { b.target = '_blank'; b.rel = 'noopener'; } }
      else b.type = 'button';
      b.addEventListener('click', function (e) { if (a.on) a.on(e); });
      row.appendChild(b);
    });
    dlg.appendChild(row);
    if (!dlg.open) dlg.showModal();
    var first = row.querySelector('.mine-btn');
    if (first) first.focus();
  }

  // ---------------------------------------------------------------- 4.1 初めて来たとき
  function intro() {
    var list = el('div', 'mine-picks');
    PICKS.forEach(function (g) {
      var a = el('a', 'mine-pick');
      a.href = g.url; a.target = '_blank'; a.rel = 'noopener';
      var img = el('img'); img.alt = ''; img.src = ASSET + g.img;
      var tx = el('span', 'mine-pick-tx');
      tx.appendChild(el('b', null, g.name.replace(/^MyCrypto/, '')));
      tx.appendChild(el('small', null, g.text));
      a.appendChild(img); a.appendChild(tx); a.appendChild(el('span', 'mine-pick-go', '遊ぶ ↗'));
      a.addEventListener('click', function () { write('intro'); });
      list.appendChild(a);
    });
    scene('03_wave', ['ようこそ、bearko.games へ！ わたしはマイン。', 'ここはマイクリのヒーローたちが活躍するゲームの集まりよ。まずは、すぐに遊べるこの 3 つから選んでみて！'], list, [
      { label: 'あとで', sub: true, on: function () { write('intro'); dlg.close(); } },
    ]);
  }

  // ---------------------------------------------------------------- 4.3 戻ってきたとき
  function story(hero, gift) {
    var beats = [
      { pose: '08_sparkle', lines: ['あっ、おかえり！ 君のプレイ、見てたよ！ とっても情熱的だった！'] },
      { pose: '09_cry', lines: ['ここにいるのは、MyCryptoHeroes で活躍していたヒーローたち。', '2026 年 9 月のサービス終了で、みんな散り散りになっちゃったの……'] },
      { pose: '00_pointer_up', lines: ['でも研究して分かったの。ヒーローは「ゲームを遊ぶ情熱」に引き寄せられるって！', 'だから呼び戻すために、マイクリのゲームをたくさん作ったわ。'] },
      { pose: '05_wink', lines: ['……ヒーローが多すぎて、1 本じゃ収まらなかったけど。'] },
    ];
    var i = 0;
    function next() {
      if (i < beats.length) {
        var b = beats[i++];
        scene(b.pose, b.lines, null, [{ label: '次へ', on: next }]);
        return;
      }
      finale(hero, gift);
    }
    next();
  }

  function finale(hero, gift) {
    var show = el('div', 'mine-hero');
    var h = el('figure', 'mine-card');
    var hi = el('img'); hi.alt = ''; hi.src = ASSET + 'Image/Heroes/' + hero.avatar.split(':')[1] + '.png';
    h.appendChild(hi);
    h.appendChild(el('figcaption', null, hero.avatarName));
    show.appendChild(h);
    scene('02_both_arms_up', ['ほら、君の情熱で「' + hero.avatarName + '」が戻ってきてる！', '一緒にヒーロー名鑑を 100 人ぶん埋めて、みんなを呼び戻して！ お願い！'], show, [
      { label: '任せて！', on: function () { thanks(hero, gift); } },
    ]);
  }

  function thanks(hero, gift) {
    write('story');
    // 聞いてくれた記念のエクステンション（cross.welcome）。未ログインなら仮アカウントに貯まる
    fetch('/api/trophies/welcome', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
    var show = el('div', 'mine-hero');
    if (gift) {
      var g = el('figure', 'mine-card ext');
      var gi = el('img'); gi.alt = ''; gi.src = ASSET + 'Image/Extensions/' + gift.avatar.split(':')[1] + '.png';
      g.appendChild(gi);
      g.appendChild(el('figcaption', null, gift.avatarName));
      show.appendChild(g);
    }
    scene('06_smile', ['ありがとう！ これは聞いてくれたお礼よ。', '集めたヒーローとエクステンションは「アチーブメント」で見られるわ。'], show, [
      { label: 'アチーブメントを見る', href: 'achievements/?hello=' + encodeURIComponent(hero.id) },
      { label: 'あとで', sub: true, on: function () { dlg.close(); } },
    ]);
  }

  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  // ---------------------------------------------------------------- どれを出すか
  var stage = read();
  var asked = new URLSearchParams(location.search).get('mine') === '1';
  if (stage === 'story' && !asked) return;
  Promise.all([
    fetch('/api/trophies').then(function (r) { return r.json(); }),
    fetch('/api/me/trophies', { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
  ]).then(function (x) {
    var defs = {};
    (x[0].trophies || []).forEach(function (t) { defs[t.id] = t; });
    var mineList = (x[1].trophies || []).slice().sort(function (a, b) { return a.at - b.at; });
    var hero = mineList.map(function (t) { return defs[t.id]; }).filter(function (d) { return d && d.kind === 'hero'; })[0];
    if (hero && (stage !== 'story' || asked)) return story(hero, defs['cross.welcome']);
    if (!hero && (stage === '' || asked)) intro();
  }).catch(function () { /* 案内が出ないだけ */ });
})();
