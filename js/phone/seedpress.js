// ============================================================
//  seedpress.js — Seedpress: .ashos -> .seed compiler for Samara OS
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Seedpress.compile({files:{path:text}, entry}) -> {ok, seed, diagnostics}
//  Seedpress.verify(seed) / serialize(seed) / parse(text) / sha256(str)
//  Pure JS (no DOM, no deps); works in browsers (window.Seedpress) and node.
// ============================================================
(function (global) {
  'use strict';
  var Syntax = global.SamaraSyntax || (typeof require === 'function' ? (function () { try { return require('./samara-syntax.js'); } catch (e) { return null; } })() : null);

  var MAGIC = 'SAMARA-SEED', FORMAT = 1;
  var OS = { name: 'Samara OS', version: '1.0.0' };

  // ---------- pure-JS SHA-256 over UTF-8 ----------
  function utf8(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(str) {
    var b = utf8(String(str)), l = b.length, h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    var hi = Math.floor(l / 0x20000000), lo = (l << 3) >>> 0;
    b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64), i, j, o;
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (o = 0; o < b.length; o += 64) {
      for (i = 0; i < 16; i++) w[i] = ((b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3]) | 0;
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (j = 0; j < 64; j++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[j] + w[j]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // canonical JSON: keys sorted recursively, no whitespace
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  // the hashed body: everything except `built` and `sha256` itself
  function bodyOf(seed) {
    return canon({ magic: seed.magic, format: seed.format, os: seed.os, sources: seed.sources, manifest: seed.manifest, program: seed.program });
  }

  // ---------- compile ----------
  function compile(opts) {
    opts = opts || {};
    var files = opts.files || {}, entry = opts.entry, diags = [];
    function D(level, file, line, msg) { diags.push({ level: level, file: file || '', line: line || 0, msg: msg }); }
    var seed = null;
    if (!Syntax) { D('error', '', 0, 'SamaraSyntax not loaded'); return { ok: false, seed: null, diagnostics: diags }; }
    if (!entry) D('error', '', 0, 'no entry file given');
    else if (!Object.prototype.hasOwnProperty.call(files, entry)) D('error', entry, 0, "entry file '" + entry + "' is missing from files");
    var paths = Object.keys(files).sort();
    if (entry && files[entry] !== undefined) paths = [entry].concat(paths.filter(function (p) { return p !== entry; }));

    var program = {}, nodeFile = {}, decls = [], sources = {};
    paths.forEach(function (p) {
      sources[p] = String(files[p]);
      var r = Syntax.parseSource(sources[p], p);
      r.diagnostics.forEach(function (d) { diags.push(d); });
      r.order.forEach(function (n) {
        if (program[n]) { D('error', p, 0, "node '" + n + "' already defined in " + nodeFile[n]); return; }
        program[n] = r.nodes[n]; nodeFile[n] = p;
      });
      decls = decls.concat(r.decls);
    });

    // manifest from sys.* declarations
    var manifest = { theme: 'ash', layout: { grid: '4x5', cols: 4, rows: 5, dock: 4 }, apps: [], boot: 'Crown' };
    var ids = {};
    decls.forEach(function (d) {
      var a = d.args;
      if (d.op === 'sys.theme') manifest.theme = String(a.name);
      else if (d.op === 'sys.boot') manifest.boot = String(a.node);
      else if (d.op === 'sys.layout') {
        if (a.grid !== undefined) { var m = /^(\d+)x(\d+)$/.exec(String(a.grid)); manifest.layout.grid = String(a.grid); manifest.layout.cols = +m[1]; manifest.layout.rows = +m[2]; }
        if (a.dock !== undefined) manifest.layout.dock = +a.dock;
      } else if (d.op === 'sys.app') {
        var id = String(a.id);
        if (ids[id]) { D('error', d.file, d.line, "app id '" + id + "' declared twice"); return; }
        ids[id] = true;
        if (!a.entry) { D('error', d.file, d.line, "sys.app '" + id + "' needs entry=Node"); return; }
        manifest.apps.push({ id: id, name: a.name !== undefined ? String(a.name) : id, glyph: String(a.glyph !== undefined ? a.glyph : (a.icon !== undefined ? a.icon : id.charAt(0).toUpperCase())),
          color: a.color !== undefined ? String(a.color) : '#8899aa', entry: String(a.entry) });
      }
    });
    manifest.apps.forEach(function (ap) {
      if (!program[ap.entry]) D('error', '', 0, "app '" + ap.id + "': entry node '" + ap.entry + "' is not defined");
    });
    if (!program[manifest.boot]) D('error', entry || '', 0, "boot node '" + manifest.boot + "' is not defined");

    var ok = !diags.some(function (d) { return d.level === 'error'; });
    if (ok || opts.force) {
      seed = { magic: MAGIC, format: FORMAT, os: { name: OS.name, version: OS.version }, built: opts.built || new Date().toISOString(),
        sha256: '', sources: sources, manifest: manifest, program: program };
      seed.sha256 = sha256(bodyOf(seed));
    }
    return { ok: ok, seed: ok ? seed : (opts.force ? seed : null), diagnostics: diags };
  }

  // ---------- verify / serialize / parse ----------
  function verify(seedOrText) {
    var errors = [], seed = seedOrText;
    if (typeof seedOrText === 'string') { var p = parse(seedOrText); if (!p.ok) return { ok: false, errors: [p.error], expected: null, actual: null }; seed = p.seed; }
    if (!seed || typeof seed !== 'object') return { ok: false, errors: ['not a seed object'], expected: null, actual: null };
    if (seed.magic !== MAGIC) errors.push('bad magic');
    if (seed.format !== FORMAT) errors.push('unsupported format ' + seed.format);
    ['os', 'sources', 'manifest', 'program'].forEach(function (k) { if (!seed[k] || typeof seed[k] !== 'object') errors.push('missing ' + k); });
    var actual = null;
    if (!errors.length) {
      actual = sha256(bodyOf(seed));
      if (actual !== seed.sha256) errors.push('sha256 mismatch (seed was modified or corrupted)');
      var man = seed.manifest;
      if (!seed.program[man.boot]) errors.push("boot node '" + man.boot + "' missing from program");
      (man.apps || []).forEach(function (a) { if (!seed.program[a.entry]) errors.push("app '" + a.id + "' entry '" + a.entry + "' missing from program"); });
    }
    return { ok: errors.length === 0, errors: errors, expected: seed.sha256 || null, actual: actual };
  }
  function serialize(seed, pretty) { return JSON.stringify(seed, null, pretty === false ? 0 : 1); }
  function parse(text) {
    var seed;
    try { seed = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return { ok: false, seed: null, error: 'invalid JSON: ' + e.message }; }
    if (!seed || seed.magic !== MAGIC) return { ok: false, seed: null, error: 'not a Samara seed (bad magic)' };
    if (seed.format !== FORMAT) return { ok: false, seed: null, error: 'unsupported seed format ' + seed.format };
    return { ok: true, seed: seed, error: null };
  }

  var api = { compile: compile, verify: verify, serialize: serialize, parse: parse, sha256: sha256, canonical: canon,
    MAGIC: MAGIC, FORMAT: FORMAT, OS: OS };
  global.Seedpress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
