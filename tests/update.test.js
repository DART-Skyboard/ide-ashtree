// Versioning / OTA update framework tests (node, no DOM).  Run: node tests/update.test.js
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var SU = require('../js/phone/samara-update.js'), SP = require('../js/phone/seedpress.js'), OS = require('../js/phone/samara-os.js');
global.Seedpress = SP; global.SamaraUpdate = SU;

var passed = 0, queue = Promise.resolve();
function t(name, fn) {
  queue = queue.then(function () { return Promise.resolve().then(fn); }).then(function () { passed++; console.log('  ok  ' + name); },
    function (e) { process.exitCode = 1; console.log('FAIL  ' + name + '\n' + (e.stack || e)); });
}
var B = path.join(__dirname, '..', 'phone', 'build');
function rd(n) { return fs.readFileSync(path.join(B, n), 'utf8'); }
var SEED100 = SP.parse(rd('samara-demo.seed')).seed, TEXT110 = rd('samara-demo-1.1.0.seed'), FEED = rd('feed.json');
var ENV = { kernel: OS.version, schema: OS.schema };

function memStore(limit) {
  var m = {};
  return { m: m, getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { if (limit && String(v).length > limit) { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
}
// fake network: url -> text (or function / Error)
function net(map) {
  var f = function (u) {
    var key = Object.keys(map).filter(function (k) { return u.slice(-k.length) === k; })[0];
    if (!key) return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(''); } });
    var v = typeof map[key] === 'function' ? map[key]() : map[key];
    if (v instanceof Error) return Promise.reject(v);
    return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(v); } });
  };
  return f;
}
function phone(over) {
  over = over || {};
  var store = over.storage || memStore(), map = over.map || { 'feed.json': FEED, 'samara-demo-1.1.0.seed': TEXT110, 'samara-demo-1.2.0-beta.1.seed': rd('samara-demo-1.2.0-beta.1.seed') };
  var up = SU.create({ storage: store, fetch: net(map), base: over.base || SEED100, env: over.env || ENV, feedUrl: 'https://x.test/phone/build/feed.json', seedpress: SP, now: over.now, online: over.online });
  return { up: up, store: store, map: map };
}

// ---------------- versions ----------------
t('parseVersion / compareVersions incl. prerelease ordering', function () {
  assert.strictEqual(SU.compareVersions('1.0.0', '1.0.0'), 0);
  assert.strictEqual(SU.compareVersions('1.0.0', '1.0.1'), -1);
  assert.strictEqual(SU.compareVersions('1.10.0', '1.9.9'), 1);          // numeric, not lexical
  assert.strictEqual(SU.compareVersions('2.0.0-beta.1', '2.0.0'), -1);
  assert.strictEqual(SU.compareVersions('2.0.0-beta.2', '2.0.0-beta.10'), -1);
  assert.strictEqual(SU.compareVersions('2.0.0-alpha', '2.0.0-beta'), -1);
  assert.strictEqual(SU.parseVersion('1.2'), null); assert.strictEqual(SU.parseVersion('v1.2.3'), null);
  assert.throws(function () { SU.compareVersions('1.0', '1.0.0'); }, TypeError);
  assert.strictEqual(SU.bumpPatch('1.2.9'), '1.2.10');
});
t('checkCompat: kernel and schema ranges', function () {
  assert(SU.checkCompat({ minKernel: '1.0.0', minSchema: 1 }, { kernel: '1.1.0', schema: 1 }).ok);
  var c = SU.checkCompat({ minKernel: '2.0.0' }, { kernel: '1.1.0', schema: 1 }); assert(!c.ok); assert(/kernel 2\.0\.0/.test(c.reasons[0]));
  c = SU.checkCompat({ minSchema: 2 }, { kernel: '1.1.0', schema: 1 }); assert(!c.ok);
  c = SU.checkCompat({ schema: 3 }, { kernel: '1.1.0', schema: 1 }); assert(!c.ok && /newer than this kernel/.test(c.reasons[0]));
  assert(SU.checkCompat({}, ENV).ok);
});

// ---------------- feed ----------------
t('parseFeed: demo feed, relative urls resolved', function () {
  var r = SU.parseFeed(FEED, 'https://x.test/phone/build/feed.json');
  assert(r.ok, r.errors.join()); assert.strictEqual(r.feed.channels.stable[0].version, '1.1.0');
  assert.strictEqual(r.feed.channels.stable[0].url, 'https://x.test/phone/build/samara-demo-1.1.0.seed');
  assert.strictEqual(r.feed.channels.beta[0].channel, 'beta');
});
t('parseFeed: corrupted feeds are rejected or sanitised, never thrown', function () {
  assert(!SU.parseFeed('{not json').ok); assert(!SU.parseFeed('[]').ok); assert(!SU.parseFeed('{"format":9,"channels":{}}').ok);
  assert(!SU.parseFeed('{"format":1}').ok); assert(!SU.parseFeed('{"format":1,"channels":{"stable":[]}}').ok);
  var r = SU.parseFeed({ format: 1, channels: { stable: [{ version: 'x', url: 'a', sha256: 'a'.repeat(64) }, { version: '1.0.1', url: 'a', sha256: 'zz' }, { version: '1.0.2', url: 'a', sha256: 'a'.repeat(64) }, 7] } });
  assert(r.ok); assert.strictEqual(r.feed.channels.stable.length, 1); assert(r.warnings.length >= 3);
});
t('pickRelease: channels, lineage, blocked, no downgrade, incompatible', function () {
  var f = SU.parseFeed(FEED, 'https://x/').feed, cur = { version: '1.0.0', build: 100, id: 'samara' };
  var p = SU.pickRelease(f, cur, { channel: 'stable', env: ENV, id: 'samara' }); assert.strictEqual(p.release.version, '1.1.0');
  p = SU.pickRelease(f, cur, { channel: 'beta', env: ENV, id: 'samara' }); assert.strictEqual(p.release.version, '1.2.0-beta.1');
  p = SU.pickRelease(f, { version: '1.1.0', build: 110, id: 'samara' }, { channel: 'stable', env: ENV, id: 'samara' }); assert.strictEqual(p.status, 'uptodate');
  p = SU.pickRelease(f, cur, { channel: 'stable', env: ENV, id: 'samara', blocked: ['1.1.0'] }); assert.strictEqual(p.status, 'uptodate');
  p = SU.pickRelease(f, cur, { channel: 'stable', env: ENV, id: 'other' }); assert.strictEqual(p.status, 'uptodate');   // other lineage ignored
  p = SU.pickRelease(f, cur, { channel: 'stable', env: { kernel: '0.9.0', schema: 1 }, id: 'samara' }); assert.strictEqual(p.status, 'incompatible'); assert(p.reasons.length);
});

// ---------------- seedpress meta ----------------
t('seedpress: meta embedded + hashed; meta-less seeds keep their hash (back-compat)', function () {
  assert(SEED100.meta && SEED100.meta.version === '1.0.0' && SEED100.meta.id === 'samara');
  assert(SP.verify(SEED100).ok);
  var old = JSON.parse(JSON.stringify(SEED100)); delete old.meta; old.os.version = '1.0.0';
  assert.strictEqual(SP.sha256(SP.canonical({ magic: old.magic, format: old.format, os: old.os, sources: old.sources, manifest: old.manifest, program: old.program })), SP.seal(JSON.parse(JSON.stringify(old))).sha256);
  var tampered = JSON.parse(JSON.stringify(SEED100)); tampered.meta.version = '9.9.9'; assert(!SP.verify(tampered).ok);
  var src = { a: '(Crown):-: {\n ui.screen (h) title="x"\n}|\';\'|\n' };
  var r = SP.compile({ files: src, entry: 'a', meta: { version: '2.0', channel: 'nightly' } }); assert(!r.ok); assert(r.diagnostics.length >= 2);
  r = SP.compile({ files: src, entry: 'a' }); assert(r.ok && r.seed.meta === undefined);
  r = SP.compile({ files: src, entry: 'a', meta: { version: '2.0.0', build: 5, channel: 'beta' } }); assert(r.ok && r.seed.meta.schema === SP.SCHEMA && r.seed.os.version === '2.0.0');
});

// ---------------- verify ----------------
t('verifyPayload: ok, tampered sha, truncated, wrong version, wrong lineage, downgrade', function () {
  var rel = SU.parseFeed(FEED, 'https://x/').feed.channels.stable[0], cur = { version: '1.0.0', id: 'samara' };
  assert(SU.verifyPayload(TEXT110, rel, { env: ENV, current: cur, seedpress: SP }).ok);
  var bad = TEXT110.replace(/"sha256":"[0-9a-f]{8}/, function (m) { return m.slice(0, -8) + 'deadbeef'; });
  var r = SU.verifyPayload(bad, Object.assign({}, rel, { size: null }), { env: ENV, current: cur, seedpress: SP }); assert(!r.ok); assert(/integrity|sha256/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110.slice(0, 5000), rel, { env: ENV, current: cur, seedpress: SP }); assert(!r.ok && /size mismatch/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110, Object.assign({}, rel, { sha256: 'b'.repeat(64) }), { env: ENV, current: cur, seedpress: SP }); assert(!r.ok && /does not match the feed/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110, Object.assign({}, rel, { version: '1.1.1' }), { env: ENV, current: cur, seedpress: SP }); assert(!r.ok && /version mismatch/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110, rel, { env: ENV, current: { version: '1.0.0', id: 'other' }, seedpress: SP }); assert(!r.ok && /different OS/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110, rel, { env: ENV, current: { version: '1.5.0', id: 'samara' }, seedpress: SP }); assert(!r.ok && /downgrade/.test(r.errors[0]));
  r = SU.verifyPayload(TEXT110, rel, { env: { kernel: '0.5.0', schema: 1 }, current: cur, seedpress: SP }); assert(!r.ok && /not compatible/.test(r.errors[0]));
  r = SU.verifyPayload('{"magic":"nope"}', Object.assign({}, rel, { size: null }), { env: ENV, current: cur, seedpress: SP }); assert(!r.ok);
  r = SU.verifyPayload(TEXT110, Object.assign({}, rel, { signature: 'abc' }), { env: ENV, current: cur, seedpress: SP, requireSignature: true }); assert(!r.ok);
});

// ---------------- updater: A/B, apply, rollback ----------------
t('full flow: check -> download -> apply -> boot select -> rollback (A/B slots)', async function () {
  var p = phone(), up = p.up;
  assert.strictEqual(up.current().version, '1.0.0'); assert.strictEqual(up.getState().active, 'base');
  var c = await up.check(); assert(c.ok && c.status === 'available' && c.release.version === '1.1.0');
  assert.strictEqual(up.primaryLabel().indexOf('Download 1.1.0'), 0);
  var d = await up.download(); assert(d.ok, d.error); assert.strictEqual(up.getState().staged.slot, 'A'); assert(p.store.m['samara:upd:slot:A']);
  assert.strictEqual(up.current().version, '1.0.0', 'staging must not change the running system');
  assert.strictEqual(up.primaryLabel(), 'Install & restart');
  var a = up.apply(); assert(a.ok); assert.strictEqual(a.version, '1.1.0');
  var s = up.getState(); assert.strictEqual(s.active, 'A'); assert.strictEqual(s.previous, 'base'); assert(s.trial);
  // "reboot": a new updater over the same storage sees the new image
  var up2 = SU.create({ storage: p.store, fetch: net(p.map), base: SEED100, env: ENV, feedUrl: 'https://x.test/phone/build/feed.json', seedpress: SP });
  var sel = up2.selectBootSeed(); assert.strictEqual(sel.version, '1.1.0'); assert.strictEqual(sel.source, 'A');
  up2.markBootGood(); assert.strictEqual(up2.getState().trial, null);
  assert(up2.canRollback());
  var rb = up2.rollback('test'); assert(rb.ok && rb.version === '1.0.0');
  assert.strictEqual(up2.getState().active, 'base'); assert.strictEqual(up2.getState().slots.A, null); assert(!p.store.m['samara:upd:slot:A']);
  assert.deepStrictEqual(up2.getState().blocked, ['1.1.0']);
  var c2 = await up2.check(); assert.strictEqual(c2.status, 'uptodate', 'a rolled-back version is not re-offered automatically');
  var c3 = await up2.check({ ignoreBlocked: true }); assert.strictEqual(c3.status, 'available');
  assert(!up2.canRollback());
});
t('second update uses the other slot; previous slot is the rollback target', async function () {
  var p = phone(); var up = p.up; up.setChannel('beta');
  await up.check(); await up.download(); up.apply(); up.markBootGood();           // 1.2.0-beta.1 (best) in A
  assert.strictEqual(up.current().version, '1.2.0-beta.1');
  assert.strictEqual(up.getState().previous, 'base');
});
t('automatic boot-time rollback after two unsuccessful boots', async function () {
  var p = phone(); await p.up.check(); await p.up.download(); p.up.apply();
  var mk = function () { return SU.create({ storage: p.store, fetch: net(p.map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP }); };
  var b1 = mk().selectBootSeed(); assert.strictEqual(b1.version, '1.1.0');            // attempt 1, never confirmed (crash)
  var b2 = mk().selectBootSeed(); assert.strictEqual(b2.version, '1.1.0');            // attempt 2
  var b3 = mk(), s3 = b3.selectBootSeed(); assert.strictEqual(s3.version, '1.0.0'); assert(s3.rolledBack && /did not start/.test(s3.notice));
  assert.strictEqual(b3.getState().just.rolledBack, true);
});
t('corrupted staged/installed slot never boots: falls back to factory image', async function () {
  var p = phone(); await p.up.check(); await p.up.download(); p.up.apply(); p.up.markBootGood();
  p.store.m['samara:upd:slot:A'] = p.store.m['samara:upd:slot:A'].replace('"Crown"', '"Crow"');
  var up = SU.create({ storage: p.store, fetch: net(p.map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP });
  var sel = up.selectBootSeed(); assert.strictEqual(sel.version, '1.0.0'); assert.strictEqual(sel.source, 'base'); assert(sel.notice);
});
t('failure handling: network down, 404, corrupted feed, hash fault, quota — phone never changes', async function () {
  var down = phone({ map: { 'feed.json': function () { return new TypeError('Failed to fetch'); } } });
  var r = await down.up.check(); assert(!r.ok); assert(/Couldn't reach/.test(r.error)); assert.strictEqual(down.up.current().version, '1.0.0');
  var nf = phone({ map: {} }); r = await nf.up.check(); assert(!r.ok && /HTTP 404/.test(r.error));
  var bad = phone({ map: { 'feed.json': '<html>captive portal</html>' } }); r = await bad.up.check(); assert(!r.ok && /damaged or unsupported/.test(r.error));
  var f = phone(); await f.up.check(); f.up.setFault('hash'); r = await f.up.download(); assert(!r.ok && /failed verification/.test(r.error));
  assert.strictEqual(f.up.getState().staged, null); assert.strictEqual(f.up.current().version, '1.0.0'); assert(!f.store.m['samara:upd:slot:A']);
  r = await f.up.download(); assert(r.ok, 'retry after a failed download works');
  var q = phone({ storage: memStore(100000) }); await q.up.check(); r = await q.up.download(); assert(!r.ok && /storage/i.test(r.error)); assert.strictEqual(q.up.getState().staged, null);
  var trunc = phone({ map: { 'feed.json': FEED, 'samara-demo-1.1.0.seed': TEXT110.slice(0, 40000) } }); await trunc.up.check(); r = await trunc.up.download(); assert(!r.ok && /size mismatch/.test(r.error));
});
t('incompatible update is reported, not installed', async function () {
  var p = phone({ env: { kernel: '0.9.0', schema: 1 } }); var r = await p.up.check();
  assert(r.ok && r.status === 'incompatible'); assert(/needs Samara kernel 1\.0\.0/.test(r.reasons[0])); assert.strictEqual((await p.up.download()).ok, false);
});
t('automatic updates: stage only, apply on next boot; nightly window uses the phone clock', async function () {
  var T = new Date(2026, 10, 15, 14, 0).getTime(), p = phone({ now: function () { return T; } }), up = p.up;
  up.setAuto({ enabled: true, schedule: 'nightly' });
  assert(!up.autoDue(T), '14:00 is outside 02:00-04:00');
  var night = new Date(2026, 10, 16, 3, 0).getTime(); assert(up.autoDue(night));
  var r = await up.autoTick(night); assert(r.ran && r.download.ok); assert.strictEqual(up.current().version, '1.0.0', 'auto update must not change the running system');
  assert(!up.autoDue(night + 60000), 'once per night');
  var sel = SU.create({ storage: p.store, fetch: net(p.map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP }).selectBootSeed(); assert.strictEqual(sel.version, '1.1.0');
  // wifi schedule honours online()
  var off = phone({ online: function () { return false; } }); off.up.setAuto({ enabled: true, schedule: 'wifi' }); assert(!off.up.autoDue());
  // auto OFF: staged update is NOT applied at boot
  var m = phone(); await m.up.check(); await m.up.download();
  var s2 = SU.create({ storage: m.store, fetch: net(m.map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP }).selectBootSeed(); assert.strictEqual(s2.version, '1.0.0');
});
t('simulate update available (developer option) runs the full flow offline', async function () {
  var p = phone({ map: {} }); var r = await p.up.simulate(); assert(r.status === 'available' && r.release.version === '1.0.1');
  var d = await p.up.download(); assert(d.ok, d.error); assert(p.up.apply().ok); assert.strictEqual(p.up.current().version, '1.0.1');
});

// ---------------- migrations ----------------
t('migrations: ordered, ranged, declarative + js, atomic, downgrade is a no-op', function () {
  SU.clearMigrations();
  var seen = [];
  SU.registerMigration('1.1.0', function (s) { seen.push('1.1.0'); s.settings.b = 2; });
  SU.registerMigration('1.0.0', function (s) { seen.push('1.0.0'); s.settings.a = 1; });
  var r = SU.runMigrations({ settings: {}, kv: {} }, '1.0.0', '1.2.0'); assert(r.ok);
  assert.deepStrictEqual(seen, ['1.0.0', '1.1.0']); assert.deepStrictEqual(r.state.settings, { a: 1, b: 2 });
  seen = []; r = SU.runMigrations({ settings: {}, kv: {} }, '1.0.5', '1.1.0'); assert.deepStrictEqual(seen, [], 'migration "from 1.0.0" skips state written by 1.0.5; target 1.1.0 excludes from=1.1.0');
  seen = []; r = SU.runMigrations({ settings: {}, kv: {} }, '1.1.0', '1.0.0'); assert.strictEqual(r.skipped, 'downgrade'); assert.deepStrictEqual(seen, []);
  var decl = [{ from: '1.0.0', op: 'rename', key: 'settings.old', to: 'kv.new' }, { from: '1.0.0', op: 'default', key: 'kv.d', value: 'x' }, { from: '1.0.0', op: 'delete', key: 'kv.gone' }, { from: '1.0.0', op: 'set', key: 'settings.s', value: 5 }];
  SU.clearMigrations();
  r = SU.runMigrations({ settings: { old: 'v' }, kv: { gone: 1 } }, '1.0.0', '1.1.0', decl);
  assert.deepStrictEqual(r.state, { settings: { s: 5 }, kv: { new: 'v', d: 'x' } });
  SU.registerMigration('1.0.0', function () { throw new Error('boom'); });
  var input = { settings: { keep: 1 }, kv: {} }; r = SU.runMigrations(input, '1.0.0', '1.1.0', decl);
  assert(!r.ok && /boom/.test(r.error)); assert.deepStrictEqual(r.state, { settings: { keep: 1 }, kv: {} }); SU.clearMigrations();
  assert.throws(function () { SU.registerMigration('bad', function () {}); });
});

// ---------------- kernel integration ----------------
function boot(seed, store, up, extra) {
  var host = Object.assign({ storage: store, update: up, now: function () { return Date.parse('2026-11-15T10:00:00Z'); } }, extra || {});
  var k = OS.createKernel(seed, host); k.boot(); k.dispatch('@unlock'); return { k: k, host: host };
}
t('kernel.system: honest info, device id stable, hardware labelled simulated', function () {
  var st = memStore(), b = boot(SEED100, st, null), s = b.k.system;
  assert.strictEqual(s.os.version, '1.0.0'); assert.strictEqual(s.os.build, 100); assert.strictEqual(s.os.channel, 'stable'); assert.strictEqual(s.os.schema, 1);
  assert.strictEqual(s.kernel.version, OS.version); assert.strictEqual(s.seed.sha256, SEED100.sha256); assert(/Simulated/.test(s.device.hardware) && s.device.simulated);
  assert(/^SMR-[0-9A-F]{4}-[0-9A-F]{4}$/.test(s.device.id)); assert.strictEqual(boot(SEED100, st, null).k.system.device.id, s.device.id);
  assert.throws(function () { 'use strict'; b.k.system = 1; });
});
function texts(k) { var o = []; (function w(n) { if (n.props && n.props.text) o.push(String(n.props.text)); if (n.props && n.props.label) o.push(String(n.props.label)); if (n.props && n.props.title) o.push(String(n.props.title)); n.children.forEach(w); })(k.tree()); return o.join('\n'); }
t('Rings pages: About / System update / Developer options render; tap build x7 enables developer options', function () {
  var b = boot(SEED100, memStore(), null), k = b.k; k.launch('rings');
  k.dispatch('@rings:about'); var tx = texts(k); assert(/Samara One \(simulated\)/.test(tx)); assert(/Samara OS 1\.0\.0/.test(tx)); assert(/schema/i.test(tx)); assert(!/Developer options$/m.test(tx));
  for (var i = 0; i < 6; i++) k.dispatch('abbnv', 'tap'); assert(!k.system.flags.developer); assert(/more tap/.test(texts(k)));
  k.dispatch('abbnv', 'tap'); assert(k.system.flags.developer);
  k.dispatch('@rings:main'); assert(texts(k).indexOf('Developer options') >= 0, 'menu entry appears once enabled');
  k.dispatch('@rings:devopts'); assert(/Developer options are ON/.test(texts(k)));
  k.dispatch('ddt', 'tap'); assert.strictEqual(k.system.flags.showTouches, true); assert.strictEqual(k.tree().props.devTouches, true);
  k.dispatch('@rings:sysupdate'); assert(/up to date|Updates are not available|Tap Check/.test(texts(k)));
  k.back(); assert(/System/.test(texts(k)), 'back returns to the Rings menu');
});
t('copy build info goes through host.copy', function () {
  var got = null, b = boot(SEED100, memStore(), null, { copy: function (t) { got = t; return true; } }); b.k.launch('rings'); b.k.dispatch('@rings:about'); b.k.dispatch('abcopy', 'tap');
  assert(/Samara OS 1\.0\.0 \(build 100\)/.test(got) && /sha256: [0-9a-f]{64}/.test(got) && /Simulated|simulated/.test(got));
});
t('end-to-end through the UI: 1.0.0 -> 1.1.0 (state migrated, notice) -> rollback (state restored)', async function () {
  var st = memStore(), map = { 'feed.json': FEED, 'samara-demo-1.1.0.seed': TEXT110 }, reboots = [];
  var up = SU.create({ storage: st, fetch: net(map), base: SEED100, env: ENV, feedUrl: 'https://x.test/phone/build/feed.json', seedpress: SP });
  var b = boot(up.selectBootSeed().seed, st, up, { reboot: function (o) { reboots.push(o); } });
  // user data written by 1.0.0
  b.k.launch('leaf'); b.k._exec([{ op: 'store.set', args: { key: 'note', value: 'hello from 1.0.0' } }], 'leaf'); b.k.setSetting('brightness', 0.5);
  b.k.launch('rings'); b.k.dispatch('@rings:sysupdate');
  b.k.dispatch('usgo', 'tap'); await b.k.idle(); assert(/Update 1\.1\.0 is available/.test(texts(b.k)));
  b.k.dispatch('usgo', 'tap'); await b.k.idle(); assert(/ready to install/.test(texts(b.k))); assert(/Install & restart/.test(texts(b.k))); assert(/What's new in 1\.1\.0/.test(texts(b.k)));
  b.k.dispatch('usgo', 'tap'); await b.k.idle(); assert.strictEqual(reboots.length, 1); assert.strictEqual(reboots[0].version, '1.1.0');
  // reboot into the new image (what Canopy's host.reboot does)
  b.k.shutdown();
  var up2 = SU.create({ storage: st, fetch: net(map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP }), sel = up2.selectBootSeed();
  var b2 = boot(sel.seed, st, up2, { reboot: function (o) { reboots.push(o); } });
  assert.strictEqual(b2.k.system.os.version, '1.1.0'); assert.strictEqual(b2.k.system.os.build, 110);
  assert.strictEqual(st.getItem('samara:samara:rings:updated-from'), '1.0.0', 'declarative migration ran');
  assert.strictEqual(st.getItem('samara:samara:leaf:note'), 'hello from 1.0.0', 'user data survives (shared lineage namespace)');
  assert(b2.k.state().notifs.some(function (n) { return /updated to 1\.1\.0/.test(n.text); }), 'update notice');
  assert.strictEqual(up2.getState().trial, null, 'boot confirmed');
  b2.k.launch('rings'); b2.k.dispatch('@rings:sysupdate'); assert(/Roll back to 1\.0\.0 \(factory image\)/.test(texts(b2.k)));
  b2.k.setSetting('brightness', 0.9);
  b2.k.dispatch('urb', 'tap'); assert.strictEqual(reboots[1].version, '1.0.0');
  b2.k.shutdown();
  var up3 = SU.create({ storage: st, fetch: net(map), base: SEED100, env: ENV, feedUrl: 'x', seedpress: SP }), b3 = boot(up3.selectBootSeed().seed, st, up3);
  assert.strictEqual(b3.k.system.os.version, '1.0.0'); assert.strictEqual(st.getItem('samara:samara:rings:updated-from'), null, 'snapshot restored: migration additions removed');
  assert.strictEqual(JSON.parse(st.getItem('samara:samara:settings')).brightness, 0.5, 'settings restored to the pre-update snapshot');
  assert(b3.k.state().notifs.some(function (n) { return /went back to 1\.0\.0/.test(n.text); }));
});
t('factory reset needs a second tap and wipes the namespace', function () {
  var st = memStore(), reb = [], b = boot(SEED100, st, null, { reboot: function (o) { reb.push(o); } }), k = b.k;
  k._exec([{ op: 'store.set', args: { key: 'x', value: '1' } }], 'crown'); k.setSetting('brightness', 0.4);
  k.launch('rings'); k.dispatch('@rings:devopts'); k.dispatch('dfr', 'tap'); assert.strictEqual(reb.length, 0); assert(/Tap again/.test(texts(k)));
  k.dispatch('dfr', 'tap'); assert.strictEqual(reb.length, 1); assert.strictEqual(st.getItem('samara:samara:settings'), null);
});

queue.then(function () { console.log('\n' + passed + ' passed' + (process.exitCode ? ', FAILURES' : '')); });
