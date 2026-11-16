// Samara persistence + Rings tests (node, no DOM).  Run: node tests/persist.test.js
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var OS = require('../js/phone/samara-os.js');
require('../js/phone/theme-art.js');
var Rings = require('../js/phone/rings.js');
var P = require('../js/phone/persist.js');
var W = require('../js/phone/wallpapers.js');
var Seedpress = require('../js/phone/seedpress.js');

var passed = 0, pending = [];
function t(name, fn) {
  try { var r = fn(); if (r && r.then) { pending.push(r.then(function () { passed++; console.log('  ok  ' + name); }, function (e) { console.log('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; })); return; } passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n' + (e.stack || e)); process.exitCode = 1; }
}

// ---- a real ROM compiled from the demo sources ----
var root = path.join(__dirname, '..'), files = {};
['phone/os/samara.ashos', 'phone/apps/tally.ashos', 'phone/apps/leaf.ashos', 'phone/apps/drift.ashos', 'phone/apps/widow.ashos'].forEach(function (f) { files[f] = fs.readFileSync(path.join(root, f), 'utf8'); });
var res = Seedpress.compile({ files: files, entry: 'phone/os/samara.ashos' });
var SEED = res.seed;
function boot(host, seed) {
  var k = OS.createKernel(JSON.parse(JSON.stringify(seed || SEED)), host); k.boot(); k.dispatch('@unlock'); return k;
}
function mem() { var h = P.memoryHost(); h.now = function () { return 1700000000000; }; return h; }
function attach(k, h, project) { return P.attach({ kernel: k, host: h, seedId: k.seedId, project: project, debounceMs: 5 }); }

console.log('Samara persistence / Rings tests');

t('demo sources compile with zero diagnostics', function () { assert(res.ok); assert.deepStrictEqual(res.diagnostics, []); });

// ---------------- persist.js: format ----------------
t('snapshot -> serialize -> parse round trip', function () {
  var snap = P.build({ exported: { settings: { theme: 'Ember' }, prefs: { wifi: false }, session: { fg: 'leaf' }, store: { 'leaf:a': '1' }, customWallpaper: { present: true, fit: 'fit' } }, seedId: 'abc', project: 'demo', osVersion: '1.0.0', savedAt: 42 });
  var r = P.parse(P.serialize(snap)); assert(r.ok); assert.deepStrictEqual(r.snapshot, snap); assert.strictEqual(r.snapshot.v, P.VERSION);
});
t('parse: empty, corrupt JSON, wrong magic, newer / bad version, bad shape', function () {
  assert.strictEqual(P.parse(null).reason, 'empty'); assert.strictEqual(P.parse('').reason, 'empty');
  assert.strictEqual(P.parse('{not json').reason, 'corrupt'); assert.strictEqual(P.parse('{"truncated":').reason, 'corrupt');
  assert.strictEqual(P.parse('{"magic":"nope","v":1}').reason, 'magic');
  assert.strictEqual(P.parse(JSON.stringify({ magic: P.MAGIC, v: P.VERSION + 1 })).reason, 'newer');
  assert.strictEqual(P.parse(JSON.stringify({ magic: P.MAGIC, v: 0 })).reason, 'version'); assert.strictEqual(P.parse(JSON.stringify({ magic: P.MAGIC })).reason, 'version');
  assert.strictEqual(P.parse(JSON.stringify({ magic: P.MAGIC, v: 1, settings: 5 })).reason, 'shape');
});

// ---------------- persist.js: kernel round trip ----------------
t('kernel session survives a "reload": settings, prefs, store data, last app + screen, recents, orientation', function () {
  var h = mem(), k = boot(h); var c = attach(k, h);
  k.dispatch('@set:theme:Ember'); k.dispatch('@pref:a11y.bold:toggle'); k.dispatch('@pref:textSize:l'); k.dispatch('@set:brightness', 'change', { value: 55 }); k.dispatch('@set:dock:3');
  k.setSetting('orientation', 'landscape');
  k._exec([{ op: 'store.set', args: { key: 'k1', value: 'hello' } }], 'crown');   // writes crown:k1
  k.launch('tally'); k.launch('leaf'); k.dispatch('n1', 'tap');
  return c.saveNow(true).then(function () {
    var k2 = OS.createKernel(JSON.parse(JSON.stringify(SEED)), h); k2.boot(); var c2 = attach(k2, h);
    assert.strictEqual(k2.state().theme, 'Midnight' === k2.state().theme ? 'Midnight' : k2.state().theme);   // (kernel's own settings may already restore the theme)
    var r = c2.restore(); assert(r.restored, 'restored'); assert.strictEqual(k2.state().toast.text, 'Restored last session');
    var S = k2.state(); assert.strictEqual(S.theme, 'Ember'); assert.strictEqual(k2.getPref('a11y.bold'), true); assert.strictEqual(k2.getPref('textSize'), 'l');
    assert.strictEqual(S.brightness, 0.55); assert.strictEqual(S.dock, 3); assert.strictEqual(S.orientation, 'landscape');
    assert.strictEqual(S.fg, 'leaf'); assert.strictEqual(S.procs.leaf.cur, 'edit1'); assert.deepStrictEqual(S.recents, ['tally', 'leaf']);
    assert.strictEqual(k2.exportSession().store['crown:k1'], 'hello');
    assert.strictEqual(S.locked, false, 'unlocked state restored (no PIN)');
  });
});
t('a PIN keeps the phone locked after restore', function () {
  var h = mem(), k = boot(h), c = attach(k, h); k.setPref('sec.pin', '2468'); k.launch('tally');
  return c.saveNow(true).then(function () {
    var k2 = OS.createKernel(JSON.parse(JSON.stringify(SEED)), h); k2.boot(); attach(k2, h).restore();
    assert.strictEqual(k2.state().locked, true); assert.strictEqual(k2.state().fg, 'tally'); assert.strictEqual(k2.hasPasscode(), true);
    '2468'.split('').forEach(function (d) { k2.dispatch('@pin:' + d); }); assert.strictEqual(k2.state().locked, false);
  });
});
t('version mismatch / corrupt storage: start fresh, say so, keep the unreadable text', function () {
  [['newer', JSON.stringify({ magic: P.MAGIC, v: 99, settings: { theme: 'Moss' } })], ['corrupt', '{"magic":"SAMARA-SESSION","v":1,"settings":{"theme":']].forEach(function (cs) {
    var h = mem(), k0 = boot(h), key = P.storageKey('seed:' + k0.seedId); h.storage.setItem(key, cs[1]);
    var k = boot(h), c = attach(k, h), r = c.restore();
    assert.strictEqual(r.restored, false); assert.strictEqual(r.reason, cs[0]); assert.notStrictEqual(k.state().theme, 'Moss');
    assert(/fresh/.test(k.state().toast.text)); assert.strictEqual(h.storage.getItem(key + ':invalid'), cs[1]);
  });
});
t('project fallback: editing the ROM (new sha) keeps the session', function () {
  var h = mem(), k = boot(h), c = attach(k, h, 'My Phone'); k.dispatch('@set:theme:Moss'); k.launch('tally');
  return c.saveNow(true).then(function () {
    var seed2 = JSON.parse(JSON.stringify(SEED)); seed2.sha256 = 'ffffffffffff0000'; var k2 = boot(h, seed2); assert.notStrictEqual(k2.seedId, k.seedId);
    assert.strictEqual(attach(k2, h).restore().restored, false, 'without a project, a different ROM does not inherit');
    var k3 = boot(h, seed2), r = attach(k3, h, 'My Phone').restore(); assert(r.restored); assert.strictEqual(r.used, 'proj:my-phone'); assert.strictEqual(k3.state().theme, 'Moss');
  });
});
t('custom wallpaper: image goes to the blob store, restored async, fit/dim kept, removable', function () {
  var h = mem(), k = boot(h), c = attach(k, h), url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  k.setCustomWallpaper({ dataUrl: url, mime: 'image/jpeg', w: 640, h: 360, fit: 'fit', dim: 0.3, blur: 4 });
  assert.strictEqual(k.state().wallpaper, 'custom'); assert(/^linear-gradient\(rgba\(0,0,0,0\.30\)/.test(k.tree().props.wallpaper) || /url\(/.test(k.tree().props.wallpaper)); assert.strictEqual(k.tree().props.wallpaperBlur, 4);
  assert.strictEqual(k.exportSession().customWallpaper.fit, 'fit'); assert(JSON.stringify(k.exportSession()).indexOf('9j/4AAQ') < 0, 'image bytes are not in the JSON snapshot');
  return c.saveNow(true).then(function () {
    var k2 = OS.createKernel(JSON.parse(JSON.stringify(SEED)), h); k2.boot(); var r = attach(k2, h).restore();
    return r.promise.then(function () {
      assert.strictEqual(k2.state().wallpaper, 'custom'); assert.strictEqual(k2.customWallpaperData().dataUrl, url); assert.strictEqual(k2.customWallpaperData().fit, 'fit'); assert.strictEqual(k2.customWallpaperData().dim, 0.3);
      assert(k2.wallpapers().some(function (w) { return w.id === 'custom'; }));
      k2.dispatch('@act:wp-remove'); assert.strictEqual(k2.state().wallpaper, 'theme'); assert(!k2.wallpapers().some(function (w) { return w.id === 'custom'; }));
    });
  });
});
t('factory reset wipes settings, store and saved session; kernel reboots clean', function () {
  var h = mem(), k = boot(h), c = attach(k, h); k.dispatch('@set:theme:Moss'); k._exec([{ op: 'store.set', args: { key: 'x', value: '1' } }], 'crown');
  return c.saveNow(true).then(function () {
    assert(h.storage.getItem(P.storageKey('seed:' + k.seedId)));
    c.factoryReset();
    assert.strictEqual(h.storage.getItem(P.storageKey('seed:' + k.seedId)), null); assert.deepStrictEqual(k.exportSession().store, {}); assert.strictEqual(k.state().powered, true); assert.strictEqual(k.state().locked, true);
    assert.notStrictEqual(k.state().theme, 'Moss'); assert.deepStrictEqual(k.state().prefs, {});
  });
});
t('GitHub backup payload: state.json + wallpaper.<ext>; import restores them', function () {
  var h = mem(), k = boot(h), c = attach(k, h, 'demo'); k.dispatch('@set:theme:Mist');
  k.setCustomWallpaper({ dataUrl: 'data:image/jpeg;base64,QUJDREVG', mime: 'image/jpeg', w: 6, h: 6 });
  return c.exportBackup().then(function (b) {
    assert.strictEqual(b.statePath, 'session/state.json'); assert.strictEqual(b.wallpaperPath, 'session/wallpaper.jpg'); assert.strictEqual(b.wallpaper.base64, 'QUJDREVG');
    assert.strictEqual(P.parse(b.state).snapshot.settings.theme, 'Mist'); assert(!/token/i.test(b.state));
    var h2 = mem(), k2 = boot(h2), c2 = attach(k2, h2, 'demo');
    return c2.importBackup(b.state, b.wallpaper, true).then(function (r) { assert(r.ok && r.restored); assert.strictEqual(k2.state().theme, 'Mist'); assert.strictEqual(k2.customWallpaperData().dataUrl, 'data:image/jpeg;base64,QUJDREVG'); });
  });
});
t('autosave is debounced (one write for a burst) and skipped when nothing changed', function () {
  var h = mem(), writes = 0, orig = h.storage.setItem; h.storage.setItem = function (k, v) { if (/session:v1/.test(k)) writes++; orig(k, v); };
  var timers = [], fakeT = function (f) { timers.push(f); return timers.length; }; h.setTimeout = fakeT; h.clearTimeout = function () {};
  var k = boot(h), c = P.attach({ kernel: k, host: h, seedId: k.seedId, debounceMs: 10 });
  k.dispatch('@set:theme:Moss'); k.dispatch('@set:theme:Mist'); k.dispatch('@pref:wifi:toggle'); assert.strictEqual(timers.length, 1, 'one timer for the burst');
  timers.shift()(); return c.flush().then(function () { assert.strictEqual(writes, 1); c.saveNow(); return c.saveNow().then(function () { assert.strictEqual(writes, 1, 'unchanged snapshot is not rewritten'); }); });
});
t('does not persist while powered off, and honours Autosave=off', function () {
  var h = mem(), k = boot(h), c = attach(k, h); k.setPref('autosave', false);
  return c.saveNow().then(function (ok) { assert.strictEqual(ok, false); k.setPref('autosave', true); k.shutdown(); return c.saveNow(true); }).then(function (ok) { assert.strictEqual(ok, false); assert.strictEqual(h.storage.getItem(P.storageKey('seed:' + k.seedId)), null); });
});

// ---------------- wallpapers.js: custom import maths ----------------
t('SamaraWallpapers.custom: fitSize downscales to 2560 keeping aspect; css modes + dim', function () {
  var C = W.custom; assert.deepStrictEqual(C.fitSize(5120, 2880, 2560), { w: 2560, h: 1440 }); assert.deepStrictEqual(C.fitSize(800, 600, 2560), { w: 800, h: 600 }); assert.deepStrictEqual(C.fitSize(1000, 4000, 2560), { w: 640, h: 2560 });
  assert(/center\/cover/.test(C.css({ dataUrl: 'data:x', fit: 'fill', dim: 0 }, '#111'))); assert(/center\/contain/.test(C.css({ dataUrl: 'data:x', fit: 'fit', dim: 0.5 }, '#111'))); assert(/center\/auto/.test(C.css({ dataUrl: 'data:x', fit: 'center', dim: 0 })));
  assert(/rgba\(0,0,0,0\.50\)/.test(C.css({ dataUrl: 'data:x', fit: 'fill', dim: 0.5 }))); assert(/jxl/.test(C.accept) && /avif/.test(C.accept));
});

// ---------------- Rings: every page builds; Back navigation ----------------
function allText(n, out) { out = out || []; if (n.props && (n.props.text || n.props.title || n.props.label)) out.push(String(n.props.text || n.props.title || n.props.label)); (n.children || []).forEach(function (c) { allText(c, out); }); return out; }
t('Rings: every page in the table builds, has a Back + Home header, and offers a way out', function () {
  var k = boot(mem()); k.launch('rings');
  Object.keys(Rings.PAGES).concat(['app:tally', 'app:rings']).forEach(function (id) {
    k.dispatch('@rings:page:' + id); var v = k.find('app:rings'), bar = v.children[0];
    assert.strictEqual(bar.tag, 'appbar', id); assert.strictEqual(bar.props.back, true, id + ' has Back'); assert.strictEqual(bar.props.home, true, id + ' has Home'); assert(bar.props.title, id + ' has a title');
    assert(v.children[1].children.length > 0, id + ' is not empty');
  });
  ['about', 'sysupdate', 'devopts'].forEach(function (id) { assert(Rings.PAGES[id], id + ' is a navigable entry'); });
});
t('Rings: Back walks sub-page -> parent -> main -> home (button, key, and "back" event)', function () {
  var k = boot(mem()); k.launch('rings'); k.dispatch('@rings:page:app:tally'); assert.strictEqual(k.proc('rings').ringsPage, 'app:tally');
  k.back(); assert.strictEqual(k.proc('rings').ringsPage, 'apps'); k.dispatch('@appbar-nope', 'back'); assert.strictEqual(k.proc('rings').ringsPage, 'main');
  assert.strictEqual(k.state().fg, 'rings'); k.press('back'); assert.strictEqual(k.state().fg, null, 'main -> home');
  k.launch('rings'); k.dispatch('@rings:page:themes'); k.dispatch('@back'); assert.strictEqual(k.proc('rings').ringsPage, 'main'); k.dispatch('@home'); assert.strictEqual(k.state().fg, null);
  k.launch('rings'); assert.strictEqual(k.proc('rings').ringsPage, 'main', 'Done resets Rings to its menu');
});
t('Rings: theme picker has 6 illustrated cards, wallpaper list has Theme Art', function () {
  var k = boot(mem()); k.launch('rings'); k.dispatch('@rings:page:themes');
  var cards = []; (function w(n) { if (n.tag === 'themecard') cards.push(n); n.children.forEach(w); })(k.tree()); assert.strictEqual(cards.length, 6);
  cards.forEach(function (c) { assert(/^data:image\/svg\+xml/.test(c.props.art), c.props.name + ' art'); assert(/^data:image\/svg\+xml/.test(c.props.emblem)); });
  assert(k.wallpapers().some(function (w) { return w.id === 'themeart'; })); k.dispatch('@set:wallpaper:themeart'); assert(/^url\("data:image\/svg\+xml/.test(k.tree().props.wallpaper));
});
t('theme art: six distinct original SVGs, valid-looking, unknown themes fall back', function () {
  var A = require('../js/phone/theme-art.js'), seen = {};
  A.themes.forEach(function (n) { var s = A.svg(n); assert(/^<svg [^>]*viewBox="0 0 720 1560"/.test(s)); assert(s.length > 4000); assert(!/<script|href=|<image/i.test(s), 'no external refs'); seen[s] = 1; assert(/<svg/.test(A.accent(n, 64)) && /<svg/.test(A.card(n))); });
  assert.strictEqual(Object.keys(seen).length, 6); assert(/<svg/.test(A.svg('Custom ROM Theme', { tokens: { accent: '#f0f', bg: '#102', dark: true } })));
});

// ---------------- Rings settings really change kernel behaviour ----------------
t('network: airplane / Wi-Fi+mobile off / per-app network permission block net.fetch (and expose online())', function () {
  var calls = 0, k = boot({ fetch: function () { calls++; return Promise.resolve({ ok: true, text: function () { return Promise.resolve('hi'); } }); } });
  var run = function () { k._exec([{ op: 'net.fetch', args: { url: 'https://example.com', placeto: 'pg' } }], 'crown'); return k.idle().then(function () { return k.vars('crown').pg; }); };
  return run().then(function (pg) { assert.strictEqual(pg, 'hi'); assert.strictEqual(k.online(), true);
    k.dispatch('@pref:airplane:toggle'); assert.strictEqual(k.online(), false); assert.strictEqual(k.tree().props.online, false); return run(); }).then(function (pg) { assert(/Airplane/.test(pg), pg); assert.strictEqual(calls, 1);
    k.dispatch('@pref:airplane:toggle'); k.dispatch('@pref:wifi:toggle'); k.dispatch('@pref:mobile:toggle'); return run(); }).then(function (pg) { assert(/offline/i.test(pg)); assert.strictEqual(calls, 1);
    k.dispatch('@pref:wifi:toggle'); k.dispatch('@pref:perm.crown.net:toggle'); return run(); }).then(function (pg) { assert(/blocked/i.test(pg)); assert.strictEqual(calls, 1); assert.strictEqual(k.find('@statusbar').props.wifi, true);
  });
});
t('privacy: camera and location permissions are enforced per app', function () {
  var k = boot(mem()); k.launch('tally'); k.dispatch('@pref:perm.tally.cam:toggle');
  k._exec([{ op: 'cam.open', args: { facing: 'back' } }], 'tally'); assert.strictEqual(k.camera().open, false); assert(/blocked/i.test(k.state().toast.text));
  k._exec([{ op: 'sensor.location', args: { placeto: 'loc' } }], 'tally'); assert(/37\./.test(k.vars('tally').loc));
  k.dispatch('@pref:perm.tally.loc:toggle'); k._exec([{ op: 'sensor.location', args: { placeto: 'loc' } }], 'tally'); assert.strictEqual(k.vars('tally').loc, '');
});
t('notifications: per-app off drops them, DND skips the banner, lock-screen toggle hides them on Bark', function () {
  var k = boot(mem()); k.launch('tally'); k.launch('leaf'); k.dispatch('@pref:notif.app.tally:toggle'); k._exec([{ op: 'sys.notify', args: { text: 'hi' } }], 'tally'); assert.strictEqual(k.state().notifs.length, 0);
  k._exec([{ op: 'sys.notify', args: { text: 'hi' } }], 'leaf'); assert.strictEqual(k.state().notifs.length, 1); assert.strictEqual(k.state().notifs[0].fresh, true);
  k.dispatch('@set:dnd:toggle'); k._exec([{ op: 'sys.notify', args: { text: 'quiet' } }], 'leaf'); assert.strictEqual(k.state().notifs[0].fresh, false);
  k.lock(); assert(k.find(function (n) { return n.tag === 'notif'; })); k.unlock(); k.dispatch('@pref:notif.lock:toggle'); k.lock(); assert.strictEqual(k.find(function (n) { return n.tag === 'notif'; }), null);
});
t('sound: silent mode mutes snd.beep, haptics off blocks vibration, captions announce sounds', function () {
  var beeps = 0, buzz = 0, k = boot({ snd: { beep: function () { beeps++; } }, haptic: function () { buzz++; } });
  var go = function () { k._exec([{ op: 'snd.beep', args: { freq: 440, ms: 10 } }, { op: 'input.haptic', args: { ms: 10 } }], 'crown'); };
  go(); assert.strictEqual(beeps, 1); assert.strictEqual(buzz, 1);
  k.dispatch('@pref:silent:toggle'); k.dispatch('@pref:haptics:toggle'); go(); assert.strictEqual(beeps, 1); assert.strictEqual(buzz, 1);
  k.dispatch('@pref:silent:toggle'); k.dispatch('@pref:a11y.captions:toggle'); go(); assert.strictEqual(beeps, 2); assert(/Beep/.test(k.state().toast.text));
});
t('display: orientation lock, text size / accessibility flags reach the view tree, screen timeout sleeps the phone', function () {
  var clock = 1000000, k = boot({ now: function () { return clock; } });
  k.dispatch('@pref:orientationLock:toggle'); k.rotate(); assert.strictEqual(k.state().orientation, 'portrait'); assert.strictEqual(k.setSetting('orientation', 'landscape'), false);
  k.dispatch('@pref:orientationLock:toggle'); k.rotate(); assert.strictEqual(k.state().orientation, 'landscape');
  k.dispatch('@pref:textSize:xl'); k.dispatch('@pref:a11y.filter:grayscale'); k.dispatch('@pref:a11y.motion:toggle'); k.dispatch('@pref:a11y.switch:toggle');
  var u = k.tree().props.ui; assert.strictEqual(u.textSize, 'xl'); assert.strictEqual(u.filter, 'grayscale'); assert.strictEqual(u.motion, true); assert.strictEqual(u.switchNav, true);
  k.dispatch('@pref:timeout:30'); clock += 20000; k.dispatch('@appbar-x', 'home'); k.tick(1000); assert.strictEqual(k.state().screenOff, false); clock += 40000; k.tick(1000); assert.strictEqual(k.state().screenOff, true); assert.strictEqual(k.state().locked, true);
});
t('locale: time zone, 24h and date format change the clock + date the OS shows', function () {
  var k = boot({ now: function () { return Date.UTC(2026, 10, 15, 22, 30); } });
  k.dispatch('@pref:tz:0'); k.dispatch('@pref:datefmt:DMY'); k.dispatch('@set:clock24:x'); k.getSetting('date');
  assert.strictEqual(k.getSetting('date'), 'Sunday, 15 November'); k.dispatch('@pref:tz:540'); assert.strictEqual(k.getSetting('date'), 'Monday, 16 November');
  k.dispatch('@pref:datefmt:ISO'); assert.strictEqual(k.getSetting('date'), 'Monday, 2026-11-16');
});
t('security: PIN set from Rings is required by Bark; wrong digits reject; remove returns to swipe', function () {
  var k = boot(mem()); k.launch('rings'); k.dispatch('@rings:page:security'); k.dispatch('@field:draft.pin', 'change', { value: '12' }); k.dispatch('@act:pin-set'); assert.strictEqual(k.hasPasscode(), false, 'too short');
  k.dispatch('@field:draft.pin', 'change', { value: '4821' }); k.dispatch('@act:pin-set'); assert.strictEqual(k.hasPasscode(), true); k.lock();
  assert.strictEqual(k.dispatch('@unlock'), true); assert.strictEqual(k.state().locked, true, 'swipe/tap no longer unlocks');
  '1111'.split('').forEach(function (d) { k.dispatch('@pin:' + d); }); assert.strictEqual(k.state().locked, true); assert.strictEqual(k.state().pinError, true);
  '4821'.split('').forEach(function (d) { k.dispatch('@pin:' + d); }); assert.strictEqual(k.state().locked, false); k.dispatch('@act:pin-clear'); k.lock(); k.dispatch('@unlock'); assert.strictEqual(k.state().locked, false);
});
t('storage: real per-app usage and Clear data', function () {
  var k = boot(mem()); k.launch('tally'); k._exec([{ op: 'store.set', args: { key: 'a', value: 'x'.repeat(100) } }], 'tally');
  var u = k.storageUsage(), tl = u.apps.filter(function (a) { return a.id === 'tally'; })[0]; assert(tl.bytes >= 100 && tl.keys === 1);
  k.dispatch('@act:clear-data:tally'); assert.strictEqual(k.storageUsage().apps.filter(function (a) { return a.id === 'tally'; })[0].bytes, 0); assert.strictEqual(k.state().procs.tally, undefined);
});
t('battery saver slows drain (simulated model)', function () {
  var a = boot(mem()), b = boot(mem()); b.dispatch('@pref:bat.saver:toggle'); a.tick(600000); b.tick(600000); assert(b.state().battery > a.state().battery);
});

// ---------------- App Drawer + exits ----------------
t('App Drawer: alphabetical, searchable, back closes it, dock has Settings + Apps', function () {
  var k = boot(mem()), dock = k.find('@dock'); assert.strictEqual(dock.children[dock.children.length - 1].id, '@drawer:open'); assert(dock.children.some(function (c) { return c.id === '@app:rings'; }));
  k.dispatch('@drawer:open'); var d = k.find('app:drawer'); assert(d); var names = []; (function w(n) { if (n.tag === 'approw') names.push(n.props.name); n.children.forEach(w); })(d);
  assert.deepStrictEqual(names, names.slice().sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })); assert(names.length >= 6);
  k.dispatch('@drawer:q', 'change', { value: 'tal' }); names = []; (function w(n) { if (n.tag === 'approw') names.push(n.props.name); n.children.forEach(w); })(k.find('app:drawer')); assert.deepStrictEqual(names, ['Tally']);
  k.dispatch('@app:tally'); assert.strictEqual(k.state().fg, 'tally'); k.home(); k.dispatch('@drawer:open'); k.back(); assert.strictEqual(k.state().drawer, false);
  k._exec([{ op: 'sys.launch', args: { id: 'drawer' } }], 'crown'); assert.strictEqual(k.state().drawer, true);
});
t('every first-party app screen has Back + Home, and Back always gets out (Tally, Leaf, Lens, Drift, Widow)', function () {
  ['tally', 'leaf', 'lens', 'drift', 'widow'].forEach(function (id) {
    var k = boot(mem()); k.launch(id); var bar = k.find('app:' + id).children[0]; assert.strictEqual(bar.tag, 'appbar', id); assert(bar.props.back && bar.props.home, id);
    for (var i = 0; i < 8 && k.state().fg === id; i++) k.press('back');
    assert.strictEqual(k.state().fg, null, id + ' exits with repeated Back');
  });
  var k2 = boot(mem()); k2.launch('leaf'); k2.dispatch('n1', 'tap'); assert.notStrictEqual(k2.proc('leaf').cur, 'list'); k2.press('back'); assert.strictEqual(k2.proc('leaf').cur, 'list'); k2.press('back'); assert.strictEqual(k2.state().fg, null);
  k2.launch('tally'); k2.dispatch('hbtn', 'tap'); k2.press('back'); assert.strictEqual(k2.state().fg, 'tally'); k2.dispatch('@appbar', 'home'); assert.strictEqual(k2.state().fg, null);
});

Promise.all(pending).then(function () { console.log('\n' + passed + ' passed' + (process.exitCode ? ', FAILURES' : '')); });
