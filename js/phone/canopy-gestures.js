// ============================================================
//  canopy-gestures.js — phone gestures for the Canopy simulator (touch AND mouse, via pointer events)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Two layers:
//   1. PURE logic (no DOM, injected clock): classifyEdge, trackVelocity, swipeDirection, resolveTaps,
//      shouldCommitSystem, createTapCounter, createRecognizer.  Unit-tested in tests/gestures.test.js.
//   2. attach(inst, {screen, root, view, render}): DOM glue — edge back/forward, home / app switcher,
//      notification shade, app-level events (doubletap ... scroll) delivered with kernel.dispatch.
//  All coordinates are the phone's OWN screen pixels (scale-to-fit removed), so portrait, landscape and
//  the pop-out overlay behave identically.
// ============================================================
(function (global) {
  'use strict';

  var DEFAULTS = {
    edgeSide: 22, edgeBottom: 28, edgeTop: 30,      // start zones (phone px)
    slop: 10, longPressMs: 500, multiTapMs: 300, multiTapDist: 32,
    swipeMin: 40, swipeMinV: 0.25, swipeLongDist: 80, swipeMaxMs: 800, swipeAxis: 1.2,
    pauseV: 0.12, flickV: 0.5, windowMs: 120
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) t[k] = s[k]; } return t; }

  // ---------------------------------------------------------------- pure helpers
  // Which screen edge (if any) a point starts in; the nearest edge (relative to its zone size) wins, so corners resolve sensibly.
  function classifyEdge(x, y, size, cfg) {
    cfg = cfg || DEFAULTS;
    if (x < 0 || y < 0 || x > size.w || y > size.h) return null;
    var d = { bottom: size.h - y, top: y, left: x, right: size.w - x };
    var lim = { bottom: cfg.edgeBottom, top: cfg.edgeTop, left: cfg.edgeSide, right: cfg.edgeSide };
    var best = null, bv = 1e9;
    ['bottom', 'top', 'left', 'right'].forEach(function (k) { if (d[k] <= lim[k]) { var r = d[k] / lim[k]; if (r < bv) { bv = r; best = k; } } });
    return best;
  }
  // velocity (px/ms) over the last windowMs before `now`; a finger that has been still for the whole window reads 0
  function trackVelocity(samples, now, windowMs) {
    var w = windowMs == null ? DEFAULTS.windowMs : windowMs, use = [], i;
    for (i = 0; i < samples.length; i++) if (samples[i].t >= now - w) use.push(samples[i]);
    if (use.length < 2) return { vx: 0, vy: 0, v: 0 };
    var a = use[0], b = use[use.length - 1], dt = Math.max(b.t - a.t, 8);
    var vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    return { vx: vx, vy: vy, v: Math.sqrt(vx * vx + vy * vy) };
  }
  // swipe classification for a finished drag; v = release speed (px/ms). Returns {dir, dist, velocity} or null.
  function swipeDirection(dx, dy, dt, v, cfg) {
    cfg = cfg || DEFAULTS;
    var ax = Math.abs(dx), ay = Math.abs(dy), dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < cfg.swipeMin || dt > cfg.swipeMaxMs) return null;
    var avg = dist / Math.max(dt, 1), sp = Math.max(avg, v || 0);
    if (!(sp >= cfg.swipeMinV || dist >= cfg.swipeLongDist)) return null;       // slow short drag = not a swipe
    var dir;
    if (ax >= ay * cfg.swipeAxis) dir = dx < 0 ? 'left' : 'right';
    else if (ay >= ax * cfg.swipeAxis) dir = dy < 0 ? 'up' : 'down';
    else return null;                                                           // ambiguous diagonal
    return { dir: dir, dist: dist, velocity: sp };
  }
  // n consecutive taps on one node -> events to fire, given which multi-tap handlers exist
  function resolveTaps(n, has2, has3) {
    var out = [];
    while (n > 0) {
      if (n >= 3 && has3) { out.push('tripletap'); n -= 3; }
      else if (n >= 2 && has2) { out.push('doubletap'); n -= 2; }
      else { out.push('tap'); n -= 1; }
    }
    return out;
  }
  function thresholds(size, cfg) {
    var w = size.w, h = size.h;
    return {
      sideDist: clamp(w * 0.22, 56, 100), sideMin: 28,
      homeDist: 54, pauseDist: clamp(h * 0.1, 56, 90), longDist: clamp(h * 0.28, 110, 220),
      shadeFrac: 0.35, closeFrac: 0.7, flick: cfg.flickV
    };
  }
  // Decide what a finished system swipe does.  m = {dx, dy, vx, vy, vNow, frac}
  //   kinds: back | forward | up (bottom edge) | shade (top edge, pulling down) | shadeclose (swiping the open shade up)
  function shouldCommitSystem(kind, m, size, cfg) {
    cfg = cfg || DEFAULTS; var T = thresholds(size, cfg), none = { commit: false, action: 'none' };
    if (kind === 'back' || kind === 'forward') {
      var sgn = kind === 'back' ? 1 : -1, d = sgn * m.dx, v = sgn * m.vx;
      if (v < -0.2 && d < T.sideDist) return none;                              // reversing: cancel
      return (d >= T.sideDist || (d >= T.sideMin && v >= cfg.flickV * 0.9)) ? { commit: true, action: kind } : none;
    }
    if (kind === 'up') {
      var up = -m.dy, vu = -m.vy;
      if (vu < -0.2 && up < T.longDist) return none;
      if (up >= T.pauseDist && m.vNow < cfg.pauseV) return { commit: true, action: 'switcher' };            // dragged up and held
      if (up >= T.longDist && vu < cfg.flickV * 1.2) return { commit: true, action: 'switcher' };           // long, unhurried drag
      if (up >= T.homeDist || (up >= 24 && vu >= cfg.flickV)) return { commit: true, action: 'home' };      // short drag or flick
      return none;
    }
    if (kind === 'shade') {
      var vd = m.vy;
      if (vd < -0.2 && m.frac < 0.6) return none;
      return (m.frac >= T.shadeFrac || (m.dy >= 24 && vd >= 0.4)) ? { commit: true, action: 'shade-open' } : none;
    }
    if (kind === 'shadeclose') {
      var vc = -m.vy;
      if (vc < -0.2) return none;                                               // moving back down: stay open
      return (m.frac <= T.closeFrac || (-m.dy >= 18 && vc >= 0.35)) ? { commit: true, action: 'shade-close' } : none;
    }
    return none;
  }

  function realClock() { return { now: function () { return Date.now(); }, setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (t) { clearTimeout(t); } }; }

  // Multi-tap counter. Plain nodes never go through it (tap fires immediately); only nodes with doubletap/tripletap handlers wait.
  function createTapCounter(o) {
    o = o || {}; var cfg = assign({}, DEFAULTS, o.config), clock = o.clock || realClock(), emit = o.emit || function () {}, p = null;
    function fire() {
      if (!p) return; var q = p; p = null; clock.clearTimeout(q.timer);
      var names = resolveTaps(q.n, q.has2, q.has3);
      names.forEach(function (nm) { emit(nm, { x: q.x, y: q.y, count: nm === 'tripletap' ? 3 : nm === 'doubletap' ? 2 : 1 }, q.key); });
    }
    function add(key, x, y, has2, has3) {
      var now = clock.now();
      if (p && (p.key !== key || now - p.t > cfg.multiTapMs || Math.hypot(x - p.x, y - p.y) > cfg.multiTapDist)) fire();
      if (!p) p = { key: key, n: 0 };
      p.n++; p.x = x; p.y = y; p.t = now; p.has2 = !!has2; p.has3 = !!has3;
      clock.clearTimeout(p.timer);
      var max = p.has3 ? 3 : p.has2 ? 2 : 1;
      if (p.n >= max) { fire(); return; }
      p.timer = clock.setTimeout(fire, cfg.multiTapMs);
    }
    return { add: add, flush: fire, pending: function () { return p ? p.n : 0; } };
  }

  // The pointer state machine.
  //   down(id,x,y,t,target) move(id,x,y,t) up(id,x,y,t) cancel(id)
  //   target = { has(eventName)->bool, shadeDrag?:bool }  (what handlers sit under the finger)
  //   emits: 'sys:start' 'sys:move' 'sys:end' 'app' {name,payload,target} 'swipe' 'tap' 'pan' 'consume'
  function createRecognizer(o) {
    o = o || {};
    var cfg = assign({}, DEFAULTS, o.config), clock = o.clock || realClock(), emit = o.emit || function () {};
    var sizeFn = o.size || function () { return { w: 360, h: 780 }; }, ctxFn = o.context || function () { return {}; };
    var ptrs = {}, nptr = 0, g = null;
    function has(name) { return !!(g && g.target && g.target.has && g.target.has(name)); }
    function clearTimer() { if (g && g.timer) { clock.clearTimeout(g.timer); g.timer = null; } }

    function down(id, x, y, t, target) {
      if (!ptrs[id]) nptr++;
      ptrs[id] = { x: x, y: y };
      if (g && id !== g.id && nptr === 2 && g.mode !== 'sys' && g.mode !== 'multi' && g.mode !== 'ended') { enterMulti(id, t); return; }
      if (g) return;                                                             // extra fingers during sys/multi are ignored
      var c = ctxFn() || {}, size = sizeFn(), zone;
      if (c.shadeOpen) zone = target && target.shadeDrag ? 'shade' : null;
      else { zone = classifyEdge(x, y, size, cfg); if ((zone === 'left' || zone === 'right') && c.locked) zone = null; }
      g = { id: id, sx: x, sy: y, st: t, x: x, y: y, zone: zone, mode: 'pending', target: target || {}, samples: [{ x: x, y: y, t: t }], timer: null, lx: x, ly: y };
      if (!zone && has('longpress')) {
        g.timer = clock.setTimeout(function () {
          g.timer = null;
          if (g && g.mode === 'pending' && Math.hypot(g.x - g.sx, g.y - g.sy) <= cfg.slop) {
            g.mode = 'longpress'; emit('app', { name: 'longpress', payload: { x: g.x, y: g.y }, target: g.target }); emit('consume');
          }
        }, cfg.longPressMs);
      }
    }
    function decide(dx, dy) {
      var ax = Math.abs(dx), ay = Math.abs(dy);
      switch (g.zone) {
        case 'left': if (dx > 0 && ax >= ay) return 'back'; break;
        case 'right': if (dx < 0 && ax >= ay) return 'forward'; break;
        case 'bottom': if (dy < 0 && ay >= ax) return 'up'; break;
        case 'top': if (dy > 0 && ay >= ax) return 'shade'; break;
        case 'shade': if (dy < 0 && ay >= ax * 0.8) return 'shadeclose'; break;
      }
      return null;
    }
    function metrics(t) {
      var dx = g.x - g.sx, dy = g.y - g.sy, v = trackVelocity(g.samples, t, cfg.windowMs), c = ctxFn() || {}, size = sizeFn(), H = c.shadeH || size.h * 0.9, frac = 0;
      if (g.kind === 'shade') frac = clamp(g.y, 0, H) / H;
      else if (g.kind === 'shadeclose') frac = clamp(H + dy, 0, H) / H;
      return { dx: dx, dy: dy, vx: v.vx, vy: v.vy, vNow: v.v, frac: frac, x: g.x, y: g.y };
    }
    function settle(id, x, y, t) {                                              // shared by move() and up()
      var p = ptrs[id]; if (p) { p.x = x; p.y = y; }
      if (!g || id !== g.id) { if (g && g.mode === 'multi') multiMove(); return; }
      var px = g.x, py = g.y; g.x = x; g.y = y; g.samples.push({ x: x, y: y, t: t }); if (g.samples.length > 24) g.samples.shift();
      var dx = x - g.sx, dy = y - g.sy, dist = Math.sqrt(dx * dx + dy * dy);
      if (g.mode === 'pending' && dist > cfg.slop) {
        clearTimer();
        var kind = decide(dx, dy);
        if (kind) { g.mode = 'sys'; g.kind = kind; emit('sys:start', { kind: kind, x: g.sx, y: g.sy, zone: g.zone }); }
        else if (has('dragstart') || has('drag') || has('dragend')) { g.mode = 'drag'; emit('app', { name: 'dragstart', payload: { x: g.sx, y: g.sy, dx: 0, dy: 0 }, target: g.target }); }
        else g.mode = 'pan';
      }
      if (g.mode === 'sys') { var m = metrics(t); emit('sys:move', { kind: g.kind, dx: dx, dy: dy, x: x, y: y, frac: m.frac, v: m }); }
      else if (g.mode === 'drag') emit('app', { name: 'drag', payload: { x: x, y: y, dx: dx, dy: dy, ddx: x - px, ddy: y - py }, target: g.target });
      else if (g.mode === 'pan') emit('pan', { dx: dx, dy: dy, ddx: x - px, ddy: y - py, x: x, y: y, target: g.target });
    }
    function move(id, x, y, t) { if (ptrs[id]) settle(id, x, y, t); }

    function up(id, x, y, t) {
      var out = { type: 'none' };
      if (!ptrs[id]) return out;
      if (g && id === g.id && g.mode !== 'multi' && g.mode !== 'ended') {
        settle(id, x, y, t); clearTimer();
        var dx = g.x - g.sx, dy = g.y - g.sy, dt = t - g.st, v = trackVelocity(g.samples, t, cfg.windowMs);
        if (g.mode === 'pending') {
          out = { type: 'tap', x: g.x, y: g.y, duration: dt }; emit('tap', out);
        } else if (g.mode === 'longpress') out = { type: 'longpress' };
        else if (g.mode === 'sys') {
          var m = metrics(t), res = shouldCommitSystem(g.kind, m, sizeFn(), cfg);
          out = { type: 'sys', kind: g.kind, commit: res.commit, action: res.action, dx: dx, dy: dy, velocity: v.v };
          emit('sys:end', out); emit('consume');
        } else if (g.mode === 'drag') {
          out = { type: 'drag', dx: dx, dy: dy, velocity: v.v };
          emit('app', { name: 'dragend', payload: { x: g.x, y: g.y, dx: dx, dy: dy, vx: v.vx, vy: v.vy, velocity: v.v }, target: g.target }); emit('consume');
        } else if (g.mode === 'pan') {
          var sw = swipeDirection(dx, dy, dt, v.v, cfg);
          if (sw) {
            out = { type: 'swipe', dir: sw.dir, dx: dx, dy: dy, velocity: sw.velocity };
            emit('swipe', { name: 'swipe' + sw.dir, dir: sw.dir, payload: { x: g.x, y: g.y, dx: dx, dy: dy, velocity: sw.velocity, direction: sw.dir, duration: dt }, target: g.target, startY: g.sy, startX: g.sx });
          } else out = { type: 'none' };
        }
        releasePtr(id); g = null; return out;
      }
      if (g && g.mode === 'multi') { endMulti(); g.mode = 'ended'; out = { type: 'multi' }; }
      releasePtr(id); if (!nptr) g = null; return out;
    }
    function releasePtr(id) { if (ptrs[id]) { delete ptrs[id]; nptr--; } }
    function cancel(id) {
      if (!ptrs[id]) return;
      if (g && id === g.id) {
        clearTimer();
        if (g.mode === 'sys') emit('sys:end', { type: 'sys', kind: g.kind, commit: false, action: 'none', cancelled: true });
        else if (g.mode === 'drag') emit('app', { name: 'dragend', payload: { x: g.x, y: g.y, cancelled: true }, target: g.target });
        else if (g.mode === 'multi') endMulti();
        g = null;
      } else if (g && g.mode === 'multi') { endMulti(); g.mode = 'ended'; }
      releasePtr(id); if (!nptr) g = null;
    }

    // two pointers: pinch (scale) + rotate (degrees, cumulative)
    function pair() { var ids = g.mp.ids, a = ptrs[ids[0]], b = ptrs[ids[1]]; return (a && b) ? { a: a, b: b } : null; }
    function enterMulti(id, t) {
      clearTimer();
      if (g.mode === 'drag') emit('app', { name: 'dragend', payload: { x: g.x, y: g.y, cancelled: true }, target: g.target });
      g.mode = 'multi'; var a = ptrs[g.id], b = ptrs[id];
      g.mp = { ids: [g.id, id], d0: Math.max(Math.hypot(b.x - a.x, b.y - a.y), 10), a0: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, last: 0, acc: 0 };
      g.mp.last = g.mp.a0;
      multiEmit('start', 1, 0, (a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    }
    function multiEmit(phase, scale, angle, cx, cy, dAngle) {
      if (has('pinch')) emit('app', { name: 'pinch', payload: { scale: scale, delta: scale - (g.mp.lastScale == null ? 1 : g.mp.lastScale), cx: cx, cy: cy, x: cx, y: cy, phase: phase }, target: g.target });
      if (has('rotate')) emit('app', { name: 'rotate', payload: { angle: angle, rotation: angle, delta: dAngle, cx: cx, cy: cy, x: cx, y: cy, phase: phase }, target: g.target });
      g.mp.lastScale = scale;
    }
    function multiMove() {
      var pr = pair(); if (!pr) return;
      var d = Math.max(Math.hypot(pr.b.x - pr.a.x, pr.b.y - pr.a.y), 1), ang = Math.atan2(pr.b.y - pr.a.y, pr.b.x - pr.a.x) * 180 / Math.PI, da = ang - g.mp.last;
      if (da > 180) da -= 360; if (da < -180) da += 360;
      g.mp.acc += da; g.mp.last = ang;
      multiEmit('move', d / g.mp.d0, g.mp.acc, (pr.a.x + pr.b.x) / 2, (pr.a.y + pr.b.y) / 2, da);
      emit('consume');
    }
    function endMulti() { var pr = pair(); if (pr) multiEmit('end', g.mp.lastScale == null ? 1 : g.mp.lastScale, g.mp.acc, (pr.a.x + pr.b.x) / 2, (pr.a.y + pr.b.y) / 2, 0); emit('consume'); }

    return {
      down: down, move: move, up: up, cancel: cancel,
      mode: function () { return g ? g.mode : null; }, zone: function () { return g ? g.zone : null; },
      // true when the browser must NOT scroll under this gesture (touchmove.preventDefault)
      exclusive: function () { return !!g && (g.mode === 'sys' || g.mode === 'drag' || g.mode === 'multi' || (g.mode === 'pending' && (g.zone === 'top' || g.zone === 'bottom' || g.zone === 'shade'))); },
      active: function () { return !!g; }
    };
  }

  // ================================================================ DOM layer
  function attach(inst, o) {
    var screen = o.screen, root = o.root, view = o.view, doc = screen.ownerDocument, win = doc.defaultView || global;
    var SCREEN = o.SCREEN, render = o.render || function () {};
    var cfg = assign({}, DEFAULTS, o.config), state = { shadeH: 0 }, active = {}, vptr = null, blockClick = false, blockT = null, disposed = false;
    function mk(tag, cls, parent) { var e = doc.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
    function K() { return inst.kernel; }
    function S() { return inst.kernel ? inst.kernel.state() : null; }
    function usable() { var s = S(); return !!(s && s.powered && !s.screenOff && !inst.booting); }
    function size() { return { w: screen.offsetWidth || SCREEN.portrait.w, h: screen.offsetHeight || SCREEN.portrait.h }; }
    function local(ev) { var r = screen.getBoundingClientRect(), k = (r.width / (screen.offsetWidth || r.width || 1)) || 1; return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k }; }

    // ---- overlay widgets
    var gx = mk('div', 'cnp-gx', screen);
    var scrim = mk('div', 'cnp-gx-scrim', screen);   // sibling of the view (z 34) so the shade (z 35) stays above it
    var arrows = { left: mk('div', 'cnp-gx-edge l', gx), right: mk('div', 'cnp-gx-edge r', gx) };
    arrows.left.textContent = '‹'; arrows.right.textContent = '›';
    var strips = ['l', 'r', 't', 'b'].map(function (c) { return mk('div', 'cnp-gx-strip ' + c, gx); });   // shield over web views so edge swipes still reach us

    // ---- target resolution: nearest element (from the touched one outward) whose view node lists the event
    function normId(id) { return id && String(id).indexOf('scroll:') === 0 ? String(id).slice(7) : id; }
    function chainFind(el, name) {
      for (var e = el; e && e !== screen; e = e.parentNode) {
        var v = e._v; if (v && v.on && v.on.indexOf(name) >= 0) return { id: v.id, el: e };
      }
      return null;
    }
    var ALL_SWIPES = ['swipeleft', 'swiperight', 'swipeup', 'swipedown'];
    function makeTarget(el, ev) {
      var t = {
        el: el,
        has: function (n) { return !!chainFind(el, n); },
        idFor: function (n) { var f = chainFind(el, n); return f ? f.id : null; },
        shadeDrag: false, mouse: ev.pointerType === 'mouse'
      };
      var sh = el.closest && el.closest('.cnp-shade');
      if (S().shade) {
        if (!sh) t.shadeDrag = true;
        else {
          var r = sh.getBoundingClientRect(), k = r.height / (sh.offsetHeight || 1) || 1;
          t.shadeDrag = sh.scrollHeight <= sh.clientHeight + 1 || sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 2 || (r.bottom - ev.clientY) / k < 44;
        }
      }
      t.scroller = scrollerOf(el);
      t.noScrollDrag = ALL_SWIPES.some(function (n) { return t.has(n); });
      return t;
    }
    function scrollerOf(el) {
      for (var e = el; e && e !== screen; e = e.parentNode) {
        if (e.nodeType !== 1) continue;
        var cs = win.getComputedStyle(e), oy = cs.overflowY, ox = cs.overflowX;
        if (((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1) || ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1)) return e;
      }
      return null;
    }

    // ---- recognizer
    var rec = createRecognizer({
      config: cfg, size: size,
      context: function () { var s = S() || {}; return { shadeOpen: !!s.shade, locked: !!s.locked, shadeH: state.shadeH }; },
      emit: onEmit
    });
    function consume() {
      inst.swallow = true; blockClick = true; clearTimeout(blockT);
      blockT = setTimeout(function () { blockClick = false; inst.swallow = false; }, 120);
    }
    screen.addEventListener('click', function (ev) { if (blockClick) { blockClick = false; ev.stopPropagation(); ev.preventDefault(); } }, true);

    function contentEl() {
      for (var i = 0; i < view.children.length; i++) { var c = view.children[i]; if (/\bcnp-(view|homeview|lock)\b/.test(c.className)) return c; }
      return null;
    }
    function shadeEl() { return view.querySelector('.cnp-shade'); }
    function resetContent(animate) {
      var c = contentEl(); if (!c) return;
      c.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s, border-radius .22s' : 'none';
      c.style.transform = ''; c.style.opacity = ''; c.style.borderRadius = ''; c.style.boxShadow = '';
      if (animate) setTimeout(function () { c.style.transition = ''; }, 260);
    }
    function showArrow(kind, d) {
      var a = arrows[kind === 'back' ? 'left' : 'right'], T = thresholds(size(), cfg);
      var amt = Math.abs(d.dx), p = clamp(amt / T.sideDist, 0, 1.15), sg = kind === 'back' ? 1 : -1;
      a.style.transition = 'none'; a.style.top = clamp(d.y, 24, size().h - 24) + 'px'; a.style.opacity = String(clamp(amt / 30, 0, 1));
      a.style.transform = 'translateX(' + (sg * (clamp(amt * 0.7, 0, 92) - 48)) + 'px) scale(' + (0.7 + 0.35 * clamp(p, 0, 1)) + ')';
      a.classList.toggle('ready', p >= 1);
      var c = contentEl(); if (c) { c.style.transition = 'none'; c.style.transform = 'translateX(' + (sg * clamp(amt * 0.22, 0, 26)) + 'px)'; }
    }
    function hideArrows() { ['left', 'right'].forEach(function (k) { var a = arrows[k]; a.style.transition = ''; a.style.opacity = '0'; a.classList.remove('ready'); a.style.transform = ''; }); }

    var cur = null;   // active system gesture {kind, shade, h0}
    function sysStart(d) {
      var s = S(); cur = { kind: d.kind };
      screen.classList.add('gx-active'); try { win.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
      if (d.kind === 'shade') {
        if (!s.shade) { if (K().sampleNotifications) K().sampleNotifications(); K().toggleShade(true); render(); }
        prepShade();
      } else if (d.kind === 'shadeclose') prepShade();
    }
    function prepShade() {
      var sh = shadeEl(); if (!sh) return;
      sh.style.animation = 'none'; sh.style.transition = 'none'; state.shadeH = sh.offsetHeight; cur.sh = sh; cur.h0 = sh.offsetHeight;
    }
    function setShade(shown, animate) {
      var sh = cur && cur.sh || shadeEl(); if (!sh) return; var h = sh.offsetHeight || state.shadeH || 1;
      sh.style.transition = animate ? 'transform .24s cubic-bezier(.2,.8,.2,1)' : 'none';
      sh.style.transform = 'translateY(' + (shown - h) + 'px)'; sh.style.opacity = '1';
      scrim.style.transition = animate ? 'opacity .24s' : 'none'; scrim.style.opacity = String(0.5 * clamp(shown / h, 0, 1));
      scrim.classList.add('on');
    }
    function sysMove(d) {
      if (!cur) return;
      switch (d.kind) {
        case 'back': case 'forward': showArrow(d.kind, { dx: d.dx, y: d.y }); break;
        case 'up': {
          var c = contentEl(); if (!c) break; var p = clamp(-d.dy / (size().h * 0.5), 0, 1);
          c.style.transition = 'none'; c.style.transformOrigin = '50% 70%';
          c.style.transform = 'translateY(' + (d.dy * 0.45) + 'px) scale(' + (1 - p * 0.2) + ')';
          c.style.borderRadius = (p * 28) + 'px'; c.style.boxShadow = '0 14px 40px rgba(0,0,0,' + (0.5 * p) + ')'; break;
        }
        case 'shade': { var h = cur.h0 || state.shadeH; setShade(clamp(d.y, 0, h)); break; }
        case 'shadeclose': { var h2 = cur.h0 || state.shadeH; setShade(clamp(h2 + d.dy, 0, h2)); break; }
      }
    }
    function sysEnd(d) {
      var kind = d.kind || (cur && cur.kind), s = S(); screen.classList.remove('gx-active');
      var done = function () { cur = null; };
      if (kind === 'back' || kind === 'forward') {
        var a = arrows[kind === 'back' ? 'left' : 'right']; a.style.transition = 'transform .2s ease, opacity .2s';
        resetContent(true); hideArrows();
        if (d.commit) inst.press(kind);
        done(); return;
      }
      if (kind === 'up') {
        var c = contentEl();
        if (d.action === 'home') {
          if (c) { c.style.transition = 'transform .18s ease-in, opacity .18s'; c.style.transform = 'translateY(-70px) scale(.72)'; c.style.opacity = '0'; }
          setTimeout(function () { if (s.locked) { if (!(inst.seed && inst.seed.manifest && inst.seed.manifest.passcode)) K().unlock(); } else if (s.fg) K().press('home'); resetContent(false); render(); }, 150);
        } else if (d.action === 'switcher') { openSwitcher(); resetContent(false); }
        else resetContent(true);
        done(); return;
      }
      if (kind === 'shade') {
        var sh = cur && cur.sh;
        if (d.commit) { setShade(sh ? sh.offsetHeight : 0, true); setTimeout(function () { if (sh) { sh.style.transform = ''; sh.style.transition = ''; } syncScrim(); }, 260); }
        else { setShade(0, true); setTimeout(function () { K().toggleShade(false); if (sh) { sh.style.transform = ''; } syncScrim(); }, 250); }
        done(); return;
      }
      if (kind === 'shadeclose') {
        var sh2 = cur && cur.sh;
        if (d.commit) { setShade(0, true); setTimeout(function () { K().toggleShade(false); render(); syncScrim(); }, 250); }
        else { setShade(sh2 ? sh2.offsetHeight : 0, true); setTimeout(function () { if (sh2) { sh2.style.transform = ''; sh2.style.transition = ''; } syncScrim(); }, 260); }
        done(); return;
      }
      done();
    }
    function syncScrim() {
      var s = S(), open = !!(s && s.powered && s.shade);
      scrim.classList.toggle('on', open);
      scrim.style.transition = ''; if (!cur) scrim.style.opacity = open ? '0.5' : '0';
    }

    function dispatchApp(name, payload, target) {
      var id = target.idFor(name); if (!id) return false;
      inst.kernel.dispatch(normId(id), name, payload); return true;
    }
    function onEmit(type, d) {
      switch (type) {
        case 'sys:start': sysStart(d); break;
        case 'sys:move': sysMove(d); break;
        case 'sys:end': sysEnd(d); break;
        case 'consume': consume(); break;
        case 'app': dispatchApp(d.name, d.payload, d.target); break;
        case 'pan': panMove(d); break;
        case 'swipe': onSwipe(d); break;
      }
    }
    function onSwipe(d) {
      var s = S();
      if (dispatchApp(d.name, d.payload, d.target)) { consume(); return; }
      if (s.locked) { if (d.dir === 'up' && !(inst.seed && inst.seed.manifest && inst.seed.manifest.passcode)) { K().unlock(); consume(); } return; }
      if (!s.fg && !s.shade && (d.dir === 'left' || d.dir === 'right')) { K().dispatch('@page:' + Math.max(0, s.page + (d.dir === 'left' ? 1 : -1)), 'tap'); consume(); }
    }
    // mouse drag-scroll (touch scrolls natively)
    var panMoved = false;
    function panMove(d) {
      var t = d.target; if (!t || !t.mouse || !t.scroller || t.noScrollDrag) return;
      if (!panMoved) { panMoved = true; screen.classList.add('gx-active'); try { win.getSelection().removeAllRanges(); } catch (e) { /* ignore */ } }
      t.scroller.scrollTop -= d.ddy; t.scroller.scrollLeft -= d.ddx; consume();
    }

    // ---- pointer wiring
    function ignoreTarget(el) { return el && el.closest && el.closest('input,textarea'); }
    screen.addEventListener('pointerdown', function (ev) {
      if (disposed || !usable()) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (ignoreTarget(ev.target)) return;
      if (sw.open) return;
      inst.swallow = false; panMoved = false;
      var p = local(ev), tgt = makeTarget(ev.target, ev);
      active[ev.pointerId] = true;
      rec.down(ev.pointerId, p.x, p.y, ev.timeStamp || Date.now(), tgt);
      // Alt+drag with a mouse emulates a second finger mirrored about the touched element's centre (pinch / rotate)
      if (ev.pointerType === 'mouse' && ev.altKey && (tgt.has('pinch') || tgt.has('rotate'))) {
        var r = ev.target.closest('[data-id]') || ev.target, rr = r.getBoundingClientRect(), L = screen.getBoundingClientRect(), k = (L.width / (screen.offsetWidth || 1)) || 1;
        var cx = (rr.left + rr.width / 2 - L.left) / k, cy = (rr.top + rr.height / 2 - L.top) / k;
        vptr = { cx: cx, cy: cy }; active.v = true;
        rec.down('v', 2 * cx - p.x, 2 * cy - p.y, ev.timeStamp || Date.now(), tgt);
      }
    });
    doc.addEventListener('pointermove', function (ev) {
      if (!active[ev.pointerId]) return;
      var p = local(ev), t = ev.timeStamp || Date.now();
      rec.move(ev.pointerId, p.x, p.y, t);
      if (vptr && ev.pointerType === 'mouse') rec.move('v', 2 * vptr.cx - p.x, 2 * vptr.cy - p.y, t);
    });
    function finish(ev, cancel) {
      if (!active[ev.pointerId]) return;
      delete active[ev.pointerId];
      var p = local(ev), t = ev.timeStamp || Date.now();
      if (vptr) { rec.cancel('v'); delete active.v; vptr = null; }
      if (cancel) rec.cancel(ev.pointerId); else rec.up(ev.pointerId, p.x, p.y, t);
      if (!rec.active()) screen.classList.remove('gx-active');
    }
    doc.addEventListener('pointerup', function (ev) { finish(ev, false); });
    doc.addEventListener('pointercancel', function (ev) { finish(ev, true); });
    // while a system / drag / pinch gesture owns the finger, the browser must not scroll or pan
    screen.addEventListener('touchmove', function (ev) { if (rec.exclusive() && ev.cancelable) ev.preventDefault(); }, { passive: false });
    screen.addEventListener('dragstart', function (ev) { ev.preventDefault(); });

    // ---- multi-tap (called from Canopy's click handler for nodes that have doubletap/tripletap)
    var taps = createTapCounter({ config: cfg, emit: function (name, payload, key) {
      if (name === 'tap') { inst.kernel.dispatch(normId(key), 'tap', payload); } else inst.kernel.dispatch(normId(key), name, payload);
    } });
    function tap(v, ev) {
      var on = v.on, has2 = on.indexOf('doubletap') >= 0, has3 = on.indexOf('tripletap') >= 0;
      if (!has2 && !has3) return false;
      var p = ev && ev.clientX != null ? local(ev) : { x: 0, y: 0 };
      var key = v.id;
      if (on.indexOf('tap') < 0 && !has2 && !has3) return false;
      taps.add(key, p.x, p.y, has2, has3); return true;
    }

    // ---- wheel / trackpad: horizontal page flicks on Home, pinch (ctrl+wheel) and `scroll` events
    var wheelAcc = 0, wheelT = 0, wheelLock = 0;
    screen.addEventListener('wheel', function (ev) {
      if (!usable()) return;
      var s = S(), tgtEl = ev.target;
      if (ev.ctrlKey) {
        var f = chainFind(tgtEl, 'pinch');
        if (f) { ev.preventDefault(); var p = local(ev); inst.kernel.dispatch(normId(f.id), 'pinch', { scale: Math.exp(-ev.deltaY * 0.01), delta: -ev.deltaY * 0.01, x: p.x, y: p.y, cx: p.x, cy: p.y, phase: 'move', source: 'wheel' }); }
        return;
      }
      if (!s.fg && !s.locked && !s.shade && Math.abs(ev.deltaX) > Math.abs(ev.deltaY) * 1.5) {
        var now = Date.now(); if (now - wheelT > 250) wheelAcc = 0; wheelT = now; wheelAcc += ev.deltaX;
        if (Math.abs(wheelAcc) > 60 && now - wheelLock > 450) { wheelLock = now; K().dispatch('@page:' + Math.max(0, s.page + (wheelAcc > 0 ? 1 : -1)), 'tap'); wheelAcc = 0; ev.preventDefault(); }
        return;
      }
      var sf = chainFind(tgtEl, 'scroll');
      if (sf) inst.kernel.dispatch(normId(sf.id), 'scroll', { dx: ev.deltaX, dy: ev.deltaY, top: sf.el.scrollTop || 0, source: 'wheel' });
    }, { passive: false });
    var scrollRaf = {};
    screen.addEventListener('scroll', function (ev) {
      var el = ev.target; if (!el || el.nodeType !== 1 || !usable()) return;
      var f = chainFind(el, 'scroll'); if (!f) return;
      var last = el._gxTop == null ? 0 : el._gxTop, lastL = el._gxLeft || 0; el._gxTop = el.scrollTop; el._gxLeft = el.scrollLeft;
      var key = f.id, payload = { dy: el.scrollTop - last, dx: el.scrollLeft - lastL, top: el.scrollTop, left: el.scrollLeft, max: Math.max(0, el.scrollHeight - el.clientHeight), source: 'scroll' };
      if (scrollRaf[key]) { scrollRaf[key].payload.dy += payload.dy; scrollRaf[key].payload.dx += payload.dx; scrollRaf[key].payload.top = payload.top; scrollRaf[key].payload.left = payload.left; return; }
      scrollRaf[key] = { payload: payload };
      (win.requestAnimationFrame || setTimeout)(function () { var q = scrollRaf[key]; delete scrollRaf[key]; if (q && inst.kernel) inst.kernel.dispatch(normId(key), 'scroll', q.payload); });
    }, true);

    // ---- keyboard (the Canopy device must have focus; never steals keys from text fields)
    root.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
      if (e.key === 'Escape' && sw.open) { e.preventDefault(); e.stopImmediatePropagation(); closeSwitcher(); return; }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopImmediatePropagation(); inst.press(e.key === 'ArrowLeft' ? 'back' : 'forward'); return; }
      if (!e.altKey && e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); inst.press('back'); }
    });

    // ---- app switcher
    var sw = { open: false, el: null };
    function appInfo(id) { var s = S(); return s && s.appIndex[id] || { id: id, name: id, glyph: id.charAt(0), color: '#8899aa' }; }
    function openSwitcher() {
      if (sw.open) return; var s = S(), sz = size(), ids = s.recents.slice().reverse();
      sw.open = true; var el = sw.el = mk('div', 'cnp-gx-sw', screen); el.style.setProperty('--ch', Math.round(sz.h * (sz.h > sz.w ? 0.6 : 0.5)) + 'px'); el.style.setProperty('--cw', Math.round(sz.h * (sz.h > sz.w ? 0.6 : 0.5) * sz.w / sz.h) + 'px');
      var cw = parseFloat(el.style.getPropertyValue('--cw')), live = contentEl();
      var title = mk('div', 'cnp-gx-sw-t', el); title.textContent = ids.length ? 'Recent apps' : 'No recent apps';
      var track = mk('div', 'cnp-gx-sw-track', el);
      ids.forEach(function (id) {
        var info = appInfo(id), card = mk('div', 'cnp-gx-card' + (s.fg === id ? ' cur' : ''), track); card.setAttribute('data-app', id);
        var head = mk('div', 'cnp-gx-card-h', card), g = mk('span', 'cnp-gx-glyph', head); g.textContent = info.glyph || info.name.charAt(0); g.style.background = info.color || '';
        var nm = mk('span', 'cnp-gx-card-n', head); nm.textContent = info.name;
        var thumb = mk('div', 'cnp-gx-thumb', card);
        if (s.fg === id && live && !s.locked) {
          var cl = live.cloneNode(true); [].forEach.call(cl.querySelectorAll('iframe,video,canvas,script'), function (n) { n.parentNode.removeChild(n); });
          cl.style.cssText = 'position:absolute;left:0;top:0;width:' + size().w + 'px;height:' + (size().h) + 'px;transform-origin:0 0;transform:scale(' + (cw / size().w) + ');pointer-events:none;';
          thumb.appendChild(cl);
        } else { var big = mk('div', 'cnp-gx-big', thumb); big.textContent = info.glyph || info.name.charAt(0); big.style.background = info.color || ''; }
        wireCard(card, id);
      });
      if (ids.length) { var clr = mk('button', 'cnp-gx-clear', el); clr.type = 'button'; clr.textContent = 'Clear all'; clr.addEventListener('click', function (ev) { ev.stopPropagation(); ids.forEach(function (id) { K().kill(id); }); closeSwitcher(); }); }
      el.addEventListener('click', function (ev) { if (ev.target === el || ev.target === track || ev.target === title) closeSwitcher(); });
      // swipe up on the home bar area inside the switcher goes Home
      var st = null;
      el.addEventListener('pointerdown', function (ev) { var p = local(ev); st = { x: p.x, y: p.y, bottom: p.y > size().h - cfg.edgeBottom }; });
      el.addEventListener('pointerup', function (ev) { if (!st) return; var p = local(ev), z = st; st = null; if (z.bottom && p.y - z.y < -40) { closeSwitcher(); K().press('home'); } });
      var cur2 = track.querySelector('.cur'); requestAnimationFrame && requestAnimationFrame(function () { el.classList.add('in'); });
      if (cur2) track.scrollLeft = 0;
    }
    function wireCard(card, id) {
      var d = null;
      card.addEventListener('pointerdown', function (ev) { var p = local(ev); d = { x: p.x, y: p.y, t: Date.now(), mode: null, sl: card.parentNode.scrollLeft, id: ev.pointerId, mouse: ev.pointerType === 'mouse' }; });
      doc.addEventListener('pointermove', function (ev) {
        if (!d || ev.pointerId !== d.id) return; var p = local(ev), dx = p.x - d.x, dy = p.y - d.y;
        if (!d.mode && Math.hypot(dx, dy) > 8) d.mode = Math.abs(dy) > Math.abs(dx) * 1.2 && dy < 0 ? 'close' : 'scroll';
        if (d.mode === 'close') { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; card.style.opacity = String(clamp(1 + dy / 300, 0.3, 1)); d.dy = dy; d.lastT = Date.now(); }
        else if (d.mode === 'scroll' && d.mouse) card.parentNode.scrollLeft = d.sl - dx;
      });
      function end(ev) {
        if (!d || (ev && ev.pointerId !== d.id)) return; var z = d; d = null;
        if (z.mode === 'close') {
          var dy = z.dy || 0, fast = dy / Math.max(Date.now() - z.t, 1) < -0.35;
          if (dy < -70 || (dy < -24 && fast)) {
            card.style.transition = 'transform .2s ease-in, opacity .2s'; card.style.transform = 'translateY(-' + (size().h) + 'px)'; card.style.opacity = '0';
            setTimeout(function () { K().kill(id); render(); if (card.parentNode) card.parentNode.removeChild(card); if (sw.el && !sw.el.querySelector('.cnp-gx-card')) { var t = sw.el.querySelector('.cnp-gx-sw-t'); if (t) t.textContent = 'No recent apps'; var c = sw.el.querySelector('.cnp-gx-clear'); if (c) c.parentNode.removeChild(c); } }, 200);
          } else { card.style.transition = 'transform .2s, opacity .2s'; card.style.transform = ''; card.style.opacity = ''; }
        } else if (!z.mode) { closeSwitcher(); K().launch(id); render(); }
      }
      doc.addEventListener('pointerup', end); doc.addEventListener('pointercancel', end);
    }
    function closeSwitcher() {
      if (!sw.open) return; sw.open = false; var el = sw.el; sw.el = null;
      if (el) { el.classList.remove('in'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180); }
    }

    // ---- housekeeping after every kernel change (rAF-throttled)
    var postQ = false;
    function post() {
      if (postQ || disposed) return; postQ = true;
      (win.requestAnimationFrame || setTimeout)(function () {
        postQ = false; if (disposed) return;
        var s = S(); if (!s) return;
        if (sw.open && (!s.powered || s.screenOff || s.locked)) closeSwitcher();
        if (!cur) syncScrim();
        screen.classList.toggle('has-web', !!view.querySelector('.cnp-web'));
      });
    }
    var prevRender = inst.host && inst.host.onRender;
    if (inst.host) inst.host.onRender = function (k) { if (prevRender) prevRender(k); post(); };
    scrim.addEventListener('click', function () { if (S().shade && !cur) { K().toggleShade(false); } });

    return {
      tap: tap, recognizer: rec, openSwitcher: openSwitcher, closeSwitcher: closeSwitcher, switcherOpen: function () { return sw.open; },
      // called first by inst.press(): the switcher swallows Home / Back / Power
      beforePress: function (key) {
        if (!sw.open) return false;
        if (key === 'home' || key === 'back' || key === 'power') { closeSwitcher(); if (key === 'home' && S().fg) K().press('home'); return key !== 'power'; }
        return false;
      },
      flushTaps: function () { taps.flush(); },
      destroy: function () { disposed = true; closeSwitcher(); taps.flush(); if (gx.parentNode) gx.parentNode.removeChild(gx); if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }
    };
  }

  var api = {
    DEFAULTS: DEFAULTS, classifyEdge: classifyEdge, trackVelocity: trackVelocity, swipeDirection: swipeDirection, resolveTaps: resolveTaps,
    thresholds: thresholds, shouldCommitSystem: shouldCommitSystem, createTapCounter: createTapCounter, createRecognizer: createRecognizer, attach: attach
  };
  global.CanopyGestures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
