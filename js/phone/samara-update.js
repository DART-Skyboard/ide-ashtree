// ============================================================
//  samara-update.js — Samara OS versioning + OTA update framework
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Pure JS (no DOM, no globals besides the export). Everything that touches the world is injected:
//    storage  {getItem,setItem,removeItem}      (localStorage in the browser, a Map-backed fake in node)
//    fetch    (url) -> Promise<{ok,status,text()[,body]}>
//    now      () -> ms                          (the phone's clock; the simulator can skew it)
//    seedpress                                  (js/phone/seedpress.js: parse/verify/serialize/sha256)
//  Design + file formats: docs/samara/UPDATES.md.
//
//  SamaraUpdate.parseVersion / compareVersions / checkCompat / parseFeed / pickRelease / verifyPayload
//  SamaraUpdate.makeRelease / addRelease / diffSeeds                       (build side: Grove, tools)
//  SamaraUpdate.registerMigration(fromVer, fn) / runMigrations(...)        (state migration)
//  SamaraUpdate.create(opts) -> updater   (check/download/apply/rollback state machine with A/B slots)
// ============================================================
(function (global) {
  'use strict';
  var FEED_FORMAT = 1;
  var CHANNELS = ['stable', 'beta', 'dev'];           // ordered most -> least stable
  var HISTORY_MAX = 40, RELEASES_MAX = 200, MAX_BOOT_ATTEMPTS = 2;

  // ---------- versions (semver subset: MAJOR.MINOR.PATCH[-prerelease]) ----------
  var SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?$/;
  function parseVersion(v) {
    if (typeof v !== 'string') return null;
    var m = SEMVER.exec(v.trim());
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [], raw: v.trim() };
  }
  function cmpNum(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function cmpPre(a, b) {                         // a prerelease sorts BEFORE the plain release
    if (!a.length && !b.length) return 0;
    if (!a.length) return 1;
    if (!b.length) return -1;
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === undefined) return -1;
      if (b[i] === undefined) return 1;
      var an = /^\d+$/.test(a[i]), bn = /^\d+$/.test(b[i]), c;
      if (an && bn) c = cmpNum(+a[i], +b[i]);
      else if (an) c = -1; else if (bn) c = 1;
      else c = a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0;
      if (c) return c;
    }
    return 0;
  }
  function compareVersions(a, b) {
    var x = parseVersion(a), y = parseVersion(b);
    if (!x || !y) throw new TypeError('invalid version: ' + (!x ? a : b));
    return cmpNum(x.major, y.major) || cmpNum(x.minor, y.minor) || cmpNum(x.patch, y.patch) || cmpPre(x.pre, y.pre);
  }
  function isVersion(v) { return !!parseVersion(v); }
  function bumpPatch(v) { var p = parseVersion(v); return p ? p.major + '.' + p.minor + '.' + (p.patch + 1) : '0.0.1'; }

  // ---------- compatibility ----------
  // env = { kernel:'1.1.0', schema:1 }   manifest = release or seed.meta (minKernel, minSchema, schema)
  function checkCompat(m, env) {
    var reasons = [];
    env = env || {}; m = m || {};
    if (m.minKernel !== undefined && env.kernel && isVersion(String(m.minKernel)) && compareVersions(env.kernel, String(m.minKernel)) < 0)
      reasons.push('needs Samara kernel ' + m.minKernel + ' or newer (this phone runs ' + env.kernel + ')');
    if (m.minSchema !== undefined && env.schema !== undefined && +m.minSchema > env.schema)
      reasons.push('needs Ash OS schema ' + m.minSchema + ' (this kernel speaks schema ' + env.schema + ')');
    if (m.schema !== undefined && env.schema !== undefined && +m.schema > env.schema)
      reasons.push('was built for Ash OS schema ' + m.schema + ', newer than this kernel (' + env.schema + ')');
    return { ok: reasons.length === 0, reasons: reasons };
  }

  // ---------- small helpers ----------
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function byteLen(s) {
    var n = 0, c;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n++; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function resolveUrl(u, base) {
    u = String(u);
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;                 // absolute (https:, sim:)
    if (!base) return u;
    try { return new URL(u, base).href; } catch (e) { /* relative base (node / file) */ }
    var dir = String(base).replace(/[#?].*$/, '').replace(/[^\/]*$/, '');
    return dir + u.replace(/^\.\//, '');
  }
  function seedpressOf(o) { return (o && o.seedpress) || global.Seedpress || (typeof require === 'function' ? (function () { try { return require('./seedpress.js'); } catch (e) { return null; } })() : null); }
  function channelsFor(ch) { var i = CHANNELS.indexOf(ch); return CHANNELS.slice(0, i < 0 ? 1 : i + 1); }   // beta users also see stable

  // ---------- feed ----------
  // { format:1, product:'samara-os', id:'samara', generated:ISO,
  //   channels:{ stable:[release...], beta:[...], dev:[...] } }
  // release = { version, build, url, sha256, size, minKernel?, minSchema?, schema?, id?, name?, notes?, createdAt?, delta?, signature? }
  function parseFeed(input, baseUrl) {
    var errors = [], warnings = [], feed = input;
    if (typeof input === 'string') {
      try { feed = JSON.parse(input.replace(/^﻿/, '')); } catch (e) { return { ok: false, feed: null, errors: ['feed is not valid JSON: ' + e.message], warnings: warnings }; }
    }
    if (!isObj(feed)) return { ok: false, feed: null, errors: ['feed must be a JSON object'], warnings: warnings };
    if (feed.format !== FEED_FORMAT) return { ok: false, feed: null, errors: ['unsupported feed format ' + feed.format + ' (expected ' + FEED_FORMAT + ')'], warnings: warnings };
    if (!isObj(feed.channels)) return { ok: false, feed: null, errors: ['feed.channels is missing'], warnings: warnings };
    var out = { format: FEED_FORMAT, product: feed.product || null, id: feed.id || null, generated: feed.generated || null, channels: {} }, total = 0;
    CHANNELS.forEach(function (ch) {
      out.channels[ch] = [];
      var list = feed.channels[ch];
      if (list === undefined) return;
      if (!Array.isArray(list)) { warnings.push('channel ' + ch + ' is not a list; ignored'); return; }
      list.forEach(function (r, i) {
        var where = ch + '[' + i + ']';
        if (++total > RELEASES_MAX) { if (total === RELEASES_MAX + 1) warnings.push('more than ' + RELEASES_MAX + ' releases; extras ignored'); return; }
        if (!isObj(r)) { warnings.push(where + ': not an object; skipped'); return; }
        if (!isVersion(r.version)) { warnings.push(where + ": bad version '" + r.version + "'; skipped"); return; }
        if (typeof r.url !== 'string' || !r.url) { warnings.push(where + ' (' + r.version + '): missing url; skipped'); return; }
        if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(r.sha256)) { warnings.push(where + ' (' + r.version + '): sha256 must be 64 hex chars; skipped'); return; }
        var rel = {
          version: r.version, build: r.build === undefined ? 0 : +r.build || 0, channel: ch, url: resolveUrl(r.url, baseUrl), sha256: r.sha256.toLowerCase(),
          size: r.size === undefined ? null : +r.size, minKernel: r.minKernel === undefined ? undefined : String(r.minKernel),
          minSchema: r.minSchema === undefined ? undefined : +r.minSchema, schema: r.schema === undefined ? undefined : +r.schema,
          id: r.id === undefined ? undefined : String(r.id), name: r.name === undefined ? undefined : String(r.name),
          notes: Array.isArray(r.notes) ? r.notes.map(String).join('\n') : (r.notes === undefined ? '' : String(r.notes)),
          createdAt: r.createdAt || null, delta: Array.isArray(r.delta) ? r.delta.slice(0, 200) : undefined, signature: r.signature === undefined ? null : r.signature
        };
        out.channels[ch].push(rel);
      });
    });
    if (!total) errors.push('feed lists no releases');
    return { ok: errors.length === 0, feed: out, errors: errors, warnings: warnings };
  }

  // current = {version, build, id}; opts = { channel, env, blocked:[versions], id }
  // -> { status:'uptodate'|'available'|'incompatible', release?, reasons:[], newer:[releases] }
  function pickRelease(feed, current, opts) {
    opts = opts || {};
    var all = [];
    channelsFor(opts.channel || 'stable').forEach(function (ch) { ((feed.channels || {})[ch] || []).forEach(function (r) { all.push(r); }); });
    var blocked = opts.blocked || [];
    var newer = all.filter(function (r) {
      if (opts.id && r.id && r.id !== opts.id) return false;                       // never cross OS lineages
      if (feed.id && opts.id && feed.id !== opts.id) return false;
      if (!opts.ignoreBlocked && blocked.indexOf(r.version) >= 0) return false;
      var c = compareVersions(r.version, current.version);
      return c > 0 || (c === 0 && (r.build || 0) > (current.build || 0));
    });
    newer.sort(function (a, b) { return compareVersions(b.version, a.version) || (b.build || 0) - (a.build || 0); });
    if (!newer.length) return { status: 'uptodate', reasons: [], newer: [] };
    var firstReasons = null, i, c;
    for (i = 0; i < newer.length; i++) {
      c = checkCompat(newer[i], opts.env);
      if (c.ok) return { status: 'available', release: newer[i], reasons: [], newer: newer };
      if (!firstReasons) firstReasons = c.reasons;
    }
    return { status: 'incompatible', release: newer[0], reasons: firstReasons || [], newer: newer };
  }

  // ---------- verify a downloaded payload ----------
  // opts: { env, current:{version,build,id}, seedpress, verifySignature(release, seed, text)->bool, requireSignature }
  function verifyPayload(text, release, opts) {
    opts = opts || {};
    var SP = seedpressOf(opts), errors = [];
    function fail(m) { errors.push(m); return { ok: false, seed: null, errors: errors }; }
    if (!SP) return fail('Seedpress is not available to verify the download');
    if (typeof text !== 'string' || !text.length) return fail('download is empty');
    if (release.size != null && isFinite(release.size) && byteLen(text) !== release.size) return fail('size mismatch: feed says ' + release.size + ' bytes, got ' + byteLen(text) + ' (truncated or altered download)');
    var p = SP.parse(text);
    if (!p.ok) return fail(p.error);
    var seed = p.seed, v = SP.verify(seed);
    if (!v.ok) return fail('integrity check failed: ' + v.errors.join('; '));
    if (String(seed.sha256).toLowerCase() !== String(release.sha256).toLowerCase()) return fail('sha256 does not match the feed (feed ' + String(release.sha256).slice(0, 12) + '…, file ' + String(seed.sha256).slice(0, 12) + '…)');
    var meta = seed.meta || {}, ver = meta.version || (seed.os && seed.os.version);
    if (ver !== release.version) return fail("version mismatch: feed says " + release.version + ", seed says " + ver);
    if (opts.current && opts.current.id && meta.id && meta.id !== opts.current.id) return fail("seed belongs to a different OS ('" + meta.id + "', this phone runs '" + opts.current.id + "')");
    if (opts.current && opts.current.version && compareVersions(ver, opts.current.version) < 0) return fail('refusing to downgrade from ' + opts.current.version + ' to ' + ver);
    var c = checkCompat(meta, opts.env); if (!c.ok) return fail('not compatible: ' + c.reasons.join('; '));
    c = checkCompat(release, opts.env); if (!c.ok) return fail('not compatible: ' + c.reasons.join('; '));
    var note = null;
    if (release.signature) {
      if (typeof opts.verifySignature === 'function') { var okSig = false; try { okSig = !!opts.verifySignature(release, seed, text); } catch (e) { okSig = false; } if (!okSig) return fail('signature check failed'); }
      else if (opts.requireSignature) return fail('release is signed but this phone has no signature verifier');
      else note = 'signature present but not checked (verifier not configured)';
    } else if (opts.requireSignature) return fail('release is not signed');
    return { ok: true, seed: seed, errors: [], note: note };
  }

  // ---------- build side: release manifests, feeds, deltas ----------
  function diffSeeds(a, b) {
    var out = [], pa = (a && a.sources) || {}, pb = (b && b.sources) || {};
    Object.keys(pb).sort().forEach(function (p) {
      if (pa[p] === undefined) out.push({ path: p, change: 'added' });
      else if (pa[p] !== pb[p]) out.push({ path: p, change: 'modified' });
    });
    Object.keys(pa).sort().forEach(function (p) { if (pb[p] === undefined) out.push({ path: p, change: 'removed' }); });
    return out;
  }
  // seed + its serialized text (for size) -> release record ready for a feed.   opts: {url, previous (seed), notes}
  function makeRelease(seed, text, opts) {
    opts = opts || {};
    var m = seed.meta || {}, rel = {
      version: m.version || (seed.os && seed.os.version), build: m.build || 0, channel: m.channel || 'stable', id: m.id || undefined,
      name: m.name || (seed.os && seed.os.name), url: opts.url || '', sha256: seed.sha256, size: byteLen(text),
      minKernel: m.minKernel, minSchema: m.minSchema, schema: m.schema, notes: opts.notes !== undefined ? opts.notes : (m.notes || ''),
      createdAt: seed.built || null, signature: null
    };
    if (opts.previous) rel.delta = diffSeeds(opts.previous, seed);
    Object.keys(rel).forEach(function (k) { if (rel[k] === undefined) delete rel[k]; });
    return rel;
  }
  // returns a NEW feed object with `rel` added (replacing the same version in that channel), newest first
  function addRelease(feed, rel, opts) {
    opts = opts || {};
    var f = feed && feed.format === FEED_FORMAT ? clone(feed) : { format: FEED_FORMAT, channels: {} };
    f.product = f.product || opts.product || 'samara-os';
    if (opts.id || rel.id) f.id = f.id || opts.id || rel.id;
    f.generated = opts.generated || new Date().toISOString();
    CHANNELS.forEach(function (c) { f.channels[c] = f.channels[c] || []; });
    var ch = rel.channel || 'stable', r = clone(rel); delete r.channel;
    f.channels[ch] = f.channels[ch].filter(function (x) { return x.version !== rel.version; });
    f.channels[ch].push(r);
    f.channels[ch].sort(function (a, b) { return compareVersions(b.version, a.version) || (b.build || 0) - (a.build || 0); });
    f.channels[ch] = f.channels[ch].slice(0, opts.keep || 10);
    return f;
  }

  // ---------- state migrations ----------
  // State handed to migrations is a plain JSON object { settings:{...}, kv:{...} } owned by the kernel/persistence layer.
  // A migration registered with registerMigration(fromVer, fn) upgrades state that was WRITTEN BY VERSION <= fromVer.
  // runMigrations applies every migration m with  stateVer <= m.from < targetVer,  in ascending `from` order.
  var registry = [];
  function registerMigration(fromVer, fn, label) {
    if (!isVersion(fromVer)) throw new TypeError('registerMigration: bad version ' + fromVer);
    if (typeof fn !== 'function') throw new TypeError('registerMigration: fn must be a function');
    var m = { from: fromVer, fn: fn, label: label || ('js@' + fromVer), kind: 'js', seq: registry.length };
    registry.push(m);
    return function unregister() { var i = registry.indexOf(m); if (i >= 0) registry.splice(i, 1); };
  }
  function clearMigrations() { registry.length = 0; }
  function splitKey(k) { k = String(k); var m = /^(settings|kv)\.(.+)$/.exec(k); return m ? { ns: m[1], key: m[2] } : { ns: 'settings', key: k }; }
  function applyDecl(state, d) {
    var a = splitKey(d.key), box = (state[a.ns] = state[a.ns] || {});
    if (d.op === 'rename') { var b = splitKey(d.to), box2 = (state[b.ns] = state[b.ns] || {}); if (box[a.key] !== undefined) { box2[b.key] = box[a.key]; delete box[a.key]; } }
    else if (d.op === 'set') box[a.key] = d.value;
    else if (d.op === 'default') { if (box[a.key] === undefined) box[a.key] = d.value; }
    else if (d.op === 'delete') delete box[a.key];
    else throw new Error('unknown migration op ' + d.op);
  }
  // extra = declarative list from seed.meta.migrations: [{from,op,key,to?,value?}]
  function runMigrations(state, fromVer, toVer, extra) {
    var res = { ok: true, state: state, applied: [], error: null, skipped: null };
    if (!isVersion(fromVer) || !isVersion(toVer)) { res.skipped = 'unknown version'; return res; }
    if (compareVersions(fromVer, toVer) >= 0) { res.skipped = compareVersions(fromVer, toVer) > 0 ? 'downgrade' : 'same version'; return res; }
    var list = registry.map(function (m) { return m; });
    (extra || []).forEach(function (d, i) { if (d && isVersion(d.from)) list.push({ from: d.from, decl: d, kind: 'decl', label: d.op + ' ' + d.key + (d.to ? ' -> ' + d.to : ''), seq: 1000 + i }); });
    list = list.filter(function (m) { return compareVersions(fromVer, m.from) <= 0 && compareVersions(m.from, toVer) < 0; })
      .sort(function (a, b) { return compareVersions(a.from, b.from) || a.seq - b.seq; });
    var work = clone(state) || {};
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      try {
        if (m.kind === 'decl') applyDecl(work, m.decl);
        else { var r = m.fn(work, { from: fromVer, to: toVer }); if (r !== undefined && isObj(r)) work = r; }
        res.applied.push({ from: m.from, kind: m.kind, label: m.label });
      } catch (e) {
        return { ok: false, state: state, applied: res.applied, error: 'migration ' + m.label + ' failed: ' + (e && e.message || e), skipped: null };   // all-or-nothing: caller keeps the old state
      }
    }
    res.state = work;
    return res;
  }

  // ======================================================================
  // updater: the state machine.  Storage layout (all under opts.namespace):
  //   state            JSON of the machine below
  //   slot:A, slot:B   compact seed JSON text of a downloaded OS image
  //   (the factory image `base` is never written: it is the seed the host booted from)
  // ======================================================================
  function create(opts) {
    opts = opts || {};
    var SP = seedpressOf(opts);
    var ns = opts.namespace || 'samara:upd:';
    var store = opts.storage || null, mem = {};
    var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    var nowFn = opts.now || function () { return Date.now(); };
    var env = opts.env || { kernel: '1.0.0', schema: 1 };
    var base = opts.base || null;                                 // factory seed (object)
    var U = {}, listeners = [];
    var ephemeral = { phase: 'idle', progress: 0, error: null, detail: '', fault: null };
    var local = null;                                              // {feed, payloads} for offline / simulated feeds

    function sget(k) { try { if (store) { var v = store.getItem(ns + k); if (v != null) return v; } } catch (e) { /* memory fallback */ } return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
    function sset(k, v) {
      mem[k] = v;
      try { if (store) store.setItem(ns + k, v); } catch (e) { delete mem[k]; throw e; }
    }
    function sdel(k) { delete mem[k]; try { if (store) store.removeItem(ns + k); } catch (e) { /* ignore */ } }

    var def = { v: 1, active: 'base', previous: null, staged: null, pendingApply: false, trial: null, channel: 'stable',
      auto: { enabled: false, schedule: 'wifi' }, available: null, lastCheck: null, lastAuto: null, blocked: [], history: [], just: null, slots: { A: null, B: null } };
    var st;
    function load() {
      var raw = sget('state'); st = clone(def);
      if (raw) { try { var o = JSON.parse(raw); if (isObj(o) && o.v === 1) Object.keys(def).forEach(function (k) { if (o[k] !== undefined) st[k] = o[k]; }); } catch (e) { /* corrupt state: start clean, keep slots unreferenced */ } }
      if (!isObj(st.slots)) st.slots = { A: null, B: null };
    }
    function save() { sset('state', JSON.stringify(st)); }
    function emit(evt) { listeners.slice().forEach(function (f) { try { f(evt || { type: 'change' }, U); } catch (e) { /* ignore */ } }); }
    function hist(event, detail, version) {
      st.history.unshift({ t: nowFn(), event: event, version: version || null, detail: detail || '' });
      if (st.history.length > HISTORY_MAX) st.history.length = HISTORY_MAX;
    }
    function trySave() { try { save(); return true; } catch (e) { ephemeral.error = 'Could not write system storage (' + (e && e.name || 'error') + '). Free some space and retry.'; return false; } }
    function phase(p, progress, detail) { ephemeral.phase = p; if (progress !== undefined) ephemeral.progress = progress; ephemeral.detail = detail || ''; emit({ type: 'phase', phase: p }); }
    function fail(msg, evt) { ephemeral.error = msg; ephemeral.phase = 'error'; ephemeral.progress = 0; hist(evt || 'error', msg); trySave(); emit({ type: 'error', error: msg }); return { ok: false, error: msg }; }
    function baseInfo() { var m = (base && base.meta) || {}; return { version: m.version || (base && base.os && base.os.version) || '0.0.0', build: m.build || 0, channel: m.channel || 'stable', id: m.id || null, sha256: base && base.sha256 }; }
    function seedInfo(seed) { var m = (seed && seed.meta) || {}; return { version: m.version || (seed && seed.os && seed.os.version) || '0.0.0', build: m.build || 0, channel: m.channel || 'stable', id: m.id || null, sha256: seed && seed.sha256 }; }
    function readSlot(name) {
      if (name === 'base') return base;
      var raw = sget('slot:' + name); if (!raw) return null;
      var p = SP && SP.parse(raw); if (!p || !p.ok) return null;
      var v = SP.verify(p.seed); return v.ok ? p.seed : null;
    }
    function activeSeed() { return readSlot(st.active); }
    function nameOf(slot) { return slot === 'base' ? 'factory image' : 'slot ' + slot; }

    // ---- public: state / info ----
    U.getState = function () {
      var cur = U.current();
      return { current: cur, active: st.active, previous: st.previous, previousInfo: previousInfo(), staged: st.staged ? clone(st.staged) : null, pendingApply: st.pendingApply,
        trial: clone(st.trial), channel: st.channel, auto: clone(st.auto), available: st.available ? clone(st.available) : null, lastCheck: clone(st.lastCheck),
        lastAuto: clone(st.lastAuto), blocked: st.blocked.slice(), history: clone(st.history), just: clone(st.just), slots: clone(st.slots),
        phase: ephemeral.phase, progress: ephemeral.progress, error: ephemeral.error, detail: ephemeral.detail, local: !!local, fault: ephemeral.fault, env: clone(env) };
    };
    function previousInfo() {
      if (!st.previous) return null;
      if (st.previous === 'base') return Object.assign({ slot: 'base' }, baseInfo());
      var s = st.slots[st.previous]; return s ? Object.assign({ slot: st.previous }, s) : null;
    }
    U.current = function () {
      var s = st.active === 'base' ? base : readSlot(st.active);
      return Object.assign({ source: st.active }, seedInfo(s || base));
    };
    U.on = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
    U.history = function () { return clone(st.history); };

    // ---- settings ----
    U.setChannel = function (ch) {
      if (CHANNELS.indexOf(ch) < 0) return false;
      st.channel = ch; st.available = null; trySave(); emit(); return true;
    };
    U.setAuto = function (o) {
      if (o.enabled !== undefined) st.auto.enabled = !!o.enabled;
      if (o.schedule !== undefined && ['wifi', 'nightly'].indexOf(o.schedule) >= 0) st.auto.schedule = o.schedule;
      trySave(); emit(); return clone(st.auto);
    };
    U.setFault = function (f) { ephemeral.fault = f || null; emit(); };
    U.useLocalFeed = function (feed, payloads) { local = feed ? { feed: feed, payloads: payloads || {} } : null; st.available = null; emit(); };
    U.setBase = function (seed) { base = seed; };
    U.setEnv = function (e) { env = e; };

    // ---- feed ----
    function feedUrl() { var u = typeof opts.feedUrl === 'function' ? opts.feedUrl() : opts.feedUrl; return u ? String(u) : ''; }
    function withTimeout(p, ms, what) {
      return new Promise(function (res, rej) {
        var t = setTimeout(function () { rej(new Error(what + ' timed out')); }, ms);
        Promise.resolve(p).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
      });
    }
    function getText(url, what, onProgress) {
      if (local && Object.prototype.hasOwnProperty.call(local.payloads, url)) return Promise.resolve(local.payloads[url]);
      if (ephemeral.fault === 'net') return Promise.reject(new Error('Simulated network failure'));
      if (!fetchFn) return Promise.reject(new Error('no network available'));
      return withTimeout(fetchFn(url), opts.timeoutMs || 20000, what).then(function (r) {
        if (r && r.ok === false) throw new Error('HTTP ' + r.status + ' for ' + what);
        if (onProgress && r && r.body && typeof r.body.getReader === 'function') {
          var total = +(r.headers && r.headers.get && r.headers.get('content-length')) || 0, got = 0, chunks = [], rd = r.body.getReader(), dec = new TextDecoder();
          return (function pump() {
            return rd.read().then(function (x) {
              if (x.done) { chunks.push(dec.decode()); return chunks.join(''); }
              got += x.value.length; chunks.push(dec.decode(x.value, { stream: true }));
              if (total) onProgress(Math.min(1, got / total)); return pump();
            });
          })();
        }
        return r && typeof r.text === 'function' ? r.text() : String(r);
      });
    }
    function describeNetErr(e, url) {
      var m = e && e.message ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed|fetch failed|network request failed|simulated network/i.test(m)) return "Couldn't reach the update server. Check your connection (or CORS if the feed is on another site). Your phone was not changed.";
      return m + '. Your phone was not changed.';
    }

    U.check = function (o) {
      o = o || {};
      if (ephemeral.phase === 'checking' || ephemeral.phase === 'downloading') return Promise.resolve({ ok: false, error: 'busy' });
      ephemeral.error = null;
      var url = feedUrl(), cur = U.current();
      phase('checking', 0, url || '(local feed)');
      var p = local ? Promise.resolve(JSON.stringify(local.feed)) : (url ? getText(url, 'update feed') : Promise.reject(new Error('No update feed is configured for this OS')));
      return p.then(function (text) {
        var pf = parseFeed(text, url || 'sim://local/');
        if (!pf.ok) throw new Error('The update feed is damaged or unsupported (' + pf.errors[0] + '). Nothing was changed.');
        var pick = pickRelease(pf.feed, cur, { channel: st.channel, env: env, blocked: st.blocked, id: cur.id, ignoreBlocked: !!o.ignoreBlocked });
        var rec = { t: nowFn(), status: pick.status, version: pick.release ? pick.release.version : null, reasons: pick.reasons, warnings: pf.warnings.slice(0, 5), auto: !!o.auto };
        st.lastCheck = rec;
        if (pick.status === 'available') {
          var already = st.staged && st.staged.release && st.staged.release.version === pick.release.version;
          st.available = { release: pick.release };
          hist('check', 'update ' + pick.release.version + ' available', pick.release.version);
          if (!already) st.staged = st.staged && compareVersions(st.staged.release.version, pick.release.version) >= 0 ? st.staged : null;
        } else { st.available = null; hist('check', pick.status === 'uptodate' ? 'up to date' : 'incompatible: ' + pick.reasons.join('; '), cur.version); }
        trySave(); phase('idle', 0, '');
        return { ok: true, status: pick.status, release: pick.release || null, reasons: pick.reasons, warnings: pf.warnings };
      }).then(function (r) { emit({ type: 'checked', result: r }); return r; }, function (e) {
        var msg = describeNetErr(e);
        st.lastCheck = { t: nowFn(), status: 'error', error: msg, auto: !!o.auto }; trySave();
        var r = fail(msg, 'check-failed'); r.status = 'error'; return r;
      });
    };

    // ---- download + verify + stage ----
    function pickSlot() {
      var c = ['A', 'B'].filter(function (s) { return s !== st.active; });
      var free = c.filter(function (s) { return !st.slots[s] && s !== st.previous; })[0];
      return free || c.filter(function (s) { return s !== st.previous; })[0] || c[0];
    }
    U.download = function (o) {
      o = o || {};
      var rel = (st.available && st.available.release) || null;
      if (!rel) return Promise.resolve(fail('No update is available to download. Check for updates first.', 'download-failed'));
      if (ephemeral.phase === 'downloading') return Promise.resolve({ ok: false, error: 'busy' });
      ephemeral.error = null; var cur = U.current();
      phase('downloading', 0, rel.version);
      return getText(rel.url, 'update ' + rel.version, function (f) { ephemeral.progress = 0.05 + f * 0.8; emit({ type: 'progress' }); }).then(function (text) {
        if (ephemeral.fault === 'hash') { text = text.replace(/"sha256": ?"[0-9a-f]{8}/, function (m) { return m.slice(0, -8) + 'deadbeef'; }); ephemeral.fault = null; }
        phase('verifying', 0.9, rel.version);
        var v = verifyPayload(text, rel, { env: env, current: cur, seedpress: SP, verifySignature: opts.verifySignature, requireSignature: opts.requireSignature });
        if (!v.ok) { st.available = st.available; return fail('The downloaded update failed verification: ' + v.errors[0] + '. It was discarded; nothing was installed.', 'verify-failed'); }
        var slot = pickSlot(), compact = SP.serialize(v.seed, false);
        phase('staging', 0.95, rel.version);
        try { sset('slot:' + slot, compact); }
        catch (e) { return fail('Not enough storage to stage the update (' + Math.round(compact.length / 1024) + ' KB needed). Nothing was installed.', 'stage-failed'); }
        if (st.previous === slot) st.previous = st.active === 'base' ? null : 'base';     // staging overwrites the rollback slot; the factory image stays the fallback
        st.slots[slot] = { version: rel.version, build: rel.build, channel: rel.channel, sha256: rel.sha256, size: byteLen(compact), staged: nowFn() };
        st.staged = { slot: slot, release: rel };
        if (!trySave()) { sdel('slot:' + slot); st.slots[slot] = null; st.staged = null; return fail(ephemeral.error, 'stage-failed'); }
        hist('staged', 'update ' + rel.version + ' verified and staged in ' + nameOf(slot), rel.version);
        phase('staged', 1, rel.version); trySave();
        var r = { ok: true, staged: true, version: rel.version, slot: slot, note: v.note || null };
        emit({ type: 'staged', release: rel, auto: !!o.auto }); return r;
      }).catch(function (e) { return fail(describeNetErr(e), 'download-failed'); });
    };

    // ---- apply (switch active slot).  Caller reboots into result.seed ----
    function promote(why) {
      var s = st.staged; if (!s) return { ok: false, error: 'No staged update' };
      var seed = readSlot(s.slot);
      if (!seed) { st.staged = null; st.slots[s.slot] = null; sdel('slot:' + s.slot); hist('apply-failed', 'staged image missing or damaged; discarded'); trySave(); return { ok: false, error: 'The staged update is missing or damaged and was discarded. Download it again.' }; }
      var from = U.current();
      st.previous = st.active; st.active = s.slot; st.staged = null; st.available = null; st.pendingApply = false;
      st.trial = { slot: s.slot, from: from.version, attempts: 0 };
      st.just = { from: from.version, to: s.release.version, notes: s.release.notes || '', rolledBack: false, t: nowFn() };
      st.blocked = st.blocked.filter(function (v) { return v !== s.release.version; });
      hist('applied', why + ': ' + from.version + ' -> ' + s.release.version, s.release.version);
      trySave(); ephemeral.phase = 'idle'; ephemeral.progress = 0; emit({ type: 'applied' });
      return { ok: true, seed: seed, version: s.release.version, from: from.version };
    }
    U.apply = function () { return promote('user installed'); };
    U.scheduleApply = function () { if (!st.staged) return false; st.pendingApply = true; trySave(); emit(); return true; };

    // ---- rollback to the previous image ----
    U.canRollback = function () { return !!previousInfo(); };
    U.rollback = function (why) {
      if (!st.previous) return { ok: false, error: 'There is no previous version to roll back to.' };
      var target = readSlot(st.previous);
      if (!target) { st.previous = null; trySave(); return { ok: false, error: 'The previous image is missing or damaged.' }; }
      var left = U.current(), leftSlot = st.active;
      st.active = st.previous; st.previous = null; st.trial = null; st.pendingApply = false;
      if (st.blocked.indexOf(left.version) < 0) st.blocked.push(left.version);
      if (leftSlot !== 'base') { st.slots[leftSlot] = null; sdel('slot:' + leftSlot); }
      var to = seedInfo(target);
      st.just = { from: left.version, to: to.version, notes: '', rolledBack: true, reason: why || 'user', t: nowFn() };
      hist('rolled-back', (why || 'user') + ': ' + left.version + ' -> ' + to.version, to.version);
      trySave(); emit({ type: 'rolledback' });
      return { ok: true, seed: target, version: to.version, from: left.version };
    };

    // ---- boot ----
    // Host calls this before creating the kernel.  Returns { seed, source, version, rolledBack, notice }.
    U.selectBootSeed = function () {
      var notice = null, rolledBack = false;
      if (st.trial && st.trial.attempts >= MAX_BOOT_ATTEMPTS) {
        var rb = U.rollback('automatic: ' + st.trial.attempts + ' unsuccessful boots');
        if (rb.ok) { rolledBack = true; notice = 'The new version did not start; Samara OS went back to ' + rb.version + '.'; }
        else { st.trial = null; trySave(); }
      } else if (st.staged && (st.pendingApply || st.auto.enabled)) {
        var pr = promote(st.pendingApply ? 'install on restart' : 'automatic update'); if (pr.ok) notice = 'Installed Samara OS ' + pr.version + '.';
      }
      var seed = activeSeed();
      if (!seed) {                                                 // corrupt active slot: fall back to factory
        hist('boot-fallback', st.active + ' unreadable; using factory image'); st.active = 'base'; st.previous = null; st.trial = null; trySave(); seed = base;
        notice = 'The installed system image was damaged; restored the factory image.'; rolledBack = true;
      }
      if (st.trial) { st.trial.attempts++; trySave(); }
      var info = seedInfo(seed);
      return { seed: seed, source: st.active, version: info.version, rolledBack: rolledBack, notice: notice };
    };
    U.markBootGood = function () { if (st.trial) { hist('boot-ok', 'boot confirmed on ' + U.current().version); st.trial = null; trySave(); emit(); } };
    U.takeJust = function () { var j = st.just; if (j) { st.just = null; trySave(); } return j; };
    U.peekJust = function () { return clone(st.just); };
    U.reset = function () {
      ['A', 'B'].forEach(function (s) { sdel('slot:' + s); }); sdel('state'); load(); ephemeral.phase = 'idle'; ephemeral.error = null; emit({ type: 'reset' });
    };

    // ---- primary action: what the one big button does in the current state ----
    U.primary = function () {
      if (ephemeral.phase === 'checking' || ephemeral.phase === 'downloading') return Promise.resolve({ ok: false, error: 'busy' });
      if (st.staged) { var r = U.apply(); return Promise.resolve(r); }
      if (st.available) return U.download();
      return U.check();
    };
    U.primaryLabel = function () {
      if (ephemeral.phase === 'checking') return 'Checking…';
      if (ephemeral.phase === 'downloading' || ephemeral.phase === 'verifying' || ephemeral.phase === 'staging') return 'Downloading…';
      if (st.staged) return 'Install & restart';
      if (st.available) { var r = st.available.release; return 'Download ' + r.version + (r.size ? ' (' + Math.max(1, Math.round(r.size / 1024)) + ' KB)' : ''); }
      return 'Check for updates';
    };

    // ---- automatic updates (schedule is driven by the phone's clock) ----
    function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    U.autoDue = function (nowMs) {
      nowMs = nowMs === undefined ? nowFn() : nowMs;
      if (!st.auto.enabled || ephemeral.phase !== 'idle' || st.staged) return false;
      if (opts.online && opts.online() === false) return false;
      var last = st.lastAuto && st.lastAuto.t;
      if (st.auto.schedule === 'nightly') {
        var h = new Date(nowMs).getHours();
        return h >= 2 && h < 4 && !(st.lastAuto && st.lastAuto.day === dayKey(nowMs));
      }
      return !last || nowMs - last >= (opts.autoIntervalMs || 6 * 3600 * 1000);       // 'wifi': whenever online, at most every 6 h
    };
    U.autoTick = function (nowMs) {
      nowMs = nowMs === undefined ? nowFn() : nowMs;
      if (!U.autoDue(nowMs)) return Promise.resolve({ ran: false });
      st.lastAuto = { t: nowMs, day: dayKey(nowMs) }; trySave();
      return U.check({ auto: true }).then(function (r) {
        if (r.ok && r.status === 'available') return U.download({ auto: true }).then(function (d) { return { ran: true, check: r, download: d }; });
        return { ran: true, check: r };
      });
    };

    load();
    return U;
  }

  var api = {
    FEED_FORMAT: FEED_FORMAT, CHANNELS: CHANNELS, MAX_BOOT_ATTEMPTS: MAX_BOOT_ATTEMPTS,
    parseVersion: parseVersion, compareVersions: compareVersions, isVersion: isVersion, bumpPatch: bumpPatch,
    checkCompat: checkCompat, channelsFor: channelsFor, parseFeed: parseFeed, pickRelease: pickRelease, verifyPayload: verifyPayload,
    diffSeeds: diffSeeds, makeRelease: makeRelease, addRelease: addRelease, byteLen: byteLen, resolveUrl: resolveUrl,
    registerMigration: registerMigration, clearMigrations: clearMigrations, runMigrations: runMigrations, create: create
  };
  global.SamaraUpdate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
