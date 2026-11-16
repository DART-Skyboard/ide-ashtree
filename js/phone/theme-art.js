// ============================================================
//  theme-art.js — original vector illustrations for the six Samara OS themes
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Everything is generated: seeded PRNG + SVG strings, no raster assets, no third-party art.
//    SamaraThemeArt.svg(theme, {w,h})      full illustration (default 720x1560 portrait); `preserveAspectRatio=slice`
//    SamaraThemeArt.card(theme)            16:10 preview used by the Rings theme picker
//    SamaraThemeArt.accent(theme, size)    square emblem (the "themed accent illustration")
//    SamaraThemeArt.dataUri(svgString)     data: URI usable as CSS url(...) / <img src>
//    SamaraThemeArt.css(theme, {w,h})      `url("data:...") center/cover no-repeat`  (wallpaper "Theme Art")
//    SamaraThemeArt.themes                 the theme names this module knows
//  Unknown (ROM-defined) themes fall back to the Ash Dark composition tinted with the theme's own accent/bg.
//  The same compositions are checked in as phone/assets/themes/*.svg (tools/gen-theme-art.js regenerates them).
// ============================================================
(function (global) {
  'use strict';

  var PAL = {
    'Ash Dark':  { a: '#00ffcc', b: '#0b2a2a', c: '#05070a', d: '#13564f', e: '#d9fff6', dark: true },
    'Ash Light': { a: '#00967a', b: '#cfe9e2', c: '#f3f7f8', d: '#7cc9b6', e: '#0b3d33', dark: false },
    'Ember':     { a: '#ff7a3d', b: '#4a1d0c', c: '#150a07', d: '#c2410c', e: '#ffd9b8', dark: true },
    'Moss':      { a: '#7bd88f', b: '#16341f', c: '#08110a', d: '#2f7a45', e: '#e1f7e6', dark: true },
    'Mist':      { a: '#4f7cf0', b: '#cdd9f5', c: '#f2f5fa', d: '#9db4ea', e: '#1c2733', dark: false },
    'Midnight':  { a: '#8a7dff', b: '#151a4a', c: '#04061a', d: '#3b2f9e', e: '#e8ebff', dark: true }
  };
  var NAMES = Object.keys(PAL);

  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
  function n1(x) { return Math.round(x * 10) / 10; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hex2rgb(h) { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(c1, c2, t) { var a = hex2rgb(c1), b = hex2rgb(c2), o = []; for (var i = 0; i < 3; i++) o.push(Math.round(a[i] + (b[i] - a[i]) * t)); return '#' + o.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }

  function palFor(theme, tokens) {
    var p = PAL[theme];
    if (p) return p;
    var t = tokens || {}, dark = t.dark !== false;
    return { a: t.accent || '#00ffcc', b: mix(t.bg || '#0d1117', t.accent || '#00ffcc', 0.18), c: t.bg || '#0d1117', d: mix(t.bg || '#0d1117', t.accent || '#00ffcc', 0.45), e: t.text || '#eee', dark: dark };
  }

  // a winged ash seed (samara): blade + seed body, drawn pointing up from (0,0), scaled by s
  function samara(x, y, rot, s, fill, op, stroke) {
    return '<g transform="translate(' + n1(x) + ' ' + n1(y) + ') rotate(' + n1(rot) + ') scale(' + n1(s) + ')" opacity="' + op + '">' +
      '<path d="M0 0C16-12 44-78 20-168C6-132-10-66 0 0Z" fill="' + fill + '" fill-opacity=".55"' + (stroke ? ' stroke="' + stroke + '" stroke-width="1.4"' : '') + '/>' +
      '<path d="M2-6C12-40 20-92 18-150" fill="none" stroke="' + (stroke || fill) + '" stroke-opacity=".55" stroke-width="1"/>' +
      '<ellipse cx="0" cy="4" rx="6.5" ry="10" fill="' + fill + '"/></g>';
  }
  // layered ridgeline from sines (deterministic)
  function ridge(W, H, base, amp, seed, fill, op, id, freq) {
    var r = rng(seed), p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28, f = freq || 1, pts = [], N = 36;
    for (var i = 0; i <= N; i++) {
      var x = W * i / N, u = i / N * 6.28 * f;
      pts.push([x, base + amp * (Math.sin(u + p1) * 0.55 + Math.sin(u * 2.3 + p2) * 0.3 + Math.sin(u * 5.1 + p3) * 0.15)]);
    }
    var d = 'M0 ' + H + 'L' + pts.map(function (q) { return n1(q[0]) + ' ' + n1(q[1]); }).join('L') + 'L' + W + ' ' + H + 'Z';
    return '<path d="' + d + '" fill="' + (id ? 'url(#' + id + ')' : fill) + '" opacity="' + op + '"/>';
  }
  function lg(id, c1, c2, o1, o2, x2, y2) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 || 0) + '" y2="' + (y2 === undefined ? 1 : y2) + '"><stop offset="0" stop-color="' + c1 + '" stop-opacity="' + (o1 === undefined ? 1 : o1) + '"/><stop offset="1" stop-color="' + c2 + '" stop-opacity="' + (o2 === undefined ? 1 : o2) + '"/></linearGradient>';
  }
  function rg(id, c, o1, o2, cx, cy, r) {
    return '<radialGradient id="' + id + '" cx="' + (cx === undefined ? 0.5 : cx) + '" cy="' + (cy === undefined ? 0.5 : cy) + '" r="' + (r || 0.5) + '"><stop offset="0" stop-color="' + c + '" stop-opacity="' + o1 + '"/><stop offset="1" stop-color="' + c + '" stop-opacity="' + (o2 || 0) + '"/></radialGradient>';
  }
  function grain(W, H, id) {
    return '<filter id="' + id + '" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .07 0"/></filter>' +
      '<rect width="' + W + '" height="' + H + '" filter="url(#' + id + ')" opacity=".9"/>';
  }
  function wobbleRing(cx, cy, r, amp, seed, k) {
    var rr = rng(seed), ph = [rr() * 6.28, rr() * 6.28, rr() * 6.28], pts = [], N = 64;
    for (var i = 0; i < N; i++) {
      var a = i / N * 6.28318, rad = r * (1 + amp * (Math.sin(a * 2 + ph[0]) * 0.5 + Math.sin(a * 3 + ph[1]) * 0.3 + Math.sin(a * 5 + ph[2]) * 0.2) * (k || 1));
      pts.push((i ? 'L' : 'M') + n1(cx + Math.cos(a) * rad * 1.0) + ' ' + n1(cy + Math.sin(a) * rad * 1.15));
    }
    return pts.join('') + 'Z';
  }

  // ------------------------------------------------------------------ compositions
  var SCENES = {
    'Ash Dark': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#04080a', P.b, 1, 1, 0.2, 1) + rg('gl', P.a, 0.35, 0, 0.5, 0.32, 0.6) + lg('sh', P.a, P.a, 0.22, 0, 0, 1) + lg('r1', P.d, P.c, 0.9, 1) + lg('r2', mix(P.d, P.c, 0.4), P.c, 0.95, 1) + '</defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/><rect width="' + W + '" height="' + H + '" fill="url(#gl)"/>';
      var cx = W * 0.62, cy = H * 0.3, i;
      for (i = 1; i <= 14; i++) o += '<path d="' + wobbleRing(cx, cy, Math.min(W, H) * 0.045 * i, 0.05, 11 + i, 1) + '" fill="none" stroke="' + P.a + '" stroke-opacity="' + n1(0.34 - i * 0.02) + '" stroke-width="' + (i % 4 === 0 ? 2.2 : 1) + '"/>';
      for (i = 0; i < 4; i++) { var sx = W * (0.15 + i * 0.22); o += '<polygon points="' + n1(sx) + ',0 ' + n1(sx + W * 0.1) + ',0 ' + n1(sx + W * 0.34) + ',' + H * 0.8 + ' ' + n1(sx - W * 0.06) + ',' + H * 0.8 + '" fill="url(#sh)" opacity=".5"/>'; }
      o += ridge(W, H, H * 0.72, H * 0.05, 3, '', 1, 'r2', 1.2) + ridge(W, H, H * 0.8, H * 0.045, 9, '', 1, 'r1', 1.6) + ridge(W, H, H * 0.9, H * 0.03, 21, P.c, 1, null, 2.2);
      for (i = 0; i < 16; i++) o += samara(W * r(), H * (0.08 + r() * 0.65), r() * 360, 0.28 + r() * 0.7, P.a, n1(0.25 + r() * 0.6), r() > 0.6 ? P.e : null);
      return o + grain(W, H, 'gn');
    },
    'Ash Light': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#f7fbfa', P.b, 1, 1, 0.3, 1) + rg('gl', '#ffffff', 0.9, 0, 0.35, 0.2, 0.55) + '</defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/><rect width="' + W + '" height="' + H + '" fill="url(#gl)"/>';
      var i;
      for (i = 0; i < 26; i++) o += '<path d="' + wobbleRing(W * 0.3, H * 0.62, Math.min(W, H) * (0.05 + i * 0.034), 0.12, 5 + (i >> 1), 1) + '" fill="none" stroke="' + P.a + '" stroke-opacity="' + n1(0.08 + (i % 5 === 0 ? 0.14 : 0)) + '" stroke-width="' + (i % 5 === 0 ? 1.8 : 0.9) + '"/>';
      o += '<circle cx="' + W * 0.78 + '" cy="' + H * 0.17 + '" r="' + Math.min(W, H) * 0.16 + '" fill="' + P.d + '" fill-opacity=".22"/><circle cx="' + W * 0.78 + '" cy="' + H * 0.17 + '" r="' + Math.min(W, H) * 0.11 + '" fill="#fff" fill-opacity=".7"/>';
      o += ridge(W, H, H * 0.82, H * 0.035, 14, P.d, 0.28, null, 1.4) + ridge(W, H, H * 0.89, H * 0.03, 8, P.a, 0.2, null, 2);
      for (i = 0; i < 12; i++) o += samara(W * r(), H * (0.1 + r() * 0.7), r() * 360, 0.25 + r() * 0.6, P.a, n1(0.25 + r() * 0.45), P.e);
      return o + grain(W, H, 'gn');
    },
    'Ember': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#120806', '#5a2410', 1, 1, 0, 1) + rg('sun', '#ffb36b', 1, 0, 0.5, 0.5, 0.5) + rg('sun2', P.a, 0.9, 0, 0.5, 0.5, 0.5) + lg('rb', P.a, '#ffd9a0', 0, 0.8, 1, 0) + lg('m1', '#2a0f08', '#0d0504', 1, 1) + '<filter id="bl"><feGaussianBlur stdDeviation="3"/></filter></defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>';
      var sx = W * 0.5, sy = H * 0.64, i;
      o += '<circle cx="' + sx + '" cy="' + sy + '" r="' + Math.min(W, H) * 0.7 + '" fill="url(#sun2)" opacity=".55"/><circle cx="' + sx + '" cy="' + sy + '" r="' + Math.min(W, H) * 0.32 + '" fill="url(#sun)"/>';
      for (i = 1; i <= 7; i++) o += '<circle cx="' + sx + '" cy="' + sy + '" r="' + Math.min(W, H) * (0.2 + i * 0.075) + '" fill="none" stroke="' + P.a + '" stroke-opacity="' + n1(0.4 - i * 0.045) + '" stroke-width="' + (i % 2 ? 1.2 : 2.4) + '" stroke-dasharray="' + (i % 2 ? '2 10' : '40 14') + '"/>';
      for (i = 0; i < 6; i++) o += '<path d="M' + n1(-20) + ' ' + n1(H * (0.25 + i * 0.1)) + 'C' + n1(W * 0.3) + ' ' + n1(H * (0.1 + i * 0.1)) + ' ' + n1(W * 0.6) + ' ' + n1(H * (0.4 + i * 0.1)) + ' ' + (W + 20) + ' ' + n1(H * (0.2 + i * 0.09)) + '" fill="none" stroke="url(#rb)" stroke-width="' + n1(1.2 + i * 0.7) + '" opacity=".6"/>';
      var pk = 'M0 ' + H + 'L0 ' + H * 0.78, x = 0, k = 0; while (x < W) { x += W / 9 * (0.6 + r() * 0.8); pk += 'L' + n1(x) + ' ' + n1(H * (0.7 + r() * 0.1)); k++; } pk += 'L' + W + ' ' + H + 'Z';
      o += '<path d="' + pk + '" fill="url(#m1)"/>';
      for (i = 0; i < 40; i++) { var ex = W * r(), ey = H * (0.1 + r() * 0.75), er = 1 + r() * 4; o += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(er) + '" fill="' + (r() > 0.5 ? '#ffd9a0' : P.a) + '" opacity="' + n1(0.3 + r() * 0.6) + '"' + (er > 3 ? ' filter="url(#bl)"' : '') + '/>'; }
      return o + grain(W, H, 'gn');
    },
    'Moss': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#07100a', P.b, 1, 1, 0.2, 1) + rg('gl', P.a, 0.28, 0, 0.5, 0.78, 0.65) + lg('lf', P.a, P.d, 0.85, 0.35) + lg('mist', '#e1f7e6', '#e1f7e6', 0, 0.14, 0, 1) + '</defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/><rect width="' + W + '" height="' + H + '" fill="url(#gl)"/>';
      var ox = W * 0.5, oy = H * 0.96, i, L = Math.min(H * 0.62, W * 1.2);
      for (i = 0; i < 17; i++) {
        var ang = -86 + i * 10.8, ln = L * (0.55 + 0.45 * Math.sin((i / 16) * 3.14159 + 0.2)), w = ln * 0.13;
        o += '<g transform="translate(' + n1(ox) + ' ' + n1(oy) + ') rotate(' + n1(ang) + ')"><path d="M0 0C' + n1(w) + ' ' + n1(-ln * 0.3) + ' ' + n1(w * 0.9) + ' ' + n1(-ln * 0.75) + ' 0 ' + n1(-ln) + 'C' + n1(-w * 0.9) + ' ' + n1(-ln * 0.75) + ' ' + n1(-w) + ' ' + n1(-ln * 0.3) + ' 0 0Z" fill="url(#lf)" opacity="' + n1(0.45 + 0.4 * r()) + '"/><path d="M0 0L0 ' + n1(-ln * 0.96) + '" stroke="' + P.e + '" stroke-opacity=".35" stroke-width="1.2"/></g>';
      }
      o += ridge(W, H, H * 0.66, H * 0.04, 7, P.c, 0.55, null, 1.3);
      o += '<rect y="' + H * 0.5 + '" width="' + W + '" height="' + H * 0.35 + '" fill="url(#mist)"/>';
      for (i = 0; i < 60; i++) o += '<circle cx="' + n1(W * r()) + '" cy="' + n1(H * (0.2 + r() * 0.78)) + '" r="' + n1(1 + r() * 3.4) + '" fill="' + (r() > 0.6 ? P.a : P.e) + '" opacity="' + n1(0.12 + r() * 0.4) + '"/>';
      o += ridge(W, H, H * 0.94, H * 0.02, 33, P.c, 1, null, 2.4);
      return o + grain(W, H, 'gn');
    },
    'Mist': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#f6f8fc', '#c9d8f4', 1, 1, 0.2, 1) + rg('sun', '#ffffff', 1, 0, 0.5, 0.5, 0.5) + lg('fog', '#f4f7fd', '#f4f7fd', 0, 0.55) + '</defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>';
      var sx = W * 0.66, sy = H * 0.24, R = Math.min(W, H) * 0.14, i;
      o += '<circle cx="' + sx + '" cy="' + sy + '" r="' + R * 3 + '" fill="url(#sun)"/><circle cx="' + sx + '" cy="' + sy + '" r="' + R + '" fill="#fff" fill-opacity=".9"/><circle cx="' + sx + '" cy="' + sy + '" r="' + R * 1.5 + '" fill="none" stroke="' + P.a + '" stroke-opacity=".35" stroke-width="1.4"/>';
      for (i = 0; i < 6; i++) o += ridge(W, H, H * (0.44 + i * 0.1), H * 0.05, 40 + i * 7, mix('#b8c8ee', '#4f64b8', i / 5), n1(0.32 + i * 0.1), null, 1 + i * 0.25) + '<rect y="' + H * (0.4 + i * 0.1) + '" width="' + W + '" height="' + H * 0.14 + '" fill="url(#fog)"/>';
      for (i = 0; i < 5; i++) { var bx = W * (0.15 + r() * 0.5), by = H * (0.12 + r() * 0.2), bs = 6 + r() * 8; o += '<path d="M' + n1(bx - bs) + ' ' + n1(by) + 'Q' + n1(bx - bs / 2) + ' ' + n1(by - bs * 0.6) + ' ' + n1(bx) + ' ' + n1(by) + 'Q' + n1(bx + bs / 2) + ' ' + n1(by - bs * 0.6) + ' ' + n1(bx + bs) + ' ' + n1(by) + '" fill="none" stroke="' + P.e + '" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>'; }
      for (i = 0; i < 8; i++) o += '<path d="M' + n1(-10) + ' ' + n1(H * (0.3 + i * 0.07)) + 'H' + W + '" stroke="' + P.a + '" stroke-opacity="0.07" stroke-width="1"/>';
      return o + grain(W, H, 'gn');
    },
    'Midnight': function (W, H, P, r) {
      var o = '<defs>' + lg('bg', '#02030f', P.b, 1, 1, 0.3, 1) + rg('n1', '#8a5cff', 0.5, 0, 0.5, 0.5, 0.5) + rg('n2', '#ff5fa8', 0.28, 0, 0.5, 0.5, 0.5) + lg('pl', '#b6a8ff', '#1a1260', 1, 1, 0.8, 1) + rg('hz', '#8a7dff', 0.6, 0, 0.5, 1, 0.8) + '<clipPath id="cp"><circle cx="' + W * 0.5 + '" cy="' + H * 0.4 + '" r="' + Math.min(W, H) * 0.2 + '"/></clipPath></defs>';
      o += '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>';
      o += '<ellipse cx="' + W * 0.25 + '" cy="' + H * 0.2 + '" rx="' + W * 0.7 + '" ry="' + H * 0.2 + '" fill="url(#n1)"/><ellipse cx="' + W * 0.85 + '" cy="' + H * 0.55 + '" rx="' + W * 0.6 + '" ry="' + H * 0.16 + '" fill="url(#n2)"/>';
      var i, cx = W * 0.5, cy = H * 0.4, R = Math.min(W, H) * 0.2;
      for (i = 0; i < 360; i++) { var sr = r(); o += '<circle cx="' + n1(W * r()) + '" cy="' + n1(H * r()) + '" r="' + n1(sr > 0.97 ? 1.9 : sr > 0.85 ? 1.2 : 0.7) + '" fill="#fff" opacity="' + n1(0.25 + r() * 0.7) + '"/>'; }
      o += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + R * 1.9 + '" ry="' + R * 0.5 + '" fill="none" stroke="' + P.a + '" stroke-opacity=".55" stroke-width="3" transform="rotate(-18 ' + cx + ' ' + cy + ')" stroke-dasharray="0"/>';
      o += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#pl)"/>';
      o += '<g clip-path="url(#cp)"><path d="M' + (cx - R) + ' ' + (cy - R * 0.2) + 'Q' + cx + ' ' + (cy + R * 0.2) + ' ' + (cx + R) + ' ' + (cy - R * 0.5) + '" stroke="#ffffff" stroke-opacity=".18" stroke-width="' + R * 0.14 + '" fill="none"/><path d="M' + (cx - R) + ' ' + (cy + R * 0.3) + 'Q' + cx + ' ' + (cy + R * 0.6) + ' ' + (cx + R) + ' ' + (cy + R * 0.1) + '" stroke="#000" stroke-opacity=".25" stroke-width="' + R * 0.2 + '" fill="none"/><circle cx="' + (cx + R * 0.45) + '" cy="' + (cy + R * 0.4) + '" r="' + R * 1.1 + '" fill="#02030f" opacity=".45"/></g>';
      o += '<path d="M' + (cx - R * 1.9 * 0.95) + ' ' + (cy + R * 0.5 * 0.31) + 'A' + R * 1.9 + ' ' + R * 0.5 + ' -18 0 0 ' + (cx + R * 1.9 * 0.95) + ' ' + (cy - R * 0.5 * 0.31) + '" fill="none" stroke="' + P.a + '" stroke-opacity=".0" />';
      o += '<path d="M' + n1(W * 0.12) + ' ' + n1(H * 0.1) + 'L' + n1(W * 0.3) + ' ' + n1(H * 0.15) + '" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/><path d="M' + n1(W * 0.03) + ' ' + n1(H * 0.07) + 'L' + n1(W * 0.12) + ' ' + n1(H * 0.1) + '" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>';
      o += '<rect y="' + H * 0.7 + '" width="' + W + '" height="' + H * 0.3 + '" fill="url(#hz)"/>' + ridge(W, H, H * 0.9, H * 0.025, 51, '#03041a', 1, null, 1.7);
      for (i = 0; i < 5; i++) o += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R * (1.4 + i * 0.55) + '" fill="none" stroke="' + P.a + '" stroke-opacity="' + n1(0.16 - i * 0.025) + '" stroke-width="1" stroke-dasharray="3 9"/>';
      return o + grain(W, H, 'gn');
    }
  };

  // ------------------------------------------------------------------ emblems (accent illustration)
  var EMBLEM = {
    'Ash Dark': function (P) { return samara(50, 70, 18, 0.46, P.a, 1, P.e) + '<circle cx="50" cy="50" r="42" fill="none" stroke="' + P.a + '" stroke-opacity=".5" stroke-width="2"/>'; },
    'Ash Light': function (P) { return samara(50, 70, -16, 0.46, P.a, 1, P.e) + '<circle cx="50" cy="50" r="42" fill="none" stroke="' + P.a + '" stroke-opacity=".5" stroke-width="2"/><circle cx="50" cy="50" r="30" fill="none" stroke="' + P.a + '" stroke-opacity=".25" stroke-width="1.4"/>'; },
    'Ember': function (P) { return '<path d="M50 10C58 30 76 38 76 62A26 26 0 0 1 24 62C24 48 34 42 38 30C42 38 46 38 46 30C46 22 48 16 50 10Z" fill="' + P.a + '"/><path d="M50 44C54 54 62 58 62 68A12 12 0 0 1 38 68C38 60 46 56 50 44Z" fill="#ffd9a0"/>'; },
    'Moss': function (P) { return '<path d="M50 90C20 70 18 34 50 10C82 34 80 70 50 90Z" fill="' + P.a + '" fill-opacity=".85"/><path d="M50 88L50 18M50 40L36 30M50 56L34 44M50 40L64 30M50 56L66 44" stroke="' + P.c + '" stroke-opacity=".6" stroke-width="2.2" fill="none" stroke-linecap="round"/>'; },
    'Mist': function (P) { return '<circle cx="62" cy="38" r="16" fill="' + P.a + '" fill-opacity=".9"/><path d="M22 70A14 14 0 0 1 30 44A20 20 0 0 1 68 50A12 12 0 0 1 76 70Z" fill="#fff" stroke="' + P.a + '" stroke-opacity=".45" stroke-width="2"/>'; },
    'Midnight': function (P) { return '<path d="M64 14A38 38 0 1 0 86 62A30 30 0 0 1 64 14Z" fill="' + P.a + '"/><path d="M30 24l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/>'; }
  };

  function svg(theme, o) {
    o = o || {};
    var W = o.w || 720, H = o.h || 1560, P = palFor(theme, o.tokens), key = SCENES[theme] ? theme : 'Ash Dark', r = rng(hash(String(theme)));
    var body = SCENES[key](W, H, P, r);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice">' + body + '</svg>';
  }
  function card(theme, tokens) { return svg(theme, { w: 640, h: 400, tokens: tokens }); }
  function accent(theme, size, tokens) {
    var P = palFor(theme, tokens), fn = EMBLEM[theme] || EMBLEM['Ash Dark'];
    size = size || 96;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '">' + fn(P) + '</svg>';
  }
  function dataUri(s) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'); }
  var cache = {};
  function css(theme, o) {
    o = o || {}; var k = theme + '|' + (o.w || '') + 'x' + (o.h || '') + '|' + (o.tokens ? o.tokens.accent + o.tokens.bg : '');
    if (!cache[k]) cache[k] = 'url("' + dataUri(svg(theme, o)) + '") center/cover no-repeat';
    return cache[k];
  }
  function cardUri(theme, tokens) { var k = 'card|' + theme + (tokens ? tokens.accent + tokens.bg : ''); if (!cache[k]) cache[k] = dataUri(card(theme, tokens)); return cache[k]; }
  function accentUri(theme, size, tokens) { var k = 'acc|' + theme + '|' + size + (tokens ? tokens.accent : ''); if (!cache[k]) cache[k] = dataUri(accent(theme, size, tokens)); return cache[k]; }

  var api = { svg: svg, card: card, accent: accent, dataUri: dataUri, css: css, cardUri: cardUri, accentUri: accentUri, themes: NAMES, palette: PAL };
  global.SamaraThemeArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
