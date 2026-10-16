/*
 * bearko.games 共通基盤 SDK v1（SPEC-001 5 章）
 *
 *   <script src="https://bearko.games/sdk/v1.js"></script>
 *   await BearkoGames.init({ game: 'tactics', version: '1.2.0' });
 *   BearkoGames.getUser();          // { id, name } か null
 *   await BearkoGames.login();      // { ok, user }
 *   await BearkoGames.unlockTrophy('tactics.ch1');  // { ok, account, unlocked, total }
 *
 * 守ること：SDK が読めない・通信に失敗しても、ゲームは最後まで遊べる。
 * どの関数も例外を投げず、失敗は { ok: false, error } で返す。
 * ゲーム側は Cookie・localStorage に触らない（ログイン状態は bearko.games が持つ）。
 */
(function () {
  'use strict';
  if (window.BearkoGames) return;

  var ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*bearko\.games$/;
  var state = { base: 'https://bearko.games', game: null, version: null, user: null, guest: null, ready: false, ui: true, defs: null };
  var listeners = [];
  var trophyListeners = [];

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

  // トロフィーの定義（名前を出すため）。1 回だけ読む
  function loadDefs() {
    if (state.defs) return Promise.resolve(state.defs);
    return call('GET', '/api/trophies').then(function (r) {
      if (r.ok) {
        state.defs = {};
        (r.trophies || []).forEach(function (t) { state.defs[t.id] = t; });
      }
      return state.defs || {};
    });
  }

  // ---------------------------------------------------------------- 通知（画面の下に小さく出す）
  var toastHost = null;
  function toastRoot() {
    if (toastHost) return toastHost.shadowRoot;
    toastHost = document.createElement('div');
    toastHost.setAttribute('data-bearko-games', 'toast');
    var root = toastHost.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.wrap{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;display:grid;gap:8px;width:min(92vw,360px);pointer-events:none;font-family:"M PLUS 1p",system-ui,sans-serif}' +
      '.t{pointer-events:auto;background:#151926;color:#eef0f6;border:1px solid rgba(167,139,250,.6);border-radius:12px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:in .25s ease-out}' +
      '.k{font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.04em}' +
      '.n{font-size:15px;font-weight:700;margin-top:2px}' +
      '.g{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;color:#9aa1b5}' +
      'button{font:inherit;font-size:12px;font-weight:700;border:0;border-radius:8px;padding:6px 10px;background:#a78bfa;color:#140f24;cursor:pointer}' +
      '@keyframes in{from{opacity:0;transform:translateY(8px)}}' +
      '@media (prefers-reduced-motion:reduce){.t{animation:none}}' +
      '</style><div class="wrap" role="status" aria-live="polite"></div>';
    document.body.appendChild(toastHost);
    return root;
  }
  function showTrophyToast(def, account, total) {
    if (!state.ui || !document.body) return;
    try {
      var wrap = toastRoot().querySelector('.wrap');
      var el = document.createElement('div');
      el.className = 't';
      var k = document.createElement('div'); k.className = 'k'; k.textContent = 'トロフィー獲得';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = def ? def.name : '';
      el.appendChild(k); el.appendChild(n);
      if (account === 'guest') {
        var g = document.createElement('div'); g.className = 'g';
        var msg = document.createElement('span'); msg.textContent = '未登録のトロフィー ' + total + ' 個';
        var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'ログインして登録';
        btn.addEventListener('click', function () { el.remove(); api.login(); });
        g.appendChild(msg); g.appendChild(btn); el.appendChild(g);
      }
      wrap.appendChild(el);
      setTimeout(function () { el.remove(); }, account === 'guest' ? 8000 : 4500);
    } catch (e) { console.warn('[BearkoGames] toast', e); }
  }

  var api = {
    version: '1.1.0',

    /** 最初に 1 回。{ game, version, apiBase? }。ログイン状態を読みに行く */
    init: function (opts) {
      opts = opts || {};
      state.game = opts.game || null;
      state.version = opts.version || null;
      if (opts.ui === false) state.ui = false;
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

    /**
     * トロフィーを獲得する。未ログインなら仮アカウントに貯める（ログインしたときにまとめて登録）。
     * 新しく得たら通知を出す（init({ ui: false }) なら出さない）。{ ok, account, unlocked, total }
     */
    unlockTrophy: function (id) {
      return call('POST', '/api/trophies/unlock', { id: id }).then(function (r) {
        if (!r.ok) return r;
        if (r.account === 'guest') state.guest = state.guest || { id: null };
        if (r.unlocked && r.unlocked.length) {
          loadDefs().then(function (defs) {
            r.unlocked.forEach(function (tid) {
              showTrophyToast(defs[tid], r.account, r.total);
              for (var i = 0; i < trophyListeners.length; i++) {
                try { trophyListeners[i](defs[tid] || { id: tid }, r); } catch (e) { console.warn('[BearkoGames] onTrophy', e); }
              }
            });
          });
        }
        return r;
      });
    },

    /** 自分のトロフィー（未ログインなら仮アカウントのもの）。{ ok, account, trophies: [{id, at, name, ...}] } */
    getTrophies: function () {
      return Promise.all([loadDefs(), call('GET', '/api/me/trophies')]).then(function (x) {
        var defs = x[0], r = x[1];
        if (!r.ok) return r;
        r.trophies = (r.trophies || []).map(function (t) { return Object.assign({}, defs[t.id] || {}, t); });
        return r;
      });
    },

    /** トロフィーの定義の一覧 */
    getTrophyDefinitions: function () {
      return loadDefs().then(function (defs) {
        return { ok: true, trophies: Object.keys(defs).map(function (k) { return defs[k]; }) };
      });
    },

    /** 新しくトロフィーを得たら呼ばれる。解除する関数を返す */
    onTrophy: function (fn) {
      if (typeof fn === 'function') trophyListeners.push(fn);
      return function () { trophyListeners = trophyListeners.filter(function (f) { return f !== fn; }); };
    },

    // 段階 3 以降（スコア・RTA）で使う。仮アカウントを用意する
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
