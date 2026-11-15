// node tests/seedpress.test.js
'use strict';
var assert = require('assert');
var path = require('path');
var S = require(path.join(__dirname, '../js/phone/samara-syntax.js'));
var P = require(path.join(__dirname, '../js/phone/seedpress.js'));
var crypto = require('crypto');
var pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }

var OS_SRC = [
  'import (SamaraHW)',
  '{{env:Samara}}',
  '[[script:samara-os-v1]]',
  'sys.theme (ash)',
  'sys.layout grid=4x5 dock=4',
  'sys.app (tally) name="Tally" glyph="+" color=#ff9500 entry=Tally',
  'sys.app (leaf) name="Leaf" icon="L" color=#34c759 entry=Leaf',
  '(Crown):-: {',
  '  [net: local] [poly: home]',
  '  ui.screen (home) title="Crown"',
  '  ui.grid (apps) cols=4 {',
  '    ui.icon (i1) glyph="+"',
  '    ui.button (b1) label="Tally"',
  '  }',
  '  ui.on (b1) tap { sys.launch (tally) }',
  '  input.on (home) { sys.home }',
  '  input.on (back) { sys.back }',
  '}|\';\'|',
  '(Bark):-: {',
  '  with var (t) {',
  '    irin ("Data: pin=0000")',
  '  }',
  '  sys.clock placeto (t)',
  '  ui.text (clk) text=(t) size=48 align=center',
  '}|\';\'|',
  ''
].join('\n');
var TALLY_SRC = [
  '(Tally):-: {',
  '  with var (s) var (c) {',
  '    irin ("Data: s=0 c=1")',
  '  }',
  '  ui.screen (tally) title="Tally"',
  '  ui.text (disp) text=(s) size=40',
  '  ui.button (eq) label="="',
  '  ui.on (eq) tap {',
  '    Research (s) placeto (s)',
  '    ui.set (disp) text=(s)',
  '    store.set (last) with (s)',
  '  }',
  '  Hammer',
  '  irout ("Result: " placeto (s))',
  '}|\';\'|'
].join('\n');
var LEAF_SRC = [
  '(Leaf):-: {',
  '  with var (note) {',
  '  }',
  '  store.get (note) placeto (note)',
  '  ui.input (ed) placeholder="Write..." multiline=true',
  '  ui.on (ed) change { store.set (note) with (note) }',
  '  gfx.canvas (cv) w=100 h=100',
  '  irin ("scene: ico")',
  '  gfx.gl.scene',
  '  gl.render',
  '  cam.open (front)',
  '  cam.snap placeto (shot)',
  '  net.fetch (https://example.com/a?b=(1)) placeto (page)',
  '  net.listen (feed) [net: wss] {when (evt) = ping}',
  '  snd.beep freq=440 ms=50',
  '  sensor.tilt placeto (tilt)',
  '  power.battery placeto (pct)',
  '}|\';\'|'
].join('\n');
var FILES = { 'phone/os/samara.ashos': OS_SRC, 'phone/apps/tally.ashos': TALLY_SRC, 'phone/apps/leaf.ashos': LEAF_SRC };
var ENTRY = 'phone/os/samara.ashos';

console.log('sha256');
t('matches node crypto (incl. unicode)', function () {
  ['', 'abc', 'a'.repeat(1000), 'héllo ☃ 😀', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64)].forEach(function (s) {
    assert.strictEqual(P.sha256(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  });
});

console.log('syntax');
t('table covers all namespaces', function () {
  S.NAMESPACES.forEach(function (ns) { assert.ok(Object.keys(S.TABLE).some(function (k) { return k.indexOf(ns + '.') === 0; }), ns); });
});
t('parseStatement: ui.button', function () {
  var r = S.parseStatement('ui.button (go) label="Go now" color=#fff');
  assert.ok(r.ok); assert.deepStrictEqual(r.op.args, { id: 'go', label: 'Go now', color: '#fff' });
});
t('parseStatement: ui.on with inline block', function () {
  var r = S.parseStatement('ui.on (b) tap { sys.home }');
  assert.ok(r.ok); assert.strictEqual(r.op.op, 'ui.on'); assert.strictEqual(r.op.handlers.tap[0].op, 'sys.home');
});
t('parseStatement: errors', function () {
  assert.ok(!S.parseStatement('ui.bogus (x)').ok);
  assert.ok(!S.parseStatement('store.get (k)').ok);           // needs placeto
  assert.ok(!S.parseStatement('cam.open (side)').ok);
  assert.ok(!S.parseStatement('ui.on (b) hover { sys.home }').ok);
  assert.ok(!S.parseStatement('ui.on (b) tap').ok);           // needs block
});
t('parseStatement: Ash core', function () {
  assert.deepStrictEqual(S.parseStatement('irin ("Data: a=1 b=hello world c=2.5")').op.args.vars, { a: 1, b: 'hello world', c: 2.5 });
  assert.deepStrictEqual(S.parseStatement('irout ("Result: " placeto (s))').op.args.parts, [{ lit: 'Result: ' }, { $var: 's' }]);
  assert.strictEqual(S.parseStatement('Research (mass * (g + 1))').op.args.expr, 'mass * (g + 1)');
  assert.strictEqual(S.parseStatement('Envelope').op.args.name, 'Envelope');
  assert.strictEqual(S.parseStatement('var (x)').op.op, 'var');
});
t('gl alias maps to gfx.gl', function () {
  var r = S.parseStatement('gl.scene');
  assert.strictEqual(r.op.op, 'gfx.gl.scene'); assert.strictEqual(r.op.args.glNode, 'ThreeScene');
});

console.log('compile');
var res = P.compile({ files: FILES, entry: ENTRY, built: '2026-01-01T00:00:00.000Z' });
t('sample OS compiles without errors', function () {
  assert.deepStrictEqual(res.diagnostics.filter(function (d) { return d.level === 'error'; }), []);
  assert.ok(res.ok && res.seed);
});
var seed = res.seed;
t('seed envelope per contract', function () {
  assert.strictEqual(seed.magic, 'SAMARA-SEED'); assert.strictEqual(seed.format, 1);
  assert.strictEqual(seed.os.name, 'Samara OS'); assert.ok(/^[0-9a-f]{64}$/.test(seed.sha256));
  assert.deepStrictEqual(Object.keys(seed.sources).sort(), Object.keys(FILES).sort());
  assert.strictEqual(seed.sources[ENTRY], OS_SRC);
});
t('manifest from sys.* statements', function () {
  assert.strictEqual(seed.manifest.theme, 'ash');
  assert.deepStrictEqual(seed.manifest.layout, { grid: '4x5', cols: 4, rows: 5, dock: 4 });
  assert.strictEqual(seed.manifest.boot, 'Crown');
  assert.deepStrictEqual(seed.manifest.apps.map(function (a) { return a.id + ':' + a.entry + ':' + a.glyph; }), ['tally:Tally:+', 'leaf:Leaf:L']);
  assert.strictEqual(seed.manifest.apps[0].color, '#ff9500');
});
t('program contains nodes from all files; manifest decls removed', function () {
  assert.deepStrictEqual(Object.keys(seed.program).sort(), ['Bark', 'Crown', 'Leaf', 'Tally']);
  JSON.stringify(seed.program).split('"op":"').forEach(function (s) { assert.ok(!/^sys\.(theme|layout|app)"/.test(s)); });
});
t('IR: handlers, children, tags, vars, irin', function () {
  var crown = seed.program.Crown;
  assert.strictEqual(crown[0].op, 'tag'); assert.strictEqual(crown[0].args.kind, 'net');
  var grid = crown.filter(function (o) { return o.op === 'ui.grid'; })[0];
  assert.deepStrictEqual(grid.children.map(function (o) { return o.op; }), ['ui.icon', 'ui.button']);
  var on = crown.filter(function (o) { return o.op === 'ui.on'; })[0];
  assert.deepStrictEqual(on.args, { id: 'b1', event: 'tap' });
  assert.deepStrictEqual(on.handlers.tap[0], { op: 'sys.launch', args: { id: 'tally' }, line: on.handlers.tap[0].line });
  var home = crown.filter(function (o) { return o.op === 'input.on' && o.args.key === 'home'; })[0];
  assert.strictEqual(home.handlers.press[0].op, 'sys.home');
  var tally = seed.program.Tally;
  assert.deepStrictEqual(tally.slice(0, 3).map(function (o) { return o.op; }), ['var', 'var', 'irin']);
  assert.deepStrictEqual(tally[2].args.vars, { s: 0, c: 1 });
  var tap = tally.filter(function (o) { return o.op === 'ui.on'; })[0].handlers.tap;
  assert.deepStrictEqual(tap.map(function (o) { return o.op; }), ['research', 'ui.set', 'store.set']);
  assert.deepStrictEqual(tap[1].args.text, { $var: 's' });
  assert.deepStrictEqual(tally[tally.length - 1].args.parts, [{ lit: 'Result: ' }, { $var: 's' }]);
});
t('IR: gl params from irin, store/cam/net, listen handlers', function () {
  var leaf = seed.program.Leaf, by = function (n) { return leaf.filter(function (o) { return o.op === n; }); };
  var scene = by('gfx.gl.scene')[0];
  assert.strictEqual(scene.args.params, 'scene: ico'); assert.strictEqual(scene.args.glNode, 'ThreeScene');
  assert.ok(!leaf.some(function (o) { return o.op === 'irin'; }), 'colon-style irin consumed');
  assert.strictEqual(by('gfx.gl.render')[0].args.glNode, 'startRenderLoop');
  assert.strictEqual(by('cam.open')[0].args.facing, 'front');
  assert.strictEqual(by('cam.snap')[0].args.placeto, 'shot');
  assert.strictEqual(by('net.fetch')[0].args.url, 'https://example.com/a?b=(1)');
  var ls = by('net.listen')[0];
  assert.strictEqual(ls.args.tag, '[net: wss]'); assert.deepStrictEqual(Object.keys(ls.handlers), ['ping']);
  assert.deepStrictEqual(ls.handlers.ping.map(function (o) { return o.op; }), ['snd.beep', 'sensor.tilt', 'power.battery']);
  assert.deepStrictEqual(by('snd.beep').length, 0);   // moved under listen handler (one-liner semantics)
  var ed = by('ui.input')[0];
  assert.strictEqual(ed.args.multiline, true);
});
t('compile is deterministic and round-trips', function () {
  var again = P.compile({ files: FILES, entry: ENTRY, built: '2026-01-01T00:00:00.000Z' });
  assert.strictEqual(again.seed.sha256, seed.sha256);
  var text = P.serialize(seed), back = P.parse(text);
  assert.ok(back.ok); assert.deepStrictEqual(back.seed, seed);
  assert.ok(P.verify(text).ok);
});
t('sha ignores `built`', function () {
  var other = P.compile({ files: FILES, entry: ENTRY, built: '2030-05-05T00:00:00.000Z' });
  assert.strictEqual(other.seed.sha256, seed.sha256);
});

console.log('diagnostics');
function diag(files, entry) { return P.compile({ files: files, entry: entry }).diagnostics; }
t('missing entry', function () {
  var d = diag({ 'a.ashos': '' }, 'nope.ashos');
  assert.ok(d.some(function (x) { return x.level === 'error' && /entry file 'nope.ashos' is missing/.test(x.msg); }));
  assert.ok(!P.compile({ files: {}, entry: 'x' }).ok);
});
t('unknown statement carries file and line', function () {
  var d = diag({ 'a.ashos': '(Crown):-: {\n  ui.text (a) text="x"\n  ui.sparkle (z)\n  foo.bar\n}' }, 'a.ashos');
  var u = d.filter(function (x) { return /unknown statement/.test(x.msg); });
  assert.strictEqual(u.length, 2);
  assert.strictEqual(u[0].file, 'a.ashos'); assert.strictEqual(u[0].line, 3); assert.strictEqual(u[1].line, 4);
});
t('unbalanced braces', function () {
  var d = diag({ 'a.ashos': '(Crown):-: {\n  ui.on (b) tap {\n    sys.home\n}\n' }, 'a.ashos');
  var e = d.filter(function (x) { return /unclosed/.test(x.msg); });
  assert.strictEqual(e.length, 1); assert.strictEqual(e[0].line, 1);
  var d2 = diag({ 'a.ashos': '(Crown):-: {\n}\n}\n' }, 'a.ashos');
  var s = d2.filter(function (x) { return /unmatched/.test(x.msg); });
  assert.strictEqual(s.length, 1); assert.strictEqual(s[0].line, 3);
});
t('missing boot node / app entry / bad args', function () {
  var d = diag({ 'a.ashos': 'sys.app (x) name="X" entry=Nope\n(Home):-: {\n  ui.button (b)\n  cam.open (side)\n}' }, 'a.ashos');
  var m = d.map(function (x) { return x.msg; }).join('\n');
  assert.ok(/boot node 'Crown'/.test(m)); assert.ok(/entry node 'Nope'/.test(m)); assert.ok(/cam.open/.test(m));
});
t('duplicate node across files, statement outside node', function () {
  var d = diag({ 'a.ashos': '(Crown):-: {\n}\nui.text (x)', 'b.ashos': '(Crown):-: {\n}' }, 'a.ashos');
  assert.ok(d.some(function (x) { return /already defined in a.ashos/.test(x.msg); }));
  assert.ok(d.some(function (x) { return /outside a node/.test(x.msg) && x.line === 3; }));
});
t('unknown key is a warning, not an error', function () {
  var r = P.compile({ files: { 'a.ashos': '(Crown):-: {\n  ui.text (a) wibble=1\n}' }, entry: 'a.ashos' });
  assert.ok(r.ok); assert.ok(r.diagnostics.some(function (x) { return x.level === 'warn' && /wibble/.test(x.msg); }));
});

console.log('verify');
t('clean seed verifies', function () { var v = P.verify(seed); assert.ok(v.ok, v.errors.join()); assert.strictEqual(v.actual, seed.sha256); });
t('tamper: program edit', function () {
  var bad = JSON.parse(P.serialize(seed)); bad.program.Crown[2].args.title = 'Evil';
  var v = P.verify(bad); assert.ok(!v.ok); assert.ok(/sha256 mismatch/.test(v.errors[0]));
});
t('tamper: source, manifest, sha', function () {
  var b1 = JSON.parse(P.serialize(seed)); b1.sources[ENTRY] += ' ';
  var b2 = JSON.parse(P.serialize(seed)); b2.manifest.apps[0].entry = 'Leaf';
  var b3 = JSON.parse(P.serialize(seed)); b3.sha256 = b3.sha256.replace(/^./, function (c) { return c === 'a' ? 'b' : 'a'; });
  [b1, b2, b3].forEach(function (b) { assert.ok(!P.verify(b).ok); });
  assert.ok(!P.verify(P.serialize(b1)).ok);
});
t('bad magic / format / json', function () {
  assert.ok(!P.parse('{').ok); assert.ok(!P.parse('{"magic":"x"}').ok); assert.ok(!P.parse('{"magic":"SAMARA-SEED","format":9}').ok);
  assert.ok(!P.verify({ magic: 'NOPE' }).ok);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
