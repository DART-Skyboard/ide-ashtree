// Samara OS kernel tests (node, no DOM).  Run: node tests/os.test.js
'use strict';
var assert = require('assert');
var OS = require('../js/phone/samara-os.js');

var passed = 0;
function t(name, fn) {
  try { var r = fn(); if (r && r.then) return r.then(function () { passed++; console.log('  ok  ' + name); }, function (e) { console.log('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; }); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; }
}

// ---- IR helpers (shape produced by Seedpress) ----
function text(id, txt, extra) { return { op: 'ui.text', args: Object.assign({ id: id, text: txt }, extra || {}) }; }
function btn(id, label, ops) { return { op: 'ui.button', args: { id: id, label: label }, handlers: { tap: ops } }; }
function tallyKey(d) { return btn('k' + d, d, [{ op: 'thenplace', args: { src: '{expr}{' + 'kk' + '}', placeto: 'expr' } }]); }

var seed = {
  magic: 'SAMARA-SEED', format: 1, os: { name: 'Samara OS', version: '1.0.0' }, sha256: 'abc123def456aaaa',
  manifest: {
    theme: 'Midnight', layout: { grid: '4x4', dock: 2 }, boot: 'Crown',
    apps: [
      { id: 'tally', name: 'Tally', glyph: '=', color: '#00ffcc', entry: 'Tally', dock: true },
      { id: 'leaf', name: 'Leaf', glyph: 'L', color: '#7bd88f', entry: 'Leaf', dock: true },
      { id: 'drift', name: 'Drift', glyph: 'D', color: '#8a7dff', entry: 'Drift' },
      { id: 'lens', name: 'Lens', glyph: 'C', color: '#ff7a3d', entry: 'Lens' }
    ]
  },
  program: {
    Crown: [
      { op: 'ui.text', args: { id: 'w1', text: 'Hello Samara' } },
      { op: 'sys.setting', args: { key: 'clock24', value: 'false' } }
    ],
    Tally: [
      { op: 'ui.screen', args: { id: 'main', title: 'Tally' } },
      { op: 'var', args: { name: 'expr' } }, { op: 'var', args: { name: 'result' } },
      { op: 'ui.text', args: { id: 'display', text: { $var: 'expr' }, size: 'xl' } },
      { op: 'ui.row', args: { id: 'r1' }, children: [
        { op: 'ui.button', args: { id: 'b7', label: '7' }, handlers: { tap: [{ op: 'thenplace', args: { src: '{expr}7', placeto: 'expr' } }] } },
        { op: 'ui.button', args: { id: 'bplus', label: '+' }, handlers: { tap: [{ op: 'thenplace', args: { src: '{expr}+', placeto: 'expr' } }] } },
        { op: 'ui.button', args: { id: 'b8', label: '8' }, handlers: { tap: [{ op: 'thenplace', args: { src: '{expr}8', placeto: 'expr' } }] } },
        { op: 'ui.button', args: { id: 'bmul', label: '*' }, handlers: { tap: [{ op: 'thenplace', args: { src: '{expr}*', placeto: 'expr' } }] } }
      ] },
      { op: 'ui.button', args: { id: 'beq', label: '=' }, handlers: { tap: [
        { op: 'research', args: { expr: 'expr', placeto: 'result' } },
        { op: 'thenplace', args: { src: 'result', placeto: 'expr' } },
        { op: 'irout', args: { parts: [{ lit: 'Result: ' }, { $var: 'result' }] } }
      ] } },
      { op: 'ui.on', args: { id: 'beq', event: 'tap' }, handlers: { tap: [{ op: 'store.set', args: { key: 'last', with: 'result' } }] } },
      { op: 'input.on', args: { key: 'back' }, handlers: { press: [{ op: 'sys.notify', args: { text: 'back pressed' } }] } }
    ],
    Leaf: [
      { op: 'ui.screen', args: { id: 'list', title: 'Leaf' } },
      { op: 'store.get', args: { key: 'note', placeto: 'note' } },
      { op: 'ui.input', args: { id: 'note', placeholder: 'note', multiline: true }, handlers: { change: [{ op: 'store.set', args: { key: 'note', with: 'note' } }] } },
      { op: 'ui.list', args: { id: 'items', items: 'one,two,three' }, handlers: { tap: [{ op: 'thenplace', args: { src: 'item', placeto: 'picked' } }, { op: 'ui.screen', args: { id: 'detail', title: 'Detail' } }, { op: 'ui.text', args: { id: 'dt', text: 'Picked {picked}' } }] } }
    ],
    Drift: [
      { op: 'ui.screen', args: { id: 'main', title: 'Drift' } },
      { op: 'ui.text', args: { id: 'page', text: { $var: 'page' } } },
      { op: 'ui.button', args: { id: 'go', label: 'Go' }, handlers: { tap: [{ op: 'net.fetch', args: { url: 'https://example.invalid/x', placeto: 'page' } }] } }
    ],
    Lens: [
      { op: 'ui.screen', args: { id: 'main', title: 'Lens' } },
      { op: 'cam.open', args: { facing: 'front' } },
      { op: 'ui.button', args: { id: 'snap', label: 'Snap' }, handlers: { tap: [{ op: 'cam.snap', args: { placeto: 'photo' } }, { op: 'ui.image', args: { id: 'pic', src: { $var: 'photo' } } }] } },
      { op: 'ui.button', args: { id: 'done', label: 'Close' }, handlers: { tap: [{ op: 'cam.close', args: {} }] } }
    ]
  }
};

function mk(over) {
  var logs = [], clock = Date.UTC(2026, 10, 15, 9, 41) + new Date().getTimezoneOffset() * 60000;
  var host = Object.assign({ now: function () { return clock; }, log: function (l) { logs.push(l); } }, over || {});
  var k = OS.createKernel(JSON.parse(JSON.stringify(seed)), host);
  return { k: k, logs: logs, host: host };
}
function unlocked(over) { var m = mk(over); m.k.boot(); m.k.dispatch('@unlock'); return m; }

var pending = [];
console.log('Samara OS kernel tests');

t('evalExpr basics', function () {
  var E = OS.evalExpr;
  assert.strictEqual(E('3+4*2'), 11); assert.strictEqual(E('(1+2)^2'), 9); assert.strictEqual(E('2^3^2'), 512);
  assert.strictEqual(E('sin(30)'), 0.5); assert.strictEqual(E('sqrt(16)+abs(-2)'), 6); assert.strictEqual(E('0.1+0.2'), 0.3);
  assert.strictEqual(E('1/0'), null); assert.strictEqual(E('2 +'), null); assert.strictEqual(E('process.exit()'), null);
  assert.strictEqual(E('x*2', function (n) { return n === 'x' ? 4 : undefined; }), 8);
  assert.strictEqual(E('expr', function (n) { return n === 'expr' ? '3+4*2' : undefined; }), 11);
  assert.strictEqual(E('-5 + 2'), -3);
});

t('boots, applies manifest, locked at start', function () {
  var m = mk(); var tr0 = m.k.tree(); assert.strictEqual(tr0.props.powered, false);
  m.k.boot(); var tr = m.k.tree();
  assert.strictEqual(tr.props.themeName, 'Midnight'); assert.strictEqual(tr.props.locked, true);
  assert(m.k.find(function (n) { return n.tag === 'lock'; }), 'lock screen');
  var sb = m.k.find('@statusbar'); assert.strictEqual(sb.props.time, '9:41'); assert(sb.props.battery > 0);
  assert(m.logs.some(function (l) { return /booted/.test(l); }));
});

t('six or more themes with distinct tokens', function () {
  var names = OS.createKernel(seed, {}).themeNames();
  ['Ash Dark', 'Ash Light', 'Ember', 'Moss', 'Mist', 'Midnight'].forEach(function (n) { assert(names.indexOf(n) >= 0, n); });
  var m = unlocked(); var seen = {};
  names.forEach(function (n) { m.k.setSetting('theme', n); var T = m.k.tree().props.theme; assert.strictEqual(m.k.tree().props.themeName, n); seen[T.bg + T.accent] = 1; });
  assert(Object.keys(seen).length >= 6);
});

t('unlock, home grid + dock respect layout', function () {
  var m = mk(); m.k.boot(); assert.strictEqual(m.k.dispatch('@app:tally'), false, 'cannot launch while locked');
  m.k.dispatch('@unlock'); var home = m.k.find(function (n) { return n.tag === 'homegrid'; });
  assert.strictEqual(home.props.cols, 4); assert.strictEqual(home.props.rows, 4);
  var ids = home.children.map(function (c) { return c.id; });
  assert(ids.indexOf('@app:drift') >= 0 && ids.indexOf('@app:rings') >= 0 && ids.indexOf('@app:tally') < 0, ids.join());
  var dock = m.k.find(function (n) { return n.tag === 'dock'; }); assert.deepStrictEqual(dock.children.map(function (c) { return c.id; }), ['@app:tally', '@app:leaf']);
  assert.strictEqual(m.k.find(function (n) { return n.tag === 'widgets'; }).children[0].props.text, 'Hello Samara');
});

t('passcode lock screen', function () {
  var s2 = JSON.parse(JSON.stringify(seed)); s2.manifest.passcode = '1234';
  var k = OS.createKernel(s2, {}); k.boot();
  '9999'.split('').forEach(function (d) { k.dispatch('@pin:' + d); }); assert.strictEqual(k.tree().props.locked, true);
  '1234'.split('').forEach(function (d) { k.dispatch('@pin:' + d); }); assert.strictEqual(k.tree().props.locked, false);
});

t('Tally: taps build an expression, = uses Research()', function () {
  var m = unlocked(); assert(m.k.launch('tally'));
  ['b7', 'bplus', 'b8', 'bmul', 'b7'].forEach(function (id) { assert(m.k.dispatch(id, 'tap'), id); });
  assert.strictEqual(m.k.find('display').props.text, '7+8*7');
  m.k.dispatch('beq', 'tap');
  assert.strictEqual(m.k.find('display').props.text, '63');
  assert(m.logs.some(function (l) { return /Result: 63/.test(l); }), 'irout logged');
  assert.strictEqual(m.k.find('scroll:main') !== null, true);
  assert.strictEqual(m.k.find('r1').children.length, 4);
});

t('process model: back stack, home, resume, kill', function () {
  var m = unlocked(); m.k.launch('leaf'); assert.strictEqual(m.k.state().fg, 'leaf');
  m.k.dispatch('items#1', 'tap'); assert.strictEqual(m.k.find('dt').props.text, 'Picked two');
  assert.strictEqual(m.k.find('@appbar').props.back, true, 'detail has back arrow');
  m.k.press('back'); assert.strictEqual(m.k.find('@appbar').props.title, 'Leaf'); assert.strictEqual(m.k.state().fg, 'leaf');
  m.k.press('home'); assert.strictEqual(m.k.state().fg, null); assert(m.k.proc('leaf'), 'still running in background');
  m.k.launch('leaf'); assert.strictEqual(m.k.find('@appbar').props.title, 'Leaf');
  m.k.press('back'); assert.strictEqual(m.k.state().fg, null); assert.strictEqual(m.k.proc('leaf'), null, 'back at root finishes the app');
});

t('hardware key handlers (input.on back) take precedence', function () {
  var m = unlocked(); m.k.launch('tally'); m.k.press('back');
  assert.strictEqual(m.k.state().fg, 'tally'); assert.strictEqual(m.k.state().notifs[0].text, 'back pressed');
});

t('power key: sleep/wake locks; volume keys; power off/on', function () {
  var m = unlocked(); m.k.press('power'); assert.strictEqual(m.k.tree().props.screenOff, true); assert.strictEqual(m.k.tree().children.length, 0);
  m.k.press('power'); assert.strictEqual(m.k.tree().props.screenOff, false); assert.strictEqual(m.k.tree().props.locked, true);
  m.k.dispatch('@unlock'); var v0 = m.k.state().volume; m.k.press('volup'); assert.strictEqual(m.k.state().volume, v0 + 10);
  assert(m.k.find(function (n) { return n.tag === 'toast'; }));
  m.k.press('powerlong'); assert.strictEqual(m.k.tree().props.powered, false); m.k.press('power'); assert.strictEqual(m.k.tree().props.powered, true);
});

t('notification shade: notify, open app from notification, clear', function () {
  var m = unlocked(); m.k.launch('tally'); m.k.home();
  m.k.K = null; m.k.notify('hello', 'Tally', 'tally'); assert(m.k.find(function (n) { return n.tag === 'banner'; }), 'heads-up banner');
  m.k.dispatch('@shade'); var shade = m.k.find(function (n) { return n.tag === 'shade'; }); assert(shade);
  var nid = m.k.state().notifs[0].id; m.k.dispatch('@notif:' + nid); assert.strictEqual(m.k.state().fg, 'tally'); assert.strictEqual(m.k.state().notifs.length, 0);
  m.k.notify('a'); m.k.notify('b'); m.k.dispatch('@notif:clear'); assert.strictEqual(m.k.state().notifs.length, 0);
  m.k.tick(5000); assert.strictEqual(m.k.find(function (n) { return n.tag === 'banner'; }), null);
});

t('Rings: theme, wallpaper, layout, dock, brightness persist across reboot', function () {
  var store = {}; var host = { storage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = v; }, removeItem: function (k) { delete store[k]; } } };
  var m = unlocked(host); m.k.launch('rings');
  var rings = m.k.find('app:rings'); assert(rings);
  var sw = m.k.find('@set:theme:Ember'); assert(sw, 'theme swatch');
  m.k.dispatch('@set:theme:Ember'); m.k.dispatch('@set:wallpaper:aurora'); m.k.dispatch('@set:layout:5x6'); m.k.dispatch('@set:dock:3');
  m.k.dispatch('@set:brightness', 'change', { value: 40 });
  var T = m.k.tree(); assert.strictEqual(T.props.themeName, 'Ember'); assert(/linear-gradient/.test(T.props.wallpaper)); assert.strictEqual(T.props.brightness, 0.4);
  m.k.home(); var hg = m.k.find(function (n) { return n.tag === 'homegrid'; }); assert.strictEqual(hg.props.cols, 5); assert.strictEqual(hg.props.rows, 6);
  m.k.press('powerlong');
  var k2 = OS.createKernel(seed, host); k2.boot(); assert.strictEqual(k2.tree().props.themeName, 'Ember'); assert.strictEqual(k2.state().cols, 5); assert.strictEqual(k2.state().dock, 3);
});

t('store.* is namespaced per app and survives relaunch (memory fallback in node)', function () {
  var m = unlocked(); m.k.launch('tally'); m.k.dispatch('b7', 'tap'); m.k.dispatch('beq', 'tap');
  assert.strictEqual(m.k.vars('tally').result, 7);
  m.k.kill('tally'); m.k.launch('leaf'); assert(m.k.vars('leaf').note === '' || m.k.vars('leaf').note === undefined);
  m.k.dispatch('note', 'change', { value: 'milk' }); assert.strictEqual(m.k.find('note').props.value, 'milk');
  m.k.kill('leaf'); m.k.launch('leaf'); assert.strictEqual(m.k.find('note').props.value, 'milk');
  m.k.kill('tally'); m.k.launch('tally'); // tally's key 'last' unaffected by leaf's namespace
  m.k.K = 1; assert(m.k.vars('tally').result === '' || m.k.vars('tally').result === undefined);
});

pending.push(t('net.fetch gives a friendly CORS error', function () {
  var m = unlocked({ fetch: function () { return Promise.reject(new TypeError('Failed to fetch')); } });
  m.k.launch('drift'); m.k.dispatch('go', 'tap');
  return m.k.idle().then(function () {
    var p = m.k.vars('drift').page; assert(/Couldn't reach example\.invalid/.test(p) && /CORS/.test(p), p);
    assert.strictEqual(m.k.find(function (n) { return n.tag === 'text' && n.props.text === p; }) !== null, true);
  });
}));

pending.push(t('net.fetch success updates bound text', function () {
  var m = unlocked({ fetch: function (u) { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('<h1>hi ' + u + '</h1>'); } }); } });
  m.k.launch('drift'); m.k.dispatch('go', 'tap');
  return m.k.idle().then(function () { assert(/^<h1>hi https:/.test(m.k.find('page').props.text)); });
}));

t('cam.*: synthetic test pattern fallback, snap, close', function () {
  var m = unlocked(); m.k.launch('lens');
  var cam = m.k.find(function (n) { return n.tag === 'camera'; }); assert(cam && cam.props.synthetic === true && cam.props.facing === 'front');
  m.k.dispatch('snap', 'tap'); var shot = m.k.vars('lens').photo; assert(/^data:image\/svg\+xml/.test(shot) && /FRONT/.test(decodeURIComponent(shot)));
  assert.strictEqual(m.k.find('pic').props.src, shot);
  m.k.dispatch('done', 'tap'); assert.strictEqual(m.k.find(function (n) { return n.tag === 'camera'; }), null);
});

t('sensors / power / clock ops, battery drain + charge', function () {
  var m = unlocked(); m.k.launch('tally');
  m.k.K = null; m.k._exec([{ op: 'sensor.tilt', args: { placeto: 't' } }, { op: 'sensor.location', args: { placeto: 'l' } }, { op: 'sys.clock', args: { placeto: 'c' } }, { op: 'sys.battery', args: { placeto: 'b' } }], 'tally');
  var v = m.k.vars('tally'); assert.strictEqual(v.t, '0,0,9.8'); assert.strictEqual(v.l, '37.7749,-122.4194'); assert.strictEqual(v.c, '9:41'); assert.strictEqual(v.b, 87);
  var b0 = m.k.state().battery; m.k.tick(600000); assert(m.k.state().battery < b0);
  m.k.setCharging(true); var b1 = m.k.state().battery; m.k.tick(120000); assert(m.k.state().battery > b1);
});

t('rotate changes orientation in tree; ops cannot loop forever', function () {
  var m = unlocked(); m.k.rotate(); assert.strictEqual(m.k.tree().props.orientation, 'landscape');
  var s2 = JSON.parse(JSON.stringify(seed)); s2.program.Loop = [{ op: 'call', args: { node: 'Loop' } }]; s2.manifest.apps.push({ id: 'loop', name: 'Loop', entry: 'Loop' });
  var k = OS.createKernel(s2, {}); k.boot(); k.dispatch('@unlock'); assert.doesNotThrow(function () { k.launch('loop'); });
});

t('status/action settings: recents, next-cycling, dnd, orientation, close, cross-app store peek, resume hook', function () {
  var m = unlocked(), k = m.k, S = k.state();
  k.launch('tally'); k.launch('leaf'); k.launch('drift');
  var get = function (key) { return k.proc('drift') && (k._exec([{ op: 'sys.setting', args: { key: key, placeto: 'q' } }], 'drift'), k.vars('drift').q); };
  assert.strictEqual(get('recent1'), 'leaf'); assert.strictEqual(get('recent2'), 'tally'); assert.strictEqual(get('recent3'), '');
  assert.strictEqual(get('windows'), 2); assert.strictEqual(get('openapps'), 3); assert.strictEqual(get('recentlabel2'), 'L  Tally'.replace('L', S.appIndex.tally.glyph));
  var set = function (key, v) { k._exec([{ op: 'sys.setting', args: { key: key, value: v } }], 'drift'); };
  var th = S.theme; set('theme', 'next'); assert.notStrictEqual(S.theme, th);
  set('brightness', 'next'); assert.strictEqual(S.brightness, 0.3); set('brightness', 'next'); assert.strictEqual(S.brightness, 0.6); set('brightness', 'next'); assert.strictEqual(S.brightness, 1); set('brightness', 'next'); assert.strictEqual(S.brightness, 0.3);
  set('dnd', 'toggle'); assert.strictEqual(get('dnd'), 'On'); k.notify('x', 'T'); assert.strictEqual(S.notifs[0].fresh, false); assert.strictEqual(k.tree().children.filter(function (n) { return n.tag === 'banner'; }).length, 0);
  set('dnd', 'toggle'); assert.strictEqual(get('dnd'), 'Off');
  set('orientation', 'toggle'); assert.strictEqual(S.orientation, 'landscape'); set('orientation', 'portrait'); assert.strictEqual(S.orientation, 'portrait');
  set('close', 'tally'); assert(!S.procs.tally); assert.strictEqual(get('windows'), 1);
  // cross-app read-only store peek + resume handler
  k._exec([{ op: 'store.set', args: { key: 'note', value: 'peek-me' } }], 'leaf');
  k._exec([{ op: 'store.get', args: { key: 'leaf/note', placeto: 'p' } }], 'drift'); assert.strictEqual(k.vars('drift').p, 'peek-me');
  assert(/key/.test(get('storage')));
  var s2 = JSON.parse(JSON.stringify(seed)); s2.program.Tally.push({ op: 'ui.on', args: { id: 'resume', event: 'tap' }, handlers: { tap: [{ op: 'thenplace', args: { src: 'back', placeto: 'r' } }] } });
  var k2 = OS.createKernel(s2, {}); k2.boot(); k2.dispatch('@unlock'); k2.launch('tally'); assert.strictEqual(k2.vars('tally').r, 'back'); k2.vars('tally').r = ''; k2.launch('leaf'); k2.launch('tally'); assert.strictEqual(k2.vars('tally').r, 'back');
});

Promise.all(pending).then(function () {
  console.log('\n' + passed + ' passed' + (process.exitCode ? ', FAILURES' : ''));
});
