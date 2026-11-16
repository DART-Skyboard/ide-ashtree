// Builds the demo OS images and the OTA feed:  node tools/samara-build.js
//   phone/build/samara-demo.seed             1.0.0  (the "factory image" a phone ships with)
//   phone/build/samara-demo-1.1.0.seed       1.1.0  stable update
//   phone/build/samara-demo-1.2.0-beta.1.seed 1.2.0-beta.1  beta update
//   phone/build/feed.json                    feed listing both updates
// The updates are the same sources with small, visible edits (PATCHES below). A real project would simply edit
// its .ashos files, bump `sys.meta version=` and publish (Grove > Publish update does the same steps).
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var SP = require(path.join(root, 'js/phone/seedpress.js'));
var SU = require(path.join(root, 'js/phone/samara-update.js'));
var FILES = ['phone/os/samara.ashos', 'phone/apps/tally.ashos', 'phone/apps/leaf.ashos', 'phone/apps/drift.ashos', 'phone/apps/widow.ashos'];
var ENTRY = 'phone/os/samara.ashos';

function read() { var f = {}; FILES.forEach(function (p) { f[p] = fs.readFileSync(path.join(root, p), 'utf8'); }); return f; }
function sub(text, from, to) { if (text.indexOf(from) < 0) throw new Error('patch target not found: ' + from.slice(0, 50)); return text.split(from).join(to); }
function build(files, meta) {
  var r = SP.compile({ files: files, entry: ENTRY, meta: meta });
  if (!r.ok || r.diagnostics.length) throw new Error('compile problems: ' + JSON.stringify(r.diagnostics));
  return r.seed;
}
function out(name, text) { fs.writeFileSync(path.join(root, 'phone/build', name), text); console.log('wrote phone/build/' + name + ' (' + text.length + ' bytes)'); }

var base = read();
var seed100 = build(base, {});
out('samara-demo.seed', SP.serialize(seed100));

// 1.1.0: visible change + a declarative state migration + notes
var f110 = Object.assign({}, base);
f110[ENTRY] = sub(base[ENTRY], 'thenplace "Welcome to Samara OS" placeto (inbox)', 'thenplace "Welcome to Samara OS 1.1 - updated over the air" placeto (inbox)');
f110[ENTRY] = sub(f110[ENTRY], 'sys.app (rings) name="Rings"', 'sys.app (rings) name="Rings & updates"');
f110[ENTRY] = sub(f110[ENTRY], 'sys.meta id="samara"', 'sys.migrate (1.0.0) op=default key=kv.rings:updated-from value="1.0.0"\nsys.meta id="samara"');
var meta110 = { version: '1.1.0', build: 110, notes: 'Home greets you with "updated over the air". Rings menu label mentions updates. State migration 1.0.0 -> 1.1.0 records where you came from.' };
var seed110 = build(f110, meta110), text110 = SP.serialize(seed110, false);
out('samara-demo-1.1.0.seed', text110);

// 1.2.0-beta.1: on top of 1.1.0
var f120 = Object.assign({}, f110);
f120[ENTRY] = sub(f110[ENTRY], 'sys.app (leaf)  name="Leaf"', 'sys.app (leaf)  name="Leaf (beta)"');
var meta120 = { version: '1.2.0-beta.1', build: 120, channel: 'beta', notes: 'Beta channel preview: the Leaf app is labelled (beta). Only phones on the Beta or Dev channel see this.' };
var seed120 = build(f120, meta120), text120 = SP.serialize(seed120, false);
out('samara-demo-1.2.0-beta.1.seed', text120);

var feed = null;
feed = SU.addRelease(feed, SU.makeRelease(seed110, text110, { url: 'samara-demo-1.1.0.seed', previous: seed100 }), { id: 'samara' });
feed = SU.addRelease(feed, SU.makeRelease(seed120, text120, { url: 'samara-demo-1.2.0-beta.1.seed', previous: seed110 }), { id: 'samara' });
out('feed.json', JSON.stringify(feed, null, 2) + '\n');
