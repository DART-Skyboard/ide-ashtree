// ============================================================
//  samara-os.js — Samara OS kernel (pure JS, DOM-free)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  SamaraOS.createKernel(seed, host) -> kernel
//    The kernel loads a .seed (ROM), boots manifest.boot, interprets the IR ops
//    (see docs/samara/SYNTAX.md), keeps per-app processes + variables and produces a
//    virtual view tree (VNode) that Canopy (DOM) or a node test renders / inspects.
//
//  VNode: { tag, id, props:{}, children:[VNode], on:['tap',...] }
//  Host (all optional):  now() log(line,level) storage{getItem,setItem,removeItem}
//    fetch(url)->Promise<Response-like>  camera{open(facing),snap(),close()}  snd{play,stop,volume,beep}
//    sensors{tilt(),location()}  haptic(ms)  gl{call(node,params,ctx)}  onRender(kernel)
// ============================================================
(function (global) {
  'use strict';
  var VERSION = '1.1.0';      // kernel (runtime) version; the OS image version lives in seed.meta.version
  var SCHEMA = 1;             // Ash OS language / seed IR ABI this kernel speaks (see docs/samara/UPDATES.md)

  // ---------- themes ----------
  var THEMES = {
    'Ash Dark':  { dark: true,  bg: '#0d1117', surface: '#161b22', surface2: '#1c232c', text: '#e9edf2', dim: '#8b98a5', accent: '#00ffcc', onAccent: '#00110d', border: '#262e38', danger: '#ff5f5f', ok: '#39ff14', wall: 'linear-gradient(160deg,#05070a,#0b2a2a 60%,#0d1117)' },
    'Ash Light': { dark: false, bg: '#f3f5f7', surface: '#ffffff', surface2: '#e8ecf0', text: '#161b22', dim: '#5d6b79', accent: '#00967a', onAccent: '#ffffff', border: '#d3d9df', danger: '#d03a3a', ok: '#1f9d3a', wall: 'linear-gradient(160deg,#dfe7ec,#f3f5f7 60%,#cfe9e2)' },
    'Ember':     { dark: true,  bg: '#1a0f0b', surface: '#26160f', surface2: '#331d14', text: '#ffeee3', dim: '#b79a89', accent: '#ff7a3d', onAccent: '#1a0900', border: '#43271b', danger: '#ff4d4d', ok: '#9be564', wall: 'linear-gradient(160deg,#1a0f0b,#4a1d0c 60%,#7a2e10)' },
    'Moss':      { dark: true,  bg: '#0f1a12', surface: '#16241a', surface2: '#1d3023', text: '#e6f4e9', dim: '#8fa996', accent: '#7bd88f', onAccent: '#06130a', border: '#26402d', danger: '#ff6b6b', ok: '#7bd88f', wall: 'linear-gradient(160deg,#0a130c,#16341f 60%,#2a5a35)' },
    'Mist':      { dark: false, bg: '#eef2f6', surface: '#ffffff', surface2: '#e2e8ef', text: '#1c2733', dim: '#66788a', accent: '#4f7cf0', onAccent: '#ffffff', border: '#cfd8e2', danger: '#d9534f', ok: '#2e9d57', wall: 'linear-gradient(160deg,#dbe5f1,#eef2f6 55%,#cdd9f5)' },
    'Midnight':  { dark: true,  bg: '#070b1f', surface: '#0f1530', surface2: '#171e40', text: '#e8ebff', dim: '#8d94c4', accent: '#8a7dff', onAccent: '#0b0720', border: '#222a55', danger: '#ff6b81', ok: '#5fe3b0', wall: 'linear-gradient(160deg,#050818,#151a4a 55%,#2a1f66)' }
  };
  var THEME_ORDER = ['Ash Dark', 'Ash Light', 'Ember', 'Moss', 'Mist', 'Midnight'];

  var WALLPAPERS = [
    { id: 'theme',  name: 'Theme',   css: null },
    { id: 'aurora', name: 'Aurora',  css: 'linear-gradient(160deg,#061a24,#0a4a46 55%,#1f8a6a)' },
    { id: 'dusk',   name: 'Dusk',    css: 'linear-gradient(170deg,#1b1038,#6b2a6e 55%,#f08a5d)' },
    { id: 'forest', name: 'Forest',  css: 'linear-gradient(160deg,#07140b,#1d4a2a 60%,#4d8a4a)' },
    { id: 'paper',  name: 'Paper',   css: 'linear-gradient(160deg,#f5f1e8,#e6dfd0)' },
    { id: 'plain',  name: 'Plain',   css: null, plain: true }
  ];
  var LAYOUTS = ['4x5', '4x6', '5x6', '3x5'];

  // ---------- user preferences (Rings pages). Flat map "key" -> value; only values that differ from the default are stored. ----------
  // Dynamic keys default to true:  notif.app.<appId> (notifications allowed)  and  perm.<appId>.<cam|mic|loc|net> (permission granted).
  var PREF_DEFAULTS = {
    textSize: 'm', orientationLock: false, autoDark: false, timeout: 0,                                  // display
    wifi: true, mobile: true, airplane: false, netmode: 'auto', ssid: 'Samara-Lab', vpn: '', dns: '', proxy: '',   // network
    silent: false, haptics: true, touchSounds: false,                                                    // sound & haptics
    'notif.lock': true,                                                                                  // notifications (DND is the kernel setting `dnd`)
    'a11y.large': false, 'a11y.bold': false, 'a11y.contrast': false, 'a11y.motion': false, 'a11y.filter': 'none', 'a11y.reader': false,
    'a11y.switch': false, 'a11y.onehand': false, 'a11y.hold': 400, 'a11y.mono': false, 'a11y.captions': false,   // accessibility
    'bat.saver': false, 'bat.pct': true,                                                                 // battery (simulated)
    lang: 'en', region: 'US', datefmt: 'MDY', tz: 'auto',                                                // language / region / time
    'sec.pin': '', autosave: true                                                                        // security / backup
  };
  var PREF_ENUMS = {
    textSize: ['s', 'm', 'l', 'xl'], 'a11y.filter': ['none', 'grayscale', 'invert', 'deuter', 'protan', 'tritan'],
    netmode: ['auto', '5g', 'lte', '3g', '2g'], datefmt: ['MDY', 'DMY', 'ISO'], timeout: [0, 15, 30, 60, 300], 'a11y.hold': [200, 400, 700, 1000],
    lang: ['en', 'es', 'fr', 'de', 'ja'], region: ['US', 'GB', 'ES', 'FR', 'DE', 'JP', 'IN', 'BR']
  };
  var PERMS = ['cam', 'mic', 'loc', 'net'];

  // ---------- small utils ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function isNumStr(v) { return typeof v === 'string' && /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(v); }
  function isNum(v) { return (typeof v === 'number' && isFinite(v)) || isNumStr(v); }
  function toNum(v, d) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function fmt(v) {
    if (typeof v === 'number') return isFinite(v) ? String(parseFloat(v.toPrecision(12))) : 'Error';
    if (v == null) return '';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function strip(s) { return String(s == null ? '' : s).trim().replace(/^\(\s*/, '').replace(/\s*\)$/, ''); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- Research(expr): safe arithmetic (no eval) ----------
  // +,-,*,/,%,^ parentheses, sin/cos/tan (degrees), sqrt,cbrt,abs,ln,log,exp,floor,ceil,round,min,max,pow,pi,e.
  // `lookup(name)` returns a number / numeric string / (string expression for a bare identifier).
  function evalExpr(src, lookup) {
    if (src == null) return null;
    var s = String(src).trim();
    if (!s) return null;
    if (/^[A-Za-z_]\w*$/.test(s)) {                        // bare identifier naming a string var => its text is the expression
      var bv = lookup ? lookup(s) : undefined;
      if (typeof bv === 'string' && !isNumStr(bv) && bv.trim()) s = bv.trim();
    }
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
    var toks = [], re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(.))/g, m, pos = 0;
    while (pos < s.length && (m = re.exec(s))) {
      if (m.index !== pos && s.slice(pos, m.index).trim()) return null;
      pos = re.lastIndex;
      if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) toks.push({ t: 'i', v: m[2] });
      else if (m[3] !== undefined) { if (!/[+\-*\/%^(),]/.test(m[3])) return null; toks.push({ t: 'o', v: m[3] }); }
    }
    var p = 0, bad = false;
    function peek() { return toks[p]; }
    function isOp(v) { var k = toks[p]; return k && k.t === 'o' && k.v === v; }
    function expr() { var v = term(); while (isOp('+') || isOp('-')) { var o = toks[p++].v, r = term(); v = o === '+' ? v + r : v - r; } return v; }
    function term() { var v = unary(); while (isOp('*') || isOp('/') || isOp('%')) { var o = toks[p++].v, r = unary(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
    function unary() { if (isOp('-')) { p++; return -unary(); } if (isOp('+')) { p++; return unary(); } return pow(); }
    function pow() { var b = atom(); if (isOp('^')) { p++; return Math.pow(b, unary()); } return b; }
    function atom() {
      var k = toks[p++];
      if (!k) { bad = true; return 0; }
      if (k.t === 'n') return k.v;
      if (k.t === 'o' && k.v === '(') { var v = expr(); if (!isOp(')')) bad = true; else p++; return v; }
      if (k.t === 'i') {
        var name = k.v, lname = name.toLowerCase();
        if (isOp('(')) {
          p++; var args = [];
          if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
          if (!isOp(')')) bad = true; else p++;
          var D = Math.PI / 180, a = args[0];
          switch (lname) {
            case 'sqrt': return Math.sqrt(a); case 'cbrt': return Math.cbrt(a); case 'abs': return Math.abs(a);
            case 'ln': return Math.log(a); case 'log': return Math.log10(a); case 'exp': return Math.exp(a);
            case 'sin': return Math.sin(a * D); case 'cos': return Math.cos(a * D); case 'tan': return Math.tan(a * D);
            case 'asin': return Math.asin(a) / D; case 'acos': return Math.acos(a) / D; case 'atan': return Math.atan(a) / D;
            case 'floor': return Math.floor(a); case 'ceil': return Math.ceil(a); case 'round': return Math.round(a);
            case 'min': return Math.min.apply(null, args); case 'max': return Math.max.apply(null, args);
            case 'pow': return Math.pow(a, args[1]);
          }
          bad = true; return 0;
        }
        var lv = lookup ? lookup(name) : undefined;
        if (lv !== undefined && isNum(lv)) return toNum(lv);
        if (lv === '' ) return 0;
        if (lname === 'pi') return Math.PI;
        if (name === 'e') return Math.E;
        bad = true; return 0;
      }
      bad = true; return 0;
    }
    var val;
    try { val = expr(); } catch (e) { return null; }
    if (bad || p < toks.length || typeof val !== 'number' || !isFinite(val)) return null;
    return parseFloat(val.toPrecision(12));
  }

  // ---------- storage ----------
  function makeStore(host, prefix) {
    var mem = {}, ls = null, IDX = prefix + '__idx';
    try { ls = host.storage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { ls = null; }
    function idx() { try { var r = ls && ls.getItem(IDX); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
    function saveIdx(a) { try { if (ls) ls.setItem(IDX, JSON.stringify(a)); } catch (e) { /* ignore */ } }
    var S_ = {
      get: function (k) {
        try { if (ls) { var v = ls.getItem(prefix + k); if (v != null) return v; } } catch (e) { /* fall back to memory */ }
        return Object.prototype.hasOwnProperty.call(mem, prefix + k) ? mem[prefix + k] : null;
      },
      set: function (k, v) {
        mem[prefix + k] = String(v);
        try { if (ls) { ls.setItem(prefix + k, String(v)); var a = idx(); if (a.indexOf(k) < 0) { a.push(k); saveIdx(a); } } } catch (e) { /* memory only */ }
      },
      remove: function (k) {
        delete mem[prefix + k];
        try { if (ls) { ls.removeItem(prefix + k); var a = idx(), i = a.indexOf(k); if (i >= 0) { a.splice(i, 1); saveIdx(a); } } } catch (e) { /* ignore */ }
      },
      // every key this store knows (index + memory + a scan of storages that support key(i))
      keys: function () {
        var out = {}, a = idx(), i;
        a.forEach(function (k) { out[k] = 1; });
        Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix) === 0) out[k.slice(prefix.length)] = 1; });
        try { if (ls && typeof ls.length === 'number' && ls.key) for (i = 0; i < ls.length; i++) { var kk = ls.key(i); if (kk && kk.indexOf(prefix) === 0) out[kk.slice(prefix.length)] = 1; } } catch (e) { /* ignore */ }
        return Object.keys(out).filter(function (k) { return k !== '__idx' && S_.get(k) !== null; });
      },
      // real usage of this seed's namespace: number of keys and characters held (localStorage when it can be enumerated, else this session's memory)
      usage: function () {
        var seen = {}, n = 0, bytes = 0, i, k, v;
        try { if (ls && typeof ls.length === 'number' && ls.key) for (i = 0; i < ls.length; i++) { k = ls.key(i); if (k && k.indexOf(prefix) === 0) seen[k] = ls.getItem(k); } } catch (e) { /* use memory */ }
        Object.keys(mem).forEach(function (mk) { if (!(mk in seen)) seen[mk] = mem[mk]; });
        Object.keys(seen).forEach(function (sk) { v = seen[sk]; if (v != null) { n++; bytes += sk.length - prefix.length + String(v).length; } });
        return { keys: n, bytes: bytes };
      }
    };
    return S_;
  }

  // ---------- synthetic camera frame (SVG data URI, works without DOM) ----------
  function testPatternSvg(facing, n, w, h) {
    w = w || 320; h = h || 240;
    var bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'], x = '', bw = w / bars.length, i;
    for (i = 0; i < bars.length; i++) x += '<rect x="' + (i * bw).toFixed(1) + '" y="0" width="' + (bw + 0.5).toFixed(1) + '" height="' + (h * 0.7) + '" fill="' + bars[i] + '"/>';
    x += '<rect y="' + (h * 0.7) + '" width="' + w + '" height="' + (h * 0.3) + '" fill="#111"/>';
    x += '<text x="' + w / 2 + '" y="' + (h * 0.86) + '" fill="#0fc" font-family="monospace" font-size="16" text-anchor="middle">SAMARA SIM CAM ' + String(facing).toUpperCase() + ' #' + n + '</text>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + x + '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ======================================================================
  function createKernel(seed, host) {
    host = host || {};
    if (typeof seed === 'string') seed = JSON.parse(seed);
    seed = seed || {};
    var manifest = seed.manifest || {}, program = seed.program || {};
    var meta = seed.meta || {};
    // an OS lineage (meta.id) keeps one persisted-state namespace across updates; seeds without it stay per-seed-hash (old behaviour)
    var seedId = meta.id ? String(meta.id).replace(/[^\w.-]/g, '_') : (seed.sha256 ? String(seed.sha256).slice(0, 12) : (manifest.name || (seed.os && seed.os.name) || 'seed')).replace(/[^\w.-]/g, '_');
    var sysStore = makeStore(host, 'samara:' + seedId + ':');
    var K = { version: VERSION, seedId: seedId, THEMES: THEMES };
    var subs = [];
    var pendingNet = [];
    var seq = 1;

    var S = {
      powered: false, screenOff: false, locked: true,
      theme: 'Ash Dark', wallpaper: 'theme', cols: 4, rows: 5, dock: 4, brightness: 1, volume: 50, clock24: false,
      orientation: 'portrait', page: 0, shade: false,
      apps: [], appIndex: {}, procs: {}, recents: [], fg: null,
      notifs: [], pin: '', pinError: false, toast: null,
      battery: 87, charging: false, signal: 4, uptime: 0, drainAcc: 0, dnd: false,
      prefs: {}, custom: null, drawer: false, drawerQuery: '', lastActive: 0, autoMode: null, lastDark: 'Ash Dark', lastLight: 'Ash Light',
      cam: { open: false, facing: 'back', synthetic: false, frames: 0, last: null },
      tilt: { x: 0, y: 0, z: 9.8 }, loc: { lat: 37.7749, lon: -122.4194 },
      clockSkew: 0, buildTaps: 0, buildTapAt: 0, sysPages: {}, logLines: [], bootNode: manifest.boot || 'Crown', netListeners: {}
    };
    var sysHook = null;    // updates: refreshes bound about_*/upd_*/dev_* variables of the open system page
    var crown = null;      // system process holding boot-node UI (home widgets)

    // ---------- logging / render plumbing ----------
    function log(level, msg) {
      var line = '[' + level + '] ' + msg;
      S.logLines.push(line); if (S.logLines.length > 500) S.logLines.shift();
      try { if (host.log) host.log(line, level); } catch (e) { /* ignore */ }
    }
    var renderQueued = false;
    function changed() {
      if (sysHook) { try { sysHook(); } catch (e) { /* ignore */ } }
      subs.slice().forEach(function (f) { try { f(K); } catch (e) { /* ignore */ } });
      try { if (host.onRender) host.onRender(K); } catch (e) { /* ignore */ }
    }
    function now() { return (host.now ? host.now() : Date.now()) + (S.clockSkew || 0); }

    // ---------- processes ----------
    function makeProc(id) {
      return { id: id, vars: {}, screens: {}, order: [], cur: null, hist: [], nodes: {}, handlers: {}, evts: {}, keyHandlers: {},
               lastCanvas: null, out: [], dead: false, started: now(), seq: 0, net: 'idle', camNode: null };
    }
    function appInfo(id) { return S.appIndex[id] || null; }
    function runNode(name, proc, scope, depth) {
      var ops = program[name];
      if (!ops) { log('warn', 'no such node: ' + name); return false; }
      var ctx = { proc: proc, scope: scope || {}, container: null, depth: depth || 0, shared: { n: 0, halt: false } };
      execOps(ops, ctx);
      return true;
    }
    function launch(id) {
      if (!S.powered || S.locked || !id) return false;
      if (id === 'drawer') { openDrawer(); return true; }          // pseudo-app: sys.launch (drawer) opens the App Drawer
      S.drawer = false; S.drawerQuery = ''; S.lastActive = now();
      var info = appInfo(id);
      if (!info) { log('error', 'launch: unknown app ' + id); return false; }
      var p = S.procs[id];
      if (!p) {
        p = S.procs[id] = makeProc(id);
        if (!info.system) {
          var entry = info.entry || info.name;
          if (program[entry]) runNode(entry, p, {}, 0); else log('warn', 'app ' + id + ' has no entry node "' + entry + '"');
          if (p.cur) p.hist = [p.cur];   // GESTURES: screens declared while the entry node runs are not back-stack history; the first visible screen is the root
        }
        log('info', 'launch ' + id);
      }
      S.recents = S.recents.filter(function (x) { return x !== id; }); S.recents.push(id);
      S.fg = id; S.shade = false; if (S.fwd === id) S.fwd = null;   // GESTURES: relaunching clears the forward target
      // every launch (first start or coming back to a running app) fires the app's optional `ui.on (resume) tap { ... }` handler once it is the foreground app, so live readouts are current
      if (p.handlers['resume|tap']) execOps(p.handlers['resume|tap'], { proc: p, scope: { evt: 'resume' }, container: null, depth: 0, shared: { n: 0, halt: false } });
      changed(); return true;
    }
    function kill(id) {
      var p = S.procs[id]; if (!p) return;
      p.dead = true; delete S.procs[id];
      S.recents = S.recents.filter(function (x) { return x !== id; });
      if (S.fg === id) { S.fg = null; S.fwd = id; }   // GESTURES: closing the foreground app remembers it for Forward
      if (S.cam.open && S.cam.owner === id) camClose();
      log('info', 'kill ' + id);
    }
    function home() { if (!S.powered) return; if (S.fg) S.fwd = S.fg; /* GESTURES: forward target */ if (S.fg === 'rings' && S.procs.rings) S.procs.rings.ringsPage = 'main'; S.fg = null; S.shade = false; S.page = 0; S.drawer = false; S.drawerQuery = ''; S.lastActive = now(); changed(); }
    function openDrawer() { if (!S.powered || S.locked) return; S.fg = null; S.shade = false; S.drawer = true; S.drawerQuery = ''; changed(); }
    function back() {
      if (!S.powered || S.screenOff) return;
      if (S.shade) { S.shade = false; changed(); return; }
      if (S.locked) return;
      S.lastActive = now();
      if (S.drawer) { S.drawer = false; S.drawerQuery = ''; changed(); return; }
      if (!S.fg) { if (S.page > 0) { S.page = 0; changed(); } return; }   // GESTURES: Back on a later home page returns to page 1
      var p = S.procs[S.fg];
      // Rings: sub-page -> parent page -> (main) -> home. The page tree lives in js/phone/rings.js.
      if (S.fg === 'rings' && p && p.ringsPage && p.ringsPage !== 'main') { var RG = rings(); p.ringsPage = (RG && RG.parent(p.ringsPage)) || 'main'; changed(); return; }
      if (p && p.hist.length > 1) { p.hist.pop(); p.cur = p.hist[p.hist.length - 1]; changed(); return; }
      kill(S.fg); S.fg = null; changed();
    }

    // ---------- prefs (Rings) ----------
    function rings() { return global.SamaraRings || (typeof require === 'function' ? (function () { try { return require('./rings.js'); } catch (e) { return null; } })() : null); }
    function prefDefault(k) {
      if (Object.prototype.hasOwnProperty.call(PREF_DEFAULTS, k)) return PREF_DEFAULTS[k];
      if (/^notif\.app\.[\w-]+$/.test(k) || /^perm\.[\w-]+\.(cam|mic|loc|net)$/.test(k)) return true;
      return undefined;
    }
    function getPref(k) { return Object.prototype.hasOwnProperty.call(S.prefs, k) ? S.prefs[k] : prefDefault(k); }
    function setPref(k, value, silent) {
      var def = prefDefault(k); if (def === undefined) { log('warn', 'unknown pref ' + k); return false; }
      var v;
      if (typeof def === 'boolean') v = String(value) === 'toggle' ? !getPref(k) : (value === true || /^(true|1|on|yes)$/i.test(String(value)));
      else if (typeof def === 'number') v = toNum(value, def);
      else v = String(value == null ? '' : value);
      if (PREF_ENUMS[k] && PREF_ENUMS[k].indexOf(v) < 0) { if (typeof def === 'string' && PREF_ENUMS[k].indexOf(String(v).toLowerCase()) >= 0) v = String(v).toLowerCase(); else return false; }
      if (k === 'sec.pin' && v !== '' && !/^\d{4,6}$/.test(v)) return false;
      if (v === def) delete S.prefs[k]; else S.prefs[k] = v;
      if (k === 'autoDark') { S.autoMode = null; applyAutoDark(); }
      if (!silent) { if (booted) persistSettings(); changed(); }
      return true;
    }
    function permOk(app, perm) { return getPref('perm.' + app + '.' + perm) !== false; }
    function online() { return !getPref('airplane') && (!!getPref('wifi') || !!getPref('mobile')); }
    function netBlock(app) {
      if (getPref('airplane')) return "Airplane mode is on. Turn it off in Rings > Network.";
      if (!getPref('wifi') && !getPref('mobile')) return "You're offline: Wi-Fi and mobile data are off (Rings > Network).";
      if (app && !permOk(app, 'net')) return 'Network access is blocked for this app (Rings > Privacy & permissions).';
      return '';
    }
    function passcode() { var pp = getPref('sec.pin'); return pp ? String(pp) : (manifest.passcode == null ? '' : String(manifest.passcode)); }
    function dparts() {
      var t = now(), tz = getPref('tz'), d, u = tz !== 'auto' && tz !== undefined && isFinite(+tz);
      d = new Date(u ? t + (+tz) * 60000 : t);
      return u ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes() }
               : { y: d.getFullYear(), mo: d.getMonth(), day: d.getDate(), dow: d.getDay(), h: d.getHours(), m: d.getMinutes() };
    }
    function applyAutoDark() {
      if (!getPref('autoDark') || !S.powered) return;
      var h = dparts().h, mode = (h < 7 || h >= 19) ? 'night' : 'day';
      if (mode === S.autoMode) return;
      S.autoMode = mode; var want = mode === 'night' ? S.lastDark : S.lastLight;
      if (want && want !== S.theme && resolveThemeName(want)) { S.theme = resolveThemeName(want); if (booted) persistSettings(); }
    }
    // ---- custom wallpaper (image lives in memory here; js/phone/persist.js stores it in IndexedDB) ----
    var customCache = { key: '', css: '' };
    function customCss() {
      var c = S.custom; if (!c) return null;
      var key = c.rev + '|' + c.fit + '|' + c.dim, W = global.SamaraWallpapers;
      if (customCache.key !== key) {
        var css = W && W.custom && W.custom.css ? W.custom.css(c, themeTokens(S.theme).bg) : 'url("' + c.dataUrl + '") center/cover no-repeat';
        customCache = { key: key, css: css };
      }
      return customCache.css;
    }
    function themeArtCss(T) { var A = global.SamaraThemeArt; return A ? A.css(S.theme, { tokens: T }) : T.wall; }
    function customMeta() { var c = S.custom; return c ? { present: true, mime: c.mime, w: c.w, h: c.h, fit: c.fit, dim: c.dim, blur: c.blur, bytes: Math.round(String(c.dataUrl).length * 0.75), rev: c.rev } : null; }
    K.setCustomWallpaper = function (o, silent) {
      if (!o || !o.dataUrl) return false;
      var old = S.custom;
      S.custom = { dataUrl: o.dataUrl, mime: o.mime || 'image/jpeg', w: o.w || 0, h: o.h || 0,
        fit: /^(fill|fit|center)$/.test(o.fit) ? o.fit : (old ? old.fit : 'fill'), dim: o.dim !== undefined ? clamp(toNum(o.dim, 0), 0, 0.85) : (old ? old.dim : 0.15),
        blur: o.blur !== undefined ? clamp(toNum(o.blur, 0), 0, 24) : (old ? old.blur : 0), rev: (old ? old.rev : 0) + 1 };
      customCache.key = '';
      if (!silent) setSetting('wallpaper', 'custom'); else changed();
      return true;
    };
    K.setCustomOptions = function (o) {
      if (!S.custom) return false; o = o || {};
      if (/^(fill|fit|center)$/.test(o.fit)) S.custom.fit = o.fit;
      if (o.dim !== undefined) S.custom.dim = clamp(toNum(o.dim, 0), 0, 0.85);
      if (o.blur !== undefined) S.custom.blur = clamp(toNum(o.blur, 0), 0, 24);
      if (booted) persistSettings(); changed(); return true;
    };
    K.clearCustomWallpaper = function () {
      S.custom = null; customCache.key = '';
      if (S.wallpaper === 'custom') S.wallpaper = 'theme';
      if (booted) persistSettings(); changed(); return true;
    };
    K.customWallpaperData = function () { return S.custom; };
    K.customWallpaperMeta = customMeta;

    // ---------- settings (theme / wallpaper / layout / brightness) ----------
    function wallpapers() {
      var out = WALLPAPERS.slice();
      out.push({ id: 'themeart', name: 'Theme Art', css: null, art: true });                       // original illustration of the current theme (js/phone/theme-art.js)
      if (S.custom) out.push({ id: 'custom', name: 'Custom', css: null, custom: true, rev: S.custom.rev });   // the user's imported image
      // preloaded procedural / animated wallpapers (js/phone/wallpapers.js), if that module is present
      var ext = (global.SamaraWallpapers && global.SamaraWallpapers.list) || [];
      ext.forEach(function (w) { if (w && w.id) out.push({ id: w.id, name: w.name, css: w.css || null, live: true, animated: !!w.animated }); });
      (manifest.wallpapers || []).forEach(function (w) {
        if (w && w.id) { out = out.filter(function (x) { return x.id !== w.id; }); out.push(w); }
      });
      return out;
    }
    function themeNames() {
      var names = THEME_ORDER.slice();
      Object.keys(manifest.themes || {}).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
      return names;
    }
    function themeTokens(name) {
      var t = (manifest.themes && manifest.themes[name]) || THEMES[name] || THEMES['Ash Dark'];
      return Object.assign({}, THEMES['Ash Dark'], t);
    }
    function resolveThemeName(n) {
      n = strip(n); var names = themeNames(), i;
      for (i = 0; i < names.length; i++) if (names[i].toLowerCase() === n.toLowerCase()) return names[i];
      var nn = n.toLowerCase().replace(/[\s_-]/g, '');
      for (i = 0; i < names.length; i++) if (names[i].toLowerCase().replace(/[\s_-]/g, '') === nn) return names[i];
      for (i = 0; i < names.length; i++) if (nn && names[i].toLowerCase().replace(/[\s_-]/g, '').indexOf(nn) === 0) return names[i];   // "ash" -> Ash Dark
      return null;
    }
    function persistSettings() {
      sysStore.set('settings', JSON.stringify({ theme: S.theme, wallpaper: S.wallpaper, cols: S.cols, rows: S.rows, dock: S.dock, brightness: S.brightness, volume: S.volume, clock24: S.clock24, dnd: S.dnd, prefs: S.prefs, customOpts: S.custom ? { fit: S.custom.fit, dim: S.custom.dim, blur: S.custom.blur } : null }));
    }
    // 'next' cycles a setting through its presets (themes, wallpapers, brightness, volume)
    function nextOf(list, cur) { var i = list.indexOf(cur); return list[(i + 1) % list.length]; }
    function setSetting(key, value, silent) {
      key = String(key).toLowerCase();
      if (value === 'next') {
        if (key === 'theme') value = nextOf(themeNames(), S.theme);
        else if (key === 'wallpaper') value = nextOf(wallpapers().map(function (w) { return w.id; }), S.wallpaper);
        else if (key === 'brightness') { var bs = [0.3, 0.6, 1]; value = bs.filter(function (x) { return x > S.brightness + 0.01; })[0] || bs[0]; }
        else if (key === 'volume') { var vs = [0, 50, 100]; value = vs.filter(function (x) { return x > S.volume; })[0]; if (value === undefined) value = vs[0]; }
      }
      switch (key) {
        case 'theme': { var n = resolveThemeName(value); if (!n) { log('warn', 'unknown theme ' + value); return false; } S.theme = n; if (themeTokens(n).dark) S.lastDark = n; else S.lastLight = n; break; }
        case 'wallpaper': {
          var w = wallpapers().filter(function (x) { return x.id === String(value) || x.name === String(value); })[0];
          if (!w) { log('warn', 'unknown wallpaper ' + value); return false; } S.wallpaper = w.id; break;
        }
        case 'layout': case 'grid': {
          var m = /^(\d+)x(\d+)$/.exec(String(value)); if (!m) return false;
          S.cols = clamp(+m[1], 2, 6); S.rows = clamp(+m[2], 2, 8); S.page = 0; break;
        }
        case 'dock': S.dock = clamp(parseInt(value, 10) || 0, 0, 6); break;
        case 'brightness': { var b = toNum(value, 1); if (b > 1) b = b / 100; S.brightness = clamp(b, 0.1, 1); break; }
        case 'volume': S.volume = clamp(Math.round(toNum(value, 50)), 0, 100); break;
        case 'clock24': S.clock24 = value === true || value === 'true' || value === '1' || value === 1; break;
        case 'dnd': {   // do not disturb: new notifications still land in the shade but no longer pop a banner
          var dv = String(value).toLowerCase();
          S.dnd = dv === 'toggle' ? !S.dnd : (dv === 'on' || dv === 'true' || dv === '1'); break;
        }
        case 'orientation': {
          var ov = String(value).toLowerCase(), want = ov === 'toggle' ? (S.orientation === 'portrait' ? 'landscape' : 'portrait') : ov;
          if (want !== 'portrait' && want !== 'landscape') return false;
          if (want !== S.orientation) { if (getPref('orientationLock') && !silent) { toast('Orientation is locked (Rings > Display)'); changed(); return false; } S.orientation = want; S.page = 0; } break;
        }
        case 'close': { var cid = String(value); if (cid && cid !== 'crown' && S.procs[cid]) kill(cid); else return false; break; }   // action: close a running app
        default: log('warn', 'unknown setting ' + key); return false;
      }
      if (!silent && booted) persistSettings();
      if (!silent) changed();
      return true;
    }
    function getSetting(key) {
      switch (String(key).toLowerCase()) {
        case 'theme': return S.theme; case 'wallpaper': return S.wallpaper; case 'layout': case 'grid': return S.cols + 'x' + S.rows;
        case 'dock': return S.dock; case 'brightness': return S.brightness; case 'volume': return S.volume; case 'clock24': return S.clock24;
        // read-only status for system-style apps (Widow); everything here is real kernel state
        case 'dnd': return S.dnd ? 'On' : 'Off';
        case 'orientation': return S.orientation;
        case 'date': return dateText();
        case 'signal': return S.signal;
        case 'power': return Math.round(S.battery) + '%' + (S.charging ? ' \u26A1' : '');
        case 'uptime': return uptimeText();
        case 'openapps': return openProcs().length;
        case 'storage': { var u = sysStore.usage(); return u.keys + (u.keys === 1 ? ' key' : ' keys') + ' \u00B7 ' + (u.bytes < 1024 ? u.bytes + ' B' : (u.bytes / 1024).toFixed(1) + ' KB'); }
        case 'wallpapername': { var wp = wallpapers().filter(function (x) { return x.id === S.wallpaper; })[0]; return wp ? wp.name : S.wallpaper; }
        case 'windows': return otherApps().length;
        case 'recentnote': return otherApps().length ? '' : 'No other apps are open. Launch one from Crown.';
      }
      var rm = /^(recent|recentlabel)([1-9])$/.exec(String(key).toLowerCase());
      if (rm) {   // the Nth most recently used running app other than the foreground one: its id, or "glyph  Name" ('' when none)
        var ra = otherApps()[+rm[2] - 1], ri = ra && appInfo(ra);
        return !ra ? '' : rm[1] === 'recent' ? ra : ((ri && ri.glyph) || '') + '  ' + (ri ? ri.name : ra);
      }
      return '';
    }
    function openProcs() { return Object.keys(S.procs).filter(function (id) { return id !== 'crown'; }); }
    function otherApps() { return S.recents.filter(function (id) { return id !== S.fg && S.procs[id]; }).reverse(); }
    function uptimeText() {
      var t = Math.floor(S.uptime / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
      return h ? h + 'h ' + pad2(m) + 'm' : m ? m + 'm ' + pad2(sec) + 's' : sec + 's';
    }
    function registerApp(a) {
      if (!a || !a.id) return;
      var cur = S.appIndex[a.id];
      var info = Object.assign({ id: a.id, name: a.id, glyph: '', color: '#00ffcc', entry: null, dock: false }, cur || {}, a);
      if (a.icon && !a.glyph) info.glyph = a.icon;
      if (cur) Object.assign(cur, info); else { S.appIndex[a.id] = info; S.apps.push(info); }
    }

    // ---------- values / interpolation ----------
    function lookupVar(ctx, name) {
      if (ctx.scope && Object.prototype.hasOwnProperty.call(ctx.scope, name)) return ctx.scope[name];
      if (ctx.proc && Object.prototype.hasOwnProperty.call(ctx.proc.vars, name)) return ctx.proc.vars[name];
      return undefined;
    }
    function assignVar(ctx, name, val) {
      name = strip(name);
      if (ctx.scope && Object.prototype.hasOwnProperty.call(ctx.scope, name)) ctx.scope[name] = val; else ctx.proc.vars[name] = val;
    }
    function interpStr(str, vars) {
      return String(str).replace(/\$?\{([A-Za-z_]\w*(?:\.\w+)*)\}/g, function (m, n) {
        var v = vars(n); return v === undefined ? m : fmt(v);
      });
    }
    function procLookup(proc, scope) {
      return function (n) {
        if (scope && Object.prototype.hasOwnProperty.call(scope, n)) return scope[n];
        if (proc && Object.prototype.hasOwnProperty.call(proc.vars, n)) return proc.vars[n];
        return undefined;
      };
    }
    // resolve one IR arg value: {$var}, {lit}, number, string (with {var} templates)
    function rv(ctx, v) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.$var !== undefined) { var x = lookupVar(ctx, v.$var); return x === undefined ? '' : x; }
        if (v.lit !== undefined) return v.lit;
      }
      if (typeof v === 'string' && v.indexOf('{') >= 0) return interpStr(v, procLookup(ctx.proc, ctx.scope));
      return v;
    }
    function arg(op, ctx, names) {
      var a = op.args || {}, i;
      names = [].concat(names);
      for (i = 0; i < names.length; i++) if (a[names[i]] !== undefined) return rv(ctx, a[names[i]]);
      return undefined;
    }
    function posId(op, ctx) { var v = arg(op, ctx, ['id', 'node', 'key', 'url', 'text', 'name', 'src', 'level', 'ms']); return v === undefined ? undefined : String(v); }
    function destOf(op) { var a = op.args || {}; var d = a.placeto || a.dest || a.to; return d ? strip(d) : null; }

    // ---------- UI model ----------
    var TAGS = { text: 'text', button: 'button', input: 'input', list: 'list', icon: 'icon', row: 'row', col: 'col', grid: 'grid', menu: 'menu', canvas: 'canvas', image: 'image', camera: 'camera', web: 'web' };
    function curScreen(proc, create) {
      if (!proc.cur || !proc.screens[proc.cur]) {
        if (!create) return null;
        addScreen(proc, 'main', {});
      }
      return proc.screens[proc.cur];
    }
    function addScreen(proc, id, props) {
      var s = proc.screens[id];
      if (!s) { s = proc.screens[id] = { kind: 'screen', id: id, props: {}, children: [] }; proc.order.push(id); proc.nodes[id] = s; }
      Object.assign(s.props, props || {});
      if (proc.cur !== id) { proc.cur = id; var hi = proc.hist.indexOf(id); if (hi >= 0) proc.hist.length = hi + 1; else proc.hist.push(id); }   // going to an earlier screen pops the stack back to it
      return s;
    }
    function rawProps(op, ctx, skip) {
      var out = {}, a = op.args || {};
      Object.keys(a).forEach(function (k) {
        if (skip.indexOf(k) >= 0) return;
        var v = a[k];
        if (v && typeof v === 'object' && v.$var !== undefined) out[k] = { bind: v.$var };
        else out[k] = v;
      });
      return out;
    }
    function addNode(ctx, kind, op, extra) {
      var proc = ctx.proc, a = op.args || {};
      var id = a.id !== undefined ? String(rv(ctx, a.id)) : null;
      var props = rawProps(op, ctx, ['id', 'parent']);
      if (extra) Object.assign(props, extra);
      var node = id ? proc.nodes[id] : null;
      if (node && node.kind !== 'screen') { Object.assign(node.props, props); }
      else {
        if (!id) id = '_' + kind + (++proc.seq);
        node = { kind: kind, id: id, props: props, children: [] };
        proc.nodes[id] = node;
        var parent = null;
        if (a.parent !== undefined && proc.nodes[strip(a.parent)]) parent = proc.nodes[strip(a.parent)];
        var list = parent ? parent.children : (ctx.container ? ctx.container.children : curScreen(proc, true).children);
        list.push(node);
      }
      if (op.handlers) Object.keys(op.handlers).forEach(function (ev) { registerHandler(proc, node.id, ev, op.handlers[ev]); });
      return node;
    }
    function registerHandler(proc, id, ev, ops, append) {
      var key = id + '|' + ev, cur = proc.handlers[key];
      if (append && cur) { (ops || []).forEach(function (o) { if (cur.indexOf(o) < 0) cur.push(o); }); }
      else proc.handlers[key] = ops ? (append ? ops.slice() : ops) : [];
      (proc.evts[id] = proc.evts[id] || []);
      if (proc.evts[id].indexOf(ev) < 0) proc.evts[id].push(ev);
    }
    function resolveProp(proc, v) {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.bind !== undefined) {
        var x = proc.vars[v.bind]; return x === undefined ? '' : x;
      }
      if (typeof v === 'string' && v.indexOf('{') >= 0) return interpStr(v, procLookup(proc, null));
      return v;
    }
    function itemsOf(v) {
      if (Array.isArray(v)) return v.map(fmt);
      if (v == null || v === '') return [];
      return String(v).split(/\s*,\s*/).filter(function (x) { return x !== ''; });
    }

    // ---------- op interpreter ----------
    var OPS = {};
    function execOps(ops, ctx) {
      if (!ops) return;
      for (var i = 0; i < ops.length; i++) { if (ctx.shared.halt) return; execOp(ops[i], ctx); }
    }
    function childCtx(ctx, container) { return { proc: ctx.proc, scope: ctx.scope, container: container, depth: ctx.depth, shared: ctx.shared }; }
    function execOp(op, ctx) {
      if (!op || !op.op) return;
      if (++ctx.shared.n > 20000) { log('error', 'op budget exceeded (infinite loop?)'); ctx.shared.halt = true; return; }
      var name = String(op.op).toLowerCase(), fn = OPS[name];
      if (!fn) {
        if (name === 'import' || name === 'tag' || name === 'tool') return;
        if (!execOp.warned) execOp.warned = {};
        if (!execOp.warned[name]) { execOp.warned[name] = 1; log('warn', 'unknown op ' + op.op); }
        return;
      }
      try { fn(op, ctx); } catch (e) { log('error', op.op + ': ' + (e && e.message ? e.message : e)); }
    }
    K._exec = function (ops, procId, scope) { // test hook
      var p = S.procs[procId] || crown; execOps(ops, { proc: p, scope: scope || {}, container: null, depth: 0, shared: { n: 0, halt: false } }); changed();
    };

    // --- ash core ---
    OPS['var'] = function (op, ctx) { var n = arg(op, ctx, 'name'); if (n && !(n in ctx.proc.vars)) ctx.proc.vars[n] = ''; };
    function numify(v) { return typeof v === 'string' && isNumStr(v) ? parseFloat(v) : v; }
    OPS['irin'] = function (op, ctx) {
      var a = op.args || {};
      if (a.vars) Object.keys(a.vars).forEach(function (k) { var v = a.vars[k]; ctx.proc.vars[k] = typeof v === 'string' ? numify(rv(ctx, v)) : v; });
      else if (a.text !== undefined) { ctx.proc.vars.irin = rv(ctx, a.text); ctx.proc.lastIrin = ctx.proc.vars.irin; if (a.data && !('s' in ctx.proc.vars)) ctx.proc.vars.s = ctx.proc.vars.irin; }
    };
    OPS['irout'] = function (op, ctx) {
      var parts = (op.args && op.args.parts) || [], out = parts.map(function (p) {
        if (p.lit !== undefined) return rv(ctx, p.lit);
        var v = lookupVar(ctx, p.$var); return v === undefined ? '' : fmt(v);
      }).join('');
      ctx.proc.out.push(out); if (ctx.proc.out.length > 200) ctx.proc.out.shift();
      ctx.proc.vars.out = out;
      log('out', ctx.proc.id + ': ' + out);
    };
    OPS['thenplace'] = function (op, ctx) {
      var a = op.args || {}, src = a.src, d = destOf(op), v;
      if (src === undefined) v = ctx.proc.vars.s;
      else { var nm = strip(src); v = lookupVar(ctx, nm); if (v === undefined) v = rv(ctx, strip(src)); }
      if (d) assignVar(ctx, d, v);
    };
    OPS['set'] = function (op, ctx) { var n = arg(op, ctx, ['var', 'name', 'id']); if (n) assignVar(ctx, n, numify(arg(op, ctx, 'value'))); };
    OPS['research'] = OPS['report'] = function (op, ctx) {
      var expr = arg(op, ctx, 'expr'), d = destOf(op) || 's';
      var look = function (n) { return lookupVar(ctx, n); };
      var raw = String((op.args || {}).expr == null ? '' : (op.args || {}).expr);
      var val = evalExpr(interpStr(raw, look), look);
      assignVar(ctx, d, val === null ? 'Error' : val);
      if (val === null) log('warn', 'Research: cannot evaluate "' + expr + '"');
    };
    OPS['call'] = function (op, ctx) {
      var n = arg(op, ctx, 'node'); if (!n || ctx.depth > 16) return;
      if (program[n]) execOps(program[n], { proc: ctx.proc, scope: ctx.scope, container: ctx.container, depth: ctx.depth + 1, shared: ctx.shared });
    };
    OPS['if'] = function (op, ctx) {
      var c = String(arg(op, ctx, 'cond') || ''), m = /^(.*?)(==|!=|<=|>=|<|>)(.*)$/.exec(c), ok = false;
      if (m) {
        var l = m[1].trim(), r = m[3].trim(), ln = isNum(l) ? toNum(l) : l, rn = isNum(r) ? toNum(r) : r;
        ok = m[2] === '==' ? ln == rn : m[2] === '!=' ? ln != rn : m[2] === '<' ? ln < rn : m[2] === '>' ? ln > rn : m[2] === '<=' ? ln <= rn : ln >= rn; // eslint-disable-line eqeqeq
      } else ok = !!c && c !== '0' && c !== 'false';
      execOps(ok ? (op.then || op.children) : op.else, ctx);
    };

    // --- sys.* ---
    OPS['sys.theme'] = function (op, ctx) { setSetting('theme', arg(op, ctx, 'name'), true); persistIfBooted(); };
    OPS['sys.layout'] = function (op, ctx) {
      var g = arg(op, ctx, 'grid'), d = arg(op, ctx, 'dock');
      if (g !== undefined) setSetting('layout', g, true); if (d !== undefined) setSetting('dock', d, true);
    };
    OPS['sys.app'] = function (op, ctx) {
      var a = op.args || {}, id = a.id !== undefined ? String(rv(ctx, a.id)) : null; if (!id) return;
      var o = { id: id }; ['name', 'icon', 'glyph', 'color', 'entry', 'dock'].forEach(function (k) { if (a[k] !== undefined) o[k] = rv(ctx, a[k]); });
      registerApp(o);
    };
    OPS['sys.boot'] = function (op, ctx) { var n = arg(op, ctx, 'node'); if (n) S.bootNode = n; };
    OPS['sys.launch'] = function (op, ctx) { launch(posId(op, ctx)); };
    OPS['sys.home'] = function () { home(); };
    OPS['sys.back'] = function () { back(); };
    OPS['sys.kill'] = function (op, ctx) { kill(posId(op, ctx)); changed(); };
    OPS['sys.lock'] = function () { lock(); };
    OPS['sys.notify'] = function (op, ctx) { notify(ctx.proc.id, arg(op, ctx, 'text'), arg(op, ctx, 'title')); };
    OPS['sys.clock'] = function (op, ctx) { var d = destOf(op); if (d) assignVar(ctx, d, clockText()); };
    OPS['sys.battery'] = OPS['power.battery'] = function (op, ctx) { var d = destOf(op); if (d) assignVar(ctx, d, Math.round(S.battery)); };
    OPS['sys.setting'] = function (op, ctx) {
      var k = arg(op, ctx, 'key'), v = arg(op, ctx, 'value'), d = destOf(op);
      if (d) assignVar(ctx, d, getSetting(k));
      if (v !== undefined) setSetting(k, v);
    };
    OPS['power.charging'] = function (op, ctx) { var d = destOf(op); if (d) assignVar(ctx, d, S.charging ? 1 : 0); };
    OPS['power.sleep'] = function () { sleep(); };
    OPS['power.wake'] = function () { wake(); };
    function persistIfBooted() { if (S.powered && booted) persistSettings(); }

    // --- ui.* ---
    OPS['ui.screen'] = function (op, ctx) {
      var id = posId(op, ctx) || 'main', props = {};
      if (op.args && op.args.title !== undefined) props.title = op.args.title;
      var s = addScreen(ctx.proc, id, props);
      if (op.children) { var saved = s.children; execOps(op.children, childCtx(ctx, s)); }
      if (op.handlers) Object.keys(op.handlers).forEach(function (ev) { registerHandler(ctx.proc, id, ev, op.handlers[ev]); });
    };
    ['text', 'button', 'input', 'list', 'icon', 'menu', 'image', 'web'].forEach(function (k) {
      OPS['ui.' + k] = function (op, ctx) { addNode(ctx, k, op); };
    });
    ['row', 'col', 'grid'].forEach(function (k) {
      OPS['ui.' + k] = function (op, ctx) {
        var node = addNode(ctx, k, op);
        if (op.children) { node.children = []; execOps(op.children, childCtx(ctx, node)); }
      };
    });
    OPS['ui.set'] = function (op, ctx) {
      var id = posId(op, ctx), n = ctx.proc.nodes[id];
      if (!n) { log('warn', 'ui.set: no widget ' + id); return; }
      var props = rawProps(op, ctx, ['id']);
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (typeof v === 'string' || (v && v.bind === undefined)) v = (typeof v === 'string') ? rv(ctx, v) : v;
        // keep variable bindings live (so async results like net.fetch refresh bound text); inputs need the concrete value
        if (v && v.bind !== undefined && k === 'value' && n.kind === 'input') v = rv(ctx, { $var: v.bind });
        n.props[k] = v;
        if (k === 'value' && n.kind === 'input') ctx.proc.vars[id] = (v && v.bind !== undefined) ? rv(ctx, { $var: v.bind }) : v;
      });
    };
    OPS['ui.get'] = function (op, ctx) {
      var id = posId(op, ctx), n = ctx.proc.nodes[id], d = destOf(op), pr = arg(op, ctx, ['prop', 'key']) || 'text';
      if (n && d) assignVar(ctx, d, resolveProp(ctx.proc, n.props[pr]));
    };
    OPS['ui.on'] = function (op, ctx) {
      var id = posId(op, ctx), ev = (op.args && (op.args.event || op.args.when)) || 'tap';
      if (op.handlers) Object.keys(op.handlers).forEach(function (e) { registerHandler(ctx.proc, id, e, op.handlers[e], true); });
      else if (op.children) registerHandler(ctx.proc, id, ev, op.children, true);
    };

    // --- gfx.* ---
    function canvasFor(op, ctx) {
      var id = (op.args && op.args.id !== undefined) ? String(rv(ctx, op.args.id)) : null;
      var n = id && ctx.proc.nodes[id]; if (n && n.kind === 'canvas') return n;
      return ctx.proc.lastCanvas ? ctx.proc.nodes[ctx.proc.lastCanvas] : null;
    }
    OPS['gfx.canvas'] = function (op, ctx) {
      var n = addNode(ctx, 'canvas', op); n.props.w = toNum(rv(ctx, n.props.w), 240); n.props.h = toNum(rv(ctx, n.props.h), 240);
      if (!n.props.cmds) n.props.cmds = []; ctx.proc.lastCanvas = n.id;
    };
    ['rect', 'circle', 'line', 'text', 'image'].forEach(function (k) {
      OPS['gfx.' + k] = function (op, ctx) {
        var c = canvasFor(op, ctx); if (!c) { log('warn', 'gfx.' + k + ': no canvas'); return; }
        var cmd = { c: k }, a = op.args || {}; Object.keys(a).forEach(function (kk) { if (kk !== 'id') cmd[kk] = rv(ctx, a[kk]); });
        c.props.cmds.push(cmd); if (c.props.cmds.length > 5000) c.props.cmds.shift();
      };
    });
    OPS['gfx.clear'] = function (op, ctx) { var c = canvasFor(op, ctx); if (c) { c.props.cmds = []; var col = arg(op, ctx, 'color'); if (col) c.props.cmds.push({ c: 'clear', color: col }); } };
    // gfx.gl.* -> host.gl.call(GLNode, params, nodeName)
    ['scene', 'camera', 'light', 'geometry', 'material', 'mesh', 'animate', 'shader', 'particle', 'load', 'ui', 'arcedge', 'render'].forEach(function (k) {
      OPS['gfx.gl.' + k] = function (op, ctx) {
        var a = op.args || {};
        if (host.gl && host.gl.call) host.gl.call(a.glNode || k, a.params || '', a.name || ''); else log('info', 'gl.' + k + ' (no GL host)');
      };
    });

    // --- cam.* ---
    function camClose() {
      S.cam.open = false; S.cam.owner = null;
      Object.keys(S.procs).forEach(function (id) { var p = S.procs[id]; if (p.camNode) { removeNode(p, p.camNode); p.camNode = null; } });
      try { if (host.camera && host.camera.close) host.camera.close(); } catch (e) { /* ignore */ }
    }
    function removeNode(p, id) {
      function rm(list) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { list.splice(i, 1); return true; } if (list[i].children && rm(list[i].children)) return true; } return false; }
      Object.keys(p.screens).forEach(function (s) { rm(p.screens[s].children); }); delete p.nodes[id];
    }
    OPS['cam.open'] = function (op, ctx) {
      var f = String(arg(op, ctx, 'facing') || 'back'); if (f !== 'front') f = 'back';
      if (!permOk(ctx.proc.id, 'cam')) { log('warn', 'cam.open blocked: camera permission denied for ' + ctx.proc.id); toast('Camera blocked for ' + (appInfo(ctx.proc.id) ? appInfo(ctx.proc.id).name : ctx.proc.id)); return; }
      S.cam.open = true; S.cam.facing = f; S.cam.synthetic = true; S.cam.owner = ctx.proc.id;
      try {
        if (host.camera && host.camera.open) {
          var r = host.camera.open(f);
          if (r && typeof r.then === 'function') { S.cam.synthetic = true; r.then(function (ok) { if (ok !== false) { S.cam.synthetic = false; changed(); } }, function () { log('warn', 'camera unavailable, using test pattern'); }); }
          else if (r !== false) S.cam.synthetic = false;
        }
      } catch (e) { log('warn', 'camera error: ' + e.message + ' (test pattern)'); S.cam.synthetic = true; }
      if (S.cam.synthetic) log('info', 'camera: synthetic test pattern (' + f + ')');
      if (!ctx.proc.camNode) {
        var n = { kind: 'camera', id: '_cam', props: {}, children: [] };
        ctx.proc.nodes._cam = n; ctx.proc.camNode = '_cam';
        (ctx.container ? ctx.container.children : curScreen(ctx.proc, true).children).push(n);
      }
    };
    OPS['cam.snap'] = function (op, ctx) {
      var d = destOf(op), shot = null;
      if (!S.cam.open) { if (d) assignVar(ctx, d, ''); log('warn', 'cam.snap: camera not open'); return; }
      S.cam.frames++;
      try { if (!S.cam.synthetic && host.camera && host.camera.snap) shot = host.camera.snap(); } catch (e) { shot = null; }
      if (!shot) shot = testPatternSvg(S.cam.facing, S.cam.frames);
      S.cam.last = shot; if (d) assignVar(ctx, d, shot);
    };
    OPS['cam.close'] = function () { camClose(); };

    // --- net.* ---
    function friendlyNetError(url, e) {
      if (e && e.offline) return e.message;
      var host_ = ''; try { host_ = /^[a-z]+:\/\/([^\/?#]+)/i.exec(url)[1]; } catch (x) { host_ = url; }
      var m = e && e.message ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed|fetch failed|cors|network request failed/i.test(m) || (e && e.name === 'TypeError'))
        return "Couldn't reach " + host_ + ". The site may block cross-origin requests (CORS) or you're offline.";
      return "Network error for " + host_ + ': ' + m;
    }
    OPS['net.fetch'] = function (op, ctx) {
      var url = String(arg(op, ctx, 'url') || ''), d = destOf(op), proc = ctx.proc, scope = ctx.scope;
      proc.net = 'loading';
      var run = function (ops, extra) {
        if (!ops || proc.dead) return;
        var c2 = { proc: proc, scope: Object.assign({}, scope, extra), container: null, depth: 0, shared: { n: 0, halt: false } };
        execOps(ops, c2);
      };
      var h = op.handlers || {};
      var fail = function (e) {
        var msg = friendlyNetError(url, e); proc.net = 'error: ' + msg;
        if (d) assignVar({ proc: proc, scope: scope }, d, msg);
        log('warn', 'net.fetch ' + url + ' -> ' + msg);
        run(h.error || h.fail, { error: msg }); changed();
      };
      var p;
      var blocked = netBlock(proc.id);
      if (blocked) { var oe = new Error(blocked); oe.offline = true; p = Promise.resolve(); fail(oe); proc.net = 'offline'; pendingNet.push(p); p.then(function () { var i = pendingNet.indexOf(p); if (i >= 0) pendingNet.splice(i, 1); }); return; }
      try {
        var f = host.fetch || (typeof fetch === 'function' ? fetch : null);
        if (!f) throw new Error('no network available');
        p = Promise.resolve(f(url)).then(function (r) {
          if (r && r.ok === false) { var err = new Error('HTTP ' + r.status); err.http = true; throw err; }
          return r && typeof r.text === 'function' ? r.text() : String(r);
        }).then(function (t) {
          t = String(t).slice(0, 200000); proc.net = 'ok';
          if (d) assignVar({ proc: proc, scope: scope }, d, t);
          log('info', 'net.fetch ' + url + ' ok (' + t.length + ' bytes)');
          run(h.done || h.ok || h.then, { result: t }); changed();
        }, fail);
      } catch (e) { p = Promise.resolve(); fail(e); }
      pendingNet.push(p); p.then(function () { var i = pendingNet.indexOf(p); if (i >= 0) pendingNet.splice(i, 1); });
    };
    OPS['net.status'] = function (op, ctx) { var d = destOf(op); if (d) assignVar(ctx, d, ctx.proc.net); };
    OPS['net.listen'] = function (op, ctx) {
      var a = op.args || {}, ev = String(a.event || a.when || '');
      var h = op.handlers && (op.handlers[ev] || op.handlers.event || op.handlers[Object.keys(op.handlers)[0]]);
      if (ev && h) (S.netListeners[ev] = S.netListeners[ev] || []).push({ proc: ctx.proc, ops: h });
    };
    K.emitNet = function (evt, payload) {
      (S.netListeners[evt] || []).forEach(function (l) {
        if (l.proc.dead) return;
        execOps(l.ops, { proc: l.proc, scope: { evt: evt, payload: payload }, container: null, depth: 0, shared: { n: 0, halt: false } });
      }); changed();
    };

    // --- store.* ---
    function skey(ctx, k) { return ctx.proc.id + ':' + k; }
    // store.get (app/key) reads another app's stored value (read-only: store.set always writes the caller's own namespace)
    function rkey(ctx, k) { var m = /^([\w-]+)\/(.+)$/.exec(String(k)); return m && S.appIndex[m[1]] ? m[1] + ':' + m[2] : skey(ctx, k); }
    OPS['store.get'] = function (op, ctx) {
      var v = sysStore.get(rkey(ctx, arg(op, ctx, 'key'))), d = destOf(op);
      if (d && v != null) assignVar(ctx, d, numify(v));   // missing key leaves the variable (and its default) unchanged
    };
    OPS['store.set'] = function (op, ctx) {
      var a = op.args || {}, w = a['with'] !== undefined ? strip(a['with']) : null, v;
      if (w) { v = lookupVar(ctx, w); if (v === undefined) v = w; } else v = arg(op, ctx, 'value');
      sysStore.set(skey(ctx, arg(op, ctx, 'key')), fmt(v));
    };

    // --- snd / sensor / input ---
    OPS['snd.play'] = function (op, ctx) { log('info', 'snd.play ' + (arg(op, ctx, 'src') || '')); try { host.snd && host.snd.play && host.snd.play(arg(op, ctx, 'src')); } catch (e) { /* ignore */ } };
    OPS['snd.stop'] = function () { try { host.snd && host.snd.stop && host.snd.stop(); } catch (e) { /* ignore */ } };
    OPS['snd.volume'] = function (op, ctx) { setSetting('volume', toNum(arg(op, ctx, 'level'), 0.5) * (toNum(arg(op, ctx, 'level'), 0.5) <= 1 ? 100 : 1)); };
    OPS['snd.beep'] = function (op, ctx) {
      if (getPref('silent') || S.volume === 0) { log('info', 'beep (muted)'); return; }
      log('info', 'beep'); if (getPref('a11y.captions')) toast('\u266A Beep');   // captions: sounds are announced on screen
      try { host.snd && host.snd.beep && host.snd.beep(arg(op, ctx, 'freq'), arg(op, ctx, 'ms'), { mono: !!getPref('a11y.mono') }); } catch (e) { /* ignore */ }
    };
    OPS['sensor.tilt'] = function (op, ctx) {
      var t = (host.sensors && host.sensors.tilt && host.sensors.tilt()) || S.tilt, d = destOf(op);
      if (d) assignVar(ctx, d, [t.x, t.y, t.z].map(function (n) { return +toNum(n).toFixed(2); }).join(','));
    };
    OPS['sensor.location'] = function (op, ctx) {
      var l = (host.sensors && host.sensors.location && host.sensors.location()) || S.loc, d = destOf(op);
      if (!permOk(ctx.proc.id, 'loc')) { log('warn', 'sensor.location blocked for ' + ctx.proc.id); if (d) assignVar(ctx, d, ''); return; }
      if (d) assignVar(ctx, d, l.lat + ',' + l.lon);
    };
    OPS['input.on'] = function (op, ctx) {
      var k = posId(op, ctx), h = op.handlers && (op.handlers.press || op.handlers[Object.keys(op.handlers)[0]]);
      if (k && h) ctx.proc.keyHandlers[k] = h;
    };
    OPS['input.haptic'] = function (op, ctx) { if (!getPref('haptics')) return; try { host.haptic && host.haptic(toNum(arg(op, ctx, 'ms'), 20)); } catch (e) { /* ignore */ } };

    // ---------- system actions ----------
    function clockText() {
      var d = dparts(), h = d.h, m = d.m;
      if (S.clock24) return pad2(h) + ':' + pad2(m);
      return ((h % 12) || 12) + ':' + pad2(m);
    }
    function dateText() {
      var d = dparts(), f = getPref('datefmt'), dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.dow],
          mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.mo];
      if (f === 'ISO') return dow + ', ' + d.y + '-' + pad2(d.mo + 1) + '-' + pad2(d.day);
      return f === 'DMY' ? dow + ', ' + d.day + ' ' + mon : dow + ', ' + mon + ' ' + d.day;
    }
    function notify(appId, text, title) {
      if (getPref('notif.app.' + appId) === false) { log('info', 'notification from ' + appId + ' suppressed (Rings > Notifications)'); return null; }
      var info = appInfo(appId), n = { id: seq++, app: appId, title: title || (info ? info.name : appId), text: String(text == null ? '' : text), t: now(), fresh: !S.dnd, age: 0 };
      S.notifs.unshift(n); if (S.notifs.length > 50) S.notifs.pop();
      log('info', 'notify [' + n.title + '] ' + n.text); changed(); return n;
    }
    function toast(text, ms) { S.toast = { text: text, age: 0, ms: ms || 1600 }; }
    function lock() { S.locked = true; S.pin = ''; S.shade = false; changed(); }
    function sleep() { S.screenOff = true; lock(); }
    function wake() { S.screenOff = false; S.lastActive = now(); changed(); }
    function unlock() {
      S.locked = false; S.pin = ''; S.pinError = false; S.page = 0; log('info', 'unlocked'); changed();
    }
    function pinKey(d) {
      var code = passcode();
      if (d === 'del') S.pin = S.pin.slice(0, -1); else S.pin += d;
      S.pinError = false;
      if (code && S.pin.length >= code.length) { if (S.pin === code) { unlock(); return; } S.pin = ''; S.pinError = true; }
      changed();
    }
    function press(key) {
      key = String(key).toLowerCase(); S.lastActive = now();
      if (key === 'power') {
        if (!S.powered) { K.boot(); return true; }
        if (S.screenOff) wake(); else sleep();
        return true;
      }
      if (key === 'powerlong') { K.shutdown(); return true; }
      if (!S.powered || S.screenOff) return false;
      if (key === 'volup' || key === 'voldown') {
        var p = S.fg && S.procs[S.fg];
        if (p && p.keyHandlers[key]) { runKey(p, key); return true; }
        S.volume = clamp(S.volume + (key === 'volup' ? 10 : -10), 0, 100); toast('Volume ' + S.volume); persistSettings(); changed(); return true;
      }
      if (key === 'forward') {   // GESTURES: app handler first (input.on (forward)); otherwise re-open the last closed/left app
        if (S.locked) return false;
        var fp = S.fg && S.procs[S.fg];
        if (fp && fp.keyHandlers.forward) { runKey(fp, 'forward'); return true; }
        if (!S.fg && S.fwd && S.appIndex[S.fwd]) { launch(S.fwd); return true; }
        return false;
      }
      if (key === 'home' || key === 'back') {
        if (!S.locked) {
          var q = S.fg && S.procs[S.fg];
          if (q && q.keyHandlers[key]) {
            // GESTURES: an input.on (back) handler only CONSUMES the key if it changed something (screen, history, vars, widgets, foreground app);
            // a handler that did nothing (e.g. 'go to list' while already on the list) falls through to the OS default so Back can still leave the app.
            var before = key === 'back' ? stateSig(q) : null, fgBefore = S.fg;
            runKey(q, key);
            if (key === 'home' || S.fg !== fgBefore || S.shade || stateSig(q) !== before) return true;
          }
        }
        if (key === 'home') { if (S.locked) return false; home(); } else back();
        return true;
      }
      if (key === 'shade') { toggleShade(); return true; }
      return false;
    }
    function stateSig(p) {   // GESTURES: cheap fingerprint of an app's observable state
      try { var np = {}; Object.keys(p.nodes).forEach(function (k) { np[k] = p.nodes[k].props; }); return JSON.stringify([p.cur, p.hist, p.vars, np, p.ringsPage, S.notifs.length, S.volume, S.brightness, S.theme, S.cam.open]); } catch (e) { return String(Math.random()); }
    }
    function runKey(p, key) {
      execOps(p.keyHandlers[key], { proc: p, scope: { key: key }, container: null, depth: 0, shared: { n: 0, halt: false } }); changed();
    }
    function toggleShade(v) { if (!S.powered || S.screenOff) return; S.shade = v === undefined ? !S.shade : !!v; changed(); }

    // ==== updates:kernel ====  system information, versioning, OTA updates, developer options (docs/samara/UPDATES.md)
    var SYS_PAGES = { about: 'RingsAbout', sysupdate: 'RingsSysUpdate', devopts: 'RingsDevOpts' };
    var SYS_TITLES = { about: 'About phone', sysupdate: 'System update', devopts: 'Developer options' };
    var flags = { dev: false, touches: false, bounds: false };
    function sysLoadFlags() { try { var f = JSON.parse(sysStore.get('sysflags') || 'null'); if (f && typeof f === 'object') flags = Object.assign({ dev: false, touches: false, bounds: false }, f); } catch (e) { /* defaults */ } }
    function sysSaveFlags() { sysStore.set('sysflags', JSON.stringify(flags)); }
    function osInfo() {
      var m = seed.meta || {}, o = seed.os || {};
      return { name: m.name || o.name || 'Samara OS', version: m.version || o.version || '0.0.0', build: m.build || 0, channel: m.channel || 'stable', schema: m.schema || SCHEMA,
        id: m.id || null, feed: m.feed || null, notes: m.notes || '', minKernel: m.minKernel || null, builtAt: seed.built || null, hasMeta: !!seed.meta };
    }
    function deviceId() {
      var ls = null, key = 'samara:device-id', id = null;
      try { id = host.deviceId ? host.deviceId() : null; } catch (e) { id = null; }
      if (id) return String(id);
      try { ls = host.storage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { ls = null; }
      try { id = ls && ls.getItem(key); } catch (e) { id = null; }
      if (!id) {
        var r = ''; for (var i = 0; i < 8; i++) r += Math.floor(Math.random() * 16).toString(16);
        id = 'SMR-' + r.slice(0, 4).toUpperCase() + '-' + r.slice(4).toUpperCase();
        try { if (ls) ls.setItem(key, id); } catch (e) { /* not persisted */ }
      }
      return id;
    }
    function hasSha() { return !!(global.Seedpress && global.Seedpress.sha256); }
    function seedBytes() { try { return JSON.stringify(seed).length; } catch (e) { return 0; } }
    function fmtBytes(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }
    function fmtUp(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ' h ' : '') + m + ' min ' + (s % 60) + ' s'; }
    function fmtWhen(t) {
      if (!t) return 'never';
      var d = new Date(t), n = new Date(now()), same = d.toDateString() === n.toDateString(), h = d.getHours();
      return (same ? 'today' : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate()) + ' ' + ((h % 12) || 12) + ':' + pad2(d.getMinutes()) + (h < 12 ? ' AM' : ' PM');
    }
    function sysInfo() {
      var o = osInfo(), ua = '';
      try { ua = (host.info && host.info().userAgent) || (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''; } catch (e) { ua = ''; }
      return {
        os: o,
        kernel: { version: VERSION, schema: SCHEMA },
        seed: { sha256: seed.sha256 || null, short: seed.sha256 ? String(seed.sha256).slice(0, 12) : '(unsealed)', bytes: seedBytes(), files: Object.keys(seed.sources || {}).length, nodes: Object.keys(program).length, apps: (manifest.apps || []).length, format: seed.format || 1 },
        uptimeMs: S.uptime,
        device: { id: deviceId(), model: 'Samara One (simulated)', name: 'Samara One', simulated: true,
          hardware: 'Simulated: this phone is JavaScript running in a web browser. CPU, memory, radios and sensors are emulated.',
          screen: (S.orientation === 'landscape' ? '780 x 360' : '360 x 780') + ' CSS px', userAgent: ua },
        flags: { developer: !!flags.dev, showTouches: !!flags.touches, showBounds: !!flags.bounds },
        feed: sysFeed()
      };
    }
    Object.defineProperty(K, 'system', { get: function () { return sysInfo(); }, enumerable: true });
    function sysFeed() { var f = null; try { f = typeof host.updateFeedUrl === 'function' ? host.updateFeedUrl() : host.updateFeedUrl; } catch (e) { f = null; } return f || osInfo().feed || null; }
    function buildInfoText() {
      var i = sysInfo(), o = i.os;
      return [o.name + ' ' + o.version + ' (build ' + o.build + ')', 'Channel: ' + o.channel, 'Ash OS schema: ' + o.schema + '   Kernel: ' + i.kernel.version + ' (schema ' + i.kernel.schema + ')',
        'Seed sha256: ' + (i.seed.sha256 || 'n/a'), 'Built: ' + (o.builtAt || 'unknown'), 'Device: ' + i.device.id + ' (' + i.device.model + ')'].join('\n');
    }
    function copyText(t) {
      try { if (host.copy) { var r = host.copy(t); if (r && r.then) r.then(function () { toast('Build info copied'); changed(); }, function () { toast('Copy failed'); changed(); }); else toast(r === false ? 'Copy failed' : 'Build info copied'); return; } } catch (e) { /* fall through */ }
      try { if (typeof navigator !== 'undefined' && navigator.clipboard) { navigator.clipboard.writeText(t).then(function () { toast('Build info copied'); changed(); }, function () { toast('Copy failed'); changed(); }); return; } } catch (e) { /* ignore */ }
      toast('Copy is not available here');
    }
    function romText() {
      var i = sysInfo(), lines = ['seed sha256  ' + (i.seed.sha256 || 'n/a'), 'format ' + i.seed.format + ' · schema ' + i.os.schema + ' · ' + fmtBytes(i.seed.bytes), 'built ' + (i.os.builtAt || 'unknown'),
        i.seed.nodes + ' nodes · ' + i.seed.apps + ' apps · boot ' + (manifest.boot || 'Crown'), '', 'source files:'];
      Object.keys(seed.sources || {}).sort().forEach(function (p) {
        var t = String(seed.sources[p]);
        lines.push('  ' + p + '\n    ' + fmtBytes(t.length) + (hasSha() ? ' · sha256 ' + global.Seedpress.sha256(t).slice(0, 16) : ''));
      });
      if ((seed.meta || {}).migrations) lines.push('', 'migrations: ' + seed.meta.migrations.length);
      return lines.join('\n');
    }
    function U() { return host.update || null; }

    // ---- bound variables for the system pages ----
    function updStatus(st) {
      if (st.phase === 'checking') return 'Checking for updates…';
      if (st.phase === 'downloading') return 'Downloading update…';
      if (st.phase === 'verifying') return 'Verifying download…';
      if (st.phase === 'staging') return 'Preparing update…';
      if (st.error) return '⚠ ' + st.error;
      if (st.staged) return 'Update ' + st.staged.release.version + ' is ready to install';
      if (st.available) return 'Update ' + st.available.release.version + ' is available';
      var lc = st.lastCheck;
      if (lc && lc.status === 'uptodate') return 'Your system is up to date';
      if (lc && lc.status === 'incompatible') return 'Update ' + lc.version + " can't be installed on this phone: " + (lc.reasons || []).join('; ');
      return 'Tap Check for updates to look for a new version';
    }
    function bar(f) { var n = Math.round(Math.max(0, Math.min(1, f)) * 20); return new Array(n + 1).join('█') + new Array(21 - n).join('░') + '  ' + Math.round(f * 100) + '%'; }
    function sysVars(proc, page) {
      var v = proc.vars, i = sysInfo(), o = i.os;
      if (page === 'about') {
        v.about_model = i.device.model;
        v.about_hw = 'No physical hardware: simulated in a web browser';
        v.about_os = o.name + ' ' + o.version;
        v.about_build = o.version + '+' + o.build + (flags.dev ? '   · developer options ON' : '');
        v.about_channel = o.channel;
        v.about_schema = String(o.schema) + (o.minKernel ? '   · needs kernel ≥ ' + o.minKernel : '');
        v.about_kernel = 'Samara kernel ' + i.kernel.version + ' · speaks schema ' + i.kernel.schema;
        v.about_seed = 'sha256 ' + i.seed.short + '…  ·  ' + fmtBytes(i.seed.bytes) + '  ·  ' + i.seed.files + ' source files, ' + i.seed.apps + ' apps';
        v.about_built = o.builtAt || 'unknown';
        v.about_up = fmtUp(S.uptime);
        v.about_dev = i.device.id;
        v.about_batt = Math.round(S.battery) + '%' + (S.charging ? ' · charging' : '');
        v.about_screen = i.device.screen;
        v.about_feed = (i.feed || 'none configured');
        v.about_ua = (i.device.userAgent ? i.device.userAgent.slice(0, 120) : 'unknown');
        v.about_hint = S.buildHint || '';
        v.about_legal = '© DART Meadow | Radical Deepscale LLC · Samara OS runs Ash OS source (.ashos) compiled by Seedpress';
      } else if (page === 'sysupdate') {
        var up = U(), st = up ? up.getState() : null;
        v.upd_current = o.name + ' ' + o.version + '  (build ' + o.build + ')\nChannel: ' + o.channel + ' · schema ' + o.schema + ' · kernel ' + i.kernel.version;
        if (!st) { v.upd_status = 'Updates are not available on this host (no update service attached).'; v.upd_bar = ''; v.upd_notes = ''; v.upd_btn = 'Updates unavailable'; v.upd_last = ''; v.upd_roll = 'Roll back'; v.upd_hist = ''; v.upd_auto = 'Automatic updates: n/a'; v.upd_sched = ''; v.upd_hint = ''; v.upd_ch_stable = 'Stable'; v.upd_ch_beta = 'Beta'; v.upd_ch_dev = 'Dev'; return; }
        v.upd_status = updStatus(st);
        var busy = st.phase === 'downloading' || st.phase === 'verifying' || st.phase === 'staging';
        v.upd_bar = busy ? bar(st.progress || 0) : '';
        var rel = (st.staged && st.staged.release) || (st.available && st.available.release) || null;
        v.upd_notes = rel ? ('What\'s new in ' + rel.version + (rel.size ? '  (' + fmtBytes(rel.size) + ')' : '') + '\n' + (rel.notes || '(no release notes)') + (rel.delta && rel.delta.length ? '\nChanged files: ' + rel.delta.map(function (d) { return d.path + ' (' + d.change + ')'; }).join(', ') : ''))
          : (o.notes ? 'About this version (' + o.version + ')\n' + o.notes : '');
        v.upd_btn = up.primaryLabel();
        v.upd_last = 'Last checked: ' + (st.lastCheck ? fmtWhen(st.lastCheck.t) + (st.lastCheck.auto ? ' (automatic)' : '') : 'never') + (st.local ? '\nUsing a local test feed (Developer options)' : '');
        ['stable', 'beta', 'dev'].forEach(function (c) { v['upd_ch_' + c] = (st.channel === c ? '● ' : '○ ') + c.charAt(0).toUpperCase() + c.slice(1); });
        v.upd_auto = st.auto.enabled ? 'Automatic updates: ON  (tap to turn off)' : 'Automatic updates: OFF  (tap to turn on)';
        v.upd_sched = 'Schedule: ' + (st.auto.schedule === 'nightly' ? 'Nightly 02:00–04:00 (simulated clock)' : 'Whenever online (Wi-Fi only, simulated)') + '  · tap to change';
        v.upd_hint = st.trial ? 'Trial boot: if this version fails to start twice, the phone rolls back to ' + st.trial.from + ' by itself.' : '';
        var pv = st.previousInfo;
        v.upd_roll = pv ? 'Roll back to ' + pv.version + (pv.slot === 'base' ? ' (factory image)' : '') : 'Roll back (no previous version stored)';
        v.upd_hist = (st.history || []).slice(0, 6).map(function (h) { return fmtWhen(h.t) + ' · ' + h.event + (h.detail ? ' · ' + h.detail : ''); }).join('\n') || 'No update activity yet';
      } else if (page === 'devopts') {
        var up2 = U(), st2 = up2 ? up2.getState() : null;
        v.dev_state = flags.dev ? 'Developer options are ON' : 'Developer options are OFF. Open About phone and tap Build number 7 times.';
        v.dev_master = flags.dev ? 'Turn developer options OFF' : 'Turn developer options ON';
        v.dev_touches = (flags.touches ? '☑ ' : '☐ ') + 'Show touches';
        v.dev_bounds = (flags.bounds ? '☑ ' : '☐ ') + 'Show layout bounds';
        v.dev_fault = (st2 && st2.fault === 'hash' ? '☑ ' : '☐ ') + 'Corrupt the next update download (test failure handling)';
        v.dev_skew = 'Jump simulated clock to 03:00 (triggers nightly auto-update)';
        v.dev_clock = 'Simulated device time: ' + fmtWhen(now()) + (S.clockSkew ? ' (skewed ' + Math.round(S.clockSkew / 60000) + ' min)' : '');
        v.dev_reset = S.resetArmed && now() - S.resetArmed < 5000 ? 'Tap again to ERASE all data' : 'Factory data reset (erases settings and app data)';
        v.dev_localfeed = st2 && st2.local ? 'Use the real update feed again' : 'Local test feed: off';
        v.dev_log = S.logLines.slice(-25).reverse().join('\n') || '(log is empty)';
        v.dev_rom = romText();
      }
    }
    function activeSysProc() {
      var r = S.procs && S.procs.rings;
      return r && S.fg === 'rings' && SYS_PAGES[r.ringsPage] && S.sysPages[r.ringsPage] ? S.sysPages[r.ringsPage] : null;
    }
    function ensureSysPage(page) {
      var old = S.sysPages[page]; if (old) old.dead = true;
      var p = makeProc('rings:' + page); S.sysPages[page] = p;
      if (program[SYS_PAGES[page]]) runNode(SYS_PAGES[page], p, {}, 0);
      else { addScreen(p, page, { title: SYS_TITLES[page] }); curScreen(p, true).children.push({ kind: 'text', id: 'nopage', props: { text: 'This OS image does not include the "' + SYS_TITLES[page] + '" page (node ' + SYS_PAGES[page] + ').', color: 'dim' }, children: [] }); }
      sysVars(p, page);
      sysHook = function () { var a = activeSysProc(); if (a) sysVars(a, S.procs.rings.ringsPage); };
      return p;
    }
    function sysOnRings(page) { if (SYS_PAGES[page]) ensureSysPage(page); }
    function sysPageV(proc, page) {
      var s = proc.screens[proc.cur], body = s ? s.children.map(function (c) { return nodeToV(c, proc); }) : [];
      return V('view', 'app:rings', { app: 'rings', screen: page }, [V('appbar', '@appbar', { title: SYS_TITLES[page], back: true, home: true, glyph: '⚙' }, [], ['tap']), V('scroll', 'scroll:rings-' + page, {}, body)]);
    }
    function sysRingsSection(kids, section) {
      var items = [V('button', '@rings:sysupdate', { label: 'System update', kind: 'card' }, [], ['tap']), V('button', '@rings:about', { label: 'About phone', kind: 'card' }, [], ['tap'])];
      if (flags.dev) items.push(V('button', '@rings:devopts', { label: 'Developer options', kind: 'card' }, [], ['tap']));
      kids.push(V('section', null, { title: 'System' }, [V('col', null, { gap: 8 }, items)]));
    }

    // ---- ops ----
    function sysReboot(r, reason) {
      if (!r || !r.ok) return;
      log('info', 'rebooting into ' + r.version + ' (' + reason + ')');
      if (host.reboot) { try { host.reboot({ seed: r.seed, reason: reason, version: r.version }); } catch (e) { log('error', 'reboot failed: ' + e.message); } }
      else { K.pendingReboot = r; toast('Restart to finish'); }
    }
    function track(p) { pendingNet.push(p); p.then(function () { var i = pendingNet.indexOf(p); if (i >= 0) pendingNet.splice(i, 1); changed(); }, function () { var i = pendingNet.indexOf(p); if (i >= 0) pendingNet.splice(i, 1); changed(); }); }
    function boolish(v, cur) { v = String(v).toLowerCase(); return v === 'toggle' || v === 'undefined' || v === '' ? !cur : (v === 'on' || v === 'true' || v === '1'); }
    OPS['sys.about'] = function (op, ctx) {
      var a = String(arg(op, ctx, 'action') || 'refresh').toLowerCase();
      if (a === 'tapbuild') {
        var t = now(); if (t - S.buildTapAt > 3000) S.buildTaps = 0; S.buildTapAt = t; S.buildTaps++;
        if (flags.dev) S.buildHint = 'Developer options are already on.';
        else if (S.buildTaps >= 7) { flags.dev = true; sysSaveFlags(); S.buildHint = 'You are now a developer!'; toast('You are now a developer!'); log('info', 'developer options enabled'); }
        else if (S.buildTaps >= 3) S.buildHint = (7 - S.buildTaps) + ' more tap' + (7 - S.buildTaps === 1 ? '' : 's') + ' to enable Developer options';
        sysVars(ctx.proc, 'about');
      } else if (a === 'copy') copyText(buildInfoText());
      else sysVars(ctx.proc, 'about');
    };
    OPS['sys.update'] = function (op, ctx) {
      var a = String(arg(op, ctx, 'action')).toLowerCase(), val = arg(op, ctx, 'value'), up = U(), d = destOf(op);
      if (!up) { toast('Updates unavailable on this host'); return; }
      var st = up.getState();
      switch (a) {
        case 'check': track(up.check()); break;
        case 'download': track(up.download()); break;
        case 'primary': { var pr = up.primary(); track(pr.then(function (r) { if (r && r.ok && r.seed) sysReboot(r, 'update'); else if (r && r.ok === false && r.error && r.error !== 'busy') toast(r.error.slice(0, 60)); return r; })); break; }
        case 'apply': { var r1 = up.apply(); if (!r1.ok) toast(r1.error); else sysReboot(r1, 'update'); break; }
        case 'rollback': { var r2 = up.rollback('user'); if (!r2.ok) toast(r2.error); else sysReboot(r2, 'rollback'); break; }
        case 'channel': up.setChannel(String(val).toLowerCase()); break;
        case 'auto': up.setAuto({ enabled: boolish(val, st.auto.enabled) }); break;
        case 'schedule': up.setAuto({ schedule: String(val).toLowerCase() === 'toggle' || val === undefined ? (st.auto.schedule === 'wifi' ? 'nightly' : 'wifi') : String(val).toLowerCase() }); break;
        case 'simulate': if (up.simulate) track(up.simulate()); break;
        case 'clearlocal': if (up.clearLocalFeed) up.clearLocalFeed(); break;
        case 'fault': up.setFault(st.fault ? null : (String(val || 'hash'))); break;
        case 'status': break;
        default: log('warn', 'sys.update: unknown action ' + a);
      }
      if (d) assignVar(ctx, d, updStatus(up.getState()));
      sysVars(ctx.proc, S.procs.rings ? S.procs.rings.ringsPage : 'sysupdate');
    };
    OPS['sys.dev'] = function (op, ctx) {
      var a = String(arg(op, ctx, 'action')).toLowerCase(), val = arg(op, ctx, 'value'), v = val === undefined ? '' : String(val).toLowerCase();
      switch (a) {
        case 'enable': flags.dev = true; sysSaveFlags(); break;
        case 'disable': flags.dev = false; flags.touches = false; flags.bounds = false; sysSaveFlags(); break;
        case 'toggle':
          if (v === 'touches') flags.touches = !flags.touches; else if (v === 'bounds') flags.bounds = !flags.bounds; else { flags.dev = !flags.dev; if (!flags.dev) { flags.touches = false; flags.bounds = false; } }
          sysSaveFlags(); break;
        case 'clearlog': S.logLines = []; break;
        case 'skipclock': {
          var nowMs = now(), dd = new Date(nowMs), tgt = new Date(nowMs); tgt.setHours(3, 0, 0, 0); if (tgt.getTime() <= nowMs) tgt.setDate(tgt.getDate() + 1);
          S.clockSkew += tgt.getTime() - nowMs; log('info', 'dev: simulated clock moved to ' + tgt.toISOString()); sysAutoTick(); break;
        }
        case 'factoryreset': {
          var t0 = now();
          if (!S.resetArmed || t0 - S.resetArmed > 5000) { S.resetArmed = t0; toast('Tap again to erase all data'); break; }
          S.resetArmed = 0; factoryReset(); return;
        }
        case 'log': case 'rom': case 'status': break;
        default: log('warn', 'sys.dev: unknown action ' + a);
      }
      sysVars(ctx.proc, S.procs.rings ? S.procs.rings.ringsPage : 'devopts');
    };
    function factoryReset() {
      var keys = sysStore.keys(); keys.slice().forEach(function (k) { sysStore.remove(k); });
      sysStore.remove('__idx'); flags = { dev: false, touches: false, bounds: false };
      log('warn', 'factory data reset: erased ' + keys.length + ' keys');
      try { if (host.factoryReset) { host.factoryReset(); return; } } catch (e) { log('error', 'factoryReset hook: ' + e.message); }
      if (host.reboot) host.reboot({ seed: null, reason: 'factory-reset' }); else { K.shutdown(); K.boot(); }
    }

    // ---- boot-time hooks: state migration, boot confirmation, "just updated" notice, auto-update ----
    var RESERVED = { settings: 1, osver: 1, sysflags: 1, __idx: 1 };
    function sysMigrate() {
      var cur = osInfo().version, last = sysStore.get('osver'), SU = global.SamaraUpdate;
      if (!last) { sysStore.set('osver', cur); return; }
      if (last === cur) return;
      if (!SU) { log('warn', 'state version changed ' + last + ' -> ' + cur + ' but SamaraUpdate is not loaded; no migration'); sysStore.set('osver', cur); return; }
      var keys = sysStore.keys();
      function gather() {
        var st = { settings: {}, kv: {} };
        try { st.settings = JSON.parse(sysStore.get('settings') || '{}') || {}; } catch (e) { st.settings = {}; }
        keys.forEach(function (k) { if (!RESERVED[k] && k.indexOf('snap:') !== 0) st.kv[k] = sysStore.get(k); });
        return st;
      }
      function write(st) {
        sysStore.set('settings', JSON.stringify(st.settings || {}));
        var want = st.kv || {};
        keys.forEach(function (k) { if (!RESERVED[k] && k.indexOf('snap:') !== 0 && want[k] === undefined) sysStore.remove(k); });
        Object.keys(want).forEach(function (k) { sysStore.set(k, want[k]); });
      }
      var cmp = SU.compareVersions(last, cur);
      if (cmp < 0) {                                     // upgrade: snapshot first so a rollback can put the old state back exactly
        var before = gather(); sysStore.set('snap:' + last, JSON.stringify(before));
        var res = SU.runMigrations(before, last, cur, (seed.meta || {}).migrations);
        if (res.ok) { write(res.state); log('info', 'state migrated ' + last + ' -> ' + cur + ' (' + res.applied.length + ' steps)'); S.migrated = { from: last, to: cur, steps: res.applied.length }; }
        else log('error', 'state migration failed, keeping old state: ' + res.error);
      } else {                                            // downgrade / rollback: restore the snapshot taken when we left `cur`
        var snap = sysStore.get('snap:' + cur);
        if (snap) { try { write(JSON.parse(snap)); log('info', 'state restored from snapshot of ' + cur); S.migrated = { from: last, to: cur, steps: 0, restored: true }; } catch (e) { log('warn', 'bad state snapshot ignored'); } }
        else log('info', 'rolled back ' + last + ' -> ' + cur + ' without a state snapshot; keeping current state');
      }
      sysStore.set('osver', cur);
    }
    var updSubscribed = false;
    function sysAfterBoot() {
      var up = U(); if (!up) return;
      if (!updSubscribed && up.on) {
        updSubscribed = true;
        K._unsubUpd = up.on(function (evt) {
          if (evt && evt.type === 'staged' && evt.auto && S.powered) { notify('rings', 'Update ' + evt.release.version + ' downloaded. It will install the next time your phone restarts.', 'System update'); }
          if (S.powered) changed();
        });
      }
      try { up.markBootGood && up.markBootGood(); } catch (e) { /* ignore */ }
      var j = up.takeJust && up.takeJust();
      if (j) {
        if (j.rolledBack) notify('rings', 'Samara OS went back to ' + j.to + '.', 'System update');
        else notify('rings', 'Samara OS updated to ' + j.to + ' (from ' + j.from + ').' + (j.notes ? '\n' + String(j.notes).slice(0, 140) : ''), 'System update');
        S.justUpdated = j;
      }
      sysAutoTick();
    }
    function sysAutoTick() { var up = U(); if (up && up.autoTick && S.powered) { var p = up.autoTick(now()); if (p && p.then) track(p); } }
    // ==== /updates:kernel ====

    // ---------- boot / shutdown ----------
    var booted = false;
    K.boot = function () {
      if (S.powered) return K;
      S.powered = true; S.screenOff = false; S.locked = manifest.lock === false ? false : true; S.fg = null;
      S.apps = []; S.appIndex = {}; S.procs = {}; S.sysPages = {}; S.recents = []; S.notifs = []; S.page = 0; S.shade = false; S.fwd = null; S.sampled = false;
      Object.assign(S, { theme: 'Ash Dark', wallpaper: 'theme', cols: 4, rows: 5, dock: 4, brightness: 1, volume: 50, clock24: false, dnd: false, prefs: {}, drawer: false, drawerQuery: '', autoMode: null, lastActive: now() });
      booted = false;
      sysLoadFlags(); sysMigrate();                                 // updates: flags + versioned state migration, BEFORE settings are read
      var savedRaw = sysStore.get('settings');
      // 1. manifest
      if (manifest.theme) setSetting('theme', manifest.theme, true);
      if (manifest.wallpaper) setSetting('wallpaper', manifest.wallpaper, true);
      var lay = manifest.layout;
      if (lay) {
        var g = lay.grid || (lay.cols && lay.rows ? lay.cols + 'x' + lay.rows : null);
        if (g) setSetting('layout', g, true); if (lay.dock !== undefined) setSetting('dock', lay.dock, true);
      }
      if (manifest.clock24) S.clock24 = true;
      (manifest.apps || []).forEach(registerApp);
      registerApp({ id: 'rings', name: 'Rings', glyph: '⚙', color: '#8b98a5', system: true });
      S.appIndex.rings.system = true;
      // 2. boot node (Crown): may register apps / theme / layout and host home widgets
      crown = S.procs.crown = makeProc('crown');
      if (program[S.bootNode]) runNode(S.bootNode, crown, {}, 0); else log('warn', 'boot node "' + S.bootNode + '" not found');
      // 3. persisted user settings override
      try {
        var saved = JSON.parse(savedRaw || 'null');
        if (saved) {
          ['theme', 'wallpaper', 'dock', 'brightness', 'volume', 'clock24', 'dnd'].forEach(function (k) { if (saved[k] !== undefined) setSetting(k, saved[k], true); });
          if (saved.cols && saved.rows) { S.cols = saved.cols; S.rows = saved.rows; }
          if (saved.prefs && typeof saved.prefs === 'object') Object.keys(saved.prefs).forEach(function (k) { setPref(k, saved.prefs[k], true); });
          if (saved.customOpts && S.custom) K.setCustomOptions(saved.customOpts);
          if (saved.wallpaper === 'custom' && S.custom) S.wallpaper = 'custom';
        }
      } catch (e) { /* ignore corrupt settings */ }
      booted = true; sysAfterBoot();
      log('info', 'Samara OS ' + osInfo().version + ' (kernel ' + VERSION + ') booted (' + S.apps.length + ' apps, theme ' + S.theme + ')');
      changed(); return K;
    };
    K.shutdown = function () {
      if (!S.powered) return K;
      persistSettings(); camClose(); if (K._unsubUpd) { K._unsubUpd(); K._unsubUpd = null; updSubscribed = false; }
      Object.keys(S.procs).forEach(function (id) { S.procs[id].dead = true; });
      S.procs = {}; S.sysPages = {}; crown = null; S.powered = false; S.fg = null; S.shade = false; S.netListeners = {};
      log('info', 'shutdown'); changed(); return K;
    };

    // ---------- tick (simulated battery / signal / transient UI) ----------
    K.tick = function (dtMs) {
      dtMs = dtMs || 0; if (!S.powered) return;
      S.uptime += dtMs;
      var per = (S.screenOff ? 600000 : 120000) * (getPref('bat.saver') ? 1.6 : 1);                // ms per 1% drain (battery saver: 60% slower, simulated)
      if (S.charging) { S.battery = Math.min(100, S.battery + dtMs / 30000); }
      else { S.battery = Math.max(0, S.battery - dtMs / per); }
      if (S.battery <= 0 && !S.charging) { K.shutdown(); return; }
      var ch = false;
      S.notifs.forEach(function (n) { if (n.fresh) { n.age += dtMs; if (n.age > 3500) { n.fresh = false; ch = true; } } });
      if (S.toast) { S.toast.age += dtMs; if (S.toast.age > (S.toast.ms || 1600)) { S.toast = null; ch = true; } }
      S.updAcc = (S.updAcc || 0) + dtMs; if (S.updAcc >= 60000) { S.updAcc = 0; sysAutoTick(); }
      S.signal = 3 + Math.floor((Math.sin(S.uptime / 60000) + 1) * 0.99);
      applyAutoDark();
      var to = +getPref('timeout');   // Rings > Display > Screen timeout (uses the host clock, so it is testable)
      if (to > 0 && !S.screenOff && S.lastActive && now() - S.lastActive > to * 1000) sleep();
      changed();
    };

    // ---------- storage / session (used by Rings pages and js/phone/persist.js) ----------
    function appStoreKeys(id) { return sysStore.keys().filter(function (k) { return k.indexOf(id + ':') === 0; }); }
    K.storageUsage = function () {
      var per = {}, total = 0;
      sysStore.keys().forEach(function (k) {
        var i = k.indexOf(':'); if (i < 0) return;
        var app = k.slice(0, i), v = sysStore.get(k); v = v == null ? '' : String(v);
        var e = per[app] = per[app] || { keys: 0, bytes: 0 }; e.keys++; e.bytes += k.length + v.length; total += k.length + v.length;
      });
      var rows = S.apps.filter(function (a) { return !a.hidden; }).map(function (a) { var e = per[a.id] || { keys: 0, bytes: 0 }; return { id: a.id, name: a.name, keys: e.keys, bytes: e.bytes }; });
      var sys = String(sysStore.get('settings') || '').length, wp = S.custom ? Math.round(String(S.custom.dataUrl).length * 0.75) : 0;
      return { apps: rows, system: sys, wallpaper: wp, total: total + sys + wp };
    };
    K.clearAppData = function (id) {
      if (!appInfo(id)) return false;
      appStoreKeys(id).forEach(function (k) { sysStore.remove(k); });
      if (S.procs[id]) { var was = S.fg === id; kill(id); if (was) S.fg = null; }
      log('info', 'cleared data of ' + id); changed(); return true;
    };
    K.exportSession = function () {
      var store = {}; sysStore.keys().forEach(function (k) { if (k.indexOf(':') > 0) store[k] = sysStore.get(k); });
      var fgp = S.fg && S.procs[S.fg];
      return {
        settings: { theme: S.theme, wallpaper: S.wallpaper, cols: S.cols, rows: S.rows, dock: S.dock, brightness: S.brightness, volume: S.volume, clock24: S.clock24, dnd: S.dnd, orientation: S.orientation },
        prefs: JSON.parse(JSON.stringify(S.prefs)),
        session: { fg: S.fg, screen: fgp && S.fg !== 'rings' ? fgp.cur : null, ringsPage: fgp && S.fg === 'rings' ? (fgp.ringsPage || 'main') : null, recents: S.recents.slice(-8), page: S.page, locked: S.locked },
        store: store,
        customWallpaper: customMeta()
      };
    };
    K.importSession = function (snap) {
      if (!snap || !S.powered) return false;
      var st = snap.settings || {}, ss = snap.session || {};
      Object.keys(snap.store || {}).forEach(function (k) { if (k.indexOf(':') > 0 && typeof snap.store[k] === 'string') sysStore.set(k, snap.store[k]); });
      ['theme', 'dock', 'brightness', 'volume', 'clock24', 'dnd'].forEach(function (k) { if (st[k] !== undefined) setSetting(k, st[k], true); });
      if (st.cols && st.rows) { S.cols = clamp(+st.cols, 2, 6); S.rows = clamp(+st.rows, 2, 8); }
      if (st.wallpaper && (st.wallpaper !== 'custom' || S.custom)) setSetting('wallpaper', st.wallpaper, true);
      if (st.orientation === 'portrait' || st.orientation === 'landscape') S.orientation = st.orientation;
      S.prefs = {}; Object.keys(snap.prefs || {}).forEach(function (k) { setPref(k, snap.prefs[k], true); });
      var cm = snap.customWallpaper; if (cm && S.custom) K.setCustomOptions({ fit: cm.fit, dim: cm.dim, blur: cm.blur });
      persistSettings();
      // session: last app / screen / recents / lock state
      S.page = Math.max(0, parseInt(ss.page, 10) || 0);
      if (ss.fg && appInfo(ss.fg)) {
        S.locked = false; launch(ss.fg);
        var p = S.procs[ss.fg];
        if (p && ss.screen && p.screens[ss.screen] && ss.fg !== 'rings') { p.cur = ss.screen; p.hist = p.order[0] && p.order[0] !== ss.screen ? [p.order[0], ss.screen] : [ss.screen]; }
        if (p && ss.fg === 'rings' && ss.ringsPage && (!rings() || rings().has(ss.ringsPage, ringsCtx(p)))) p.ringsPage = ss.ringsPage;
      }
      S.recents = (ss.recents || []).filter(function (id) { return appInfo(id) && id !== S.fg; }).concat(S.fg ? [S.fg] : []);
      S.locked = (ss.locked === false && !passcode()) ? false : true;
      S.lastActive = now(); changed(); return true;
    };
    K.factoryReset = function () {
      var was = S.powered; K.shutdown();
      sysStore.keys().forEach(function (k) { sysStore.remove(k); }); sysStore.remove('settings');
      S.prefs = {}; S.custom = null; customCache.key = ''; S.orientation = 'portrait'; S.lastDark = 'Ash Dark'; S.lastLight = 'Ash Light'; S.autoMode = null;
      log('info', 'factory reset');
      if (was) K.boot(); return true;
    };

    // ---------- Rings actions ----------
    function ringsProc() { return S.procs.rings || null; }
    function ringsField(key, value) {
      var rp = ringsProc();
      switch (key) {
        case 'wp.dim': K.setCustomOptions({ dim: toNum(value, 0) / 100 }); return true;
        case 'wp.blur': K.setCustomOptions({ blur: toNum(value, 0) }); return true;
        case 'draft.pin': if (rp) { rp.draft = rp.draft || {}; rp.draft.pin = String(value).replace(/\D/g, '').slice(0, 6); } return true;
        case 'vpn': case 'dns': case 'proxy': setPref(key, String(value).slice(0, 200)); return true;
      }
      return false;
    }
    function ringsAct(name, a) {
      var rp = ringsProc(), sess = host.session || null;
      rp && (rp.draft = rp.draft || {});
      switch (name) {
        case 'clear-data': K.clearAppData(a); toast('Cleared data of ' + (appInfo(a) ? appInfo(a).name : a)); return true;
        case 'stop-app': if (a !== 'rings' && S.procs[a]) { kill(a); toast('Stopped ' + a); } changed(); return true;
        case 'open-app': launch(a); return true;
        case 'lock-now': lock(); return true;
        case 'beep': OPS['snd.beep']({ args: { freq: 660, ms: 120 } }, { proc: { id: 'rings' }, scope: {} }); changed(); return true;
        case 'pin-set': {
          var pin = rp && rp.draft.pin || '';
          if (!/^\d{4,6}$/.test(pin)) { toast('Enter a 4 to 6 digit PIN first'); changed(); return true; }
          setPref('sec.pin', pin); rp.draft.pin = ''; toast('PIN set. Bark now asks for it.'); return true;
        }
        case 'pin-clear': setPref('sec.pin', ''); toast('PIN removed'); return true;
        case 'wifi-join': setPref('wifi', true); setPref('airplane', false); setPref('ssid', a); toast('Joined ' + a + ' (simulated)'); return true;
        case 'wp-remove': K.clearCustomWallpaper(); toast('Custom wallpaper removed'); return true;
        case 'wp-fit': K.setCustomOptions({ fit: a }); return true;
        case 'perm-reset': PERMS.forEach(function (pp) { setPref('perm.' + a + '.' + pp, true, true); }); persistSettings(); changed(); return true;
        case 'notif-test': notify(a, 'Test notification from ' + a, (appInfo(a) ? appInfo(a).name : a)); return true;
        case 'save-now': if (sess && sess.saveNow) { sess.saveNow(); toast('Session saved'); } else { persistSettings(); toast('Settings saved'); } changed(); return true;
        case 'restore-now': if (sess && sess.restoreNow) sess.restoreNow(); else toast('Nothing to restore here'); changed(); return true;
        case 'factory-reset':
          if (!rp) return true;
          if (rp.draft.confirm !== 'reset') { rp.draft.confirm = 'reset'; toast('Tap Erase everything again to confirm'); changed(); return true; }
          rp.draft.confirm = null;
          if (sess && sess.factoryReset) sess.factoryReset(); else K.factoryReset();
          return true;
        case 'cancel-reset': if (rp) rp.draft.confirm = null; changed(); return true;
        case 'github-backup': if (sess && sess.github) { toast('Backing up to GitHub...'); Promise.resolve(sess.github.backup()).then(function (m) { toast(m || 'Backed up'); changed(); }, function (e) { toast('Backup failed: ' + (e && e.message || e), 3200); changed(); }); } changed(); return true;
        case 'github-restore': if (sess && sess.github) { toast('Restoring from GitHub...'); Promise.resolve(sess.github.restore()).then(function (m) { toast(m || 'Restored'); changed(); }, function (e) { toast('Restore failed: ' + (e && e.message || e), 3200); changed(); }); } changed(); return true;
      }
      return false;
    }
    K.toast = function (t, ms) { toast(t, ms); changed(); };
    K.getPref = getPref; K.setPref = setPref; K.online = online; K.netBlock = netBlock; K.hasPasscode = function () { return !!passcode(); };
    K.PREF_DEFAULTS = PREF_DEFAULTS; K.PREF_ENUMS = PREF_ENUMS; K.PERMS = PERMS;
    K.openDrawer = openDrawer; K.closeDrawer = function () { S.drawer = false; S.drawerQuery = ''; changed(); };

    // ---------- event dispatch ----------
    function findProcFor(id) {
      var sp0 = activeSysProc(); if (sp0) return sp0;      // updates: system pages own their widgets
      if (S.fg && S.procs[S.fg]) return S.procs[S.fg];
      return crown;
    }
    function dispatchSys(id, evt, payload) {
      var parts = id.split(':'), k = parts[0];
      switch (k) {
        case '@app': launch(parts[1]); return true;
        case '@page': S.page = Math.max(0, parseInt(parts[1], 10) || 0); changed(); return true;
        case '@unlock': if (!passcode()) unlock(); return true;
        case '@pin': pinKey(parts[1]); return true;
        case '@shade': toggleShade(); return true;
        case '@back': back(); return true;
        case '@home': home(); return true;
        case '@lock': lock(); return true;
        case '@rotate': K.rotate(); return true;
        case '@notif':
          if (parts[1] === 'clear') { S.notifs = []; changed(); return true; }
          if (parts[1] === 'x') { S.notifs = S.notifs.filter(function (n) { return String(n.id) !== parts[2]; }); changed(); return true; }
          var n = S.notifs.filter(function (x) { return String(x.id) === parts[1]; })[0];
          S.notifs = S.notifs.filter(function (x) { return x !== n; });
          S.shade = false;
          if (n && appInfo(n.app) && !S.locked) launch(n.app); else changed();
          return true;
        case '@set':
          if (payload && payload.value !== undefined && parts.length === 2 && parts[1] !== 'charge' && parts[1] !== 'clock24') { setSetting(parts[1], payload.value); return true; }   // range inputs
          if (parts[1] === 'brightness') { setSetting('brightness', payload && payload.value !== undefined ? payload.value : parts[2]); return true; }
          if (parts[1] === 'charge') { S.charging = !S.charging; changed(); return true; }
          if (parts[1] === 'clock24') { S.clock24 = !S.clock24; persistSettings(); changed(); return true; }
          if (parts[1] === 'darklight') {
            var dark = themeTokens(S.theme).dark; setSetting('theme', dark ? 'Ash Light' : 'Ash Dark'); return true;
          }
          setSetting(parts[1], parts.slice(2).join(':')); return true;
        case '@rings': {   // @rings:page:<id> navigates; (legacy) @rings:<id> too
          var rp = S.procs.rings; if (rp) { rp.ringsPage = parts[1] === 'page' ? parts.slice(2).join(':') : parts[1]; sysOnRings(rp.ringsPage); changed(); } return true;
        }
        case '@pref': setPref(parts[1], parts.slice(2).join(':')); return true;                     // @pref:<key>:<value|toggle>
        case '@field': return ringsField(parts[1], payload && payload.value !== undefined ? payload.value : parts.slice(2).join(':'));   // text/range inputs
        case '@act': return ringsAct(parts[1], parts.slice(2).join(':'));                           // buttons that do something
        case '@drawer':
          if (parts[1] === 'q') { S.drawerQuery = String(payload && payload.value !== undefined ? payload.value : ''); changed(); return true; }
          if (parts[1] === 'close') { S.drawer = false; S.drawerQuery = ''; changed(); return true; }
          openDrawer(); return true;
      }
      return false;
    }
    K.dispatch = function (id, evt, payload) {
      if (!S.powered || S.screenOff) return false;
      id = String(id); evt = evt || 'tap'; payload = payload || {};
      S.lastActive = now();
      if (evt === 'back') { back(); return true; }        // gestures: any widget id + 'back' event == the Back action (Rings: sub-page -> parent -> home)
      if (evt === 'home') { home(); return true; }
      if (id.charAt(0) === '@') {
        if (S.locked && !/^@(unlock|pin|shade|notif)/.test(id)) return false;
        return dispatchSys(id, evt, payload);
      }
      if (S.locked) return false;
      var proc = findProcFor(id); if (!proc) return false;
      var base = id, idx = -1, h = id.lastIndexOf('#');
      if (h > 0 && proc.nodes[id.slice(0, h)] === undefined) { /* literal id */ } else if (h > 0) { base = id.slice(0, h); idx = parseInt(id.slice(h + 1), 10); }
      if (!proc.nodes[base] && base.indexOf('scroll:') === 0) base = base.slice(7);   // GESTURES: the screen's scroller carries the screen id's handlers
      var node = proc.nodes[base]; if (!node) return false;
      var scope = { id: base, evt: evt }, ops;
      if (evt === 'change' || evt === 'submit') {
        var val = payload.value !== undefined ? payload.value : (node.props.value || '');
        if (node.kind === 'input') {
          var pv = node.props.value;   // two-way binding: value=(var) writes back to that variable and stays bound
          if (pv && pv.bind !== undefined) proc.vars[pv.bind] = numify(val); else if (pv && pv.$var !== undefined) proc.vars[pv.$var] = numify(val); else node.props.value = val;
          proc.vars[base] = numify(val);
        }
        scope.value = numify(val);
      }
      if (idx >= 0) { var items = itemsOf(resolveProp(proc, node.props.items)); scope.index = idx; scope.item = items[idx]; proc.vars[base + '_index'] = idx; proc.vars[base + '_item'] = items[idx]; }
      if (payload.x !== undefined) { scope.x = payload.x; scope.y = payload.y; }
      Object.keys(payload).forEach(function (pk) { var pv = payload[pk]; if (!(pk in scope) && (typeof pv === 'number' || typeof pv === 'string' || typeof pv === 'boolean')) scope[pk] = pv; });   // GESTURES: dx, dy, velocity, scale, angle, count... usable as {dx}
      ops = proc.handlers[base + '|' + evt];
      if (!ops && idx >= 0 && evt === 'tap') ops = proc.handlers[base + '|select'];
      if (ops) execOps(ops, { proc: proc, scope: scope, container: null, depth: 0, shared: { n: 0, halt: false } });
      changed();
      return !!ops;
    };
    K.press = press;
    K.launch = launch; K.home = home; K.back = back; K.kill = function (id) { kill(id); changed(); }; K.lock = lock; K.unlock = unlock; K.sleep = sleep; K.wake = wake;
    // GESTURES: demo notifications for the shade, clearly marked 'Sample', seeded once per boot (only if nothing real is waiting)
    K.sampleNotifications = function () {
      if (S.sampled || S.notifs.length) { S.sampled = true; return false; }
      S.sampled = true;
      [['leaf', 'Sample · Leaf', 'This is a sample notification. Tap to open Leaf.'], ['tally', 'Sample · Tally', 'Sample: a calculation finished.'], ['rings', 'Sample · System', 'Sample: swipe a notification away with the x.']].forEach(function (r) {
        var app = S.appIndex[r[0]] ? r[0] : 'rings', n = notify(app, r[2], r[1]); n.fresh = false; n.sample = true;
      });
      return true;
    };
    K.toggleShade = toggleShade; K.notify = function (text, title, appId) { return notify(appId || 'rings', text, title); };
    K.setSetting = setSetting; K.getSetting = getSetting;
    K.rotate = function () {
      if (getPref('orientationLock')) { toast('Orientation is locked (Rings > Display)'); changed(); return S.orientation; }
      S.orientation = S.orientation === 'portrait' ? 'landscape' : 'portrait'; S.page = 0; changed(); return S.orientation;
    };
    K.setCharging = function (v) { S.charging = !!v; changed(); };
    K.setBattery = function (v) { S.battery = clamp(toNum(v, 50), 0, 100); changed(); };
    K.setTilt = function (x, y, z) { S.tilt = { x: x, y: y, z: z === undefined ? 9.8 : z }; };
    K.setLocation = function (lat, lon) { S.loc = { lat: lat, lon: lon }; };
    K.subscribe = function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; };
    K.idle = function () {
      return new Promise(function (res) {
        (function wait() { if (!pendingNet.length) return res(); Promise.all(pendingNet.slice()).then(function () { setTimeout(wait, 0); }); })();
      });
    };
    K.state = function () { return S; };
    K.proc = function (id) { return S.procs[id] || null; };
    K.vars = function (id) { var p = S.procs[id || S.fg]; return p ? p.vars : null; };
    K.themeNames = themeNames; K.themeTokens = themeTokens; K.wallpapers = wallpapers; K.evalExpr = evalExpr;
    K.logLines = function () { return S.logLines.slice(); };
    K.camera = function () { return S.cam; };
    K.testPattern = testPatternSvg;

    // ---------- view tree ----------
    function V(tag, id, props, children, on) { return { tag: tag, id: id || null, props: props || {}, children: children || [], on: on || [] }; }
    function appIconV(a) { return V('appicon', '@app:' + a.id, { name: a.name, glyph: a.glyph || a.name.charAt(0), color: a.color }, [], ['tap']); }

    function nodeToV(node, proc) {
      var P = {}, k;
      for (k in node.props) P[k] = resolveProp(proc, node.props[k]);
      var on = (proc.evts[node.id] || []).slice();
      var tag = TAGS[node.kind] || node.kind, kids = [];
      if (node.kind === 'input') { if (P.value === undefined || P.value === '') P.value = proc.vars[node.id] !== undefined && proc.vars[node.id] !== '' ? fmt(proc.vars[node.id]) : (P.value || ''); P.multiline = P.multiline === true || P.multiline === 'true'; if (on.indexOf('change') < 0) on.push('change'); }
      if (node.kind === 'text' && P.text !== undefined) P.text = fmt(P.text);
      if (node.kind === 'button' && P.label !== undefined) P.label = fmt(P.label);
      if (node.kind === 'list' || node.kind === 'menu') {
        itemsOf(P.items).forEach(function (it, i) { kids.push(V('listitem', node.id + '#' + i, { text: it, index: i }, [], ['tap'])); });
        P.items = undefined;
      } else if (node.kind === 'camera') {
        P.facing = S.cam.facing; P.synthetic = S.cam.synthetic; P.open = S.cam.open;
      } else if (node.kind === 'canvas') {
        P.cmds = node.props.cmds ? node.props.cmds.slice() : [];
      } else node.children.forEach(function (c) { kids.push(nodeToV(c, proc)); });
      if (node.kind === 'button' && on.indexOf('tap') < 0) on.push('tap');
      Object.keys(P).forEach(function (kk) { if (P[kk] === undefined) delete P[kk]; });
      return V(tag, node.id, P, kids, on);
    }
    function uiScreenV(proc) {
      var s = proc.screens[proc.cur], info = appInfo(proc.id), kids = [];
      if (!s) return V('view', 'app:' + proc.id, { app: proc.id }, [V('text', null, { text: '(' + (info ? info.name : proc.id) + ' has no screen)', color: 'dim', align: 'center' })]);
      // Every app screen gets a header with Back (sub-screen -> parent, root -> Home) and a Home button, so no app can trap the user.
      var title = s.props.title !== undefined ? fmt(resolveProp(proc, s.props.title)) : (info ? info.name : proc.id);
      kids.push(V('appbar', '@appbar', { title: title, back: true, home: true, glyph: info && info.glyph }, [], ['tap']));
      var body = s.children.map(function (c) { return nodeToV(c, proc); });
      kids.push(V('scroll', 'scroll:' + s.id, {}, body, (proc.evts[s.id] || []).slice()));   // GESTURES: screen-level handlers (ui.on (main) swipeleft ...)
      return V('view', 'app:' + proc.id, { app: proc.id, screen: s.id }, kids);
    }
    // Rings is built by js/phone/rings.js (a data-driven page table). The kernel only supplies this context object.
    function ringsCtx(proc) {
      var sess = host.session || null;
      return {
        V: V, S: S, page: proc.ringsPage || 'main', draft: proc.draft || {}, version: VERSION, seed: seed, seedId: seedId, manifest: manifest,
        apps: S.apps.filter(function (a) { return !a.hidden; }), appInfo: appInfo, procs: S.procs,
        pref: getPref, defaults: PREF_DEFAULTS, perms: PERMS, themeNames: themeNames, themeTokens: themeTokens, wallpapers: wallpapers,
        online: online, netBlock: netBlock, usage: K.storageUsage, custom: customMeta(), art: global.SamaraThemeArt || null, session: sess,
        clockText: clockText, dateText: dateText, dparts: dparts, hasPin: !!getPref('sec.pin'), hasPasscode: !!passcode(), layouts: LAYOUTS, devEnabled: !!flags.dev
      };
    }
    function ringsV(proc) {
      var RG = rings();
      if (!RG) return V('view', 'app:rings', { app: 'rings' }, [V('appbar', '@appbar', { title: 'Rings', back: true, home: true }, [], ['tap']), V('scroll', 'scroll:rings', {}, [V('text', null, { text: 'Rings pages module (js/phone/rings.js) is not loaded.', color: 'dim' })])]);
      var R = ringsCtx(proc), page = RG.resolve(proc.ringsPage || 'main', R); proc.ringsPage = page;
      if (activeSysProc()) return sysPageV(activeSysProc(), page);   // updates: About / System update / Developer options
      var b = RG.build(R, page);
      return V('view', 'app:rings', { app: 'rings', page: page }, [V('appbar', '@appbar', { title: b.title, back: true, home: true, glyph: '\u2699' }, [], ['tap']), V('scroll', 'scroll:rings:' + page, {}, b.kids)]);
    }
    function homeV() {
      var cols = S.orientation === 'landscape' ? Math.max(S.rows, 4) : S.cols, rows = S.orientation === 'landscape' ? Math.min(S.cols, 3) : S.rows;
      var per = cols * rows, apps = S.apps.filter(function (a) { return !a.hidden; });
      // Dock: the ROM's dock apps, then Settings (Rings) and the App Drawer button are always pinned at the end.
      var ringsApp = apps.filter(function (a) { return a.id === 'rings'; })[0], rest = apps.filter(function (a) { return a !== ringsApp; });
      var dockApps = rest.filter(function (a) { return a.dock; });
      if (!dockApps.length && S.dock > 0 && rest.length > S.dock) dockApps = rest.slice(0, S.dock);
      var reserve = ringsApp && S.dock >= 3 ? 2 : 0;   // with 3+ slots Settings and the drawer share the dock; with fewer, only the drawer button is added
      dockApps = dockApps.slice(0, Math.max(0, S.dock - reserve));
      var grid = rest.filter(function (a) { return dockApps.indexOf(a) < 0; });
      if (ringsApp && S.dock < 3) grid.push(ringsApp);
      var dockIcons = dockApps.map(appIconV);
      if (ringsApp && S.dock >= 3) dockIcons.push(appIconV(ringsApp));
      dockIcons.push(V('appicon', '@drawer:open', { name: 'Apps', glyph: '\u2630', color: '#4b5b6e' }, [], ['tap']));
      var pages = Math.max(1, Math.ceil(grid.length / per)), page = clamp(S.page, 0, pages - 1); S.page = page;
      var kids = [];
      if (crown && crown.cur && crown.screens[crown.cur] && crown.screens[crown.cur].children.length) {
        kids.push(V('widgets', 'widgets', {}, crown.screens[crown.cur].children.map(function (c) { return nodeToV(c, crown); })));
      }
      kids.push(V('homegrid', '@homegrid', { cols: cols, rows: rows, page: page, pages: pages }, grid.slice(page * per, page * per + per).map(appIconV)));
      if (pages > 1) kids.push(V('dots', 'dots', { n: pages, page: page }, [], []));
      kids.push(V('dock', '@dock', { n: dockIcons.length }, dockIcons));
      return V('homeview', 'home', { app: 'crown', page: page }, kids);
    }
    function lockV() {
      var kids = [V('text', null, { text: clockText(), size: 'clock', align: 'center' }), V('text', null, { text: dateText(), size: 'md', color: 'dim', align: 'center' })];
      var fresh = getPref('notif.lock') === false ? [] : S.notifs.slice(0, 3);
      if (fresh.length) kids.push(V('col', null, { gap: 6, cls: 'lock-notifs' }, fresh.map(function (n) { return V('notif', '@notif:' + n.id, { title: n.title, text: n.text, time: n.t }, [], ['tap']); })));
      if (passcode()) {
        var dots = [], code = passcode();
        for (var i = 0; i < code.length; i++) dots.push(V('pindot', null, { filled: i < S.pin.length }));
        kids.push(V('row', null, { gap: 10, justify: 'center', cls: S.pinError ? 'pin-error' : '' }, dots));
        var rowsK = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];
        rowsK.forEach(function (r) { kids.push(V('row', null, { gap: 14, justify: 'center' }, r.map(function (d) { return d === '' ? V('text', null, { text: '' }) : V('key', '@pin:' + d, { label: d === 'del' ? '⌫' : d }, [], ['tap']); }))); });
      } else kids.push(V('button', '@unlock', { label: 'Swipe up or tap to unlock', kind: 'ghost' }, [], ['tap']));
      return V('lock', 'bark', {}, kids);
    }
    function shadeV() {
      var kids = [];
      kids.push(V('row', null, { gap: 8, wrap: true }, [
        V('chip', '@lock', { label: 'Lock' }, [], ['tap']),
        V('chip', '@rotate', { label: S.orientation === 'portrait' ? 'Rotate' : 'Portrait' }, [], ['tap']),
        V('chip', '@set:darklight', { label: themeTokens(S.theme).dark ? 'Light' : 'Dark' }, [], ['tap']),
        V('chip', '@set:charge', { label: S.charging ? 'Charging' : 'Charge', selected: S.charging }, [], ['tap'])
      ]));
      kids.push(V('input', '@set:brightness', { type: 'range', min: 10, max: 100, value: Math.round(S.brightness * 100) }, [], ['change']));
      kids.push(V('row', null, { justify: 'space-between' }, [V('text', null, { text: 'Notifications', size: 'sm', color: 'dim' }), V('chip', '@notif:clear', { label: 'Clear all' }, [], ['tap'])]));
      if (!S.notifs.length) kids.push(V('text', null, { text: 'No notifications', color: 'dim', align: 'center', size: 'sm' }));
      S.notifs.forEach(function (n) { kids.push(V('notif', '@notif:' + n.id, { title: n.title, text: n.text, time: n.t, dismiss: '@notif:x:' + n.id }, [], ['tap'])); });
      return V('shade', '@shadepanel', {}, kids);
    }
    function drawerV() {
      var q = String(S.drawerQuery || '').trim().toLowerCase();
      var list = S.apps.filter(function (a) { return !a.hidden; }).slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0; })
        .filter(function (a) { return !q || a.name.toLowerCase().indexOf(q) >= 0 || a.id.toLowerCase().indexOf(q) >= 0; });
      var kids = [V('input', '@drawer:q', { type: 'search', placeholder: 'Search ' + S.apps.filter(function (a) { return !a.hidden; }).length + ' apps', value: S.drawerQuery, hint: 'search' }, [], ['change'])], last = '';
      list.forEach(function (a) {
        var L = a.name.charAt(0).toUpperCase(); if (!/[A-Z]/.test(L)) L = '#';
        if (L !== last) { last = L; kids.push(V('text', null, { text: L, size: 'xs', color: 'dim', cls: 'cnp-drawer-letter' })); }
        kids.push(V('approw', '@app:' + a.id, { name: a.name, glyph: a.glyph || a.name.charAt(0), color: a.color, sub: a.system ? 'System' : '' }, [], ['tap']));
      });
      if (!list.length) kids.push(V('text', null, { text: 'No apps match "' + S.drawerQuery + '"', color: 'dim', align: 'center' }));
      return V('view', 'app:drawer', { app: 'drawer' }, [V('appbar', '@appbar', { title: 'All apps', back: true, home: true, glyph: '\u2630' }, [], ['tap']), V('scroll', 'scroll:drawer', {}, kids)]);
    }
    function statusV() {
      var air = !!getPref('airplane'), mobOn = !air && !!getPref('mobile'), nm = getPref('netmode');
      return V('statusbar', '@statusbar', { time: clockText(), battery: Math.round(S.battery), charging: S.charging, signal: mobOn ? S.signal : 0, wifi: !air && !!getPref('wifi'), airplane: air,
        net: mobOn && !getPref('wifi') ? (nm === 'auto' ? '5G' : nm.toUpperCase()) : '', showPct: getPref('bat.pct') !== false, saver: !!getPref('bat.saver'), notifs: S.notifs.length,
        title: S.fg && appInfo(S.fg) ? appInfo(S.fg).name : '' }, [], ['tap']);
    }
    K.tree = function () {
      var T = themeTokens(S.theme), w = wallpapers().filter(function (x) { return x.id === S.wallpaper; })[0] || WALLPAPERS[0];
      var wall = w.plain ? T.bg : w.id === 'themeart' ? themeArtCss(T) : (w.id === 'custom' && S.custom) ? customCss() : (w.css || T.wall);
      var cu = w.id === 'custom' && S.custom ? S.custom : null, pf = S.prefs;
      var root = V('device', '@device', { powered: S.powered, screenOff: S.screenOff, locked: S.locked, theme: T, themeName: S.theme, wallpaper: wall, wallpaperId: w.id, wallpaperLive: !!w.live,
        brightness: S.brightness, orientation: S.orientation, volume: S.volume, fg: S.fg, devTouches: !!flags.touches, devBounds: !!flags.bounds,
        wallpaperBlur: cu ? cu.blur : 0, wallpaperRev: cu ? cu.rev : 0, online: online(), hasPasscode: !!passcode(), holdMs: +getPref('a11y.hold'),
        ui: { textSize: getPref('a11y.large') && getPref('textSize') === 'm' ? 'l' : getPref('textSize'), bold: !!getPref('a11y.bold'), contrast: !!getPref('a11y.contrast'), motion: !!getPref('a11y.motion'),
              filter: getPref('a11y.filter'), reader: !!getPref('a11y.reader'), switchNav: !!getPref('a11y.switch'), oneHand: !!getPref('a11y.onehand'), captions: !!getPref('a11y.captions') } }, [], []);
      if (!S.powered || S.screenOff) return root;
      root.children.push(statusV());
      if (S.locked) root.children.push(lockV());
      else if (S.fg && S.procs[S.fg]) root.children.push(S.fg === 'rings' ? ringsV(S.procs.rings) : uiScreenV(S.procs[S.fg]));
      else if (S.drawer) root.children.push(drawerV());
      else root.children.push(homeV());
      root.children.push(V('homebar', '@home', {}, [], ['tap']));
      var fresh = S.notifs.filter(function (n) { return n.fresh; })[0];
      if (fresh && !S.shade) root.children.push(V('banner', '@notif:' + fresh.id, { title: fresh.title, text: fresh.text }, [], ['tap']));
      if (S.toast) root.children.push(V('toast', null, { text: S.toast.text }));
      if (S.shade) root.children.push(shadeV());
      return root;
    };
    K.find = function (pred, node) {
      node = node || K.tree();
      if (typeof pred === 'string') { var idp = pred; pred = function (n) { return n.id === idp; }; }
      if (pred(node)) return node;
      for (var i = 0; i < node.children.length; i++) { var r = K.find(pred, node.children[i]); if (r) return r; }
      return null;
    };
    return K;
  }

  var api = { createKernel: createKernel, evalExpr: evalExpr, THEMES: THEMES, THEME_ORDER: THEME_ORDER, WALLPAPERS: WALLPAPERS, version: VERSION, schema: SCHEMA, testPatternSvg: testPatternSvg };
  global.SamaraOS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
