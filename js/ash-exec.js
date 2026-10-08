// Ash 2.1 executor for the extension statements (net./shell64./journal.). Pure Ash semantics; every host effect goes
// through the `host` object (wrappers). Statements after a `net.listen` line run once per matching event.
(function (global) {
  'use strict';
  function parseVars(payload, vars) {
    var re = /(\w[\w.]*)=(\S+)/g, m; while ((m = re.exec(payload))) vars[m[1]] = m[2];
  }
  function run(src, host) {
    var out = [], vars = {}, onEvent = [], lines = src.split('\n').map(function (l) { return l.trim(); });
    var inNode = false, listener = null, body = [];
    lines.forEach(function (l) {
      if (!l || l.indexOf('//') === 0 || /^import\s/.test(l)) return;
      var nm = /^\(([A-Za-z0-9_]+)\):-:\s*\{/.exec(l);
      if (nm) { inNode = true; body.push('@node ' + nm[1]); return; }
      if (/^\}\|';'\|/.test(l) || /^\}::::/.test(l)) { inNode = false; return; }
      if (!inNode) return;
      var m;
      if ((m = /^var \((\w+)\)/.exec(l))) { if (!(m[1] in vars)) vars[m[1]] = ''; return; }
      if ((m = /^irin\s*\("Data:\s*([^"]*)"\)/.exec(l))) { parseVars(m[1], vars); return; }
      if ((m = /^net\.listen \((\w+)\)\s*(\[net:[^\]]+\])?\s*\{\s*when \((\w+)\)\s*=\s*(\S+)\s*\}/.exec(l))) {
        listener = { node: m[1], tag: m[2] || '', evt: m[4] }; return;
      }
      body.push(l);
    });
    var GL = { scene: 'ThreeScene', camera: 'CameraNode', light: 'LightNode', geometry: 'GeometryNode', material: 'MaterialNode',
               mesh: 'MeshNode', animate: 'AnimateNode', shader: 'ShaderNode', load: 'GLBLoader', ui: 'UIOverlayNode' };
    function exec(stmts, v) {
      var lastIrin = '', curNode = '';
      stmts.forEach(function (l) {
        var m;
        if ((m = /^@node (\w+)/.exec(l))) { curNode = m[1]; return; }
        if ((m = /^irin\s*\("([^"]*)"\)/.exec(l)) && !/^Data:/.test(m[1])) { lastIrin = m[1]; return; }   // colon-style GL parameters
        if ((m = /^gl\.(\w+)/.exec(l)) && host.gl) {
          if (m[1] === 'render') { host.gl.call('startRenderLoop', '', curNode); }
          else if (GL[m[1]]) { host.gl.call(GL[m[1]], lastIrin, curNode); lastIrin = ''; }
          return;
        }
        if ((m = /^shell64\.read \((\w+)\) placeto \((\w+)\)/.exec(l))) {
          var r = host.shell64.read(v[m[1]]); v[m[2]] = r ? r.k + ' bl=' + r.bl + ' rbli=' + r.rbli + ' t=' + r.t + ' ' + host.shell64.classify(r) : ''; return; }
        if ((m = /^shell64\.update \((\w+)\) with \((\w+)\)\+\((\w+)\)/.exec(l))) {
          host.shell64.update(v[m[1]], { bl: +v[m[2]], rbli: +v[m[3]] }); return; }
        if ((m = /^journal\.write \((\w+)\) with var \((\w+)\)/.exec(l))) {
          host.journal.write({ type: v.type || 'ash_journal', pattern: { text: v[m[2]], evt: v.evt || null }, trigger: 'ash_exec' }, false); return; }
        if ((m = /^irout \("([^"]*)"placeto \((\w+)\)\)/.exec(l))) { var ln = m[1] + v[m[2]]; out.push(ln); if (host.log) host.log(ln); return; }
      });
    }
    if (listener) {
      host.net.listen(listener.evt, function (evtPayload) {
        var v = Object.assign({}, vars, { evt: listener.evt, payload: evtPayload }); exec(body, v);
      });
    } else exec(body, vars);
    return { out: out, vars: vars, listener: listener };
  }
  global.AshExec = { run: run };
  if (typeof module !== 'undefined') module.exports = global.AshExec;
})(typeof window !== 'undefined' ? window : globalThis);
