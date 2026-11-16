// ============================================================
//  samara-syntax.js — Samara OS statement table + parser
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Declarative table of every Samara statement (namespaces sys/ui/gfx/cam/
//  net/store/snd/sensor/power/input), plus a block-aware parser for Justin's
//  Ash node syntax:   (Name):-: { with var (s) { irin ("Data: k=v") ... } irout (...) }|';'|
//  Pure JS; attaches to window and module.exports (same IIFE style as ash-exec.js).
//  IR op shape is documented at the top of docs/samara/SYNTAX.md.
// ============================================================
(function (global) {
  'use strict';

  var NAMESPACES = ['sys', 'ui', 'gfx', 'cam', 'net', 'store', 'snd', 'sensor', 'power', 'input'];
  var NATURAL_TOOLS = ['Hammer', 'Puzzle', 'Stick', 'Maze', 'Envelope', 'Knife', 'Scissors'];

  // gfx.gl.<x>  ->  GLDrivers node (js/gldrivers.js ASH_GL.<node>); same map as ash-exec.js
  var GL_MAP = {
    scene: 'ThreeScene', camera: 'CameraNode', light: 'LightNode', geometry: 'GeometryNode',
    material: 'MaterialNode', mesh: 'MeshNode', animate: 'AnimateNode', shader: 'ShaderNode',
    particle: 'ParticleNode', load: 'GLBLoader', ui: 'UIOverlayNode', arcedge: 'ArcEdgeNode',
    render: 'startRenderLoop'
  };

  // ---------- the statement table ----------
  // pos: names of positional slots, filled by the first "(..)" group then bare words.
  // req: how many positional slots are required.  keys: known key=value names (others warn
  // unless any:true).  dest: 'opt'|'req' => `placeto (var)`.  withv: 'opt'|'req' => `with (var)`.
  // block: 'handlers' (needs { }) | 'children' (optional { } of child statements).
  // events: legal handler events.  host: the host method the kernel calls (host.<ns>.<fn>).
  var TABLE = {};
  function def(name, o) {
    o = o || {};
    TABLE[name] = {
      name: name, ns: name.split('.')[0], pos: o.pos || [], req: o.req == null ? (o.pos || []).length : o.req,
      keys: o.keys || [], any: !!o.any, dest: o.dest || null, withv: o.withv || null,
      block: o.block || null, events: o.events || null, defEvent: o.defEvent || null,
      host: o.host || name, glNode: o.glNode || null, doc: o.doc || ''
    };
  }
  // sys
  def('sys.theme',   { pos: ['name'], doc: 'Select the OS colour theme (manifest).' });
  def('sys.layout',  { pos: [], keys: ['grid', 'dock'], doc: 'Home grid "CxR" and dock slot count (manifest).' });
  def('sys.app',     { pos: ['id'], keys: ['name', 'icon', 'glyph', 'color', 'entry'], doc: 'Register a launcher app (manifest).' });
  def('sys.boot',    { pos: ['node'], doc: 'Boot node (manifest); default Crown.' });
  def('sys.launch',  { pos: ['id'], doc: 'Launch an app by id.' });
  def('sys.home',    { doc: 'Go to the home screen.' });
  def('sys.back',    { doc: 'Navigate back.' });
  def('sys.notify',  { pos: ['text'], keys: ['title'], doc: 'Show a notification.' });
  def('sys.clock',   { dest: 'opt', doc: 'Current time string into var.' });
  def('sys.battery', { dest: 'opt', doc: 'Battery percent into var.' });
  def('sys.setting', { pos: ['key', 'value'], req: 1, dest: 'opt', doc: 'Get (placeto) or set a system setting.' });
  // ==== updates: system information / versioning / OTA statements ====
  def('sys.meta',    { pos: [], any: true, doc: 'OS release metadata (manifest): version= build= channel= id= name= schema= minKernel= minSchema= feed= notes=.' });
  def('sys.migrate', { pos: ['from'], keys: ['op', 'key', 'to', 'value'], doc: 'Declarative state migration (manifest): runs when persisted state written by version <= (from) is upgraded. op=rename|set|default|delete.' });
  def('sys.about',   { pos: ['action'], req: 0, keys: ['key'], dest: 'opt', doc: 'System info: refresh (fill about_* vars) | tapbuild | copy.' });
  def('sys.update',  { pos: ['action', 'value'], req: 1, dest: 'opt', doc: 'OTA updates: check|download|apply|primary|rollback|channel|auto|schedule|simulate|status.' });
  def('sys.dev',     { pos: ['action', 'value'], req: 1, dest: 'opt', doc: 'Developer options: enable|disable|toggle|log|rom|factoryreset|clearlog|status.' });
  // ui
  def('ui.screen', { pos: ['id'], keys: ['title', 'parent'], block: 'children', host: 'ui.screen', doc: 'Declare / show a screen.' });
  def('ui.text',   { pos: ['id'], keys: ['text', 'size', 'align', 'color', 'parent', 'kind', 'weight', 'glyph', 'span', 'wrap', 'justify'], doc: 'Static or bound text.' });
  def('ui.button', { pos: ['id'], keys: ['label', 'color', 'parent', 'w', 'h', 'kind', 'weight', 'glyph', 'span', 'wrap', 'justify'], doc: 'Push button; pair with ui.on (id) tap.' });
  def('ui.input',  { pos: ['id'], keys: ['placeholder', 'multiline', 'value', 'parent', 'mode', 'hint', 'kind'], doc: 'Text field.' });
  def('ui.web',    { pos: ['id'], keys: ['url', 'mode', 'reload', 'h', 'kind', 'parent'], doc: 'Real web view (sandboxed iframe in the browser host). url=(var) mode=desktop|mobile reload=(counter); ui.on (id) load { }.' });
  def('ui.list',   { pos: ['id'], keys: ['items', 'parent'], doc: 'List of items (comma list or var).' });
  def('ui.icon',   { pos: ['id'], keys: ['glyph', 'color', 'size', 'parent'], doc: 'Glyph icon.' });
  def('ui.row',    { pos: ['id'], keys: ['gap', 'parent', 'kind', 'weight', 'span', 'wrap', 'justify'], block: 'children', doc: 'Horizontal container.' });
  def('ui.col',    { pos: ['id'], keys: ['gap', 'parent', 'kind', 'weight', 'span', 'wrap', 'justify'], block: 'children', doc: 'Vertical container.' });
  def('ui.grid',   { pos: ['id'], keys: ['cols', 'gap', 'parent'], block: 'children', doc: 'Grid container.' });
  def('ui.set',    { pos: ['id'], any: true, doc: 'Set widget properties: ui.set (id) text=.. color=..' });
  def('ui.on',     { pos: ['id', 'event'], block: 'handlers', events: ['tap', 'change', 'submit', 'load'], doc: 'Event handler block (load: ui.web finished loading).' });
  def('call',      { pos: ['node'], doc: 'Run another node\'s ops in this app (shared vars/widgets), like a subroutine.' });
  def('if',        { pos: [], keys: ['cond'], block: 'children', doc: 'Conditional block: if cond="${a}==${b}" { ... }  (== != < > <= >=; no else, use a second if).' });
  def('ui.menu',   { pos: ['id'], keys: ['items', 'parent'], doc: 'Menu of items.' });
  // gfx
  def('gfx.canvas', { pos: ['id'], keys: ['w', 'h'], doc: '2D canvas surface.' });
  def('gfx.rect',   { pos: ['id'], req: 0, keys: ['x', 'y', 'w', 'h', 'color', 'fill', 'radius'], doc: 'Filled rectangle.' });
  def('gfx.circle', { pos: ['id'], req: 0, keys: ['x', 'y', 'r', 'color', 'fill'], doc: 'Circle.' });
  def('gfx.line',   { pos: ['id'], req: 0, keys: ['x1', 'y1', 'x2', 'y2', 'color', 'width'], doc: 'Line.' });
  def('gfx.text',   { pos: ['id'], req: 0, keys: ['x', 'y', 'text', 'size', 'color'], doc: 'Text on canvas.' });
  def('gfx.image',  { pos: ['id'], req: 0, keys: ['x', 'y', 'w', 'h', 'src'], doc: 'Image on canvas.' });
  def('gfx.clear',  { pos: ['id'], req: 0, keys: ['color'], doc: 'Clear canvas.' });
  Object.keys(GL_MAP).forEach(function (k) {
    def('gfx.gl.' + k, { pos: ['name'], req: 0, any: true, dest: 'opt', host: 'gl.call', glNode: GL_MAP[k],
      doc: 'GLDrivers node ' + GL_MAP[k] + ' (preceding irin ("..") text becomes params).' });
  });
  // cam
  def('cam.open',  { pos: ['facing'], req: 0, doc: 'Open camera: front|back (default back).' });
  def('cam.snap',  { dest: 'req', doc: 'Capture a frame into var.' });
  def('cam.close', { doc: 'Close camera.' });
  // net
  def('net.fetch',  { pos: ['url'], dest: 'opt', keys: ['method', 'body'], doc: 'HTTP GET (host-mediated) into var.' });
  def('net.listen', { pos: ['node'], block: 'handlers', defEvent: 'event', doc: 'Listen for events: net.listen (n) [net:..] {when (evt) = X}.' });
  def('net.status', { dest: 'opt', doc: 'Connectivity status into var.' });
  // store
  def('store.get', { pos: ['key'], dest: 'req', doc: 'Read per-seed storage into var.' });
  def('store.set', { pos: ['key'], withv: 'req', doc: 'Write var to per-seed storage.' });
  // snd / sensor / power / input
  def('snd.play',   { pos: ['src'], req: 0, keys: ['volume', 'loop'], doc: 'Play a sound (stub).' });
  def('snd.stop',   { doc: 'Stop sound.' });
  def('snd.volume', { pos: ['level'], doc: 'Set volume 0..1.' });
  def('snd.beep',   { pos: [], keys: ['freq', 'ms'], doc: 'Beep.' });
  def('sensor.tilt',     { dest: 'opt', doc: 'Tilt {x,y,z} into var.' });
  def('sensor.location', { dest: 'opt', doc: 'Location {lat,lon} into var.' });
  def('power.battery',   { dest: 'opt', doc: 'Battery percent into var.' });
  def('power.charging',  { dest: 'opt', doc: 'Charging flag into var.' });
  def('power.sleep',     { doc: 'Screen off.' });
  def('power.wake',      { doc: 'Screen on.' });
  def('input.on',     { pos: ['key'], block: 'handlers', events: ['press'], defEvent: 'press',
                        doc: 'Hardware key handler: home|back|power|volup|voldown.' });
  def('input.haptic', { pos: ['ms'], req: 0, doc: 'Vibrate.' });

  var HW_KEYS = ['home', 'back', 'power', 'volup', 'voldown'];
  var MANIFEST_OPS = { 'sys.theme': 1, 'sys.layout': 1, 'sys.app': 1, 'sys.boot': 1, 'sys.meta': 1, 'sys.migrate': 1 };

  // ---------- low-level helpers ----------
  function isWordCh(c) { return /[\w]/.test(c); }
  function unquote(s) {
    s = String(s).trim();
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
      return s.slice(1, -1).replace(/\\(["\\nt])/g, function (_, c) { return c === 'n' ? '\n' : c === 't' ? '\t' : c; });
    }
    return s;
  }
  function numify(s) { return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : s; }

  // read a balanced (...) group starting at s[i]=='(' ; returns {raw, end}
  function readParen(s, i) {
    var d = 0, q = false, j;
    for (j = i; j < s.length; j++) {
      var c = s[j];
      if (c === '\\' && q) { j++; continue; }
      if (c === '"') q = !q;
      else if (!q) {
        if (c === '(') d++;
        else if (c === ')') { d--; if (d === 0) return { raw: s.slice(i + 1, j), end: j + 1 }; }
      }
    }
    return null;
  }
  function readQuoted(s, i) {
    for (var j = i + 1; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '"') return { raw: s.slice(i, j + 1), end: j + 1 };
    }
    return null;
  }
  function readToken(s, i) {            // one value token at s[i]
    var c = s[i], r;
    if (c === '"') { r = readQuoted(s, i); if (!r) return null; return { t: 'str', v: unquote(r.raw), end: r.end }; }
    if (c === '(') { r = readParen(s, i); if (!r) return null; return { t: 'paren', v: r.raw, end: r.end }; }
    var j = i;
    while (j < s.length && !/[\s()"]/.test(s[j])) j++;
    return { t: 'word', v: s.slice(i, j), end: j };
  }
  function tokenize(rest) {
    var toks = [], i = 0, t;
    while (i < rest.length) {
      if (/\s/.test(rest[i])) { i++; continue; }
      t = readToken(rest, i);
      if (!t) return { error: 'unterminated string or parenthesis' };
      if (t.t === 'word' && t.end > i) {
        var w = t.v, eq = w.indexOf('=');
        if (eq > 0 && /^[A-Za-z_][\w.]*$/.test(w.slice(0, eq))) {
          var key = w.slice(0, eq), after = w.slice(eq + 1), val;
          if (after === '' && t.end < rest.length && /["(]/.test(rest[t.end])) {
            val = readToken(rest, t.end);
            if (!val) return { error: 'unterminated value for ' + key + '=' };
            toks.push({ t: 'kv', key: key, val: val }); i = val.end; continue;
          }
          toks.push({ t: 'kv', key: key, val: { t: 'word', v: after } }); i = t.end; continue;
        }
      }
      if (t.end === i) { i++; continue; }
      toks.push(t); i = t.end;
    }
    return { toks: toks };
  }
  function valueOf(tok, key) {
    var v;
    if (tok.t === 'str') v = tok.v;
    else if (tok.t === 'paren') { var r = tok.v.trim(); v = /^[A-Za-z_]\w*$/.test(r) ? { $var: r } : unquote(r); }
    else {
      v = tok.v;
      if (/^\$[A-Za-z_]\w*$/.test(v)) v = { $var: v.slice(1) };
      else if (v === 'true') v = true; else if (v === 'false') v = false; else v = numify(v);
    }
    if (key === 'items' && typeof v === 'string') v = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return v;
  }
  function posValue(tok) {            // positional: raw string (ids/urls/text), numbers, $var
    if (tok.t === 'paren') {
      var r = tok.v.trim();
      if (/^\$[A-Za-z_]\w*$/.test(r)) return { $var: r.slice(1) };
      return unquote(r);
    }
    return valueOf(tok);
  }

  // ---------- statement parsing ----------
  function parseIrinText(inner) {
    var text = unquote(inner);
    var m = /^Data:\s*([\s\S]*)$/.exec(text);
    if (!m) return { text: text };
    var vars = {}, re = /(\w[\w.]*)=([^\s]+(?:\s+(?![\w.]+=)[^\s]+)*)/g, a;
    while ((a = re.exec(m[1]))) vars[a[1]] = numify(a[2].trim());
    if (!Object.keys(vars).length) return { text: m[1], data: true };
    return { vars: vars };
  }
  function parseIroutParts(inner) {
    var parts = [], re = /"((?:[^"\\]|\\.)*)"|placeto\s*\(\s*([\w.]+)\s*\)|\(\s*([\w.]+)\s*\)/g, m;
    while ((m = re.exec(inner))) {
      if (m[1] != null) parts.push({ lit: unquote('"' + m[1] + '"') });
      else parts.push({ $var: m[2] || m[3] });
    }
    if (!parts.length && inner.trim()) parts.push({ lit: inner.trim() });
    return parts;
  }

  // parse one statement (no braces). returns {ops:[...], diags:[{level,msg}]}
  function parseStmt(text, line) {
    var diags = [], ops = [];
    function err(m) { diags.push({ level: 'error', line: line, msg: m }); return { ops: [], diags: diags }; }
    function warn(m) { diags.push({ level: 'warn', line: line, msg: m }); }
    text = text.trim();
    if (!text) return { ops: [], diags: [] };
    var nm = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/.exec(text);
    if (!nm) return err("cannot parse statement '" + text.slice(0, 40) + "'");
    var name = nm[0], rest = text.slice(name.length), m;

    // --- Ash core keywords ---
    if (name === 'import') {
      m = /^\s*\(\s*([\w.]+)\s*\)/.exec(rest);
      if (!m) return err('import needs (Name)');
      return { ops: [{ op: 'import', args: { name: m[1] }, line: line }], diags: diags };
    }
    if (name === 'var' || name === 'Var') {
      var re = /\(\s*([A-Za-z_]\w*)\s*\)/g, any = false;
      while ((m = re.exec(rest))) { any = true; ops.push({ op: 'var', args: { name: m[1] }, line: line }); }
      if (!any) return err('var needs (name)');
      // trailing more `var (x)` pairs are covered by the global regex
      return { ops: ops, diags: diags };
    }
    if (name === 'irin') {
      var pr = readParen(rest.trim() ? rest.slice(rest.indexOf('(')) : '', 0);
      if (rest.indexOf('(') < 0 || !pr) return err('irin needs ("...")');
      return { ops: [{ op: 'irin', args: parseIrinText(pr.raw), line: line }], diags: diags };
    }
    if (name === 'irout') {
      var po = rest.indexOf('(') >= 0 ? readParen(rest, rest.indexOf('(')) : null;
      if (!po) return err('irout needs ("...")');
      return { ops: [{ op: 'irout', args: { parts: parseIroutParts(po.raw) }, line: line }], diags: diags };
    }
    if (name === 'thenplace') {
      var tk = tokenize(rest);
      if (tk.error) return err(tk.error);
      var a = {}, k;
      for (k = 0; k < tk.toks.length; k++) {
        var tt = tk.toks[k];
        if (tt.t === 'word' && tt.v === 'placeto' && tk.toks[k + 1]) { a.placeto = String(tk.toks[++k].v).trim(); }
        else if (a.src === undefined) a.src = String(tt.v).trim();
      }
      return { ops: [{ op: 'thenplace', args: a, line: line }], diags: diags };
    }
    if (name === 'Research' || name === 'Report') {
      var pp = rest.indexOf('(') >= 0 ? readParen(rest, rest.indexOf('(')) : null;
      if (!pp) return err(name + ' needs (expr)');
      var ra = { expr: pp.raw.trim() };
      m = /placeto\s*\(\s*([\w.]+)\s*\)/.exec(rest.slice(pp.end));
      if (m) ra.placeto = m[1];
      return { ops: [{ op: name.toLowerCase(), args: ra, line: line }], diags: diags };
    }
    if (NATURAL_TOOLS.indexOf(name) >= 0) {
      var ta = { name: name };
      m = /^\s*\(\s*([^)]*)\)/.exec(rest);
      if (m) ta.target = m[1].trim();
      return { ops: [{ op: 'tool', args: ta, line: line }], diags: diags };
    }

    // --- Samara table statements ---
    var key = name;
    if (/^gl\./.test(key)) key = 'gfx.' + key;           // legacy alias gl.scene -> gfx.gl.scene
    var spec = TABLE[key];
    if (!spec) {
      var first = key.split('.')[0];
      if (NAMESPACES.indexOf(first) >= 0 && key.indexOf('.') > 0) {
        var cands = Object.keys(TABLE).filter(function (n) { return n.indexOf(first + '.') === 0; });
        return err("unknown statement '" + name + "' (namespace " + first + " has: " +
          cands.map(function (c) { return c.slice(first.length + 1); }).join(', ') + ')');
      }
      return err("unknown statement '" + name + "'");
    }
    var tz = tokenize(rest);
    if (tz.error) return err(spec.name + ': ' + tz.error);
    var args = {}, pi = 0, toks = tz.toks, i, t;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t.t === 'kv') {
        if (!spec.any && spec.keys.indexOf(t.key) < 0) warn(spec.name + ": unknown key '" + t.key + "'");
        args[t.key] = valueOf(t.val, t.key);
      } else if (t.t === 'word' && (t.v === 'placeto' || t.v === 'with') && toks[i + 1] && toks[i + 1].t === 'paren') {
        var slot = t.v === 'placeto' ? 'dest' : 'withv';
        if (!spec[slot]) { diags.push({ level: 'error', line: line, msg: spec.name + " does not take '" + t.v + "'" }); return { ops: [], diags: diags }; }
        args[t.v === 'placeto' ? 'placeto' : 'with'] = toks[i + 1].v.trim(); i++;
      } else {
        if (pi >= spec.pos.length) {
          diags.push({ level: 'error', line: line, msg: spec.name + ": unexpected argument '" + (t.v || '') + "'" });
          return { ops: [], diags: diags };
        }
        args[spec.pos[pi++]] = posValue(t);
      }
    }
    if (pi < spec.req) return err(spec.name + ' needs ' + spec.pos.slice(pi, spec.req).map(function (p) { return '(' + p + ')'; }).join(' '));
    if (spec.dest === 'req' && !args.placeto) return err(spec.name + " needs 'placeto (var)'");
    if (spec.withv === 'req' && !args['with']) return err(spec.name + " needs 'with (var)'");
    if (spec.events && args.event !== undefined && spec.events.indexOf(args.event) < 0) {
      return err(spec.name + ": unknown event '" + args.event + "' (use " + spec.events.join('|') + ')');
    }
    if (key === 'input.on' && HW_KEYS.indexOf(String(args.key)) < 0) {
      return err("input.on: unknown key '" + args.key + "' (use " + HW_KEYS.join('|') + ')');
    }
    if (key === 'cam.open') { if (args.facing === undefined) args.facing = 'back'; else if (args.facing !== 'front' && args.facing !== 'back') return err("cam.open: facing must be front|back"); }
    if (key === 'sys.layout' && args.grid !== undefined) {
      m = /^(\d+)x(\d+)$/.exec(String(args.grid));
      if (!m) return err('sys.layout: grid must look like 4x5');
    }
    if (spec.glNode) args.glNode = spec.glNode;
    return { ops: [{ op: spec.name, args: args, line: line }], diags: diags, spec: spec };
  }

  // ---------- source scanner: splits into pieces ----------
  function parseTag(raw) {
    var m = /^\s*([\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(raw);
    return m ? { kind: m[1], value: m[2] } : { kind: 'raw', value: raw.trim() };
  }
  function scan(src) {
    var pieces = [], buf = '', bufLine = 0, line = 1, i = 0, n = src.length, pdepth = 0, q = false, pending = [];
    function flush(kind) {
      var text = buf.trim();
      if (text) pieces.push({ t: kind || 'stmt', text: text, line: bufLine, tags: pending.splice(0) });
      else if (pending.length) {
        pending.splice(0).forEach(function (tg) { pieces.push({ t: 'tag', kind: tg.kind, value: tg.value, line: tg.line }); });
      }
      buf = ''; bufLine = 0;
    }
    function add(c) { if (!bufLine && /\S/.test(c)) bufLine = line; buf += c; }
    while (i < n) {
      var c = src[i];
      if (c === '\n') {
        line++;
        if (pdepth > 0 || q) { buf += ' '; } else flush();
        i++; continue;
      }
      if (q) { add(c); if (c === '\\' && i + 1 < n) { add(src[i + 1]); i += 2; continue; } if (c === '"') q = false; i++; continue; }
      if (c === '"') { q = true; add(c); i++; continue; }
      if (c === '/' && src[i + 1] === '/' && pdepth === 0) { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '(') { pdepth++; add(c); i++; continue; }
      if (c === ')') { if (pdepth > 0) pdepth--; add(c); i++; continue; }
      if (pdepth > 0) { add(c); i++; continue; }
      if (c === '{' && src[i + 1] === '{') {
        var e = src.indexOf('}}', i + 2);
        if (e < 0) { add(c); i++; continue; }
        var tg = parseTag(src.slice(i + 2, e)); tg.line = line;
        if (buf.trim()) pending.push(tg); else { flush(); pieces.push({ t: 'tag', kind: tg.kind, value: tg.value, line: line }); }
        i = e + 2; continue;
      }
      if (c === '[') {
        var d = 0, j = i, dbl = src[i + 1] === '[';
        for (; j < n; j++) { if (src[j] === '[') d++; else if (src[j] === ']') { d--; if (d === 0) break; } else if (src[j] === '\n') break; }
        if (j < n && src[j] === ']') {
          var inner = src.slice(i + 1, j);
          if (dbl) inner = inner.slice(1, -1);
          var tg2 = parseTag(inner); tg2.line = line;
          if (buf.trim()) pending.push(tg2); else { flush(); pieces.push({ t: 'tag', kind: tg2.kind, value: tg2.value, line: line }); }
          i = j + 1; continue;
        }
        add(c); i++; continue;
      }
      if (c === '{') { var ln = bufLine || line; flush('open'); if (pieces.length && pieces[pieces.length - 1].t === 'open') { /* ok */ } else pieces.push({ t: 'open', text: '', line: ln, tags: [] }); i++; continue; }
      if (c === '}') {
        flush(); pieces.push({ t: 'close', line: line });
        i++;
        if (src.substr(i, 5) === "|';'|") i += 5;
        else if (src[i] === '|' && src[i + 1] === '|') i += 2;
        while (src[i] === ':') i++;
        continue;
      }
      if (c === ';') { flush(); i++; continue; }
      add(c); i++;
    }
    flush();
    if (q) pieces.push({ t: 'error', text: 'unterminated string', line: line });
    return pieces;
  }

  // ---------- block parser ----------
  // parseSource(text, file) -> { nodes:{Name:[ops]}, order:[names], decls:[manifest decl ops], meta:{imports,tags}, diagnostics }
  function parseSource(text, file) {
    var diags = [], nodes = {}, order = [], decls = [], meta = { imports: [], tags: [] };
    function D(level, line, msg) { diags.push({ level: level, file: file, line: line, msg: msg }); }
    var pieces = scan(String(text || ''));
    var stack = [];                 // frames
    var cur = null;                 // current node record {name, ops, line, pendings}
    var topOps = null;
    function ops() { return stack.length ? stack[stack.length - 1].ops : null; }

    function addOps(list, piece, target) {
      list.forEach(function (op) {
        if (MANIFEST_OPS[op.op]) { decls.push({ op: op.op, args: op.args, line: op.line, file: file }); return; }
        if (op.op === 'import') { meta.imports.push(op.args.name); return; }
        // colon-style GL params: irin ("...") immediately before gfx.gl.*
        if (/^gfx\.gl\./.test(op.op) && target.length) {
          var last = target[target.length - 1];
          if (last.op === 'irin' && last.args.text !== undefined && !last.args.vars && args_noParams(op)) {
            op.args.params = last.args.text; target.pop();
          }
        }
        if (/^gfx\.gl\./.test(op.op) && op.args.name === undefined && cur) op.args.name = cur.name;
        target.push(op);
      });
    }
    function args_noParams(op) { return op.args.params === undefined; }
    function attachTags(piece, op, target) {
      (piece.tags || []).forEach(function (tg) {
        if (op && op.op === 'net.listen') { op.args.tag = '[' + tg.kind + ': ' + tg.value + ']'; return; }
        meta.tags.push({ kind: tg.kind, value: tg.value, file: file, line: tg.line });
        if (stack.length) target.push({ op: 'tag', args: { kind: tg.kind, value: tg.value }, line: tg.line });
      });
    }
    function runStmt(piece, wantHeader) {
      var r = parseStmt(piece.text, piece.line);
      r.diags.forEach(function (d) { D(d.level, d.line, d.msg); });
      return r;
    }
    function finishNode(frame) {
      var rec = frame.rec;
      rec.pendings.forEach(function (p) {
        var idx = p.parent.indexOf(p.op);
        if (idx >= 0) { var rest = p.parent.splice(idx + 1); (p.op.handlers[p.event] = p.op.handlers[p.event] || []).push.apply(p.op.handlers[p.event], rest); }
      });
    }

    pieces.forEach(function (pc) {
      var top = stack.length ? stack[stack.length - 1] : null, tgt = top ? top.ops : null, r, op, m;
      if (pc.t === 'error') { D('error', pc.line, pc.text); return; }
      if (pc.t === 'tag') {
        meta.tags.push({ kind: pc.kind, value: pc.value, file: file, line: pc.line });
        if (tgt) tgt.push({ op: 'tag', args: { kind: pc.kind, value: pc.value }, line: pc.line });
        return;
      }
      if (pc.t === 'close') {
        if (!stack.length) { D('error', pc.line, "unmatched '}'"); return; }
        var fr = stack.pop();
        if (fr.kind === 'node') { finishNode(fr); cur = null; }
        else if (fr.kind === 'listen') {
          if (!fr.event) { D('error', fr.line, "net.listen block needs 'when (evt) = X'"); }
          else if (!fr.ops.length && cur && !fr.blockBody) {
            cur.pendings.push({ op: fr.op, parent: fr.parentOps, event: fr.event });   // one-liner: following ops are the handler
          }
        }
        return;
      }
      if (pc.t === 'open') {
        var h = pc.text;
        if ((m = /^\(\s*([A-Za-z_]\w*)\s*\)\s*:-:$/.exec(h))) {
          if (stack.length) { D('error', pc.line, "node '" + m[1] + "' cannot be nested"); stack.push({ kind: 'junk', ops: [], line: pc.line }); return; }
          if (nodes[m[1]]) D('error', pc.line, "duplicate node '" + m[1] + "' in " + file);
          var nops = []; nodes[m[1]] = nops; order.push(m[1]);
          cur = { name: m[1], ops: nops, line: pc.line, pendings: [] };
          stack.push({ kind: 'node', ops: nops, line: pc.line, rec: cur });
          (pc.tags || []).forEach(function (tg) { meta.tags.push({ kind: tg.kind, value: tg.value, file: file, line: tg.line }); nops.push({ op: 'tag', args: { kind: tg.kind, value: tg.value }, line: tg.line }); });
          return;
        }
        if (/^with\b/.test(h)) {
          if (!stack.length) { D('error', pc.line, "'with' block outside a node"); stack.push({ kind: 'junk', ops: [], line: pc.line }); return; }
          var vre = /var\s*\(\s*([A-Za-z_]\w*)\s*\)/gi, vm;
          while ((vm = vre.exec(h))) tgt.push({ op: 'var', args: { name: vm[1] }, line: pc.line });
          stack.push({ kind: 'with', ops: tgt, line: pc.line });
          return;
        }
        if (!h) { D('error', pc.line, "unexpected '{'"); stack.push({ kind: 'junk', ops: [], line: pc.line }); return; }
        r = runStmt(pc);
        op = r.ops[0];
        if (!op || !r.spec || !r.spec.block) {
          if (op) D('error', pc.line, op.op + " does not take a { } block");
          stack.push({ kind: 'junk', ops: [], line: pc.line }); return;
        }
        if (!stack.length) { D('error', pc.line, op.op + ' outside a node'); stack.push({ kind: 'junk', ops: [], line: pc.line }); return; }
        attachTags(pc, op, tgt);
        tgt.push(op);
        if (r.spec.block === 'children') {
          op.children = []; stack.push({ kind: 'children', ops: op.children, line: pc.line });
        } else if (op.op === 'net.listen') {
          op.handlers = {};
          stack.push({ kind: 'listen', op: op, ops: [], parentOps: tgt, line: pc.line, event: null, blockBody: false });
        } else {
          var ev = op.args.event || r.spec.defEvent;
          op.handlers = {}; op.handlers[ev] = [];
          stack.push({ kind: 'handler', op: op, ops: op.handlers[ev], line: pc.line });
        }
        return;
      }
      // plain statement
      if (top && top.kind === 'listen' && (m = /^when\s*\(\s*([\w.]+)\s*\)\s*=\s*(.+)$/.exec(pc.text))) {
        top.event = unquote(m[2].trim()); top.op.args.when = m[1]; top.op.args.event = top.event;
        top.op.handlers[top.event] = top.ops;
        return;
      }
      if (top && top.kind === 'listen' && top.event) top.blockBody = true;
      if (top && top.kind === 'junk') return;
      r = runStmt(pc);
      if (!r.ops.length) return;
      if (r.spec && r.spec.block === 'handlers') {
        D('error', pc.line, r.spec.name + ' needs a { } block');
        return;
      }
      if (!stack.length) {
        var allDecl = r.ops.every(function (o) { return MANIFEST_OPS[o.op] || o.op === 'import'; });
        if (!allDecl) { D('error', pc.line, r.ops[0].op + ' outside a node block'); return; }
        addOps(r.ops, pc, []);
        (pc.tags || []).forEach(function (tg) { meta.tags.push({ kind: tg.kind, value: tg.value, file: file, line: tg.line }); });
        return;
      }
      attachTags(pc, r.ops[0], tgt);
      addOps(r.ops, pc, tgt);
    });
    stack.forEach(function (f) { D('error', f.line, "unclosed '{' (opened here)"); });
    return { nodes: nodes, order: order, decls: decls, meta: meta, diagnostics: diags };
  }

  // parseStatement(line) -> { ok, op, ops, error, diagnostics }
  // A single statement; if the line contains a { } block it is parsed as a mini source and the first op returned.
  function parseStatement(line) {
    line = String(line);
    if (/[{}]/.test(line.replace(/"(?:[^"\\]|\\.)*"/g, ''))) {
      var ps = parseSource('(_):-: {\n' + line + '\n}', '<stmt>');
      var list = (ps.nodes._ || []);
      var errs = ps.diagnostics.filter(function (d) { return d.level === 'error'; });
      return { ok: !errs.length && list.length > 0, op: list[0] || null, ops: list, error: errs.length ? errs[0].msg : null, diagnostics: ps.diagnostics };
    }
    var r = parseStmt(line, 1);
    if (r.spec && r.spec.block === 'handlers') r.diags.push({ level: 'error', line: 1, msg: r.spec.name + ' needs a { } block' });
    var e = r.diags.filter(function (d) { return d.level === 'error'; });
    return { ok: !e.length && r.ops.length > 0, op: r.ops[0] || null, ops: r.ops, error: e.length ? e[0].msg : null,
             diagnostics: r.diags };
  }

  var api = {
    NAMESPACES: NAMESPACES, TABLE: TABLE, GL_MAP: GL_MAP, NATURAL_TOOLS: NATURAL_TOOLS, HW_KEYS: HW_KEYS,
    parseStatement: parseStatement, parseSource: parseSource, scan: scan
  };
  global.SamaraSyntax = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
