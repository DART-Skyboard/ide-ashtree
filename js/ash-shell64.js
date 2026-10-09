// Shell 64 socket host wrapper: parse/serialize shell64.state.ash (reflexive variable state) and run reflex reads.
// No decimals. State per record: bl, rbli, t, a, shell. Round-trips the .ash file byte-for-byte.
(function (global) {
  'use strict';
  var LINE = /^(\s*irin \("Data: )k=(\S+) bl=(\d+) rbli=(\d+) t=(\S+) a=(\S+) shell=(\S+) (kind=[^"]*)("\)\s*)$/;
  function parse(text) {
    var lines = text.split('\n'), recs = [];
    lines.forEach(function (ln, i) {
      var m = LINE.exec(ln); if (!m) return;
      recs.push({ i: i, pre: m[1], k: m[2], bl: +m[3], rbli: +m[4], t: m[5], a: m[6], shell: m[7], rest: m[8], post: m[9] });
    });
    return { lines: lines, recs: recs, byKey: Object.fromEntries(recs.map(function (r) { return [r.k, r]; })) };
  }
  function fmt(r) { return r.pre + 'k=' + r.k + ' bl=' + r.bl + ' rbli=' + r.rbli + ' t=' + r.t + ' a=' + r.a + ' shell=' + r.shell + ' ' + r.rest + r.post; }
  function serialize(st) { var L = st.lines.slice(); st.recs.forEach(function (r) { L[r.i] = fmt(r); }); return L.join('\n'); }
  // The record's own variable state says what it is — no weights.
  function classify(r) { return r.bl === 0 ? 'data' : (r.rbli >= 1 ? 'buildable' : 'sequence'); }
  function read(st, k) { return st.byKey[k] || null; }
  function find(st, prefix) { return st.recs.filter(function (r) { return r.k.indexOf(prefix) === 0; }); }
  // Reflex routing: a context (tool, shell) re-reads the SAME fact as buildable without destroying its stored form.
  function route(r, ctx) { return Object.assign({}, r, { bl: r.bl + 1, rbli: r.rbli + 1, t: ctx.tool || r.t, shell: ctx.shell || r.shell }); }
  // Reflex writes back (dynamic update). Only bl/rbli/t/a/shell may change.
  function update(st, k, patch) {
    var r = st.byKey[k]; if (!r) return false;
    ['bl', 'rbli', 't', 'a', 'shell'].forEach(function (f) { if (patch[f] !== undefined) r[f] = patch[f]; });
    return true;
  }
  // Emotion: root happy/sad/neutral accented by the active shell (aerospace/maritime/geological).
  var ROOT = { happy: 1, sad: 1, neutral: 1 }, SHELLS = { Aerospace: 1, Maritime: 1, Geological: 1 };
  function emotion(root, shell) { if (!ROOT[root]) root = 'neutral'; return { root: root, accent: SHELLS[shell] ? shell : '-', state: root + '/' + (SHELLS[shell] ? shell : '-') }; }
  global.AshShell64 = { parse: parse, serialize: serialize, classify: classify, read: read, find: find, route: route, update: update, emotion: emotion };
  if (typeof module !== 'undefined') module.exports = global.AshShell64;
})(typeof window !== 'undefined' ? window : globalThis);
