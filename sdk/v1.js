/*
 * bearko.games 共通基盤 SDK v1（SPEC-001 5 章）
 *
 *   <script src="https://bearko.games/sdk/v1.js"></script>
 *   await BearkoGames.init({ game: 'tactics', version: '1.2.0' });
 *   BearkoGames.getUser();          // { id, name } か null
 *   await BearkoGames.login();      // { ok, user }
 *
 * 守ること：SDK が読めない・通信に失敗しても、ゲームは最後まで遊べる。
 * どの関数も例外を投げず、失敗は { ok: false, error } で返す。
 * ゲーム側は Cookie・localStorage に触らない（ログイン状態は bearko.games が持つ）。
 */
(function () {
  'use strict';
  if (window.BearkoGames) return;

  var ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*bearko\.games$/;
  var state = { base: 'https://bearko.games', game: null, version: null, user: null, guest: null, ready: false };
  var listeners = [];

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state.user); } catch (e) { console.warn('[BearkoGames] onChange', e); }
    }
  }

  function call(method, path, body) {
    var opt = { method: method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(state.base + path, opt)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return res.ok ? Object.assign({ ok: true }, data) : { ok: false, status: res.status, error: data.error || 'http_' + res.status };
        });
      })
      .catch(function (e) { return { ok: false, error: 'network', detail: String(e && e.message || e) }; });
  }

  function refresh() {
    return call('GET', '/api/me').then(function (r) {
      if (r.ok) {
        var before = JSON.stringify(state.user);
        state.user = r.user || null;
        state.guest = r.guest || null;
        if (JSON.stringify(state.user) !== before) emit();
      }
      return r.ok ? { ok: true, user: state.user } : r;
    });
  }

  var api = {
    version: '1.0.0',

    /** 最初に 1 回。{ game, version, apiBase? }。ログイン状態を読みに行く */
    init: function (opts) {
      opts = opts || {};
      state.game = opts.game || null;
      state.version = opts.version || null;
      if (opts.apiBase) state.base = String(opts.apiBase).replace(/\/+$/, '');
      return refresh().then(function (r) { state.ready = true; return r; });
    },

    /** ログイン中なら { id, name }、していなければ null */
    getUser: function () { return state.user ? { id: state.user.id, name: state.user.name } : null; },

    /** 仮アカウント（未ログインで記録を貯めている）があるか */
    hasGuest: function () { return !!state.guest; },

    /** ログイン状態が変わったら呼ばれる。解除する関数を返す */
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    /** ログイン画面をポップアップで開く。開けなければページを移動して戻ってくる */
    login: function () {
      return new Promise(function (resolve) {
        var url = state.base + '/login/?origin=' + encodeURIComponent(location.origin);
        var w = 480, h = 640;
        var left = Math.max(0, (screen.width - w) / 2), top = Math.max(0, (screen.height - h) / 2);
        var popup = null;
        try { popup = window.open(url, 'bearko-games-login', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top); } catch (e) { popup = null; }
        if (!popup) {
          location.href = state.base + '/login/?return=' + encodeURIComponent(location.href);
          return; // ページを移るので resolve しない
        }
        var done = false;
        function finish(result) {
          if (done) return;
          done = true;
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          resolve(result);
        }
        function onMessage(ev) {
          if (ev.origin !== state.base || !ev.data || ev.data.type !== 'bearko-games:login') return;
          state.user = ev.data.user || null;
          state.guest = null;
          emit();
          finish({ ok: true, user: api.getUser() });
        }
        window.addEventListener('message', onMessage);
        // 閉じられたら、念のため状態を読み直して終える
        var timer = setInterval(function () {
          if (popup.closed) {
            clearInterval(timer);
            refresh().then(function () { finish(state.user ? { ok: true, user: api.getUser() } : { ok: false, error: 'closed' }); });
          }
        }, 500);
      });
    },

    /** この端末のログインを終える */
    logout: function () {
      return call('POST', '/api/auth/logout', {}).then(function (r) {
        if (r.ok) { state.user = null; emit(); }
        return r;
      });
    },

    /** 表示名を変える（ログイン中だけ） */
    setName: function (name) {
      return call('POST', '/api/me/name', { name: name }).then(function (r) {
        if (r.ok && r.user) { state.user = r.user; emit(); }
        return r;
      });
    },

    // 段階 2 以降（トロフィー・スコア・RTA）で使う。仮アカウントを用意する
    _ensureGuest: function () {
      if (state.user) return Promise.resolve({ ok: true, user: state.user });
      return call('POST', '/api/guest', {}).then(function (r) {
        if (r.ok) state.guest = r.guest;
        return r;
      });
    },
  };

  // bearko.games 以外（ローカル開発など）で読まれたとき用の目印
  api.isBearkoGames = ORIGIN_RE.test(location.origin);
  window.BearkoGames = api;
})();
