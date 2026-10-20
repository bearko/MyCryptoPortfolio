// マインの案内（SPEC-008 4 章）。説明は段階に分け、遊ぶ前には「何を遊ぶか」だけを言う。
//   4.1 初めて来たとき：すぐ遊べる 3 本を紹介（ポータル）
//   4.3 ヒーローを 1 人でも呼び戻して戻ってきたとき：ポータルで「おかえり」→ アチーブメントの画面へ。
//       ヒーローの話は、名鑑が見えてから（解放の演出 6.4 のあと）。js/achievements.js が BgMine.story() を呼ぶ
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

  // ---------------------------------------------------------------- 4.3 戻ってきたとき（ポータル）：アチーブメントの画面へ誘う
  function welcomeBack(hero) {
    scene('08_sparkle', ['あっ、おかえり！ 君のプレイ、見てたよ！ とっても情熱的だった！', '「アチーブメント」を開いてみて。見せたいものがあるの！'], null, [
      { label: 'アチーブメントを見る', href: 'achievements/?hello=' + encodeURIComponent(hero.id) },
      { label: 'あとで', sub: true, on: function () { dlg.close(); } },
    ]);
  }

  // ---------------------------------------------------------------- 4.3 アチーブメントの画面：名鑑が見えてから 2 回だけ話す
  // 聞き終えたら true（記念のエクステンションを渡した）。途中で閉じたら false（次に開いたとき、もう一度話す）
  function story() {
    return new Promise(function (done) {
      var heard = false;
      dlg.addEventListener('close', function () { done(heard); }, { once: true });
      scene('09_cry', ['ここにいるのは、MyCryptoHeroes で活躍していたヒーローたち。', '2026 年 9 月のサービス終了で、みんな散り散りになっちゃったの……'], null, [
        { label: '次へ', on: function () {
          scene('02_both_arms_up', ['でもヒーローは、ゲームを遊ぶ情熱に引き寄せられて戻ってくるの。', '一緒にヒーロー名鑑を 100 人ぶん埋めて、みんなを呼び戻して！ お願い！'], null, [
            { label: '任せて！', on: function (e) {
              if (e.currentTarget.disabled) return;
              e.currentTarget.disabled = true;   // 2 度押しても 1 回だけ送る
              write('story');
              // 聞いてくれた記念のエクステンション（cross.welcome）。未ログインなら仮アカウントに貯まる
              fetch('/api/trophies/welcome', { method: 'POST', credentials: 'same-origin' }).catch(function () {}).then(function () { heard = true; dlg.close(); });
            } },
          ]);
        } },
      ]);
    });
  }

  var asked = new URLSearchParams(location.search).get('mine') === '1';
  // アチーブメントの画面から使う（js/achievements.js）
  window.BgMine = {
    pending: function () { return read() !== 'story' || asked; },
    story: story,
  };
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  if (document.getElementById('shelves')) return;   // アチーブメントの画面では、ここから先（ポータルの案内）は出さない

  // ---------------------------------------------------------------- どれを出すか
  var stage = read();
  if (stage === 'story' && !asked) return;
  Promise.all([
    fetch('/api/trophies').then(function (r) { return r.json(); }),
    fetch('/api/me/trophies', { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
  ]).then(function (x) {
    var defs = {};
    (x[0].trophies || []).forEach(function (t) { defs[t.id] = t; });
    var mineList = (x[1].trophies || []).slice().sort(function (a, b) { return a.at - b.at; });
    var hero = mineList.map(function (t) { return defs[t.id]; }).filter(function (d) { return d && d.kind === 'hero'; })[0];
    if (hero && (stage !== 'story' || asked)) return welcomeBack(hero);
    if (!hero && (stage === '' || asked)) intro();
  }).catch(function () { /* 案内が出ないだけ */ });
})();
