// ポータルの計測（SPEC-009）を送る。トップ（js/main.js に同じものがある）以外のページ用。
// once を渡すと、そのタブで 1 回だけ数える（描き直し・再読みこみで増やさない）
(function () {
  'use strict';
  window.BgStat = function (e, s, once) {
    if (once) {
      try { var k = 'bg.stat.' + e + '.' + s; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (err) { /* 毎回数えるだけ */ }
    }
    try {
      var data = JSON.stringify({ e: e, g: '', s: s });
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/portal/event', new Blob([data], { type: 'text/plain' })))) {
        fetch('/api/portal/event', { method: 'POST', body: data, keepalive: true }).catch(function () {});
      }
    } catch (err) { /* 数えられないだけ */ }
  };
})();
