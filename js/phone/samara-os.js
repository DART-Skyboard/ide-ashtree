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
  var VERSION = '1.0.0';

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
    var mem = {}, ls = null;
    try { ls = host.storage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { ls = null; }
    return {
      get: function (k) {
        try { if (ls) { var v = ls.getItem(prefix + k); if (v != null) return v; } } catch (e) { /* fall back to memory */ }
        return Object.prototype.hasOwnProperty.call(mem, prefix + k) ? mem[prefix + k] : null;
      },
      set: function (k, v) {
        mem[prefix + k] = String(v);
        try { if (ls) ls.setItem(prefix + k, String(v)); } catch (e) { /* memory only */ }
      },
      remove: function (k) { delete mem[prefix + k]; try { if (ls) ls.removeItem(prefix + k); } catch (e) { /* ignore */ } }
    };
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
    var seedId = (seed.sha256 ? String(seed.sha256).slice(0, 12) : (manifest.name || (seed.os && seed.os.name) || 'seed')).replace(/[^\w.-]/g, '_');
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
      battery: 87, charging: false, signal: 4, uptime: 0, drainAcc: 0,
      cam: { open: false, facing: 'back', synthetic: false, frames: 0, last: null },
      tilt: { x: 0, y: 0, z: 9.8 }, loc: { lat: 37.7749, lon: -122.4194 },
      logLines: [], bootNode: manifest.boot || 'Crown', netListeners: {}
    };
    var crown = null;      // system process holding boot-node UI (home widgets)

    // ---------- logging / render plumbing ----------
    function log(level, msg) {
      var line = '[' + level + '] ' + msg;
      S.logLines.push(line); if (S.logLines.length > 500) S.logLines.shift();
      try { if (host.log) host.log(line, level); } catch (e) { /* ignore */ }
    }
    var renderQueued = false;
    function changed() {
      subs.slice().forEach(function (f) { try { f(K); } catch (e) { /* ignore */ } });
      try { if (host.onRender) host.onRender(K); } catch (e) { /* ignore */ }
    }
    function now() { return host.now ? host.now() : Date.now(); }

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
      if (!S.powered || S.locked) return false;
      var info = appInfo(id);
      if (!info) { log('error', 'launch: unknown app ' + id); return false; }
      var p = S.procs[id];
      if (!p) {
        p = S.procs[id] = makeProc(id);
        if (!info.system) {
          var entry = info.entry || info.name;
          if (program[entry]) runNode(entry, p, {}, 0); else log('warn', 'app ' + id + ' has no entry node "' + entry + '"');
        }
        log('info', 'launch ' + id);
      }
      S.recents = S.recents.filter(function (x) { return x !== id; }); S.recents.push(id);
      S.fg = id; S.shade = false;
      changed(); return true;
    }
    function kill(id) {
      var p = S.procs[id]; if (!p) return;
      p.dead = true; delete S.procs[id];
      S.recents = S.recents.filter(function (x) { return x !== id; });
      if (S.fg === id) S.fg = null;
      if (S.cam.open && S.cam.owner === id) camClose();
      log('info', 'kill ' + id);
    }
    function home() { if (!S.powered) return; S.fg = null; S.shade = false; S.page = 0; changed(); }
    function back() {
      if (!S.powered || S.screenOff) return;
      if (S.shade) { S.shade = false; changed(); return; }
      if (S.locked) return;
      if (!S.fg) return;
      var p = S.procs[S.fg];
      if (p && p.hist.length > 1) { p.hist.pop(); p.cur = p.hist[p.hist.length - 1]; changed(); return; }
      if (S.fg === 'rings' && p && p.ringsPage && p.ringsPage !== 'main') { p.ringsPage = 'main'; changed(); return; }
      kill(S.fg); S.fg = null; changed();
    }

    // ---------- settings (theme / wallpaper / layout / brightness) ----------
    function wallpapers() {
      var out = WALLPAPERS.slice();
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
      sysStore.set('settings', JSON.stringify({ theme: S.theme, wallpaper: S.wallpaper, cols: S.cols, rows: S.rows, dock: S.dock, brightness: S.brightness, volume: S.volume, clock24: S.clock24 }));
    }
    function setSetting(key, value, silent) {
      key = String(key).toLowerCase();
      switch (key) {
        case 'theme': { var n = resolveThemeName(value); if (!n) { log('warn', 'unknown theme ' + value); return false; } S.theme = n; break; }
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
      }
      return '';
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
      if (proc.cur !== id) { proc.cur = id; if (proc.hist[proc.hist.length - 1] !== id) proc.hist.push(id); }
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
    ['text', 'button', 'input', 'list', 'icon', 'menu', 'image'].forEach(function (k) {
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
    OPS['store.get'] = function (op, ctx) {
      var v = sysStore.get(skey(ctx, arg(op, ctx, 'key'))), d = destOf(op);
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
    OPS['snd.beep'] = function (op, ctx) { log('info', 'beep'); try { host.snd && host.snd.beep && host.snd.beep(arg(op, ctx, 'freq'), arg(op, ctx, 'ms')); } catch (e) { /* ignore */ } };
    OPS['sensor.tilt'] = function (op, ctx) {
      var t = (host.sensors && host.sensors.tilt && host.sensors.tilt()) || S.tilt, d = destOf(op);
      if (d) assignVar(ctx, d, [t.x, t.y, t.z].map(function (n) { return +toNum(n).toFixed(2); }).join(','));
    };
    OPS['sensor.location'] = function (op, ctx) {
      var l = (host.sensors && host.sensors.location && host.sensors.location()) || S.loc, d = destOf(op);
      if (d) assignVar(ctx, d, l.lat + ',' + l.lon);
    };
    OPS['input.on'] = function (op, ctx) {
      var k = posId(op, ctx), h = op.handlers && (op.handlers.press || op.handlers[Object.keys(op.handlers)[0]]);
      if (k && h) ctx.proc.keyHandlers[k] = h;
    };
    OPS['input.haptic'] = function (op, ctx) { try { host.haptic && host.haptic(toNum(arg(op, ctx, 'ms'), 20)); } catch (e) { /* ignore */ } };

    // ---------- system actions ----------
    function clockText() {
      var d = new Date(now()), h = d.getHours(), m = d.getMinutes();
      if (S.clock24) return pad2(h) + ':' + pad2(m);
      return ((h % 12) || 12) + ':' + pad2(m);
    }
    function dateText() {
      var d = new Date(now());
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] + ', ' +
        ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()] + ' ' + d.getDate();
    }
    function notify(appId, text, title) {
      var info = appInfo(appId), n = { id: seq++, app: appId, title: title || (info ? info.name : appId), text: String(text == null ? '' : text), t: now(), fresh: true, age: 0 };
      S.notifs.unshift(n); if (S.notifs.length > 50) S.notifs.pop();
      log('info', 'notify [' + n.title + '] ' + n.text); changed(); return n;
    }
    function toast(text) { S.toast = { text: text, age: 0 }; }
    function lock() { S.locked = true; S.pin = ''; S.shade = false; changed(); }
    function sleep() { S.screenOff = true; lock(); }
    function wake() { S.screenOff = false; changed(); }
    function unlock() {
      S.locked = false; S.pin = ''; S.pinError = false; S.page = 0; log('info', 'unlocked'); changed();
    }
    function pinKey(d) {
      var code = manifest.passcode == null ? '' : String(manifest.passcode);
      if (d === 'del') S.pin = S.pin.slice(0, -1); else S.pin += d;
      S.pinError = false;
      if (code && S.pin.length >= code.length) { if (S.pin === code) { unlock(); return; } S.pin = ''; S.pinError = true; }
      changed();
    }
    function press(key) {
      key = String(key).toLowerCase();
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
      if (key === 'home' || key === 'back') {
        if (!S.locked) {
          var q = S.fg && S.procs[S.fg];
          if (q && q.keyHandlers[key]) { runKey(q, key); return true; }
        }
        if (key === 'home') { if (S.locked) return false; home(); } else back();
        return true;
      }
      if (key === 'shade') { toggleShade(); return true; }
      return false;
    }
    function runKey(p, key) {
      execOps(p.keyHandlers[key], { proc: p, scope: { key: key }, container: null, depth: 0, shared: { n: 0, halt: false } }); changed();
    }
    function toggleShade(v) { if (!S.powered || S.screenOff) return; S.shade = v === undefined ? !S.shade : !!v; changed(); }

    // ---------- boot / shutdown ----------
    var booted = false;
    K.boot = function () {
      if (S.powered) return K;
      S.powered = true; S.screenOff = false; S.locked = manifest.lock === false ? false : true; S.fg = null;
      S.apps = []; S.appIndex = {}; S.procs = {}; S.recents = []; S.notifs = []; S.page = 0; S.shade = false;
      Object.assign(S, { theme: 'Ash Dark', wallpaper: 'theme', cols: 4, rows: 5, dock: 4, brightness: 1, volume: 50, clock24: false });
      booted = false;
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
          ['theme', 'wallpaper', 'dock', 'brightness', 'volume', 'clock24'].forEach(function (k) { if (saved[k] !== undefined) setSetting(k, saved[k], true); });
          if (saved.cols && saved.rows) { S.cols = saved.cols; S.rows = saved.rows; }
        }
      } catch (e) { /* ignore corrupt settings */ }
      booted = true;
      log('info', 'Samara OS ' + VERSION + ' booted (' + S.apps.length + ' apps, theme ' + S.theme + ')');
      changed(); return K;
    };
    K.shutdown = function () {
      if (!S.powered) return K;
      persistSettings(); camClose();
      Object.keys(S.procs).forEach(function (id) { S.procs[id].dead = true; });
      S.procs = {}; crown = null; S.powered = false; S.fg = null; S.shade = false; S.netListeners = {};
      log('info', 'shutdown'); changed(); return K;
    };

    // ---------- tick (simulated battery / signal / transient UI) ----------
    K.tick = function (dtMs) {
      dtMs = dtMs || 0; if (!S.powered) return;
      S.uptime += dtMs;
      var per = S.screenOff ? 600000 : 120000;                // ms per 1% drain
      if (S.charging) { S.battery = Math.min(100, S.battery + dtMs / 30000); }
      else { S.battery = Math.max(0, S.battery - dtMs / per); }
      if (S.battery <= 0 && !S.charging) { K.shutdown(); return; }
      var ch = false;
      S.notifs.forEach(function (n) { if (n.fresh) { n.age += dtMs; if (n.age > 3500) { n.fresh = false; ch = true; } } });
      if (S.toast) { S.toast.age += dtMs; if (S.toast.age > 1600) { S.toast = null; ch = true; } }
      S.signal = 3 + Math.floor((Math.sin(S.uptime / 60000) + 1) * 0.99);
      changed();
    };

    // ---------- event dispatch ----------
    function findProcFor(id) {
      if (S.fg && S.procs[S.fg]) return S.procs[S.fg];
      return crown;
    }
    function dispatchSys(id, evt, payload) {
      var parts = id.split(':'), k = parts[0];
      switch (k) {
        case '@app': launch(parts[1]); return true;
        case '@page': S.page = Math.max(0, parseInt(parts[1], 10) || 0); changed(); return true;
        case '@unlock': if (!manifest.passcode) unlock(); return true;
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
          if (parts[1] === 'brightness') { setSetting('brightness', payload && payload.value !== undefined ? payload.value : parts[2]); return true; }
          if (parts[1] === 'charge') { S.charging = !S.charging; changed(); return true; }
          if (parts[1] === 'clock24') { S.clock24 = !S.clock24; persistSettings(); changed(); return true; }
          if (parts[1] === 'darklight') {
            var dark = themeTokens(S.theme).dark; setSetting('theme', dark ? 'Ash Light' : 'Ash Dark'); return true;
          }
          setSetting(parts[1], parts.slice(2).join(':')); return true;
        case '@rings': { var rp = S.procs.rings; if (rp) { rp.ringsPage = parts[1]; changed(); } return true; }
      }
      return false;
    }
    K.dispatch = function (id, evt, payload) {
      if (!S.powered || S.screenOff) return false;
      id = String(id); evt = evt || 'tap'; payload = payload || {};
      if (id.charAt(0) === '@') {
        if (S.locked && !/^@(unlock|pin|shade|notif)/.test(id)) return false;
        return dispatchSys(id, evt, payload);
      }
      if (S.locked) return false;
      var proc = findProcFor(id); if (!proc) return false;
      var base = id, idx = -1, h = id.lastIndexOf('#');
      if (h > 0 && proc.nodes[id.slice(0, h)] === undefined) { /* literal id */ } else if (h > 0) { base = id.slice(0, h); idx = parseInt(id.slice(h + 1), 10); }
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
      ops = proc.handlers[base + '|' + evt];
      if (!ops && idx >= 0 && evt === 'tap') ops = proc.handlers[base + '|select'];
      if (ops) execOps(ops, { proc: proc, scope: scope, container: null, depth: 0, shared: { n: 0, halt: false } });
      changed();
      return !!ops;
    };
    K.press = press;
    K.launch = launch; K.home = home; K.back = back; K.kill = kill; K.lock = lock; K.unlock = unlock; K.sleep = sleep; K.wake = wake;
    K.toggleShade = toggleShade; K.notify = function (text, title, appId) { return notify(appId || 'rings', text, title); };
    K.setSetting = setSetting; K.getSetting = getSetting;
    K.rotate = function () { S.orientation = S.orientation === 'portrait' ? 'landscape' : 'portrait'; S.page = 0; changed(); return S.orientation; };
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
      var title = s.props.title !== undefined ? fmt(resolveProp(proc, s.props.title)) : null;
      if (title !== null) kids.push(V('appbar', '@appbar', { title: title, back: proc.hist.length > 1, glyph: info && info.glyph }, [], ['tap']));
      var body = s.children.map(function (c) { return nodeToV(c, proc); });
      kids.push(V('scroll', 'scroll:' + s.id, {}, body));
      return V('view', 'app:' + proc.id, { app: proc.id, screen: s.id }, kids);
    }
    function ringsV(proc) {
      var page = proc.ringsPage || 'main', kids = [], i;
      function section(title, children) { kids.push(V('section', null, { title: title }, children)); }
      var themes = themeNames().map(function (n) {
        var t = themeTokens(n); return V('swatch', '@set:theme:' + n, { name: n, bg: t.bg, surface: t.surface, accent: t.accent, text: t.text, selected: n === S.theme }, [], ['tap']);
      });
      section('Theme', [V('row', null, { wrap: true, gap: 10 }, themes)]);
      section('Wallpaper', [V('row', null, { wrap: true, gap: 8 }, wallpapers().map(function (w) {
        return V('chip', '@set:wallpaper:' + w.id, { label: w.name, selected: w.id === S.wallpaper, preview: w.css }, [], ['tap']);
      }))]);
      section('Home layout', [
        V('row', null, { wrap: true, gap: 8 }, LAYOUTS.map(function (l) { return V('chip', '@set:layout:' + l, { label: l.replace('x', ' × '), selected: l === S.cols + 'x' + S.rows }, [], ['tap']); })),
        V('text', null, { text: 'Dock slots', size: 'sm', color: 'dim' }),
        V('row', null, { wrap: true, gap: 8 }, [2, 3, 4, 5].map(function (d) { return V('chip', '@set:dock:' + d, { label: String(d), selected: d === S.dock }, [], ['tap']); }))
      ]);
      section('Display', [
        V('text', null, { text: 'Brightness ' + Math.round(S.brightness * 100) + '%', size: 'sm', color: 'dim' }),
        V('input', '@set:brightness', { type: 'range', min: 10, max: 100, value: Math.round(S.brightness * 100) }, [], ['change']),
        V('row', null, { wrap: true, gap: 8 }, [
          V('chip', '@set:clock24', { label: '24-hour clock', selected: S.clock24 }, [], ['tap']),
          V('chip', '@set:charge', { label: S.charging ? 'Charging' : 'Not charging', selected: S.charging }, [], ['tap'])
        ])
      ]);
      section('About', [
        V('text', null, { text: 'Samara OS ' + VERSION, size: 'md' }),
        V('text', null, { text: ((seed.os && seed.os.name) || 'Samara OS') + ' · seed ' + seedId + ' · ' + S.apps.length + ' apps', size: 'sm', color: 'dim' }),
        V('text', null, { text: 'Battery ' + Math.round(S.battery) + '% · Volume ' + S.volume + '%', size: 'sm', color: 'dim' })
      ]);
      return V('view', 'app:rings', { app: 'rings' }, [V('appbar', '@appbar', { title: 'Rings', back: false, glyph: '⚙' }, [], ['tap']), V('scroll', 'scroll:rings', {}, kids)]);
    }
    function homeV() {
      var cols = S.orientation === 'landscape' ? Math.max(S.rows, 4) : S.cols, rows = S.orientation === 'landscape' ? Math.min(S.cols, 3) : S.rows;
      var per = cols * rows, apps = S.apps.filter(function (a) { return !a.hidden; });
      var dockApps = apps.filter(function (a) { return a.dock; });
      if (!dockApps.length && S.dock > 0 && apps.length > S.dock) dockApps = apps.slice(0, S.dock);
      dockApps = dockApps.slice(0, S.dock);
      var grid = apps.filter(function (a) { return dockApps.indexOf(a) < 0; });
      var pages = Math.max(1, Math.ceil(grid.length / per)), page = clamp(S.page, 0, pages - 1); S.page = page;
      var kids = [];
      if (crown && crown.cur && crown.screens[crown.cur] && crown.screens[crown.cur].children.length) {
        kids.push(V('widgets', 'widgets', {}, crown.screens[crown.cur].children.map(function (c) { return nodeToV(c, crown); })));
      }
      kids.push(V('homegrid', '@homegrid', { cols: cols, rows: rows, page: page, pages: pages }, grid.slice(page * per, page * per + per).map(appIconV)));
      if (pages > 1) kids.push(V('dots', 'dots', { n: pages, page: page }, [], []));
      if (dockApps.length) kids.push(V('dock', '@dock', { n: dockApps.length }, dockApps.map(appIconV)));
      return V('homeview', 'home', { app: 'crown', page: page }, kids);
    }
    function lockV() {
      var kids = [V('text', null, { text: clockText(), size: 'clock', align: 'center' }), V('text', null, { text: dateText(), size: 'md', color: 'dim', align: 'center' })];
      var fresh = S.notifs.slice(0, 3);
      if (fresh.length) kids.push(V('col', null, { gap: 6, cls: 'lock-notifs' }, fresh.map(function (n) { return V('notif', '@notif:' + n.id, { title: n.title, text: n.text, time: n.t }, [], ['tap']); })));
      if (manifest.passcode) {
        var dots = [], code = String(manifest.passcode);
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
    function statusV() {
      return V('statusbar', '@statusbar', { time: clockText(), battery: Math.round(S.battery), charging: S.charging, signal: S.signal, wifi: true, notifs: S.notifs.length,
        title: S.fg && appInfo(S.fg) ? appInfo(S.fg).name : '' }, [], ['tap']);
    }
    K.tree = function () {
      var T = themeTokens(S.theme), w = wallpapers().filter(function (x) { return x.id === S.wallpaper; })[0] || WALLPAPERS[0];
      var wall = w.plain ? T.bg : (w.css || T.wall);
      var root = V('device', '@device', { powered: S.powered, screenOff: S.screenOff, locked: S.locked, theme: T, themeName: S.theme, wallpaper: wall, wallpaperId: w.id, wallpaperLive: !!w.live,
        brightness: S.brightness, orientation: S.orientation, volume: S.volume, fg: S.fg }, [], []);
      if (!S.powered || S.screenOff) return root;
      root.children.push(statusV());
      if (S.locked) root.children.push(lockV());
      else if (S.fg && S.procs[S.fg]) root.children.push(S.fg === 'rings' ? ringsV(S.procs.rings) : uiScreenV(S.procs[S.fg]));
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

  var api = { createKernel: createKernel, evalExpr: evalExpr, THEMES: THEMES, THEME_ORDER: THEME_ORDER, WALLPAPERS: WALLPAPERS, version: VERSION, testPatternSvg: testPatternSvg };
  global.SamaraOS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
