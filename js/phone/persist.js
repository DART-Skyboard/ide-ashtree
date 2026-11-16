// ============================================================
//  persist.js — Samara OS session persistence (pure, host-injected, runs under node)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  A *snapshot* is the whole user-visible state of the simulated phone:
//    settings (theme, wallpaper id, orientation, brightness, ...), prefs (Rings toggles), custom wallpaper
//    reference, per-app store.* data, and the session (foreground app/screen, recents, home page, lock state).
//  The kernel produces/consumes it through  kernel.exportSession() / kernel.importSession(obj).
//
//  SamaraPersist.attach({ kernel, host, seedId, project })  -> controller
//     host = { storage:{getItem,setItem,removeItem}, blobs:{get,set,del} (async, for the wallpaper image),
//              setTimeout, clearTimeout, now }                       (browserHost() builds one from the page)
//     controller.restore()        apply the saved snapshot (sync part) and return {restored, reason, promise}
//     controller.saveNow() / scheduleSave() / flush()
//     controller.factoryReset()   wipe every saved byte for this ROM and reboot the kernel to factory state
//     controller.exportBackup()   -> Promise<{ state:"<json text>", wallpaper:{ext,mime,base64}|null, path }>   (GitHub backup)
//     controller.importBackup(stateText, wallpaper) -> Promise<{ok,...}>   writes to this controller's keys (no GitHub code here)
//  Storage keys (versioned):   samara:session:v1:<ns>      ns = "seed:<sha12>" and, when a project is given, "proj:<name>"
//  The project key is a fallback so that rebuilding a ROM after editing its sources (new sha) keeps the session.
//  Formats: parse() never throws; it returns {ok:false, reason:'empty'|'corrupt'|'magic'|'version'|'newer'|'shape'}.
// ============================================================
(function (global) {
  'use strict';
  var VERSION = 1, MAGIC = 'SAMARA-SESSION', PREFIX = 'samara:session:v' + VERSION + ':';

  // ---------- pure helpers ----------
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function slug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'; }
  function nsKeys(seedId, project) {
    var k = ['seed:' + String(seedId || 'seed')];
    if (project) k.push('proj:' + slug(project));
    return k;
  }
  function storageKey(ns) { return PREFIX + ns; }
  function blobKey(ns) { return 'wallpaper:' + ns; }

  var MIGRATIONS = {};   // MIGRATIONS[n] upgrades a version-n snapshot object to n+1 (none yet; the table is the extension point)

  function validate(snap) {
    if (!isObj(snap)) return 'shape';
    if (snap.settings !== undefined && !isObj(snap.settings)) return 'shape';
    if (snap.prefs !== undefined && !isObj(snap.prefs)) return 'shape';
    if (snap.session !== undefined && !isObj(snap.session)) return 'shape';
    if (snap.store !== undefined && !isObj(snap.store)) return 'shape';
    if (snap.customWallpaper !== undefined && snap.customWallpaper !== null && !isObj(snap.customWallpaper)) return 'shape';
    return null;
  }
  function serialize(snap) { return JSON.stringify(snap); }
  function parse(text) {
    if (text === null || text === undefined || text === '') return { ok: false, reason: 'empty', message: 'no saved session' };
    var o;
    try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, reason: 'corrupt', message: 'saved session is not valid JSON' }; }
    if (!isObj(o) || o.magic !== MAGIC) return { ok: false, reason: 'magic', message: 'not a Samara session' };
    var v = o.v;
    if (typeof v !== 'number' || v < 1 || Math.floor(v) !== v) return { ok: false, reason: 'version', message: 'bad session version ' + v, version: v };
    if (v > VERSION) return { ok: false, reason: 'newer', message: 'session was saved by a newer Samara OS (v' + v + ')', version: v };
    while (v < VERSION) { var m = MIGRATIONS[v]; if (!m) return { ok: false, reason: 'version', message: 'no migration from v' + v, version: v }; o = m(o); v = o.v = v + 1; }
    var bad = validate(o);
    if (bad) return { ok: false, reason: bad, message: 'saved session has an unexpected shape' };
    return { ok: true, snapshot: o };
  }
  // assemble a snapshot from kernel.exportSession() output + envelope fields
  function build(parts) {
    parts = parts || {};
    var ex = parts.exported || {};
    return {
      magic: MAGIC, v: VERSION, seedId: parts.seedId || '', project: parts.project || null, os: parts.osVersion || '',
      savedAt: parts.savedAt || 0,
      settings: ex.settings || {}, prefs: ex.prefs || {}, session: ex.session || {}, store: ex.store || {},
      customWallpaper: ex.customWallpaper || null
    };
  }
  function dataUrlParts(u) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(u || ''));
    if (!m) return null;
    return { mime: m[1], base64: m[2] ? m[3] : null, raw: m[2] ? null : decodeURIComponent(m[3]) };
  }
  function extForMime(mime) { return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/jxl': 'jxl' }[mime] || 'img'; }
  function mimeForExt(ext) { return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', jxl: 'image/jxl' }[String(ext).toLowerCase()] || 'application/octet-stream'; }

  // ---------- in-memory host (tests, and the fallback when a page blocks storage) ----------
  function memoryHost() {
    var m = {}, b = {};
    return {
      storage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _dump: m },
      blobs: { get: function (k) { return Promise.resolve(b[k] === undefined ? null : b[k]); }, set: function (k, v) { b[k] = v; return Promise.resolve(true); }, del: function (k) { delete b[k]; return Promise.resolve(true); }, _dump: b },
      now: function () { return Date.now(); }, setTimeout: setTimeout, clearTimeout: clearTimeout
    };
  }

  // ======================================================================
  function attach(opts) {
    var K = opts.kernel, H = opts.host || memoryHost(), keys = nsKeys(opts.seedId, opts.project);
    var delay = opts.debounceMs === undefined ? 1500 : opts.debounceMs;
    var C = { keys: keys, lastSaved: 0, lastError: null, enabled: true, suspended: false };
    var timer = null, lastSig = '', imgRev = null, unsub = null;
    var st = H.setTimeout || setTimeout, ct = H.clearTimeout || clearTimeout;
    function now() { return H.now ? H.now() : Date.now(); }
    function note(text, ms) { try { if (K.toast) K.toast(text, ms); } catch (e) { /* ignore */ } }
    function lsGet(k) { try { return H.storage ? H.storage.getItem(k) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { H.storage.setItem(k, v); return true; } catch (e) { C.lastError = e && e.message ? e.message : 'storage write failed'; return false; } }
    function lsDel(k) { try { H.storage.removeItem(k); } catch (e) { /* ignore */ } }

    function snapshot() { return build({ exported: K.exportSession(), seedId: opts.seedId, project: opts.project, osVersion: K.version, savedAt: now() }); }
    function sigOf(s) { var c = Object.assign({}, s); c.savedAt = 0; return JSON.stringify(c); }

    // write the snapshot (and, when it changed, the wallpaper image) under every namespace key
    C.saveNow = function (force) {
      var st0 = K.state ? K.state() : null;
      if (C.suspended || !C.enabled || (st0 && !st0.powered)) return Promise.resolve(false);      // never persist a powered-off / half-booted kernel
      if (!force && K.getPref && K.getPref('autosave') === false) return Promise.resolve(false);   // Rings > Backup > Autosave
      var snap = snapshot(), sig = sigOf(snap), text = serialize(snap), ok = true, jobs = [];
      if (sig !== lastSig) {
        keys.forEach(function (ns) { ok = lsSet(storageKey(ns), text) && ok; });
        if (ok) { lastSig = sig; C.lastSaved = snap.savedAt; C.lastError = null; }
      }
      var cw = K.customWallpaperData ? K.customWallpaperData() : null, rev = cw ? cw.rev : null;
      if (rev !== imgRev) {
        imgRev = rev;
        keys.forEach(function (ns) {
          if (!H.blobs) return;
          jobs.push(cw ? H.blobs.set(blobKey(ns), { dataUrl: cw.dataUrl, mime: cw.mime }) : H.blobs.del(blobKey(ns)));
        });
      }
      return Promise.all(jobs).then(function () { return ok; }, function (e) { C.lastError = String(e && e.message || e); return false; });
    };
    C.scheduleSave = function () {
      if (timer || C.suspended || !C.enabled) return;
      timer = st(function () { timer = null; C.saveNow(); }, delay);
    };
    C.flush = function () { if (timer) { ct(timer); timer = null; } return C.saveNow(); };
    C.setEnabled = function (v) { C.enabled = !!v; if (C.enabled) C.scheduleSave(); };

    // restore: sync part (settings/prefs/store/session), async part (wallpaper image)
    C.restore = function () {
      var snap = null, used = null, bad = null, i;
      for (i = 0; i < keys.length && !snap; i++) {
        var raw = lsGet(storageKey(keys[i])), r = parse(raw);
        if (r.ok) { snap = r.snapshot; used = keys[i]; }
        else if (r.reason !== 'empty' && !bad) { bad = { reason: r.reason, message: r.message, raw: raw }; }
      }
      if (!snap) {
        if (bad) {   // keep the unreadable text around (it may be a newer OS's session) before autosave overwrites it
          lsSet(storageKey(keys[0]) + ':invalid', String(bad.raw).slice(0, 200000));
          note(bad.reason === 'newer' ? 'Saved session is from a newer OS; started fresh' : 'Saved session was unreadable; started fresh', 3200);
        }
        return { restored: false, reason: bad ? bad.reason : 'empty', promise: Promise.resolve(false) };
      }
      var promise = Promise.resolve(true);
      try {
        K.importSession(snap);
        lastSig = sigOf(snap);   // so an immediate autosave does not rewrite identical bytes
        if (snap.customWallpaper && snap.customWallpaper.present && H.blobs) {
          promise = H.blobs.get(blobKey(used)).then(function (img) {
            if (img && img.dataUrl) { K.setCustomWallpaper({ dataUrl: img.dataUrl, mime: img.mime || snap.customWallpaper.mime, w: snap.customWallpaper.w, h: snap.customWallpaper.h, fit: snap.customWallpaper.fit, dim: snap.customWallpaper.dim, blur: snap.customWallpaper.blur }, true); imgRev = K.customWallpaperData().rev; if (snap.settings && snap.settings.wallpaper === 'custom') K.setSetting('wallpaper', 'custom'); }
            return true;
          }, function () { return false; });
        }
        note('Restored last session', 3200);
      } catch (e) { C.lastError = e.message; return { restored: false, reason: 'error', promise: Promise.resolve(false) }; }
      return { restored: true, reason: 'ok', used: used, savedAt: snap.savedAt, promise: promise };
    };

    C.factoryReset = function () {
      C.suspended = true; if (timer) { ct(timer); timer = null; }
      keys.forEach(function (ns) { lsDel(storageKey(ns)); lsDel(storageKey(ns) + ':invalid'); if (H.blobs) H.blobs.del(blobKey(ns)); });
      lastSig = ''; imgRev = null; C.lastSaved = 0;
      try { K.factoryReset(); } finally { C.suspended = false; }
      note('Reset to factory settings', 3200);
      return true;
    };

    C.exportBackup = function () {
      var snap = snapshot(), cw = K.customWallpaperData ? K.customWallpaperData() : null, wp = null, base = 'session/';
      if (cw && snap.customWallpaper) {
        var parts = dataUrlParts(cw.dataUrl), ext = extForMime(cw.mime);
        if (parts && parts.base64) { wp = { ext: ext, mime: cw.mime, base64: parts.base64 }; snap.customWallpaper.file = 'wallpaper.' + ext; }
      }
      return Promise.resolve({ state: JSON.stringify(snap, null, 1), wallpaper: wp, statePath: base + 'state.json', wallpaperPath: wp ? base + 'wallpaper.' + wp.ext : null });
    };
    // Put a backup (state.json text + optional wallpaper {ext|mime, base64}) into this ROM's storage. apply:true also applies it live.
    C.importBackup = function (stateText, wallpaper, apply) {
      var r = parse(stateText);
      if (!r.ok) return Promise.resolve({ ok: false, reason: r.reason, message: r.message });
      var snap = r.snapshot, text = serialize(snap), jobs = [];
      keys.forEach(function (ns) { lsSet(storageKey(ns), text); });
      var mime = wallpaper && (wallpaper.mime || mimeForExt(wallpaper.ext)), dataUrl = wallpaper && wallpaper.base64 ? 'data:' + mime + ';base64,' + wallpaper.base64 : null;
      keys.forEach(function (ns) { if (H.blobs) jobs.push(dataUrl ? H.blobs.set(blobKey(ns), { dataUrl: dataUrl, mime: mime }) : H.blobs.del(blobKey(ns))); });
      return Promise.all(jobs).then(function () {
        lastSig = ''; imgRev = null;
        if (apply) { var rr = C.restore(); return rr.promise.then(function () { return { ok: true, restored: rr.restored }; }); }
        return { ok: true };
      });
    };

    C.detach = function () { if (timer) { ct(timer); timer = null; } if (unsub) { unsub(); unsub = null; } };
    if (K.subscribe) unsub = K.subscribe(function () { C.scheduleSave(); });
    return C;
  }

  // Write a session into a storage namespace without any kernel (used by Grove "Load from GitHub" before the sim exists).
  function writeSession(host, seedIdOrNs, project, stateText, wallpaper) {
    var r = parse(stateText); if (!r.ok) return Promise.resolve({ ok: false, reason: r.reason, message: r.message });
    var keys = project ? ['proj:' + slug(project)] : nsKeys(seedIdOrNs), jobs = [];
    keys.forEach(function (ns) { host.storage.setItem(storageKey(ns), serialize(r.snapshot)); });
    var mime = wallpaper && (wallpaper.mime || mimeForExt(wallpaper.ext));
    keys.forEach(function (ns) { if (host.blobs) jobs.push(wallpaper && wallpaper.base64 ? host.blobs.set(blobKey(ns), { dataUrl: 'data:' + mime + ';base64,' + wallpaper.base64, mime: mime }) : host.blobs.del(blobKey(ns))); });
    return Promise.all(jobs).then(function () { return { ok: true }; });
  }

  // ---------- browser host: localStorage + IndexedDB (fallback: localStorage, then memory) ----------
  function browserHost() {
    var mem = memoryHost(), ls = null;
    try { if (global.localStorage) { global.localStorage.setItem('samara:probe', '1'); global.localStorage.removeItem('samara:probe'); ls = global.localStorage; } } catch (e) { ls = null; }
    var storage = ls ? { getItem: function (k) { return ls.getItem(k); }, setItem: function (k, v) { ls.setItem(k, v); }, removeItem: function (k) { ls.removeItem(k); } } : mem.storage;
    var dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (res) {
        try {
          var idb = global.indexedDB; if (!idb) return res(null);
          var rq = idb.open('samara-persist', 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore('blobs'); };
          rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(null); }; rq.onblocked = function () { res(null); };
        } catch (e) { res(null); }
      });
      return dbp;
    }
    function tx(mode, fn) {
      return db().then(function (d) {
        if (!d) return undefined;
        return new Promise(function (res) {
          try { var t = d.transaction('blobs', mode), rq = fn(t.objectStore('blobs')); t.oncomplete = function () { res(rq ? rq.result : true); }; t.onerror = t.onabort = function () { res(undefined); }; } catch (e) { res(undefined); }
        });
      });
    }
    var blobs = {
      get: function (k) {
        return tx('readonly', function (s) { return s.get(k); }).then(function (v) {
          if (v) return v;
          try { var raw = ls && ls.getItem('samara:blob:' + k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        });
      },
      set: function (k, v) {
        return tx('readwrite', function (s) { return s.put(v, k); }).then(function (r) {
          if (r !== undefined) return true;
          try { if (ls) { ls.setItem('samara:blob:' + k, JSON.stringify(v)); return true; } } catch (e) { /* quota: image is session-only */ }
          mem.blobs.set(k, v); return false;
        });
      },
      del: function (k) { try { if (ls) ls.removeItem('samara:blob:' + k); } catch (e) { /* ignore */ } return tx('readwrite', function (s) { return s.delete(k); }).then(function () { return true; }); }
    };
    return { storage: storage, blobs: blobs, now: function () { return Date.now(); }, setTimeout: function (f, ms) { return global.setTimeout(f, ms); }, clearTimeout: function (t) { global.clearTimeout(t); } };
  }

  var api = { VERSION: VERSION, MAGIC: MAGIC, parse: parse, serialize: serialize, build: build, attach: attach, writeSession: writeSession, memoryHost: memoryHost, browserHost: browserHost,
              nsKeys: nsKeys, storageKey: storageKey, blobKey: blobKey, slug: slug, dataUrlParts: dataUrlParts, extForMime: extForMime, mimeForExt: mimeForExt, MIGRATIONS: MIGRATIONS };
  global.SamaraPersist = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
