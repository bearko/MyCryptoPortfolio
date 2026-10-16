/*
 * bearko.games 共通基盤 SDK v1（SPEC-001 5 章）
 *
 *   <script src="https://bearko.games/sdk/v1.js"></script>
 *   await BearkoGames.init({ game: 'tactics', version: '1.2.0' });
 *   BearkoGames.getUser();          // { id, name } か null
 *   await BearkoGames.login();      // { ok, user }
 *   await BearkoGames.unlockTrophy('tactics.ch1');  // { ok, account, unlocked, total }
 *   await BearkoGames.rta.start({ regulation: 'survivor-normal' });   // RTA の計測を始める
 *   await BearkoGames.rta.checkpoint('stage1', { igtMs: 240000 });     // 区切り。最後の区切りで終わる
 *   BearkoGames.rta.abort();                                           // 中断（ゲームオーバーなど）
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
      '.s{font-size:12px;color:#c9cde0;margin-top:4px;line-height:1.5}' +
      '.n.time{font-variant-numeric:tabular-nums;font-size:22px}' +
      'a{color:#c4b5fd;font-size:12px;font-weight:700}' +
      '.timer{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none;font-family:"M PLUS 1p",system-ui,sans-serif;font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;color:#eef0f6;background:rgba(21,25,38,.82);border:1px solid rgba(167,139,250,.6);border-radius:999px;padding:3px 12px;letter-spacing:.02em}' +
      '.timer.top{top:max(8px,env(safe-area-inset-top))}.timer.bottom{bottom:max(8px,env(safe-area-inset-bottom))}' +
      '.timer b{color:#a78bfa;font-size:11px;margin-right:6px}' +
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

  // ---------------------------------------------------------------- RTA（SPEC-001 6 章）
  var PING_EVERY = 5 * 60e3; // 「操作あり」は 5 分に 1 回まで（6.4）
  var INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'];
  var rta = null; // 計測中：{ runId, regulation, reg, startedAt, lastInput, maxIdle, lastSent, timer, tick, position }
  var regs = null;

  function fmt(ms) {
    if (!(ms >= 0)) return '--:--.--';
    var cs = Math.floor(ms / 10) % 100, sec = Math.floor(ms / 1000), h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = sec % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + two(m) : String(m)) + ':' + two(ss) + '.' + two(cs);
  }

  function loadRegs() {
    if (regs) return Promise.resolve(regs);
    return call('GET', '/api/rta/regulations').then(function (r) {
      if (r.ok) { regs = {}; (r.regulations || []).forEach(function (g) { regs[g.id] = g; }); }
      return regs || {};
    });
  }

  function idleNow() { return rta ? Math.max(rta.maxIdle, Date.now() - rta.lastInput) : 0; }

  function onInput() {
    if (!rta) return;
    var t = Date.now();
    rta.maxIdle = Math.max(rta.maxIdle, t - rta.lastInput);
    rta.lastInput = t;
    if (t - rta.lastSent >= PING_EVERY) {
      rta.lastSent = t;
      call('POST', '/api/rta/ping', { runId: rta.runId, idleMs: rta.maxIdle });
    }
  }

  function showTimer() {
    if (!state.ui || !rta || rta.position === false || !document.body) return;
    try {
      var root = toastRoot();
      var el = document.createElement('div');
      el.className = 'timer ' + (rta.position === 'bottom' ? 'bottom' : 'top');
      // ゲームの HUD と重ならないよう、端からの距離をゲーム側で決められる（timerOffset、px）
      if (rta.offset > 0) el.style[rta.position === 'bottom' ? 'bottom' : 'top'] = 'calc(' + Math.round(rta.offset) + 'px + env(safe-area-inset-' + (rta.position === 'bottom' ? 'bottom' : 'top') + '))';
      el.innerHTML = '<b>RTA</b><span></span>';
      root.appendChild(el);
      var span = el.querySelector('span');
      var run = rta;
      run.timer = el;
      run.tick = setInterval(function () { span.textContent = fmt(Date.now() - run.localStart); }, 100);
      span.textContent = fmt(0);
    } catch (e) { console.warn('[BearkoGames] timer', e); }
  }

  function endRun() {
    if (!rta) return;
    INPUT_EVENTS.forEach(function (ev) { window.removeEventListener(ev, onInput, true); });
    if (rta.tick) clearInterval(rta.tick);
    if (rta.timer) rta.timer.remove();
    rta = null;
  }

  function toast(parts, ms) {
    if (!state.ui || !document.body) return;
    try {
      var wrap = toastRoot().querySelector('.wrap');
      var el = document.createElement('div');
      el.className = 't';
      var k = document.createElement('div'); k.className = 'k'; k.textContent = parts.kicker; el.appendChild(k);
      var n = document.createElement('div'); n.className = 'n' + (parts.time ? ' time' : ''); n.textContent = parts.title; el.appendChild(n);
      (parts.lines || []).forEach(function (line) { var d = document.createElement('div'); d.className = 's'; d.textContent = line; el.appendChild(d); });
      if (parts.button || parts.link) {
        var g = document.createElement('div'); g.className = 'g';
        if (parts.link) { var a = document.createElement('a'); a.href = parts.link.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = parts.link.text; g.appendChild(a); }
        else g.appendChild(document.createElement('span'));
        if (parts.button) {
          var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = parts.button.text;
          btn.addEventListener('click', function () { el.remove(); parts.button.onClick(); });
          g.appendChild(btn);
        }
        el.appendChild(g);
      }
      wrap.appendChild(el);
      setTimeout(function () { el.remove(); }, ms || 4500);
    } catch (e) { console.warn('[BearkoGames] toast', e); }
  }

  function showFinish(r, reg, regulation) {
    var lines = [];
    if (reg) lines.push(reg.name);
    if (r.reference) lines.push('参考記録：15 分以上操作がなかったため、ランキングには載りません（マイページには残ります）');
    else if (r.account === 'login') lines.push((r.best ? '自己ベスト！ ' : '') + (r.rank ? 'ランキング ' + r.rank + ' 位' : ''));
    else lines.push('ログインすると、この記録がランキングに載ります');
    toast({
      kicker: 'RTA 記録',
      title: fmt(r.timeMs),
      time: true,
      lines: lines,
      link: { text: 'ランキングを見る', href: state.base + '/rta/?regulation=' + encodeURIComponent(regulation) },
      button: r.account === 'guest' && !r.reference ? { text: 'ログインして登録', onClick: function () { api.login(); } } : null,
    }, 12000);
  }

  var rtaApi = {
    /** 計測を始める。{ regulation, timer: 'top' | 'bottom' | false, timerOffset: px }。前の計測は中断になる → { ok, runId, account } */
    start: function (opts) {
      opts = opts || {};
      endRun();
      return call('POST', '/api/rta/start', { regulation: opts.regulation }).then(function (r) {
        if (!r.ok) return r;
        if (r.account === 'guest') state.guest = state.guest || { id: null };
        var t = Date.now();
        rta = { runId: r.runId, regulation: r.regulation, localStart: t, lastInput: t, maxIdle: 0, lastSent: t, position: opts.timer === undefined ? 'top' : opts.timer, offset: Number(opts.timerOffset) || 0 };
        INPUT_EVENTS.forEach(function (ev) { window.addEventListener(ev, onInput, { capture: true, passive: true }); });
        showTimer();
        loadRegs();
        return r;
      });
    },

    /** 区切りを通った。{ igtMs }（ゲーム内時間、参考値）。最後の区切りなら計測が終わる → { ok, splitMs, finished, timeMs, reference, best, rank } */
    checkpoint: function (id, opts) {
      if (!rta) return Promise.resolve({ ok: false, error: 'not_running' });
      var run = rta;
      var body = { runId: run.runId, checkpoint: id, igtMs: opts && opts.igtMs != null ? opts.igtMs : null, idleMs: idleNow() };
      run.lastSent = Date.now();
      var send = function () { return call('POST', '/api/rta/checkpoint', body); };
      return send()
        .then(function (r) { return r.ok || r.error !== 'network' ? r : new Promise(function (res) { setTimeout(function () { send().then(res); }, 2000); }); })
        .then(function (r) {
          if (!r.ok) {
            if ((r.status === 409 || r.status === 404) && rta === run) endRun(); // この計測はもう続けられない
            return r;
          }
          return loadRegs().then(function (all) {
            var reg = all[run.regulation];
            if (r.rejected) {
              toast({ kicker: 'RTA', title: '記録できませんでした', lines: ['この計測は無効になりました'] }, 6000);
            } else if (r.finished) {
              showFinish(r, reg, run.regulation);
            } else {
              var cp = reg && reg.checkpoints.filter(function (c) { return c.id === id; })[0];
              toast({ kicker: 'RTA ' + (cp ? cp.label : id), title: fmt(r.splitMs), time: true }, 3500);
            }
            if (r.finished && rta === run) endRun();
            return r;
          });
        });
    },

    /** 中断（ゲームオーバー・タイトルに戻ったとき） */
    abort: function () {
      if (!rta) return Promise.resolve({ ok: true });
      var id = rta.runId;
      endRun();
      return call('POST', '/api/rta/abort', { runId: id });
    },

    /** 計測中なら { runId, regulation }、していなければ null */
    current: function () { return rta ? { runId: rta.runId, regulation: rta.regulation } : null; },

    /** レギュレーションの定義 → { ok, regulations } */
    getRegulations: function () {
      return loadRegs().then(function (all) { return { ok: true, regulations: Object.keys(all).map(function (k) { return all[k]; }) }; });
    },

    /** ランキング → { ok, entries: [{ rank, name, timeMs, at, me }], me } */
    getRanking: function (regulation) { return call('GET', '/api/rta/ranking?regulation=' + encodeURIComponent(regulation)); },

    /** 自分の記録（参考記録も含む） → { ok, account, runs } */
    getMyRuns: function () { return call('GET', '/api/me/rta'); },

    /** ミリ秒を「12:34.56」の形にする */
    formatTime: fmt,
  };

  var api = {
    version: '1.2.0',
    rta: rtaApi,

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
