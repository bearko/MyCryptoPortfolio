/*
 * bearko.games 共通基盤 SDK v1（SPEC-001 5 章）
 *
 *   <script src="https://bearko.games/sdk/v1.js"></script>
 *   await BearkoGames.init({ game: 'tactics', version: '1.2.0' });
 *   BearkoGames.setToastPosition({ position: 'top', offset: 48 });   // 通知を画面の上に出す（既定は下。1.5.0）
 *   BearkoGames.chat.setVisible(false);                                // 全体チャットの 💬 を隠す（遊びの最中。1.6.0）
 *   BearkoGames.chat.onToggle(function (open) { ... });                // 窓を開いた・閉じた（1.6.1。Factory は時間を止める）
 *   BearkoGames.chat.onCompose(function (on) { ... });                 // 入力欄に入った・出た（1.7.0）
 *   BearkoGames.init({ game: 'survivor', chat: { position: 'top-right' } }); // 💬 の置き場所。chat: false で出さない
 *   BearkoGames.init({ game: 'portal', chat: { layout: 'float' } });        // PC でも右側のドックを使わず 1.x の窓（1.7.0）
 *   BearkoGames.chat.mount(el, { composerAt: 'top' });                 // 自分の場所にタイムラインを描く（1.7.0）
 *   BearkoGames.init({ game: 'tactics', presence: false });           // 同時接続数の「操作あり」を送らない（1.9.0。既定は送る。SPEC-007）。来訪のアチーブメントも送らない（1.10.0。SPEC-008）
 *   BearkoGames.openAvatarPicker();                                    // アイコン図鑑の窓（1.7.0。1.8.0 でトロフィーで解放する図鑑に）
 *   BearkoGames.getUser();          // { id, name, avatar } か null
 *   await BearkoGames.login();      // { ok, user }
 *   await BearkoGames.unlockTrophy('tactics.ch1');  // { ok, account, unlocked, total }
 *   await BearkoGames.rta.start({ regulation: 'survivor-normal' });   // RTA の計測を始める
 *   await BearkoGames.rta.checkpoint('stage1', { igtMs: 240000 });     // 区切り。最後の区切りで終わる
 *   BearkoGames.rta.abort();                                           // 中断（ゲームオーバーなど）
 *   await BearkoGames.submitScore({ stagesCleared: 3, ... });          // 総合スコアの成績を送る（SPEC-002）
 *
 * 守ること：SDK が読めない・通信に失敗しても、ゲームは最後まで遊べる。
 * どの関数も例外を投げず、失敗は { ok: false, error } で返す。
 * ゲーム側は Cookie・localStorage に触らない（ログイン状態は bearko.games が持つ）。
 */
(function () {
  'use strict';
  if (window.BearkoGames) return;

  var ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*bearko\.games$/;
  var state = { base: 'https://bearko.games', game: null, version: null, user: null, guest: null, hasAccount: false, ready: false, ui: true, defs: null, toastPos: 'bottom', toastOffset: 0 };
  var listeners = [];
  var trophyListeners = [];

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state.user); } catch (e) { console.warn('[BearkoGames] onChange', e); }
    }
    try { chatOnUser(); } catch (e) { console.warn('[BearkoGames] chat', e); }
  }

  function send(method, path, body) {
    var opt = { method: method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(state.base + path, opt)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok && data.account === 'guest') state.guest = state.guest || { id: null };
          if (res.ok && data.account) state.hasAccount = true;
          return res.ok ? Object.assign({ ok: true }, data) : { ok: false, status: res.status, error: data.error || 'http_' + res.status };
        });
      })
      .catch(function (e) { return { ok: false, error: 'network', detail: String(e && e.message || e) }; });
  }

  // ログインも仮アカウントもまだないとき、書き込みを同時に送ると、Cookie がまだないので
  // サーバーが仮アカウントを送った数だけ作ってしまう（記録が 1 つしか残らない）。
  // そのあいだは最初の書き込みの返事（ここで Cookie が届く）を待ってから、残りを送る（SPEC-001 4.6）
  var accountGate = null;
  function call(method, path, body) {
    if (method === 'GET' || state.user || state.guest || state.hasAccount) return send(method, path, body);
    if (accountGate) return accountGate.then(function () { return call(method, path, body); });
    var first = send(method, path, body);
    accountGate = first.then(function () { accountGate = null; });
    return first;
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
        state.avatars = r.avatars || null;   // SPEC-006：{ default, starters, total }
        state.gameNames = r.games || {};
      }
      return state.defs || {};
    });
  }

  // ---------------------------------------------------------------- 通知（画面の下に小さく出す。setToastPosition で上にも出せる）
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
      '.wrap.top{bottom:auto;top:max(16px,env(safe-area-inset-top))}' +
      '.t{pointer-events:auto;background:#151926;color:#eef0f6;border:1px solid rgba(167,139,250,.6);border-radius:12px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:in .25s ease-out}' +
      '.k{font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.04em}' +
      '.n{font-size:15px;font-weight:700;margin-top:2px}' +
      '.g{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;color:#9aa1b5}' +
      '.a{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:#f6e2a0}.a img{width:28px;height:28px;image-rendering:pixelated;border-radius:50%;background:#1d2233}' +
      '.s{font-size:12px;color:#c9cde0;margin-top:4px;line-height:1.5}' +
      '.n.time{font-variant-numeric:tabular-nums;font-size:22px}' +
      'a{color:#c4b5fd;font-size:12px;font-weight:700}' +
      '.timer{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none;font-family:"M PLUS 1p",system-ui,sans-serif;font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;color:#eef0f6;background:rgba(21,25,38,.82);border:1px solid rgba(167,139,250,.6);border-radius:999px;padding:3px 12px;letter-spacing:.02em}' +
      '.timer.top{top:max(8px,env(safe-area-inset-top))}.timer.bottom{bottom:max(8px,env(safe-area-inset-bottom))}' +
      '.timer b{color:#a78bfa;font-size:11px;margin-right:6px}' +
      'button{font:inherit;font-size:12px;font-weight:700;border:0;border-radius:8px;padding:6px 10px;background:#a78bfa;color:#140f24;cursor:pointer}' +
      '@keyframes in{from{opacity:0;transform:translateY(8px)}}' +
      '.wrap.top .t{animation-name:in-top}@keyframes in-top{from{opacity:0;transform:translateY(-8px)}}' +
      '@media (prefers-reduced-motion:reduce){.t{animation:none}}' +
      '</style><div class="wrap" role="status" aria-live="polite"></div>';
    document.body.appendChild(toastHost);
    applyToastPosition();
    return root;
  }
  // 通知の置き場所（結果画面のボタンを隠さないよう、ゲームが上に寄せられる）
  function applyToastPosition() {
    if (!toastHost) return;
    var wrap = toastHost.shadowRoot.querySelector('.wrap');
    var top = state.toastPos === 'top';
    wrap.classList.toggle('top', top);
    var side = top ? 'top' : 'bottom';
    wrap.style.top = wrap.style.bottom = '';
    if (state.toastOffset > 0) wrap.style[side] = 'calc(' + Math.round(state.toastOffset) + 'px + env(safe-area-inset-' + side + '))';
  }
  // 獲得の返事（unlock / visit）→ 通知と onTrophy
  function announce(r) {
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
  }

  function showTrophyToast(def, account, total) {
    if (!state.ui || !document.body) return;
    try {
      var wrap = toastRoot().querySelector('.wrap');
      var el = document.createElement('div');
      el.className = 't';
      var k = document.createElement('div'); k.className = 'k'; k.textContent = 'アチーブメント獲得';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = def ? def.name : '';
      el.appendChild(k); el.appendChild(n);
      // SPEC-006：トロフィーごとにアイコンが 1 つ解放される
      if (def && def.avatar && avatarUrl(def.avatar)) {
        var a = document.createElement('div'); a.className = 'a';
        var ai = document.createElement('img'); ai.alt = ''; ai.src = avatarUrl(def.avatar);
        var at = document.createElement('span'); at.textContent = 'アイコン「' + (def.avatarName || '') + '」が使えるようになりました';
        a.appendChild(ai); a.appendChild(at); el.appendChild(a);
      }
      if (account === 'guest') {
        var g = document.createElement('div'); g.className = 'g';
        var msg = document.createElement('span'); msg.textContent = '未登録のアチーブメント ' + total + ' 個';
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

  // ---------------------------------------------------------------- 同時接続数（SPEC-007。1.9.0）
  // 操作があったページだけ、最初の操作ですぐ 1 回、そのあとは 3 分ごとに「操作あり」を送る。
  // 番号はページを開くたびの使い捨て（メモリだけ）。重ならない番号はサーバーの Cookie が持つ。仮アカウントは作らない
  var PRESENCE_EVERY = 3 * 60e3;
  var presence = { on: false, dirty: false, sentOnce: false, timer: null, page: null };

  function presencePage() {
    var b = new Uint8Array(16), s = '';
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < b.length; j++) s += String.fromCharCode(b[j]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function presenceBeat() {
    presence.dirty = false;
    presence.sentOnce = true;
    try {
      // Content-Type を付けない（単純なリクエストにして、事前の確認（OPTIONS）を送らない）。返事は見ない
      fetch(state.base + '/api/presence', { method: 'POST', credentials: 'include', keepalive: true, body: JSON.stringify({ game: state.game, page: presence.page }) })
        .catch(function () { /* 数えられないだけ */ });
    } catch (e) { /* 数えられないだけ */ }
  }

  function presenceInput() {
    presence.dirty = true;
    if (!presence.sentOnce) { presenceBeat(); visitOnce(); }
  }

  // SPEC-008：来訪のアチーブメント。ゲームで最初に操作したとき 1 回だけ（開いただけでは送らない）。
  // 仮アカウントはこのとき作られる（すでに持っていればサーバーが 1 つにまとめる）
  var visited = false;
  function visitOnce() {
    if (visited || !state.game || state.game === 'portal') return;
    visited = true;
    call('POST', '/api/trophies/visit', { game: state.game }).then(announce);
  }

  function presenceStart() {
    if (presence.on) return;
    presence.on = true;
    presence.page = presencePage();
    INPUT_EVENTS.forEach(function (ev) { window.addEventListener(ev, presenceInput, { capture: true, passive: true }); });
    presence.timer = setInterval(function () {
      if (presence.dirty && document.visibilityState !== 'hidden') presenceBeat();
    }, PRESENCE_EVERY);
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

  // 横断 RTA（SPEC-001 6.14）：区切りがその挑戦の区間に数えられたとき
  function showCross(c) {
    var lines = [c.name];
    if (c.finished) {
      lines.push('公式タイム（' + c.total + ' 区間の合計）');
      if (c.reference) lines.push('参考記録：15 分以上操作がなかった区間があるため、ランキングには載りません');
      else if (c.rank) lines.push((c.best ? '自己ベスト！ ' : '') + 'ランキング ' + c.rank + ' 位');
      else if (c.best) lines.push('自己ベスト！');
    } else {
      lines.push('区間 ' + c.filled + ' / ' + c.total + '：' + c.label + ' ' + fmt(c.segmentMs));
    }
    toast({
      kicker: '横断 RTA',
      title: c.finished ? fmt(c.timeMs) : c.label,
      time: !!c.finished,
      lines: lines,
      link: { text: c.finished ? 'ランキングを見る' : 'のこりの区間を見る', href: state.base + '/rta/?regulation=' + encodeURIComponent(c.regulation) },
    }, 9000);
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
          if (r.unlocked && r.unlocked.length) announce(r);   // SPEC-008：RTA の完走でアチーブメント
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
            if (r.cross) showCross(r.cross);
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

    /** 横断 RTA の挑戦を始める（ポータルから。SPEC-001 6.14）→ { ok, account, attempt } */
    crossStart: function (regulation) { return call('POST', '/api/rta/cross/start', { regulation: regulation }); },
    /** 横断 RTA の挑戦をやめる */
    crossAbort: function () { return call('POST', '/api/rta/cross/abort', {}); },
    /** 挑戦中の横断 RTA → { ok, account, attempt: { regulation, startedAt, deadline, segments: [{ label, game, done, ms }] } | null } */
    crossCurrent: function () { return call('GET', '/api/rta/cross/current'); },

    /** 自分の記録（参考記録も含む） → { ok, account, runs } */
    getMyRuns: function () { return call('GET', '/api/me/rta'); },

    /** ミリ秒を「12:34.56」の形にする */
    formatTime: fmt,
  };


  // ---------------------------------------------------------------- 全体チャット（SPEC-004・SPEC-005。1.7.0）
  // PC（1100px 以上）は右側のドック（常に見えている。▸ で畳める）、狭い画面（639px 以下）は 💬 → 下から出るシート、
  // その間は 💬 → 窓。1 件は YouTube のコメント風：アイコン・名前・タイトルの札・時刻／本文／♡ いいね・返信・（本人なら）編集・消す。
  // 返信は 1 段。並びは新しい順といいね順。未ログインでも読める。書けるのはログインして名前を決めた人（サーバーが確かめる）。
  var chat = {
    enabled: true, ui: true, button: true, visible: true, mounted: false, open: false, collapsed: false,
    layout: 'dock', dockMin: 1100, position: 'bottom-right', offset: { x: 16, y: 16 },
    sort: 'new', filter: null, replyTo: null, editing: null, openReplies: {}, more: true, loading: false, likesLoaded: false,
    host: null, ws: null, you: null, msgs: [], liked: {}, unread: 0, note: '', retry: 0, closeTimer: null, pingTimer: null, retryTimer: null,
    listeners: [], toggles: [], composes: [], mounts: [], sheetWatching: false, focused: 0,
  };
  var CHAT_CLOSE_AFTER = 30e3, CHAT_PING_EVERY = 25e3, CHAT_MAX = 200, CHAT_KEEP = 600, CHAT_PAGE = 50;
  var GAME_LABEL = { survivor: 'Survivor', tactics: 'Tactics', workshop: 'Workshop', factory: 'Factory', fortress: 'Fortress', deckbattle: 'DeckBattle', '10buy': '10 buy year!', '10buy-year': '10 buy year!', education: 'Education', advance: 'Advance', portal: 'bearko.games' };
  var ASSET_BASE = 'https://raw.githubusercontent.com/bearko/mycryptoheroes/main/';
  var CHAT_ERR = { rate: '少し待ってから送ってください', login: 'ログインすると参加できます', name: '名前を決めると参加できます', banned: 'このアカウントは発言できません', long: '1〜200 文字で送ってください', parent: 'その発言はもうありません', not_found: 'その発言はもうありません', owner: '自分の発言だけ直せます' };

  /** アイコンの id（"hero:1001" / "ext:5106"）→ 絵の URL。何も選んでいなければ既定の MCHウォーリアー（SPEC-006） */
  var DEFAULT_AVATAR = 'hero:10001';
  function avatarUrl(id) {
    var m = /^(hero|ext):([0-9]{1,6})$/.exec(String(id || DEFAULT_AVATAR));
    if (!m) m = /^(hero|ext):([0-9]{1,6})$/.exec(DEFAULT_AVATAR);
    return ASSET_BASE + (m[1] === 'hero' ? 'Image/Heroes/' : 'Image/Extensions/') + m[2] + '.png';
  }

  var CHAT_CSS =
    ':host{all:initial}' +
    '.btn{position:fixed;z-index:2147483645;width:48px;height:48px;border-radius:50%;background:#151926;border:1px solid rgba(167,139,250,.6);color:#eef0f6;font-size:22px;line-height:1;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:"M PLUS 1p",system-ui,sans-serif;padding:0}' +
    '.btn.on{display:flex}.btn:hover{border-color:#a78bfa}' +
    '.b{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;border-radius:9px;background:#a78bfa;color:#140f24;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box}' +
    '.b.on{display:flex}' +
    '.tab{position:fixed;z-index:2147483645;right:0;top:38%;writing-mode:vertical-rl;background:#151926;border:1px solid rgba(167,139,250,.6);border-right:0;border-radius:10px 0 0 10px;color:#eef0f6;font:700 12px/1 "M PLUS 1p",system-ui,sans-serif;padding:14px 7px;cursor:pointer;display:none;align-items:center;gap:8px;box-shadow:-4px 0 16px rgba(0,0,0,.35)}' +
    '.tab.on{display:flex}.tab:hover{border-color:#a78bfa}.tab .b{position:static;writing-mode:horizontal-tb}' +
    '.panel{position:fixed;z-index:2147483645;display:none;flex-direction:column;background:#151926;color:#eef0f6;border:1px solid rgba(167,139,250,.6);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:"M PLUS 1p",system-ui,sans-serif;font-size:13px;overflow:hidden;box-sizing:border-box}' +
    '.panel.open{display:flex;animation:in .2s ease-out}' +
    '.panel.mode-float{width:360px;max-height:70vh}' +
    '.panel.mode-dock{top:0!important;right:0!important;bottom:0!important;left:auto!important;width:320px;max-height:none;border-radius:0;border-top:0;border-bottom:0;border-right:0;box-shadow:-8px 0 24px rgba(0,0,0,.35);animation:none}' +
    '.panel.mode-sheet{left:0;right:0;top:auto;bottom:0;width:auto;max-height:none;height:60vh;border-radius:12px 12px 0 0;padding-bottom:env(safe-area-inset-bottom)}' +
    '.tl{display:flex;flex-direction:column;min-height:0;flex:1;font-family:"M PLUS 1p",system-ui,sans-serif;font-size:13px;color:#eef0f6}' +
    '.head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08)}' +
    '.head .k{font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.04em;flex:1;white-space:nowrap}' +
    '.head .n{font-size:11px;color:#9aa1b5}' +
    '.sort{display:flex;gap:2px;background:#0b0d14;border-radius:999px;padding:2px}' +
    '.sort button{font:inherit;font-size:10px;border:0;border-radius:999px;padding:3px 8px;background:none;color:#9aa1b5;cursor:pointer;font-family:inherit}' +
    '.sort button.on{background:#a78bfa;color:#140f24;font-weight:700}' +
    '.x{background:none;border:0;color:#9aa1b5;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;font-family:inherit}' +
    '.x:hover{color:#eef0f6}' +
    '.list{flex:1;overflow-y:auto;padding:8px 12px;display:grid;gap:12px;align-content:start;min-height:120px;overscroll-behavior:contain}' +
    '.m{display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px}' +
    '.m.r{grid-template-columns:24px minmax(0,1fr)}' +
    '.av{width:32px;height:32px;border-radius:50%;background:#1d2233;border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-weight:700;color:#c4b5fd;font-size:13px;overflow:hidden;flex:none;box-sizing:border-box}' +
    '.m.r .av{width:24px;height:24px;font-size:10px}' +
    '.av img{width:100%;height:100%;image-rendering:pixelated;display:block}' +
    '.h{display:flex;gap:6px;align-items:baseline;font-size:11px;color:#9aa1b5;flex-wrap:wrap;min-width:0}' +
    '.h b{color:#c4b5fd;font-weight:700;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.g{font-size:10px;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:0 4px;color:#9aa1b5}' +
    '.ed{font-size:10px;color:#6b7280}' +
    '.t{white-space:pre-wrap;word-break:break-word;line-height:1.5;color:#eef0f6;margin-top:2px}' +
    '.acts{display:flex;gap:12px;margin-top:4px;align-items:center;flex-wrap:wrap}' +
    '.acts button{background:none;border:0;color:#9aa1b5;font-size:11px;cursor:pointer;padding:0;font-family:inherit;display:inline-flex;gap:3px;align-items:center;line-height:1.4}' +
    '.acts button:hover{color:#eef0f6}.acts .like.on{color:#f472b6}.acts .like.on .hz{display:none}.acts .like:not(.on) .hf{display:none}.acts .del:hover{color:#f9a8a8}' +
    '.reps{margin-top:8px;display:grid;gap:8px}' +
    '.lnk{background:none;border:0;color:#a78bfa;font-size:11px;cursor:pointer;padding:0;font-family:inherit;text-align:left;font-weight:700}' +
    '.lnk:hover{text-decoration:underline}' +
    '.cmp{display:flex;gap:6px;align-items:center;padding:8px 12px;border-top:1px solid rgba(255,255,255,.08)}' +
    '.cmp.top{border-top:0;border-bottom:1px solid rgba(255,255,255,.08)}' +
    '.icmp{display:flex;gap:6px;align-items:center;margin-top:6px}' +
    '.cmp input,.icmp input{flex:1;min-width:0;font:inherit;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0b0d14;color:#eef0f6;box-sizing:border-box;font-family:inherit}' +
    '.icmp input{font-size:12px;padding:6px 8px}' +
    '.cmp input:focus,.icmp input:focus{outline:1px solid #a78bfa}' +
    '.cmp button,.icmp button{font:inherit;font-size:12px;font-weight:700;border:0;border-radius:8px;padding:8px 12px;background:#a78bfa;color:#140f24;cursor:pointer;white-space:nowrap;font-family:inherit}' +
    '.icmp button{font-size:11px;padding:6px 10px}' +
    '.cmp button.sec,.icmp button.sec{background:none;color:#9aa1b5;border:1px solid rgba(255,255,255,.15)}' +
    '.cmp button:disabled{opacity:.5;cursor:default}' +
    '.cmp .msg{flex:1;font-size:12px;color:#9aa1b5}' +
    '.note{font-size:11px;color:#f9a8a8;padding:0 12px 6px;min-height:14px}' +
    '.empty{color:#6b7280;font-size:12px;text-align:center;padding:24px 8px}' +
    '.ldm{font:inherit;font-size:11px;color:#9aa1b5;background:none;border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:5px 12px;cursor:pointer;justify-self:center;font-family:inherit}' +
    '.ldm:hover{color:#eef0f6}.ldm:disabled{opacity:.5}' +
    '@keyframes in{from{opacity:0;transform:translateY(8px)}}' +
    '@media (prefers-reduced-motion:reduce){.panel.open{animation:none}}';

  /** いまの形：狭い画面はシート、広い画面でドックの設定ならドック、その間は窓 */
  function chatMode() {
    if (typeof window === 'undefined') return 'float';
    if (window.innerWidth <= 639) return 'sheet';
    if (chat.layout === 'dock' && window.innerWidth >= chat.dockMin) return 'dock';
    return 'float';
  }
  function chatIsSheet() { return chatMode() === 'sheet'; }
  /** タイムラインが見えているか（ドックなら畳んでいない、窓・シートなら開いている） */
  function chatShown() { return chat.visible && (chatMode() === 'dock' ? !chat.collapsed : chat.open); }

  function chatRoot() {
    if (chat.host) return chat.host.shadowRoot;
    chat.host = document.createElement('div');
    chat.host.setAttribute('data-bearko-games', 'chat');
    var root = chat.host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' + CHAT_CSS + '</style>' +
      '<button class="btn" type="button" aria-label="チャット" aria-expanded="false">💬<span class="b" aria-hidden="true"></span></button>' +
      '<button class="tab" type="button" aria-label="チャットを開く">💬 いまの会話<span class="b" aria-hidden="true"></span></button>' +
      '<div class="panel" role="dialog" aria-label="いまの会話"><div class="tl"></div></div>';
    root.querySelector('.btn').addEventListener('click', function () { if (chat.open) chatClose(); else chatOpen(); });
    root.querySelector('.tab').addEventListener('click', function () { chatCollapse(false); });
    document.body.appendChild(chat.host);
    try { chat.collapsed = localStorage.getItem('bg.chat.dock') === 'closed'; } catch (e) { /* 使えない環境 */ }
    window.addEventListener('resize', function () { applyChatPosition(); chatRender(); });   // 窓・ドック・シートの境目をまたいだら置き直す
    applyChatPosition();
    return root;
  }

  function applyChatPosition() {
    if (!chat.host) return;
    var root = chat.host.shadowRoot, btn = root.querySelector('.btn'), panel = root.querySelector('.panel');
    var mode = chatMode();
    var right = chat.position.indexOf('left') < 0, top = chat.position.indexOf('top') === 0;
    var x = Math.round(chat.offset.x), y = Math.round(chat.offset.y);
    var sx = right ? 'right' : 'left', sy = top ? 'top' : 'bottom';
    [btn, panel].forEach(function (el) { el.style.left = el.style.right = el.style.top = el.style.bottom = ''; });
    panel.className = 'panel mode-' + mode + (chatShown() ? ' open' : '');
    btn.style[sx] = 'calc(' + x + 'px + env(safe-area-inset-' + sx + '))';
    btn.style[sy] = 'calc(' + y + 'px + env(safe-area-inset-' + sy + '))';
    if (mode === 'sheet') {
      panel.style.height = '';
      chatFitSheet();
    } else if (mode === 'float') {
      panel.style.height = '';
      panel.style[sx] = 'calc(' + x + 'px + env(safe-area-inset-' + sx + '))';
      panel.style[sy] = 'calc(' + (y + 58) + 'px + env(safe-area-inset-' + sy + '))';
    } else {
      panel.style.height = '';
    }
    chat.host.style.display = chat.visible ? '' : 'none';
    // 💬 は窓・シートのときだけ（ドックは畳んだときの耳）。{ button: false } は出さない
    btn.classList.toggle('on', chat.button && mode !== 'dock');
    root.querySelector('.tab').classList.toggle('on', mode === 'dock' && chat.collapsed);
  }

  /**
   * 1.6.2: シートを「いま見えている範囲」（visualViewport）に収める。
   * スマホでキーボードが出ると見える範囲が縮むが、position:fixed の窓は縮まず、入力欄がキーボードの下に隠れていた。
   * 窓の上端と高さを visualViewport の offsetTop / height から決めるので、入力欄は常にキーボードのすぐ上に来る
   */
  function chatFitSheet() {
    if (!chat.host) return;
    var panel = chat.host.shadowRoot.querySelector('.panel');
    var vv = window.visualViewport;
    if (!chatIsSheet()) return;   // PC の窓の位置は applyChatPosition が決める（ここでは触らない）
    if (!chat.open || !vv) { panel.style.top = panel.style.bottom = panel.style.height = ''; return; }
    var list = panel.querySelector('.list');
    var atTop = !list || list.scrollTop < 40;   // 読み返している途中なら、その位置を保つ
    var gap = Math.max(48, Math.round(vv.height * 0.12));   // 上に少し残して、ゲームが見えるままにする
    panel.style.top = Math.round(vv.offsetTop + gap) + 'px';
    panel.style.bottom = 'auto';
    panel.style.height = Math.round(vv.height - gap) + 'px';
    if (list && atTop) list.scrollTop = 0;
  }

  function chatSheetWatch(on) {
    var vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    if (on && !chat.sheetWatching) { vv.addEventListener('resize', chatFitSheet); vv.addEventListener('scroll', chatFitSheet); chat.sheetWatching = true; }
    if (!on && chat.sheetWatching) { vv.removeEventListener('resize', chatFitSheet); vv.removeEventListener('scroll', chatFitSheet); chat.sheetWatching = false; }
  }

  function chatMount() {
    if (!chat.enabled || !chat.ui || !state.ui || chat.mounted) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', chatMount, { once: true }); return; }
    chat.mounted = true;
    chatRoot();
    if (chatMode() === 'dock' && chat.visible && !chat.collapsed) { chat.open = true; chatConnect(); }
    chatRender();
  }

  function chatUrl() {
    return state.base.replace(/^http/, 'ws') + '/api/chat/ws?game=' + encodeURIComponent(state.game || 'portal');
  }

  function chatConnect() {
    if (chat.ws || !chat.enabled || typeof WebSocket === 'undefined') return;
    var ws;
    try { ws = new WebSocket(chatUrl()); } catch (e) { chatNote('つながりませんでした'); return; }
    chat.ws = ws;
    ws.onopen = function () {
      chat.retry = 0;
      chatNote('');
      clearInterval(chat.pingTimer);
      chat.pingTimer = setInterval(function () { try { ws.send('ping'); } catch (e) { /* 閉じた */ } }, CHAT_PING_EVERY);
    };
    ws.onmessage = function (ev) {
      var m = null;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && typeof m === 'object') chatHandle(m);
    };
    ws.onclose = function (ev) {
      if (chat.ws === ws) chat.ws = null;
      clearInterval(chat.pingTimer);
      if (ev && ev.code === 4003) { chatNote('このアカウントは発言できません'); chatRender(); return; }
      // 見えているあいだは少し待って（1・2・4…30 秒）つなぎ直す
      if (chat.open) {
        var wait = Math.min(30e3, 1000 * Math.pow(2, chat.retry++));
        clearTimeout(chat.retryTimer);
        chat.retryTimer = setTimeout(function () { if (chat.open) chatConnect(); }, wait);
      }
    };
    ws.onerror = function () { /* onclose が来る */ };
  }

  function chatDisconnect() {
    clearTimeout(chat.retryTimer);
    clearInterval(chat.pingTimer);
    var ws = chat.ws;
    chat.ws = null;
    if (ws) { try { ws.close(); } catch (e) { /* もう閉じている */ } }
  }

  // ---- 手元の発言の集まり（親も返信も 1 つの配列。id で引く）
  function chatFind(id) {
    for (var i = 0; i < chat.msgs.length; i++) if (chat.msgs[i].id === id) return chat.msgs[i];
    return null;
  }
  function chatMerge(list, liked) {
    var added = [];
    (list || []).forEach(function (m) {
      if (!m || typeof m.id !== 'number') return;
      var cur = chatFind(m.id);
      if (cur) { cur.text = m.text; cur.likes = m.likes || 0; cur.editedAt = m.editedAt || null; cur.avatar = m.avatar || null; }
      else { chat.msgs.push(m); added.push(m); }
    });
    (liked || []).forEach(function (id) { chat.liked[id] = true; });
    chatPrune();
    return added;
  }
  /** 持ちすぎない：親が多すぎたら古い親（とその返信）から捨てる */
  function chatPrune() {
    var roots = chat.msgs.filter(function (m) { return m.parent == null; });
    if (roots.length <= CHAT_KEEP) return;
    roots.sort(function (a, b) { return a.id - b.id; });
    var drop = {};
    roots.slice(0, roots.length - CHAT_KEEP).forEach(function (m) { drop[m.id] = true; });
    chat.msgs = chat.msgs.filter(function (m) { return !drop[m.id] && !(m.parent != null && drop[m.parent]); });
  }
  function chatRoots() {
    var roots = chat.msgs.filter(function (m) { return m.parent == null && (!chat.filter || m.game === chat.filter); });
    if (chat.sort === 'likes') roots.sort(function (a, b) { return (b.likes || 0) - (a.likes || 0) || b.id - a.id; });
    else roots.sort(function (a, b) { return b.id - a.id; });
    return roots;
  }
  function chatReplies(id) {
    return chat.msgs.filter(function (m) { return m.parent === id; }).sort(function (a, b) { return a.id - b.id; });
  }
  function chatEmit(m) {
    for (var i = 0; i < chat.listeners.length; i++) {
      try { chat.listeners[i](m); } catch (e) { console.warn('[BearkoGames] chat.onMessage', e); }
    }
  }

  function chatHandle(m) {
    if (m.t === 'hist') {
      chat.you = m.you || null;
      chatMerge(m.msgs, m.liked);
      chatRender();
    } else if (m.t === 'msg') {
      if (!chatFind(m.id)) {
        chat.msgs.push(m);
        chatPrune();
        if (!chatShown() && !(chat.you && m.uid === chat.you.uid)) chat.unread++;
        chatEmit(m);
      }
      chatRender();
    } else if (m.t === 'like') {
      var liked = chatFind(m.id);
      if (liked) { liked.likes = m.n; chatEmit(m); chatRender(); }
    } else if (m.t === 'liked') {
      if (m.on) chat.liked[m.id] = true; else delete chat.liked[m.id];
      chatRender();
    } else if (m.t === 'edit') {
      var edited = chatFind(m.id);
      if (edited) { edited.text = m.text; edited.editedAt = m.editedAt; chatEmit(m); chatRender(); }
    } else if (m.t === 'del') {
      chat.msgs = chat.msgs.filter(function (x) { return x.id !== m.id && x.parent !== m.id; });
      chatEmit(m);
      chatRender();
    } else if (m.t === 'purge') {
      var gone = {};
      chat.msgs.forEach(function (x) { if (x.uid === m.uid) gone[x.id] = true; });
      chat.msgs = chat.msgs.filter(function (x) { return !gone[x.id] && !(x.parent != null && gone[x.parent]); });
      chatRender();
    } else if (m.t === 'err') {
      chatNote(CHAT_ERR[m.code] || '送れませんでした');
    }
  }

  /** 部屋から取り直す（遡る・いいね順）。WebSocket とは別に HTTP で読む */
  function chatFetch(params) {
    var q = [];
    for (var k in params) if (params[k] != null) q.push(k + '=' + encodeURIComponent(params[k]));
    return call('GET', '/api/chat/messages' + (q.length ? '?' + q.join('&') : '')).then(function (r) {
      if (r.ok) chatMerge(r.msgs, r.liked);
      return r;
    });
  }
  function chatLoadMore() {
    if (chat.loading || !chat.more) return Promise.resolve({ ok: false, error: 'done' });
    var roots = chatRoots();
    var oldest = null;
    chat.msgs.forEach(function (m) { if (m.parent == null && (oldest == null || m.id < oldest)) oldest = m.id; });
    chat.loading = true;
    chatRender();
    return chatFetch({ before: oldest || null, limit: CHAT_PAGE }).then(function (r) {
      chat.loading = false;
      if (r.ok) {
        var n = 0;
        (r.msgs || []).forEach(function (m) { if (m.parent == null) n++; });
        if (n < CHAT_PAGE) chat.more = false;
      }
      chatRender();
      return r;
    });
  }
  function chatSetSort(sort) {
    chat.sort = sort === 'likes' ? 'likes' : 'new';
    chatRender();
    if (chat.sort === 'likes' && !chat.likesLoaded) {
      chat.likesLoaded = true;
      chatFetch({ order: 'likes', limit: CHAT_PAGE }).then(function () { chatRender(); });
    }
  }

  function chatNote(text) {
    chat.note = text || '';
    chatEach(function (root) { var n = root.querySelector('.note'); if (n) n.textContent = chat.note; });
  }

  function chatWsSend(obj) {
    if (!chat.ws || chat.ws.readyState !== 1) { chatConnect(); return { ok: false, error: 'closed' }; }
    try { chat.ws.send(JSON.stringify(obj)); } catch (e) { return { ok: false, error: 'network' }; }
    return { ok: true };
  }
  function chatClean(text) {
    return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  }
  function chatSend(text, parent) {
    var t = chatClean(text);
    if (!t) return { ok: false, error: 'empty' };
    if (t.length > CHAT_MAX) return { ok: false, error: 'long' };
    var msg = { t: 'msg', text: t };
    if (parent != null) msg.parent = parent;
    return chatWsSend(msg);
  }
  function chatLike(id, on) {
    if (on == null) on = !chat.liked[id];
    if (!state.user) { chatNote(CHAT_ERR.login); return { ok: false, error: 'login' }; }
    if (!state.user.name) { chatNote(CHAT_ERR.name); return { ok: false, error: 'name' }; }
    var r = chatWsSend({ t: 'like', id: id, on: !!on });
    if (r.ok) {   // 先に手元を動かす（返事で正しい数に戻る）
      var m = chatFind(id);
      if (m) { m.likes = Math.max(0, (m.likes || 0) + (on ? 1 : -1)); }
      if (on) chat.liked[id] = true; else delete chat.liked[id];
      chatRender();
    }
    return r;
  }
  function chatEdit(id, text) {
    var t = chatClean(text);
    if (!t) return { ok: false, error: 'empty' };
    if (t.length > CHAT_MAX) return { ok: false, error: 'long' };
    return chatWsSend({ t: 'edit', id: id, text: t });
  }
  function chatDelete(id) {
    return call('DELETE', '/api/chat/messages/' + encodeURIComponent(id)).then(function (r) {
      if (r.ok) { chat.msgs = chat.msgs.filter(function (x) { return x.id !== id && x.parent !== id; }); chatRender(); }
      else chatNote('消せませんでした');
      return r;
    });
  }

  /** 開いた・閉じたを知らせる（1.6.1。Factory は開いているあいだ時間を止める） */
  function chatToggled(open) {
    chat.toggles.forEach(function (fn) { try { fn(open); } catch (e) { console.warn('[BearkoGames] chat onToggle', e); } });
  }
  /** 入力欄に入った・出た（1.7.0。Factory はドックでは書いているあいだだけ時間を止める） */
  function chatComposing(on) {
    chat.focused += on ? 1 : -1;
    if (chat.focused < 0) chat.focused = 0;
    var now = chat.focused > 0;
    if (now === chat.composing) return;
    chat.composing = now;
    chat.composes.forEach(function (fn) { try { fn(now); } catch (e) { console.warn('[BearkoGames] chat onCompose', e); } });
  }

  function chatOpen() {
    if (!chat.enabled) return;
    chatMount();
    if (chatMode() === 'dock') { chatCollapse(false); return; }
    var was = chat.open;
    chat.open = true;
    chat.unread = 0;
    clearTimeout(chat.closeTimer);
    chatConnect();
    applyChatPosition();
    chatRender();
    chatSheetWatch(true);
    chatFitSheet();
    if (chat.host) {
      var input = chat.host.shadowRoot.querySelector('.cmp input');
      var coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      // 1.6.2: 指で触る端末では、押したときだけキーボードを出す（開いた瞬間に出ると、窓がキーボードの下に隠れる）
      if (input && !coarse) { try { input.focus({ preventScroll: true }); } catch (e) { /* 古い環境 */ } }
    }
    if (!was) chatToggled(true);
  }

  function chatClose() {
    if (chatMode() === 'dock') { chatCollapse(true); return; }
    var was = chat.open;
    chat.open = false;
    chatSheetWatch(false);
    chatFitSheet();
    applyChatPosition();
    chatRender();
    if (was) chatToggled(false);
    clearTimeout(chat.closeTimer);
    chat.closeTimer = setTimeout(function () { if (!chat.open) chatDisconnect(); }, CHAT_CLOSE_AFTER);
  }

  /** ドックを畳む（true）／広げる（false）。畳んだかどうかはこの端末に覚える */
  function chatCollapse(on) {
    var was = chatShown();
    chat.collapsed = !!on;
    try { localStorage.setItem('bg.chat.dock', on ? 'closed' : 'open'); } catch (e) { /* 使えない環境 */ }
    if (!on) { chat.open = true; chat.unread = 0; clearTimeout(chat.closeTimer); chatConnect(); }
    else { chat.open = false; clearTimeout(chat.closeTimer); chat.closeTimer = setTimeout(function () { if (!chat.open) chatDisconnect(); }, CHAT_CLOSE_AFTER); }
    applyChatPosition();
    chatRender();
    if (was !== chatShown()) chatToggled(!on);
  }

  function chatTime(at) {
    var d = new Date(at), now = new Date(), two = function (n) { return (n < 10 ? '0' : '') + n; };
    var hm = two(d.getHours()) + ':' + two(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }
  function chatAvatarEl(m, small) {
    var av = document.createElement('div'); av.className = 'av';
    var url = avatarUrl(m.avatar);
    var initial = (m.name || '?').slice(0, 1);
    if (url) {
      var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = url;
      img.addEventListener('error', function () { av.textContent = initial; });
      av.appendChild(img);
    } else av.textContent = initial;
    return av;
  }
  function chatInlineComposer(opts) {
    var box = document.createElement('div'); box.className = 'icmp';
    var input = document.createElement('input'); input.type = 'text'; input.maxLength = CHAT_MAX; input.placeholder = opts.placeholder; input.value = opts.value || ''; input.setAttribute('autocomplete', 'off');
    input.addEventListener('focus', function () { chatComposing(true); });
    input.addEventListener('blur', function () { chatComposing(false); });
    var ok = document.createElement('button'); ok.type = 'button'; ok.textContent = opts.okLabel;
    var no = document.createElement('button'); no.type = 'button'; no.className = 'sec'; no.textContent = 'やめる';
    var go = function () { opts.onOk(input.value); };
    ok.addEventListener('click', go);
    no.addEventListener('click', opts.onCancel);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) { e.preventDefault(); go(); } if (e.key === 'Escape') opts.onCancel(); });
    box.appendChild(input); box.appendChild(ok); box.appendChild(no);
    setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { /* 古い環境 */ } }, 0);
    return box;
  }

  /** 1 件（親も返信も）。YouTube のコメント風 */
  function chatItem(m, isReply) {
    var me = state.user ? state.user.id : null;
    var el = document.createElement('div'); el.className = 'm' + (isReply ? ' r' : ''); el.setAttribute('data-id', String(m.id));
    el.appendChild(chatAvatarEl(m, isReply));
    var body = document.createElement('div');
    var h = document.createElement('div'); h.className = 'h';
    var b = document.createElement('b'); b.textContent = m.name || '名無し'; h.appendChild(b);
    var g = document.createElement('span'); g.className = 'g'; g.textContent = GAME_LABEL[m.game] || m.game; h.appendChild(g);
    var tm = document.createElement('span'); tm.textContent = chatTime(m.at); h.appendChild(tm);
    if (m.editedAt) { var ed = document.createElement('span'); ed.className = 'ed'; ed.textContent = '（編集済み）'; h.appendChild(ed); }
    body.appendChild(h);
    if (chat.editing === m.id) {
      body.appendChild(chatInlineComposer({
        placeholder: '本文を直す（200 文字まで）', value: m.text, okLabel: '保存',
        onOk: function (v) { var r = chatEdit(m.id, v); if (r.ok) { chat.editing = null; chatRender(); } else chatNote(r.error === 'long' ? CHAT_ERR.long : r.error === 'empty' ? CHAT_ERR.long : 'つなぎ直しています…'); },
        onCancel: function () { chat.editing = null; chatRender(); },
      }));
    } else {
      var t = document.createElement('div'); t.className = 't'; t.textContent = m.text; body.appendChild(t);
    }
    var acts = document.createElement('div'); acts.className = 'acts';
    var like = document.createElement('button'); like.type = 'button'; like.className = 'like' + (chat.liked[m.id] ? ' on' : '');
    like.innerHTML = '<span class="hz">♡</span><span class="hf">♥</span><span class="ln"></span>';
    like.querySelector('.ln').textContent = m.likes ? String(m.likes) : 'いいね';
    like.setAttribute('aria-label', 'いいね');
    like.addEventListener('click', function () { chatLike(m.id); });
    acts.appendChild(like);
    var rep = document.createElement('button'); rep.type = 'button'; rep.className = 'rep'; rep.textContent = '返信';
    var rootId = isReply ? m.parent : m.id;
    rep.addEventListener('click', function () {
      if (!state.user) { chatNote(CHAT_ERR.login); return; }
      if (!state.user.name) { chatNote(CHAT_ERR.name); return; }
      chat.replyTo = rootId; chat.openReplies[rootId] = true; chat.replyPrefill = isReply ? '@' + (m.name || '') + ' ' : ''; chatRender();
    });
    acts.appendChild(rep);
    if (me && m.uid === me) {
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'edt'; edit.textContent = '編集';
      edit.addEventListener('click', function () { chat.editing = m.id; chatRender(); });
      acts.appendChild(edit);
      var d = document.createElement('button'); d.type = 'button'; d.className = 'del'; d.textContent = '消す';
      d.addEventListener('click', function () { chatDelete(m.id); });
      acts.appendChild(d);
    }
    body.appendChild(acts);
    if (!isReply) {
      var replies = chatReplies(m.id);
      var reps = document.createElement('div'); reps.className = 'reps';
      var opened = chat.openReplies[m.id] || chat.replyTo === m.id;
      if (replies.length && !opened) {
        var more = document.createElement('button'); more.type = 'button'; more.className = 'lnk'; more.textContent = '返信 ' + replies.length + ' 件を見る';
        more.addEventListener('click', function () { chat.openReplies[m.id] = true; chatRender(); });
        reps.appendChild(more);
      } else if (replies.length) {
        replies.forEach(function (r) { reps.appendChild(chatItem(r, true)); });
        var less = document.createElement('button'); less.type = 'button'; less.className = 'lnk'; less.textContent = '返信をたたむ';
        less.addEventListener('click', function () { delete chat.openReplies[m.id]; if (chat.replyTo === m.id) chat.replyTo = null; chatRender(); });
        reps.appendChild(less);
      }
      if (chat.replyTo === m.id) {
        reps.appendChild(chatInlineComposer({
          placeholder: '返信を書く（200 文字まで）', value: chat.replyPrefill || '', okLabel: '返信',
          onOk: function (v) { var r = chatSend(v, m.id); if (r.ok) { chat.replyTo = null; chat.replyPrefill = ''; chatNote(''); chatRender(); } else chatNote(r.error === 'long' || r.error === 'empty' ? CHAT_ERR.long : 'つなぎ直しています…'); },
          onCancel: function () { chat.replyTo = null; chat.replyPrefill = ''; chatRender(); },
        }));
      }
      if (reps.childNodes.length) body.appendChild(reps);
    }
    el.appendChild(body);
    return el;
  }

  /** 入力欄（未ログイン → ログイン、名無し → 名前を決める） */
  function chatComposer(atTop) {
    var foot = document.createElement('div'); foot.className = 'cmp' + (atTop ? ' top' : '');
    if (!state.user) {
      var msg = document.createElement('span'); msg.className = 'msg'; msg.textContent = '読むだけならこのまま。参加するにはログイン';
      var login = document.createElement('button'); login.type = 'button'; login.textContent = 'ログインして参加';
      login.addEventListener('click', function () { api.login(); });
      foot.appendChild(msg); foot.appendChild(login);
    } else if (!state.user.name) {
      var msg2 = document.createElement('span'); msg2.className = 'msg'; msg2.textContent = '参加するには名前を決めてください';
      var nameBtn = document.createElement('button'); nameBtn.type = 'button'; nameBtn.textContent = '名前を決める';
      nameBtn.addEventListener('click', function () {
        var name = prompt('表示名（16 文字まで）', '');
        if (name == null) return;
        api.setName(name).then(function (r) { if (!r.ok) chatNote('名前を変えられませんでした'); });
      });
      foot.appendChild(msg2); foot.appendChild(nameBtn);
    } else {
      var input = document.createElement('input'); input.type = 'text'; input.maxLength = CHAT_MAX; input.placeholder = 'メッセージ（200 文字まで）'; input.value = chat.draft || ''; input.setAttribute('autocomplete', 'off');
      input.addEventListener('input', function () { chat.draft = input.value; });
      input.addEventListener('focus', function () { chatComposing(true); });
      input.addEventListener('blur', function () { chatComposing(false); });
      var send = document.createElement('button'); send.type = 'button'; send.textContent = '送る';
      var go = function () {
        var r = chatSend(input.value);
        if (r.ok) { input.value = ''; chat.draft = ''; chatNote(''); }
        else if (r.error === 'closed') chatNote('つなぎ直しています…');
        else if (r.error === 'long') chatNote(CHAT_ERR.long);
      };
      send.addEventListener('click', go);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) { e.preventDefault(); go(); } });
      foot.appendChild(input); foot.appendChild(send);
    }
    return foot;
  }

  /** タイムライン 1 式を tl（.tl）に描く。opts.kind: 'panel' | 'mount' */
  function chatRenderTimeline(tl, opts) {
    var mode = chatMode();
    var scroller = tl.querySelector('.list');
    var keepScroll = scroller ? scroller.scrollTop : 0;
    var wasFocused = tl.querySelector('.cmp input') && tl.querySelector('.cmp input').matches(':focus');
    tl.textContent = '';
    // 見出し：いまの会話・並び替え・（ドック）▸ ／（窓・シート）×
    var head = document.createElement('div'); head.className = 'head';
    var k = document.createElement('span'); k.className = 'k'; k.textContent = opts.title || 'いまの会話'; head.appendChild(k);
    var n = document.createElement('span'); n.className = 'n'; n.textContent = chat.ws && chat.ws.readyState === 1 ? '' : '接続中…'; head.appendChild(n);
    var sort = document.createElement('div'); sort.className = 'sort'; sort.setAttribute('role', 'tablist');
    [['new', '新しい順'], ['likes', 'いいね順']].forEach(function (s) {
      var sb = document.createElement('button'); sb.type = 'button'; sb.textContent = s[1]; sb.className = chat.sort === s[0] ? 'on' : '';
      sb.addEventListener('click', function () { chatSetSort(s[0]); });
      sort.appendChild(sb);
    });
    head.appendChild(sort);
    if (opts.kind === 'panel') {
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', mode === 'dock' ? 'たたむ' : '閉じる'); x.textContent = mode === 'dock' ? '▸' : '×';
      x.addEventListener('click', function () { if (mode === 'dock') chatCollapse(true); else chatClose(); });
      head.appendChild(x);
    }
    tl.appendChild(head);
    var atTop = opts.composerAt === 'top' || (opts.composerAt !== 'bottom' && mode !== 'sheet');
    if (atTop) tl.appendChild(chatComposer(true));
    // 一覧（新しいものが上）
    var list = document.createElement('div'); list.className = 'list';
    var roots = chatRoots();
    if (!roots.length) {
      var empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = chat.filter ? 'このタイトルの発言はまだありません' : 'まだ発言はありません。最初のひとことをどうぞ';
      list.appendChild(empty);
    }
    roots.forEach(function (m) { list.appendChild(chatItem(m, false)); });
    if (chat.sort === 'new' && roots.length && chat.more) {
      var ldm = document.createElement('button'); ldm.type = 'button'; ldm.className = 'ldm'; ldm.textContent = chat.loading ? '読んでいます…' : 'もっと読む'; ldm.disabled = chat.loading;
      ldm.addEventListener('click', function () { chatLoadMore(); });
      list.appendChild(ldm);
    }
    tl.appendChild(list);
    var note = document.createElement('div'); note.className = 'note'; note.textContent = chat.note; tl.appendChild(note);
    if (!atTop) tl.appendChild(chatComposer(false));
    list.scrollTop = keepScroll;
    if (wasFocused) { var inp = tl.querySelector('.cmp input'); if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { /* 古い環境 */ } } }
  }

  function chatEach(fn) {
    if (chat.host) fn(chat.host.shadowRoot);
    chat.mounts.forEach(function (m) { fn(m.root); });
  }

  function chatRender() {
    if (chat.host) {
      var root = chat.host.shadowRoot;
      var btn = root.querySelector('.btn'), panel = root.querySelector('.panel');
      var shown = chatShown();
      [btn.querySelector('.b'), root.querySelector('.tab .b')].forEach(function (badge) {
        badge.textContent = chat.unread > 99 ? '99+' : String(chat.unread);
        badge.classList.toggle('on', chat.unread > 0 && !shown);
      });
      btn.setAttribute('aria-expanded', String(shown));
      panel.classList.toggle('open', shown);
      if (shown) chatRenderTimeline(panel.querySelector('.tl'), { kind: 'panel' });
    }
    chat.mounts.forEach(function (m) { chatRenderTimeline(m.root.querySelector('.tl'), { kind: 'mount', composerAt: m.composerAt, title: m.title }); });
  }

  // ログイン状態が変わったら、入力欄を描き直し、つないでいれば名前とアイコンを持ち直すためにつなぎ直す
  function chatOnUser() {
    if (!chat.enabled) return;
    chatRender();
    if (chat.ws) { chatDisconnect(); if (chat.open) chatConnect(); }
  }

  // ---------------------------------------------------------------- アイコン図鑑（SPEC-005 5.3 → SPEC-006）
  // 最初から使える 3 体と、トロフィー 1 つにつき 1 つ。持っていないものは灰色で、獲得の条件（タイトルとトロフィー）を出す
  var picker = { host: null, owned: null, sel: null, msg: '' };
  var PICKER_CSS =
    ':host{all:initial}' +
    '.pk{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:"M PLUS 1p",system-ui,sans-serif;font-size:13px;color:#eef0f6}' +
    '.pkb{width:min(600px,96vw);height:min(680px,92vh);background:#151926;border:1px solid rgba(167,139,250,.6);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}' +
    '.pkh{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)}' +
    '.pkh .k{font-weight:700;flex:1}.pkh .cnt{font-size:12px;color:#9aa1b5}.pkh .cnt b{color:#f6e2a0;font-size:15px}' +
    '.bar{height:4px;background:rgba(255,255,255,.08);margin:0 12px;border-radius:2px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#a78bfa,#f6e2a0)}' +
    '.x{background:none;border:0;color:#9aa1b5;font-size:20px;line-height:1;cursor:pointer;font-family:inherit}' +
    '.pkn{font-size:11px;color:#9aa1b5;padding:8px 12px 0;line-height:1.5}' +
    '.pkg{flex:1;overflow-y:auto;padding:4px 12px 10px}' +
    '.sec{font-size:11px;font-weight:700;color:#9aa1b5;margin:10px 0 6px;display:flex;gap:6px;align-items:baseline}.sec em{font-style:normal;font-weight:500;color:#6b7280}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px}' +
    '.it{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;background:#0b0d14;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 4px 6px;cursor:pointer;color:#cfd3e0;font:inherit;font-size:10px;font-family:inherit;min-width:0}' +
    '.it:hover{border-color:#a78bfa}.it.on{border-color:#f472b6;box-shadow:0 0 0 1px #f472b6}.it.sel{border-color:#f6e2a0}' +
    '.it img{width:48px;height:48px;image-rendering:pixelated}' +
    '.it span{max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-align:center;line-height:1.25;word-break:break-all}' +
    '.it.lock{color:#6b7280}.it.lock img{filter:grayscale(1) brightness(.45)}' +
    '.it.lock::after{content:"🔒";position:absolute;top:4px;right:5px;font-size:11px;opacity:.8}' +
    '.it .now{position:absolute;top:3px;left:4px;font-size:9px;font-weight:700;color:#f472b6}' +
    '.det{border-top:1px solid rgba(255,255,255,.08);padding:10px 12px;display:flex;gap:10px;align-items:center;min-height:64px;box-sizing:border-box}' +
    '.det img{width:48px;height:48px;image-rendering:pixelated;border-radius:50%;background:#1d2233;flex:none}.det img.lock{filter:grayscale(1) brightness(.45)}' +
    '.det .tx{flex:1;min-width:0;line-height:1.5}.det .nm{font-weight:700}.det .cd{font-size:11px;color:#9aa1b5}.det .cd b{color:#f6e2a0;font-weight:700}.det .er{font-size:11px;color:#f9a8a8}' +
    '.det button{font:inherit;font-size:13px;font-weight:700;border:0;border-radius:8px;padding:9px 16px;background:linear-gradient(180deg,#c4b5fd,#8b5cf6);color:#140f24;cursor:pointer;font-family:inherit;white-space:nowrap}' +
    '.det button:disabled{background:#2a2f42;color:#6b7280;cursor:default}' +
    '.empty{color:#6b7280;text-align:center;padding:24px}';

  function pickerClose() {
    if (picker.host) { picker.host.remove(); picker.host = null; }
  }
  /** 図鑑の項目（最初からの 3 体 → タイトルごとのトロフィー）。{ id, name, trophy, open } */
  function pickerItems() {
    var defs = state.defs || {}, av = state.avatars;
    if (!av) return [];
    var owned = picker.owned || {};
    var out = (av.starters || []).map(function (a) { return { id: a.id, name: a.name, trophy: null, open: true }; });
    // SPEC-008：絵を差し替える前のアチーブメントを持っている人は、前の絵も使える
    var former = {};
    Object.keys(defs).forEach(function (k) {
      var t = defs[k];
      if (owned[t.id]) (t.formerAvatars || []).forEach(function (id) { if (!former[id]) former[id] = t; });
    });
    var now = {};
    Object.keys(defs).forEach(function (k) {
      var t = defs[k];
      if (t.avatar) { now[t.avatar] = true; out.push({ id: t.avatar, name: t.avatarName || '', trophy: !owned[t.id] && former[t.avatar] ? former[t.avatar] : t, open: !!owned[t.id] || !!former[t.avatar], viaFormer: !owned[t.id] && !!former[t.avatar] }); }
    });
    // 前の絵が、いまはどのアチーブメントの絵でもないもの（雪だるまなど）は「以前の絵」にまとめる（持っている人にだけ出す）
    Object.keys(former).forEach(function (id) {
      if (now[id]) return;
      out.push({ id: id, name: '以前の「' + former[id].name + '」', trophy: former[id], open: true, legacy: true, viaFormer: true });
    });
    return out;
  }
  function pickerSelect(it) {
    var root = picker.host && picker.host.shadowRoot;
    if (!root) return;
    picker.sel = it ? it.id : null;
    var det = root.querySelector('.det');
    det.textContent = '';
    var cur = state.user ? state.user.avatar || DEFAULT_AVATAR : DEFAULT_AVATAR;
    if (!it) { it = pickerItems().filter(function (x) { return x.id === cur; })[0] || { id: cur, name: '', open: true }; }
    var img = document.createElement('img'); img.alt = ''; img.src = avatarUrl(it.id); if (!it.open) img.className = 'lock';
    var tx = document.createElement('div'); tx.className = 'tx';
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = (it.name || 'いまのアイコン') + (it.open ? '' : '（未獲得）');
    var cd = document.createElement('div'); cd.className = 'cd';
    if (it.trophy) {
      var g = (state.gameNames || {})[it.trophy.game] || it.trophy.game;
      cd.appendChild(document.createTextNode((it.viaFormer ? '以前の絵：' : it.open ? '獲得：' : '獲得条件：') + g + ' のアチーブメント '));
      var b = document.createElement('b'); b.textContent = '「' + it.trophy.name + '」'; cd.appendChild(b);
      if (it.viaFormer) cd.appendChild(document.createTextNode(' を持っているので使える'));
      if (!it.open && it.trophy.description) cd.appendChild(document.createTextNode(' — ' + it.trophy.description));
    } else cd.textContent = '最初から使える';
    tx.appendChild(nm); tx.appendChild(cd);
    if (picker.msg) { var er = document.createElement('div'); er.className = 'er'; er.textContent = picker.msg; tx.appendChild(er); }
    var go = document.createElement('button'); go.type = 'button';
    go.textContent = it.id === cur ? '使っている' : (it.open ? 'これにする' : 'まだ使えない');
    go.disabled = it.id === cur || !it.open;
    go.addEventListener('click', function () {
      picker.msg = '';
      api.setAvatar(it.id).then(function (r) {
        if (r.ok) { pickerRender(); return; }
        picker.msg = r.error === 'login' || r.status === 401 ? 'ログインするとアイコンを決められます' : r.error === 'locked' ? 'このアイコンのアチーブメントがまだありません' : '変えられませんでした。時間をおいてもう一度';
        pickerSelect(it);
      });
    });
    det.appendChild(img); det.appendChild(tx); det.appendChild(go);
  }
  function pickerRender() {
    if (!picker.host) return;
    var root = picker.host.shadowRoot;
    var box = root.querySelector('.pkg');
    box.textContent = '';
    var items = pickerItems();
    var cur = state.user ? state.user.avatar || DEFAULT_AVATAR : DEFAULT_AVATAR;
    var total = (state.avatars && state.avatars.total) || items.length;
    var got = items.filter(function (x) { return x.open && !x.viaFormer; }).length;
    root.querySelector('.cnt').innerHTML = '';
    var cb = document.createElement('b'); cb.textContent = String(got);
    root.querySelector('.cnt').appendChild(cb);
    root.querySelector('.cnt').appendChild(document.createTextNode(' / ' + total));
    root.querySelector('.bar i').style.width = (total ? Math.round(got / total * 100) : 0) + '%';
    if (!items.length) { var e = document.createElement('div'); e.className = 'empty'; e.textContent = picker.owned ? '読めませんでした。時間をおいて開き直してください' : '読んでいます…'; box.appendChild(e); return; }
    // まとまり：最初から / タイトルごと（トロフィーの並び）/ 横断
    var groups = [], byKey = {};
    items.forEach(function (it) {
      var key = it.legacy ? '_legacy' : it.trophy ? it.trophy.game : '_start';
      if (!byKey[key]) { byKey[key] = { key: key, items: [] }; groups.push(byKey[key]); }
      byKey[key].items.push(it);
    });
    groups.forEach(function (gr) {
      var h = document.createElement('div'); h.className = 'sec';
      var gname = gr.key === '_start' ? '最初から' : gr.key === '_legacy' ? '以前の絵' : ((state.gameNames || {})[gr.key] || gr.key);
      h.textContent = gname;
      var em = document.createElement('em'); em.textContent = gr.items.filter(function (x) { return x.open && !x.viaFormer; }).length + ' / ' + gr.items.filter(function (x) { return !x.legacy; }).length; if (gr.key !== '_legacy') h.appendChild(em);
      var grid = document.createElement('div'); grid.className = 'grid';
      gr.items.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-id', it.id);
        b.className = 'it' + (it.open ? '' : ' lock') + (cur === it.id ? ' on' : '') + (picker.sel === it.id ? ' sel' : '');
        b.title = it.open ? it.name : (it.trophy ? '「' + it.trophy.name + '」で解放' : '');
        b.setAttribute('aria-label', it.open ? it.name : 'まだ使えないアイコン');
        var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = avatarUrl(it.id);
        var nm = document.createElement('span'); nm.textContent = it.open ? it.name : (it.trophy ? it.trophy.name : '？？？');
        if (cur === it.id) { var now = document.createElement('i'); now.className = 'now'; now.textContent = '使用中'; b.appendChild(now); }
        b.appendChild(img); b.appendChild(nm);
        b.addEventListener('click', function () { picker.msg = ''; pickerSelect(it); pickerMark(); });
        grid.appendChild(b);
      });
      box.appendChild(h); box.appendChild(grid);
    });
    pickerSelect(items.filter(function (x) { return x.id === picker.sel; })[0] || null);
  }
  function pickerMark() {
    var root = picker.host && picker.host.shadowRoot;
    if (!root) return;
    root.querySelectorAll('.it').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-id') === picker.sel); });
  }
  /** アイコン図鑑の窓。bearko.games 全体（すべてのゲームとチャット）のアイコンが変わる */
  function openAvatarPicker() {
    if (!document.body) return;
    pickerClose();
    picker.sel = null; picker.msg = ''; picker.owned = null;
    picker.host = document.createElement('div');
    picker.host.setAttribute('data-bearko-games', 'avatar-picker');
    var root = picker.host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' + PICKER_CSS + '</style>' +
      '<div class="pk"><div class="pkb" role="dialog" aria-label="アイコン図鑑">' +
      '<div class="pkh"><span class="k">アイコン図鑑</span><span class="cnt"></span><button class="x" type="button" aria-label="閉じる">×</button></div>' +
      '<div class="bar"><i></i></div>' +
      '<div class="pkn">アチーブメントを 1 つ取るごとに、その名前のスキルを持つヒーロー／エクステンションのアイコンが 1 つ増えます。選んだアイコンは bearko.games 全体（すべてのゲームとチャット）で使われます</div>' +
      '<div class="pkg"></div>' +
      '<div class="det"></div>' +
      '</div></div>';
    root.querySelector('.x').addEventListener('click', pickerClose);
    root.querySelector('.pk').addEventListener('click', function (e) { if (e.target === root.querySelector('.pk')) pickerClose(); });
    document.body.appendChild(picker.host);
    pickerRender();
    Promise.all([loadDefs(), call('GET', '/api/me/trophies')]).then(function (x) {
      var r = x[1], owned = {};
      ((r && r.ok && r.trophies) || []).forEach(function (t) { owned[t.id] = true; });
      picker.owned = owned;
      pickerRender();
    }).catch(function () { picker.owned = {}; pickerRender(); });
  }

  var chatApi = {
    /** 窓・シートを開く（ドックなら広げる）。つなぐ */
    open: function () { chatOpen(); },
    /** 窓・シートを閉じる（ドックなら畳む）。30 秒後に切る */
    close: function () { chatClose(); },
    /** 見えているか */
    isOpen: function () { return chatShown(); },
    /** ドックを畳む／広げる（1.7.0） */
    collapse: function (on) { chatMount(); chatCollapse(on !== false); },
    /** 💬・窓・ドックを出す／隠す（遊びの最中は隠す）。隠すときは窓も閉じる */
    setVisible: function (on) {
      chat.visible = on !== false;
      if (!chat.visible && chat.open && chatMode() !== 'dock') chatClose();
      if (chat.host) { applyChatPosition(); chatRender(); }
    },
    /** 置き場所 { position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left', offset: { x, y } }（💬 と窓。ドックは右側に固定） */
    setPosition: function (opts) {
      opts = opts || {};
      if (typeof opts.position === 'string' && /^(top|bottom)-(left|right)$/.test(opts.position)) chat.position = opts.position;
      if (opts.offset) {
        var ox = Number(opts.offset.x), oy = Number(opts.offset.y);
        chat.offset = { x: isFinite(ox) ? Math.max(0, Math.min(ox, 2000)) : chat.offset.x, y: isFinite(oy) ? Math.max(0, Math.min(oy, 2000)) : chat.offset.y };
      }
      if (typeof opts.layout === 'string' && /^(dock|float)$/.test(opts.layout)) chat.layout = opts.layout;
      if (isFinite(Number(opts.dockMin)) && Number(opts.dockMin) > 0) chat.dockMin = Number(opts.dockMin);
      if (chat.host) { applyChatPosition(); chatRender(); }
    },
    /** いまの形（1.7.0）：'dock' | 'float' | 'sheet' */
    layout: function () { return chatMode(); },
    /** 並び順（1.7.0）：'new' | 'likes' */
    setSort: function (sort) { chatSetSort(sort); },
    /** タイトルで絞る（1.7.0）。null で全部 */
    setFilter: function (game) { chat.filter = typeof game === 'string' && game ? game : null; chatRender(); },
    /** 遡って読む（1.7.0） */
    loadMore: function () { return chatLoadMore(); },
    /** 自分の場所に描く（1.7.0。ポータルの /chat/ など）。{ composerAt: 'top' | 'bottom', title } */
    mount: function (el, opts) {
      if (!el) return { ok: false, error: 'element' };
      opts = opts || {};
      var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CHAT_CSS + '</style><div class="tl"></div>';
      var m = { el: el, root: root, composerAt: opts.composerAt || 'top', title: opts.title || null };
      chat.mounts.push(m);
      chat.open = true;
      chatConnect();
      chatRender();
      return { ok: true, unmount: function () { chat.mounts = chat.mounts.filter(function (x) { return x !== m; }); root.innerHTML = ''; } };
    },
    /** 窓を使わず自前で出すとき：つなぐ（読み始める）。切るのは disconnect() */
    connect: function () { chatConnect(); },
    disconnect: function () { chatDisconnect(); },
    /** 発言する → { ok, error } （サーバーの返事は onMessage / err で） */
    send: function (text) { return chatSend(text); },
    /** 返信する（1.7.0） */
    reply: function (id, text) { return chatSend(text, Number(id)); },
    /** いいね（on を省くと押し直し）（1.7.0） */
    like: function (id, on) { return chatLike(Number(id), on); },
    /** 直す（本人だけ）（1.7.0） */
    edit: function (id, text) { return chatEdit(Number(id), text); },
    /** 消す（本人か管理者）（1.7.0） */
    remove: function (id) { return chatDelete(Number(id)); },
    /** 手元にある発言（つないでから届いたもの。親も返信も） */
    getMessages: function () { return chat.msgs.slice(); },
    /** 新しい発言・いいね・編集・削除が届いたら呼ばれる（{ t: 'msg' | 'like' | 'edit' | 'del', … }）。解除する関数を返す */
    onMessage: function (fn) {
      if (typeof fn === 'function') chat.listeners.push(fn);
      return function () { chat.listeners = chat.listeners.filter(function (f) { return f !== fn; }); };
    },
    /** 未読の数（見えていないあいだに届いたもの） */
    unread: function () { return chat.unread; },
    /** 窓・シートを開いた（true）・閉じた（false）／ドックを広げた・畳んだときに呼ばれる（1.6.1）。解除する関数を返す */
    onToggle: function (fn) {
      if (typeof fn === 'function') chat.toggles.push(fn);
      return function () { chat.toggles = chat.toggles.filter(function (f) { return f !== fn; }); };
    },
    /** 入力欄に入った（true）・出た（false）ときに呼ばれる（1.7.0。Factory はドックでは書いているあいだだけ時間を止める） */
    onCompose: function (fn) {
      if (typeof fn === 'function') chat.composes.push(fn);
      return function () { chat.composes = chat.composes.filter(function (f) { return f !== fn; }); };
    },
    /** にぎわい：タイトルごとの直近 24 時間の件数（1.7.0）→ { ok, games: { survivor: 12, … }, total } */
    stats: function () { return call('GET', '/api/chat/stats'); },
  };

  var nf = function (n) { return Math.round(n).toLocaleString('ja-JP'); };

  var api = {
    version: '1.10.0',
    rta: rtaApi,

    /**
     * 総合スコアの成績を送る（SPEC-002）。計算はサーバー。自己ベストを更新したら通知を出す
     * （積み上げのタイトルなど、こまめに送るときは { quiet: true } で通知を出さない）。
     * → { ok, score, best, improved, total, account }
     */
    submitScore: function (metrics, opts) {
      opts = opts || {};
      return call('POST', '/api/score/submit', { game: state.game, version: state.version, metrics: metrics }).then(function (r) {
        if (!r.ok) return r;
        if (r.account === 'guest') state.guest = state.guest || { id: null };
        if (r.improved && !opts.quiet) {
          toast({
            kicker: 'タイトルスコア 自己ベスト',
            title: nf(r.score),
            time: true,
            lines: ['総合スコア ' + nf(r.total) + (r.account === 'guest' ? '（ログインすると総合ランキングに載ります）' : '')],
            link: { text: '総合ランキング', href: state.base + '/score/' },
            button: r.account === 'guest' ? { text: 'ログインして登録', onClick: function () { api.login(); } } : null,
          }, 7000);
        }
        return r;
      });
    },

    /** 自分のタイトルスコアと総合スコア → { ok, account, total, titles: [{ game, score, milestone, performance, at }] } */
    getScores: function () { return call('GET', '/api/me/scores'); },

    /** 総合ランキング（game を渡すとタイトル別） */
    getScoreRanking: function (game) { return call('GET', '/api/score/ranking' + (game ? '?game=' + encodeURIComponent(game) : '')); },

    /** 総合スコアの対象タイトル → { ok, games: [{ id, name, kind, status }] } */
    getScoreGames: function () { return call('GET', '/api/score/games'); },

    /** 全体チャット（SPEC-004・SPEC-005。1.7.0）：open / close / collapse / setVisible / setPosition / layout / setSort / setFilter / loadMore / mount / send / reply / like / edit / remove / onMessage / onToggle / onCompose / stats */
    chat: chatApi,

    /** 最初に 1 回。{ game, version, apiBase?, toast?, toastOffset?, chat?: false | { position, offset, ui }, presence?: false }。ログイン状態を読みに行く */
    init: function (opts) {
      opts = opts || {};
      state.game = opts.game || null;
      state.version = opts.version || null;
      if (opts.ui === false) state.ui = false;
      if (opts.toast) api.setToastPosition({ position: opts.toast, offset: opts.toastOffset });
      if (opts.apiBase) state.base = String(opts.apiBase).replace(/\/+$/, '');
      // 同時接続数（SPEC-007）：操作のあったページから「操作あり」を送る。presence: false で送らない
      if (opts.presence !== false) { try { presenceStart(); } catch (e) { console.warn('[BearkoGames] presence', e); } }
      // 全体チャット（1.6.0 / 1.7.0）：既定は PC で右側のドック・狭い画面で 💬 → シート。chat: false で何も出さない。
      // { layout: 'float' } で 1.x の窓、{ ui: false } で自前の窓（connect / send / onMessage）、{ button: false } で 💬 を出さない
      if (opts.chat === false) chat.enabled = false;
      else if (opts.chat && typeof opts.chat === 'object') { if (opts.chat.ui === false) chat.ui = false; if (opts.chat.button === false) chat.button = false; chatApi.setPosition(opts.chat); }
      return refresh().then(function (r) { state.ready = true; try { chatMount(); } catch (e) { console.warn('[BearkoGames] chat', e); } return r; });
    },

    /**
     * 通知（トロフィー・RTA の記録・自己ベスト）の置き場所。{ position: 'top' | 'bottom', offset: 端からの px }。
     * 既定は下。結果画面のボタンと重なるゲームは上に寄せる（1.5.0）
     */
    setToastPosition: function (opts) {
      opts = opts || {};
      state.toastPos = opts.position === 'top' ? 'top' : 'bottom';
      var off = Number(opts.offset);
      state.toastOffset = isFinite(off) && off > 0 ? Math.min(off, 2000) : 0;
      try { applyToastPosition(); } catch (e) { console.warn('[BearkoGames] toast', e); }
    },

    /** ログイン中なら { id, name }、していなければ null */
    getUser: function () { return state.user ? { id: state.user.id, name: state.user.name, avatar: state.user.avatar || null } : null; },

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
        if (r.ok) { state.user = null; state.hasAccount = false; emit(); }
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
     * アイコンを変える（SPEC-005 5.3。1.7.0）。bearko.games 全体（すべてのゲームとチャット）のアイコンが変わる。
     * id は "hero:1001" / "ext:5106"（資産リポジトリのヒーロー／エクステンション）。null で既定の絵（名前の 1 文字目）
     */
    setAvatar: function (id) {
      return call('POST', '/api/me/avatar', { id: id == null ? null : String(id) }).then(function (r) {
        if (r.ok && r.user) { state.user = r.user; emit(); }
        if (r.ok && r.unlocked && r.unlocked.length) announce(r);   // SPEC-008：アイコンを変えるとアチーブメント
        return r;
      });
    },
    /** アイコンの id → 絵の URL（null や合わない id は既定の MCHウォーリアー。1.8.0） */
    avatarUrl: function (id) { return avatarUrl(id); },
    /** アイコン図鑑の窓を開く（1.7.0。1.8.0 で図鑑に）。各タイトルのマイページはこれを呼ぶだけでよい */
    openAvatarPicker: function () { try { openAvatarPicker(); } catch (e) { console.warn('[BearkoGames] avatar picker', e); } },

    /**
     * トロフィーを獲得する。未ログインなら仮アカウントに貯める（ログインしたときにまとめて登録）。
     * 新しく得たら通知を出す（init({ ui: false }) なら出さない）。{ ok, account, unlocked, total }
     */
    unlockTrophy: function (id) {
      return call('POST', '/api/trophies/unlock', { id: id }).then(announce);
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
