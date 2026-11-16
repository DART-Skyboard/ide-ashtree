// Pure gesture-recognition tests (node, no DOM).  Run: node tests/gestures.test.js
'use strict';
var assert = require('assert'), G = require('../js/phone/canopy-gestures.js');
var passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } }

function fakeClock() {
  var now = 0, q = [], id = 0;
  return {
    now: function () { return now; },
    setTimeout: function (f, ms) { var h = ++id; q.push({ h: h, at: now + ms, f: f }); return h; },
    clearTimeout: function (h) { q = q.filter(function (x) { return x.h !== h; }); },
    advance: function (ms) { var end = now + ms; for (;;) { q.sort(function (a, b) { return a.at - b.at; }); var n = q[0]; if (!n || n.at > end) break; q.shift(); now = n.at; n.f(); } now = end; }
  };
}
var P = { w: 360, h: 780 }, L = { w: 780, h: 360 };

t('classifyEdge: portrait zones, corners, interior, outside', function () {
  assert.strictEqual(G.classifyEdge(5, 400, P), 'left');
  assert.strictEqual(G.classifyEdge(356, 400, P), 'right');
  assert.strictEqual(G.classifyEdge(180, 775, P), 'bottom');
  assert.strictEqual(G.classifyEdge(180, 4, P), 'top');
  assert.strictEqual(G.classifyEdge(180, 400, P), null);
  assert.strictEqual(G.classifyEdge(40, 400, P), null, 'just inside the side zone limit');
  assert.strictEqual(G.classifyEdge(3, 775, P), 'left', 'corner: nearest edge relative to its zone wins');
  assert.strictEqual(G.classifyEdge(100, 779, P), 'bottom');
  assert.strictEqual(G.classifyEdge(-1, 10, P), null); assert.strictEqual(G.classifyEdge(10, 900, P), null);
});
t('classifyEdge: landscape uses the landscape size', function () {
  assert.strictEqual(G.classifyEdge(770, 180, L), 'right');
  assert.strictEqual(G.classifyEdge(400, 352, L), 'bottom');
  assert.strictEqual(G.classifyEdge(400, 180, L), null);
  assert.strictEqual(G.classifyEdge(10, 180, L), 'left');
});
t('swipeDirection: thresholds', function () {
  assert.strictEqual(G.swipeDirection(2, 3, 80, 0), null, 'tap-sized movement is not a swipe');
  assert.strictEqual(G.swipeDirection(-60, 5, 120, 0.5).dir, 'left');
  assert.strictEqual(G.swipeDirection(60, -5, 120, 0.5).dir, 'right');
  assert.strictEqual(G.swipeDirection(4, -70, 150, 0.5).dir, 'up');
  assert.strictEqual(G.swipeDirection(4, 70, 150, 0.5).dir, 'down');
  assert.strictEqual(G.swipeDirection(30, 0, 50, 0.6), null, 'under the minimum distance');
  assert.strictEqual(G.swipeDirection(50, 0, 700, 0.02), null, 'short slow drag is not a swipe');
  assert.strictEqual(G.swipeDirection(120, 0, 700, 0.02).dir, 'right', 'long drag still counts');
  assert.strictEqual(G.swipeDirection(60, 60, 100, 0.6), null, 'diagonal is ambiguous');
  assert.strictEqual(G.swipeDirection(300, 0, 2000, 1), null, 'too slow overall (> swipeMaxMs)');
});
t('resolveTaps', function () {
  assert.deepStrictEqual(G.resolveTaps(1, true, true), ['tap']);
  assert.deepStrictEqual(G.resolveTaps(2, true, false), ['doubletap']);
  assert.deepStrictEqual(G.resolveTaps(2, false, true), ['tap', 'tap']);
  assert.deepStrictEqual(G.resolveTaps(3, true, true), ['tripletap']);
  assert.deepStrictEqual(G.resolveTaps(3, true, false), ['doubletap', 'tap']);
  assert.deepStrictEqual(G.resolveTaps(5, true, true), ['tripletap', 'doubletap']);
});
t('tap counter: double tap fires immediately at the 2nd tap; single waits for the window', function () {
  var c = fakeClock(), out = [], tc = G.createTapCounter({ clock: c, emit: function (n, p, k) { out.push(n + ':' + k + ':' + p.count); } });
  tc.add('card', 10, 10, true, false); assert.deepStrictEqual(out, [], 'first tap is deferred');
  c.advance(100); tc.add('card', 12, 11, true, false); assert.deepStrictEqual(out, ['doubletap:card:2']);
  tc.add('card', 10, 10, true, false); c.advance(299); assert.strictEqual(out.length, 1); c.advance(2); assert.deepStrictEqual(out, ['doubletap:card:2', 'tap:card:1']);
});
t('tap counter: triple, tap-only-window expiry, different node / far apart flush the old one', function () {
  var c = fakeClock(), out = [], tc = G.createTapCounter({ clock: c, emit: function (n, p, k) { out.push(n + ':' + k); } });
  tc.add('a', 0, 0, true, true); c.advance(100); tc.add('a', 0, 0, true, true); assert.deepStrictEqual(out, [], 'with a tripletap handler we wait for the 3rd');
  c.advance(100); tc.add('a', 0, 0, true, true); assert.deepStrictEqual(out, ['tripletap:a']);
  out.length = 0; tc.add('a', 0, 0, true, true); c.advance(50); tc.add('b', 0, 0, true, true); assert.deepStrictEqual(out, ['tap:a'], 'a different node flushes the first');
  out.length = 0; c.advance(400); assert.deepStrictEqual(out, ['tap:b']);
  out.length = 0; tc.add('a', 0, 0, true, false); c.advance(50); tc.add('a', 200, 200, true, false); assert.deepStrictEqual(out, ['tap:a'], 'taps far apart are not a double tap');
});
t('tap counter: a node with no multi-tap handler fires at once (no delay)', function () {
  var c = fakeClock(), out = [], tc = G.createTapCounter({ clock: c, emit: function (n) { out.push(n); } });
  tc.add('x', 0, 0, false, false); assert.deepStrictEqual(out, ['tap']);
});

// ---- recognizer
function rig(ctx, targetHas) {
  var c = fakeClock(), ev = [], size = ctx && ctx.size || P;
  var r = G.createRecognizer({ clock: c, size: function () { return size; }, context: function () { return ctx || {}; }, emit: function (t, d) { ev.push({ t: t, d: d }); } });
  var target = { has: function (n) { return (targetHas || []).indexOf(n) >= 0; } };
  function path(id, pts, stepMs) { // [[x,y],...] with timing; returns after last point (no up)
    pts.forEach(function (p, i) { c.advance(stepMs); if (i === 0) return; r.move(id, p[0], p[1], c.now()); });
  }
  return { c: c, r: r, ev: ev, target: target, path: path, types: function () { return ev.map(function (e) { return e.t; }); } };
}
function line(x0, y0, x1, y1, n) { var o = []; for (var i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; }

t('recognizer: stationary press/release = tap, nothing consumed', function () {
  var g = rig(); g.r.down(1, 100, 300, g.c.now(), g.target); g.c.advance(80); var o = g.r.up(1, 101, 300, g.c.now());
  assert.strictEqual(o.type, 'tap'); assert(g.types().indexOf('consume') < 0);
});
t('recognizer: slop — 8px wiggle is still a tap, 14px is not', function () {
  var g = rig(); g.r.down(1, 100, 300, 0, g.target); g.r.move(1, 108, 300, 40); assert.strictEqual(g.r.up(1, 108, 300, 80).type, 'tap');
  var h = rig(); h.r.down(1, 100, 300, 0, h.target); h.r.move(1, 114, 300, 40); assert.notStrictEqual(h.r.up(1, 114, 300, 80).type, 'tap');
});
t('recognizer: left-edge drag right = back; commits past the distance', function () {
  var g = rig(); g.r.down(1, 6, 400, 0, g.target); g.path(1, line(6, 400, 120, 402, 8), 25);
  var o = g.r.up(1, 120, 402, g.c.now());
  assert.strictEqual(o.type, 'sys'); assert.strictEqual(o.kind, 'back'); assert.strictEqual(o.action, 'back'); assert(o.commit);
  assert(g.types().indexOf('sys:start') >= 0 && g.types().indexOf('sys:move') >= 0);
});
t('recognizer: short slow edge drag springs back; short fast flick commits', function () {
  var g = rig(); g.r.down(1, 6, 400, 0, g.target); g.path(1, line(6, 400, 50, 400, 6), 90); g.c.advance(200);
  var o = g.r.up(1, 50, 400, g.c.now()); assert.strictEqual(o.kind, 'back'); assert.strictEqual(o.commit, false);
  var f = rig(); f.r.down(1, 6, 400, 0, f.target); f.path(1, line(6, 400, 62, 400, 4), 12); var o2 = f.r.up(1, 62, 400, f.c.now());
  assert.strictEqual(o2.commit, true, 'fast flick over the small minimum commits');
});
t('recognizer: right-edge drag left = forward; dragging the wrong way from an edge is not a system gesture', function () {
  var g = rig(); g.r.down(1, 355, 400, 0, g.target); g.path(1, line(355, 400, 220, 400, 8), 25);
  var o = g.r.up(1, 220, 400, g.c.now()); assert.strictEqual(o.kind, 'forward'); assert.strictEqual(o.action, 'forward');
  var w = rig(); w.r.down(1, 5, 400, 0, w.target); w.path(1, line(5, 400, -0, 400, 1), 10); w.r.move(1, 5, 300, 50);
  assert.notStrictEqual(w.r.mode(), 'sys', 'vertical drag from the left edge is just a pan');
});
t('recognizer: reversing direction cancels back', function () {
  var g = rig(); g.r.down(1, 6, 400, 0, g.target); g.path(1, line(6, 400, 120, 400, 6), 25); g.path(1, line(120, 400, 60, 400, 3), 20);
  var o = g.r.up(1, 60, 400, g.c.now()); assert.strictEqual(o.commit, false);
});
t('recognizer: bottom edge — short=home, long hold=switcher, slow-short=none, fast long flick=home', function () {
  var a = rig(); a.r.down(1, 180, 775, 0, a.target); a.path(1, line(180, 775, 180, 690, 6), 20); var oa = a.r.up(1, 180, 690, a.c.now());
  assert.strictEqual(oa.action, 'home');
  var b = rig(); b.r.down(1, 180, 775, 0, b.target); b.path(1, line(180, 775, 180, 560, 8), 40); b.c.advance(300); var ob = b.r.up(1, 180, 560, b.c.now());
  assert.strictEqual(ob.action, 'switcher', 'dragged up then held still');
  var c = rig(); c.r.down(1, 180, 775, 0, c.target); c.path(1, line(180, 775, 180, 745, 4), 30); var oc = c.r.up(1, 180, 745, c.c.now() + 400);
  assert.strictEqual(oc.action, 'none', 'too short');
  var d = rig(); d.r.down(1, 180, 775, 0, d.target); d.path(1, line(180, 775, 180, 420, 6), 8); var od = d.r.up(1, 180, 420, d.c.now());
  assert.strictEqual(od.action, 'home', 'very fast long flick is still Home');
  var e = rig(); e.r.down(1, 180, 775, 0, e.target); e.path(1, line(180, 775, 180, 480, 10), 90); var oe = e.r.up(1, 180, 480, e.c.now());
  assert.strictEqual(oe.action, 'switcher', 'long unhurried drag');
});
t('recognizer: landscape bottom swipe uses landscape thresholds', function () {
  var g = rig({ size: L }); g.r.down(1, 390, 355, 0, g.target); g.path(1, line(390, 355, 390, 235, 6), 40); g.c.advance(250);
  assert.strictEqual(g.r.up(1, 390, 235, g.c.now()).action, 'switcher');
  var h = rig({ size: L }); h.r.down(1, 390, 355, 0, h.target); h.path(1, line(390, 355, 390, 280, 5), 15);
  assert.strictEqual(h.r.up(1, 390, 280, h.c.now()).action, 'home');
});
t('recognizer: top edge pull down opens the shade (frac + flick)', function () {
  var g = rig({ shadeH: 400 }); g.r.down(1, 180, 5, 0, g.target); g.path(1, line(180, 5, 190, 260, 8), 25); g.c.advance(200);
  var o = g.r.up(1, 190, 260, g.c.now()); assert.strictEqual(o.kind, 'shade'); assert.strictEqual(o.action, 'shade-open');
  var h = rig({ shadeH: 400 }); h.r.down(1, 180, 5, 0, h.target); h.path(1, line(180, 5, 180, 70, 4), 60); h.c.advance(250);
  assert.strictEqual(h.r.up(1, 180, 70, h.c.now()).commit, false, 'only 17% down and slow: close again');
  var f = rig({ shadeH: 400 }); f.r.down(1, 180, 5, 0, f.target); f.path(1, line(180, 5, 180, 70, 4), 10);
  assert.strictEqual(f.r.up(1, 180, 70, f.c.now()).commit, true, 'a quick flick opens it');
});
t('recognizer: open shade — swipe up closes (when shadeDrag), ignores otherwise', function () {
  var tg = { has: function () { return false; }, shadeDrag: true };
  var c = fakeClock(), ev = [], r = G.createRecognizer({ clock: c, context: function () { return { shadeOpen: true, shadeH: 400 }; }, emit: function (t, d) { ev.push(t); } });
  r.down(1, 180, 380, 0, tg); for (var i = 1; i <= 6; i++) { c.advance(20); r.move(1, 180, 380 - i * 45, c.now()); }
  var o = r.up(1, 180, 110, c.now()); assert.strictEqual(o.kind, 'shadeclose'); assert.strictEqual(o.action, 'shade-close');
  var c2 = fakeClock(), r2 = G.createRecognizer({ clock: c2, context: function () { return { shadeOpen: true, shadeH: 400 }; } });
  r2.down(1, 180, 100, 0, { has: function () { return false; }, shadeDrag: false }); c2.advance(20); r2.move(1, 180, 20, 20);
  assert.strictEqual(r2.mode(), 'pan', 'scrollable shade content: not a close gesture');
});
t('recognizer: locked screen disables back/forward edges but keeps bottom', function () {
  var g = rig({ locked: true }); g.r.down(1, 5, 400, 0, g.target); g.path(1, line(5, 400, 140, 400, 6), 25);
  var o = g.r.up(1, 140, 400, g.c.now()); assert.notStrictEqual(o.type, 'sys');
});
t('recognizer: swipe on a node emits a swipe with payload', function () {
  var g = rig(null, ['swipeleft']); g.r.down(1, 250, 300, 0, g.target); g.path(1, line(250, 300, 120, 305, 5), 25);
  var o = g.r.up(1, 120, 305, g.c.now()); assert.strictEqual(o.type, 'swipe'); assert.strictEqual(o.dir, 'left');
  var s = g.ev.filter(function (e) { return e.t === 'swipe'; })[0].d; assert.strictEqual(s.name, 'swipeleft'); assert(s.payload.dx < -100 && s.payload.velocity > 0.25);
});
t('recognizer: longpress fires after the hold if nothing moved; movement cancels it', function () {
  var g = rig(null, ['longpress']); g.r.down(1, 100, 300, 0, g.target); g.c.advance(520);
  var lp = g.ev.filter(function (e) { return e.t === 'app' && e.d.name === 'longpress'; }); assert.strictEqual(lp.length, 1); assert(g.types().indexOf('consume') >= 0);
  assert.strictEqual(g.r.up(1, 100, 300, g.c.now()).type, 'longpress');
  var h = rig(null, ['longpress']); h.r.down(1, 100, 300, 0, h.target); h.c.advance(200); h.r.move(1, 140, 300, h.c.now()); h.c.advance(500);
  assert.strictEqual(h.ev.filter(function (e) { return e.t === 'app'; }).length, 0);
  var n = rig(); n.r.down(1, 100, 300, 0, n.target); n.c.advance(900); assert.strictEqual(n.ev.length, 0, 'no longpress handler: nothing emitted');
});
t('recognizer: drag start/move/end go to nodes with drag handlers (and beat swipe)', function () {
  var g = rig(null, ['drag', 'dragstart', 'dragend', 'swipeleft']); g.r.down(1, 200, 300, 0, g.target); g.path(1, line(200, 300, 120, 300, 4), 20); g.r.up(1, 120, 300, g.c.now());
  var names = g.ev.filter(function (e) { return e.t === 'app'; }).map(function (e) { return e.d.name; });
  assert.strictEqual(names[0], 'dragstart'); assert.strictEqual(names[names.length - 1], 'dragend'); assert(names.indexOf('drag') > 0);
  assert(g.ev.filter(function (e) { return e.t === 'swipe'; }).length === 0);
});
t('recognizer: two pointers give pinch scale and rotate angle', function () {
  var g = rig(null, ['pinch', 'rotate']); g.r.down(1, 150, 300, 0, g.target); g.r.down(2, 210, 300, 5, g.target);
  g.r.move(2, 270, 300, 20); // distance 60 -> 120 : scale 2
  var p = g.ev.filter(function (e) { return e.t === 'app' && e.d.name === 'pinch'; }); var last = p[p.length - 1].d.payload;
  assert(Math.abs(last.scale - 2) < 1e-6, 'scale ' + last.scale);
  g.r.move(2, 150, 420, 40); // second finger now straight below the first: rotation of +90deg, distance 120
  var r = g.ev.filter(function (e) { return e.t === 'app' && e.d.name === 'rotate'; }); assert(Math.abs(r[r.length - 1].d.payload.angle - 90) < 1e-6);
  g.r.up(2, 150, 420, 60); var end = g.ev.filter(function (e) { return e.t === 'app' && e.d.name === 'pinch'; }).pop().d.payload; assert.strictEqual(end.phase, 'end');
});
t('recognizer: angle unwraps across +/-180', function () {
  var g = rig(null, ['rotate']); g.r.down(1, 100, 100, 0, g.target); g.r.down(2, 40, 100, 1, g.target);   // second finger to the left: angle 180
  g.r.move(2, 40, 90, 10); g.r.move(2, 40, 80, 20);                                                      // sweeping slightly: continuous
  var r = g.ev.filter(function (e) { return e.t === 'app' && e.d.name === 'rotate'; }); var a = r[r.length - 1].d.payload.angle;
  assert(Math.abs(a) < 30, 'continuous rotation, got ' + a);
});
t('trackVelocity: stationary finger reads 0; window only', function () {
  assert.strictEqual(G.trackVelocity([{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 50 }], 400, 120).v, 0);
  var v = G.trackVelocity([{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 100 }], 100, 120); assert(Math.abs(v.vx - 0.6) < 1e-9);
});
t('shouldCommitSystem: velocity matters', function () {
  var sz = P;
  assert.strictEqual(G.shouldCommitSystem('back', { dx: 40, dy: 0, vx: 0.8, vy: 0, vNow: 0.8, frac: 0 }, sz).commit, true);
  assert.strictEqual(G.shouldCommitSystem('back', { dx: 40, dy: 0, vx: 0.1, vy: 0, vNow: 0.1, frac: 0 }, sz).commit, false);
  assert.strictEqual(G.shouldCommitSystem('forward', { dx: -90, dy: 0, vx: 0, vy: 0, vNow: 0, frac: 0 }, sz).commit, true);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', FAILURES' : ''));
