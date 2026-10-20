// トップの BGM（MCH の craft.mp3。作者の依頼 2026-10-20）。
// ブラウザは操作の前に音を出させないので、開いたときに鳴らせなければ最初の操作（押す・キー）で鳴らし始める。
// 見出しの ♪ で止められ、止めたことはこの端末に覚える（bg.bgm）。タブを離れたら止め、戻ったら続きから
(function () {
  'use strict';
  var KEY = 'bg.bgm';
  var SRC = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/Audio/SE/Actions/craft.mp3';
  var VOLUME = 0.3;
  var btn = document.getElementById('bgm');
  if (!btn || typeof Audio === 'undefined') return;

  function wanted() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  var on = wanted();
  var audio = null;
  var fade = null;

  function player() {
    if (audio) return audio;
    audio = new Audio(SRC);   // 鳴らすときまで読みこまない（4MB ある）
    audio.loop = true;
    audio.volume = 0;
    return audio;
  }
  // 0 から VOLUME まで 1.2 秒かけて上げる（いきなり大きく鳴らさない）
  function fadeIn() {
    clearInterval(fade);
    var a = player();
    fade = setInterval(function () {
      a.volume = Math.min(VOLUME, a.volume + VOLUME / 24);
      if (a.volume >= VOLUME) clearInterval(fade);
    }, 50);
  }
  function play() {
    if (!on || document.hidden) return Promise.resolve(false);
    var a = player();
    if (!a.paused) return Promise.resolve(true);
    return a.play().then(function () { fadeIn(); return true; }, function () { return false; });
  }
  function stop() {
    clearInterval(fade);
    if (audio) audio.pause();
  }
  function paint() {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'BGM を止める' : 'BGM を鳴らす');
    btn.title = on ? 'BGM：オン' : 'BGM：オフ';
    btn.classList.toggle('off', !on);
  }

  btn.addEventListener('click', function () {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 次に開くと既定（オン）に戻るだけ */ }
    paint();
    if (on) play(); else stop();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else play(); });

  // 開いたときに鳴らせなければ、最初の操作で（♪ を押したときは上で決まるので数えない）
  function first(e) {
    if (e.target && e.target.closest && e.target.closest('#bgm')) return;
    play().then(function (ok) { if (ok || !on) off(); });
  }
  function off() { ['pointerdown', 'keydown'].forEach(function (t) { document.removeEventListener(t, first, true); }); }
  paint();
  if (on) {
    play().then(function (ok) {
      if (ok) return;
      ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, first, true); });
    });
  }
})();
