/*
 * bearko.games 共通基盤 SDK v1（SPEC-001 5 章）
 *
 *   <script src="https://bearko.games/sdk/v1.js"></script>
 *   await BearkoGames.init({ game: 'tactics', version: '1.2.0' });
 *   BearkoGames.setToastPosition({ position: 'top', offset: 48 });   // 通知を画面の上に出す（既定は下。1.5.0）
 *   BearkoGames.chat.setVisible(false);                                // 全体チャットの 💬 を隠す（遊びの最中。1.6.0）
 *   BearkoGames.chat.onToggle(function (open) { ... });                // 窓を開いた・閉じた（1.6.1。Factory は時間を止める）
 *   BearkoGames.init({ game: 'survivor', chat: { position: 'top-right' } }); // 💬 の置き場所。chat: false で出さない
 *   BearkoGames.getUser();          // { id, name } か null
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


  // ---------------------------------------------------------------- 全体チャット（SPEC-004。1.6.0）
  // 画面の隅の 💬 と、押すと開く窓（通知と同じ Shadow DOM）。開いているあいだだけ WebSocket でつなぎ、閉じて 30 秒で切る。
  // 未ログインでも読める。書けるのはログインして名前を決めた人（サーバーが確かめる。画面では先に止める）。
  var chat = {
    enabled: true, ui: true, button: true, visible: true, mounted: false, open: false, toggles: [],
    position: 'bottom-right', offset: { x: 16, y: 16 },
    host: null, ws: null, you: null, msgs: [], unread: 0, note: '', retry: 0, closeTimer: null, pingTimer: null, retryTimer: null,
    listeners: [],
  };
  var CHAT_CLOSE_AFTER = 30e3, CHAT_PING_EVERY = 25e3, CHAT_MAX = 200, CHAT_KEEP = 200;
  var GAME_LABEL = { survivor: 'Survivor', tactics: 'Tactics', workshop: 'Workshop', factory: 'Factory', fortress: 'Fortress', deckbattle: 'DeckBattle', '10buy-year': '10 buy year!', education: 'Education', advance: 'Advance', portal: 'bearko.games' };

  function chatRoot() {
    if (chat.host) return chat.host.shadowRoot;
    chat.host = document.createElement('div');
    chat.host.setAttribute('data-bearko-games', 'chat');
    var root = chat.host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.btn{position:fixed;z-index:2147483645;width:48px;height:48px;border-radius:50%;background:#151926;border:1px solid rgba(167,139,250,.6);color:#eef0f6;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:"M PLUS 1p",system-ui,sans-serif;padding:0}' +
      '.btn:hover{border-color:#a78bfa}' +
      '.btn .b{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;border-radius:9px;background:#a78bfa;color:#140f24;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box}' +
      '.btn .b.on{display:flex}' +
      '.panel{position:fixed;z-index:2147483645;width:360px;max-height:70vh;display:none;flex-direction:column;background:#151926;color:#eef0f6;border:1px solid rgba(167,139,250,.6);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:"M PLUS 1p",system-ui,sans-serif;font-size:13px;overflow:hidden;box-sizing:border-box}' +
      '.panel.open{display:flex;animation:in .2s ease-out}' +
      '.head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.head .k{font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.04em;flex:1}' +
      '.head .n{font-size:11px;color:#9aa1b5}' +
      '.x{background:none;border:0;color:#9aa1b5;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;font-family:inherit}' +
      '.list{flex:1;overflow-y:auto;padding:8px 12px;display:grid;gap:8px;align-content:start;min-height:180px;overscroll-behavior:contain}' +
      '.m{display:grid;gap:2px}' +
      '.m .h{display:flex;gap:6px;align-items:baseline;font-size:11px;color:#9aa1b5}' +
      '.m .h b{color:#c4b5fd;font-weight:700}' +
      '.m .g{font-size:10px;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:0 4px;color:#9aa1b5}' +
      '.m .t{white-space:pre-wrap;word-break:break-word;line-height:1.5;color:#eef0f6}' +
      '.m .d{background:none;border:0;color:#9aa1b5;font-size:11px;cursor:pointer;margin-left:auto;font-family:inherit}' +
      '.m .d:hover{color:#f9a8a8}' +
      '.foot{padding:8px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:6px;align-items:center}' +
      '.foot input{flex:1;min-width:0;font:inherit;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0b0d14;color:#eef0f6;box-sizing:border-box}' +
      '.foot input:focus{outline:1px solid #a78bfa}' +
      '.foot button{font:inherit;font-size:12px;font-weight:700;border:0;border-radius:8px;padding:8px 12px;background:#a78bfa;color:#140f24;cursor:pointer;white-space:nowrap}' +
      '.foot button:disabled{opacity:.5;cursor:default}' +
      '.foot .msg{flex:1;font-size:12px;color:#9aa1b5}' +
      '.note{font-size:11px;color:#f9a8a8;padding:0 12px 6px;min-height:14px}' +
      '.empty{color:#6b7280;font-size:12px;text-align:center;padding:24px 8px}' +
      '@media (max-width:639px){.panel{left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%;max-height:60vh;border-radius:12px 12px 0 0;padding-bottom:env(safe-area-inset-bottom)}}' +
      '@keyframes in{from{opacity:0;transform:translateY(8px)}}' +
      '@media (prefers-reduced-motion:reduce){.panel.open{animation:none}}' +
      '</style>' +
      '<button class="btn" type="button" aria-label="チャット" aria-expanded="false">💬<span class="b" aria-hidden="true"></span></button>' +
      '<div class="panel" role="dialog" aria-label="いまの会話">' +
      '<div class="head"><span class="k">いまの会話</span><span class="n"></span><button class="x" type="button" aria-label="閉じる">×</button></div>' +
      '<div class="list" aria-live="polite"></div><div class="note"></div><div class="foot"></div></div>';
    root.querySelector('.btn').addEventListener('click', function () { if (chat.open) chatClose(); else chatOpen(); });
    root.querySelector('.x').addEventListener('click', chatClose);
    document.body.appendChild(chat.host);
    applyChatPosition();
    return root;
  }

  function applyChatPosition() {
    if (!chat.host) return;
    var root = chat.host.shadowRoot, btn = root.querySelector('.btn'), panel = root.querySelector('.panel');
    var right = chat.position.indexOf('left') < 0, top = chat.position.indexOf('top') === 0;
    var x = Math.round(chat.offset.x), y = Math.round(chat.offset.y);
    var sx = right ? 'right' : 'left', sy = top ? 'top' : 'bottom';
    [btn, panel].forEach(function (el) { el.style.left = el.style.right = el.style.top = el.style.bottom = ''; });
    btn.style[sx] = 'calc(' + x + 'px + env(safe-area-inset-' + sx + '))';
    btn.style[sy] = 'calc(' + y + 'px + env(safe-area-inset-' + sy + '))';
    panel.style[sx] = 'calc(' + x + 'px + env(safe-area-inset-' + sx + '))';
    panel.style[sy] = 'calc(' + (y + 58) + 'px + env(safe-area-inset-' + sy + '))';
    chat.host.style.display = chat.visible ? '' : 'none';
    btn.style.display = chat.button ? '' : 'none';   // 1.6.1: { button: false } は 💬 を出さず、窓はゲームのボタンから open()
  }

  function chatMount() {
    if (!chat.enabled || !chat.ui || !state.ui || chat.mounted) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', chatMount, { once: true }); return; }
    chat.mounted = true;
    chatRoot();
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
      // 開いているあいだは少し待って（1・2・4…30 秒）つなぎ直す
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

  function chatHandle(m) {
    if (m.t === 'hist') {
      chat.msgs = (m.msgs || []).slice(-CHAT_KEEP);
      chat.you = m.you || null;
      chatRender();
    } else if (m.t === 'msg') {
      chat.msgs.push(m);
      if (chat.msgs.length > CHAT_KEEP) chat.msgs.splice(0, chat.msgs.length - CHAT_KEEP);
      if (!chat.open) chat.unread++;
      for (var i = 0; i < chat.listeners.length; i++) {
        try { chat.listeners[i](m); } catch (e) { console.warn('[BearkoGames] chat.onMessage', e); }
      }
      chatRender();
    } else if (m.t === 'del') {
      chat.msgs = chat.msgs.filter(function (x) { return x.id !== m.id; });
      chatRender();
    } else if (m.t === 'purge') {
      chat.msgs = chat.msgs.filter(function (x) { return x.uid !== m.uid; });
      chatRender();
    } else if (m.t === 'err') {
      chatNote({ rate: '少し待ってから送ってください', login: 'ログインすると参加できます', name: '名前を決めると参加できます', banned: 'このアカウントは発言できません', long: '1〜200 文字で送ってください' }[m.code] || '送れませんでした');
    }
  }

  function chatNote(text) {
    chat.note = text || '';
    if (chat.host) chat.host.shadowRoot.querySelector('.note').textContent = chat.note;
  }

  function chatSend(text) {
    var t = String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!t) return { ok: false, error: 'empty' };
    if (t.length > CHAT_MAX) return { ok: false, error: 'long' };
    if (!chat.ws || chat.ws.readyState !== 1) { chatConnect(); return { ok: false, error: 'closed' }; }
    try { chat.ws.send(JSON.stringify({ t: 'msg', text: t })); } catch (e) { return { ok: false, error: 'network' }; }
    return { ok: true };
  }

  /** 開いた・閉じたを知らせる（1.6.1。Factory は開いているあいだ時間を止める） */
  function chatToggled(open) {
    chat.toggles.forEach(function (fn) { try { fn(open); } catch (e) { console.warn('[BearkoGames] chat onToggle', e); } });
  }

  function chatOpen() {
    if (!chat.enabled) return;
    var was = chat.open;
    chat.open = true;
    chat.unread = 0;
    clearTimeout(chat.closeTimer);
    chatConnect();
    chatRender();
    if (chat.host) {
      var input = chat.host.shadowRoot.querySelector('.foot input');
      if (input) { try { input.focus({ preventScroll: true }); } catch (e) { /* 古い環境 */ } }
    }
    if (!was) chatToggled(true);
  }

  function chatClose() {
    var was = chat.open;
    chat.open = false;
    chatRender();
    if (was) chatToggled(false);
    clearTimeout(chat.closeTimer);
    chat.closeTimer = setTimeout(function () { if (!chat.open) chatDisconnect(); }, CHAT_CLOSE_AFTER);
  }

  function chatTime(at) {
    var d = new Date(at), two = function (n) { return (n < 10 ? '0' : '') + n; };
    return two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function chatRender() {
    if (!chat.host) return;
    var root = chat.host.shadowRoot;
    var btn = root.querySelector('.btn'), badge = btn.querySelector('.b'), panel = root.querySelector('.panel');
    badge.textContent = chat.unread > 99 ? '99+' : String(chat.unread);
    badge.classList.toggle('on', chat.unread > 0 && !chat.open);
    btn.setAttribute('aria-expanded', String(chat.open));
    panel.classList.toggle('open', chat.open);
    if (!chat.open) return;
    root.querySelector('.head .n').textContent = chat.ws && chat.ws.readyState === 1 ? '' : '接続中…';
    // 一覧
    var list = root.querySelector('.list');
    var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.textContent = '';
    if (!chat.msgs.length) {
      var empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'まだ発言はありません。最初のひとことをどうぞ';
      list.appendChild(empty);
    }
    var me = state.user ? state.user.id : null;
    chat.msgs.forEach(function (m) {
      var el = document.createElement('div'); el.className = 'm';
      var h = document.createElement('div'); h.className = 'h';
      var b = document.createElement('b'); b.textContent = m.name || '名無し'; h.appendChild(b);
      var g = document.createElement('span'); g.className = 'g'; g.textContent = GAME_LABEL[m.game] || m.game; h.appendChild(g);
      var tm = document.createElement('span'); tm.textContent = chatTime(m.at); h.appendChild(tm);
      if (me && m.uid === me) {
        var d = document.createElement('button'); d.className = 'd'; d.type = 'button'; d.textContent = '消す';
        d.addEventListener('click', function () { chatDelete(m.id); });
        h.appendChild(d);
      }
      var t = document.createElement('div'); t.className = 't'; t.textContent = m.text;
      el.appendChild(h); el.appendChild(t);
      list.appendChild(el);
    });
    if (atBottom) list.scrollTop = list.scrollHeight;
    root.querySelector('.note').textContent = chat.note;
    // 入力欄（未ログイン → ログイン、名無し → 名前を決める）
    var foot = root.querySelector('.foot');
    var was = foot.querySelector('input');
    var draft = was ? was.value : '';
    foot.textContent = '';
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
      var input = document.createElement('input'); input.type = 'text'; input.maxLength = CHAT_MAX; input.placeholder = 'メッセージ（200 文字まで）'; input.value = draft; input.setAttribute('autocomplete', 'off');
      var send = document.createElement('button'); send.type = 'button'; send.textContent = '送る';
      var go = function () {
        var r = chatSend(input.value);
        if (r.ok) { input.value = ''; chatNote(''); }
        else if (r.error === 'closed') chatNote('つなぎ直しています…');
        else if (r.error === 'long') chatNote('1〜200 文字で送ってください');
      };
      send.addEventListener('click', go);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) { e.preventDefault(); go(); } });
      foot.appendChild(input); foot.appendChild(send);
    }
  }

  function chatDelete(id) {
    call('DELETE', '/api/chat/messages/' + encodeURIComponent(id)).then(function (r) {
      if (r.ok) { chat.msgs = chat.msgs.filter(function (x) { return x.id !== id; }); chatRender(); }
      else chatNote('消せませんでした');
    });
  }

  // ログイン状態が変わったら、入力欄を描き直し、つないでいれば名前を持ち直すためにつなぎ直す
  function chatOnUser() {
    if (!chat.enabled) return;
    chatRender();
    if (chat.ws) { chatDisconnect(); if (chat.open) chatConnect(); }
  }

  var chatApi = {
    /** 窓を開く（つなぐ） */
    open: function () { chatMount(); chatOpen(); },
    /** 窓を閉じる（30 秒後に切る） */
    close: function () { chatClose(); },
    /** 開いているか */
    isOpen: function () { return chat.open; },
    /** 💬 と窓を出す／隠す（遊びの最中は隠す）。隠すときは窓も閉じる */
    setVisible: function (on) {
      chat.visible = on !== false;
      if (!chat.visible && chat.open) chatClose();
      if (chat.host) applyChatPosition();
    },
    /** 置き場所 { position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left', offset: { x, y } } */
    setPosition: function (opts) {
      opts = opts || {};
      if (typeof opts.position === 'string' && /^(top|bottom)-(left|right)$/.test(opts.position)) chat.position = opts.position;
      if (opts.offset) {
        var ox = Number(opts.offset.x), oy = Number(opts.offset.y);
        chat.offset = { x: isFinite(ox) ? Math.max(0, Math.min(ox, 2000)) : chat.offset.x, y: isFinite(oy) ? Math.max(0, Math.min(oy, 2000)) : chat.offset.y };
      }
      if (chat.host) applyChatPosition();
    },
    /** 窓を使わず自前で出すとき：つなぐ（読み始める）。切るのは disconnect() */
    connect: function () { chatConnect(); },
    disconnect: function () { chatDisconnect(); },
    /** 発言する → { ok, error } （サーバーの返事は onMessage / err で） */
    send: function (text) { return chatSend(text); },
    /** 手元にある発言（つないでから届いたもの） */
    getMessages: function () { return chat.msgs.slice(); },
    /** 新しい発言が届いたら呼ばれる。解除する関数を返す */
    onMessage: function (fn) {
      if (typeof fn === 'function') chat.listeners.push(fn);
      return function () { chat.listeners = chat.listeners.filter(function (f) { return f !== fn; }); };
    },
    /** 未読の数（窓を閉じているあいだに届いたもの） */
    unread: function () { return chat.unread; },
    /** 窓を開いた（true）・閉じた（false）ときに呼ばれる（1.6.1）。解除する関数を返す */
    onToggle: function (fn) {
      if (typeof fn === 'function') chat.toggles.push(fn);
      return function () { chat.toggles = chat.toggles.filter(function (f) { return f !== fn; }); };
    },
  };

  var nf = function (n) { return Math.round(n).toLocaleString('ja-JP'); };

  var api = {
    version: '1.6.1',
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

    /** 全体チャット（SPEC-004。1.6.0）：open / close / setVisible / setPosition / send / onMessage / connect / disconnect */
    chat: chatApi,

    /** 最初に 1 回。{ game, version, apiBase?, toast?, toastOffset?, chat?: false | { position, offset, ui } }。ログイン状態を読みに行く */
    init: function (opts) {
      opts = opts || {};
      state.game = opts.game || null;
      state.version = opts.version || null;
      if (opts.ui === false) state.ui = false;
      if (opts.toast) api.setToastPosition({ position: opts.toast, offset: opts.toastOffset });
      if (opts.apiBase) state.base = String(opts.apiBase).replace(/\/+$/, '');
      // 全体チャット（1.6.0）：既定は 💬 を出す。chat: false で何も出さない。{ ui: false } で自前の窓（connect / send / onMessage）
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
