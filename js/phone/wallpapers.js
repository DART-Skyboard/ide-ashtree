/* Samara OS wallpapers - fully procedural, preloaded, no network assets.
 *
 *   SamaraWallpapers.list                       -> [{ id, name, animated, css, tags }]
 *   SamaraWallpapers.mount(id, el, opts)        -> { stop, pause, resume, resize, setOptions }
 *       opts: { dark:boolean, accent:'#hex', bg:'#hex' }
 *
 * mount() puts one <canvas> (absolute, inset:0, 100% x 100%) into `el`, renders crisp at the device pixel
 * ratio (<=2 animated, <=3 static, times any CSS scale on the phone frame), re-flows by aspect ratio when `el`
 * changes size (portrait <-> landscape), runs at <=30fps, pauses while the document is hidden or pause()d,
 * draws a single still frame under prefers-reduced-motion, and removes everything on stop().
 * Every scene = pre-baked layers (built on resize) + a tiny per-frame compositor, so animation stays cheap.
 */
(function (root) {
  'use strict';
  var PI = Math.PI, TAU = PI * 2, abs = Math.abs, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt,
    min = Math.min, max = Math.max, floor = Math.floor, exp = Math.exp, hypot = Math.hypot;
  var VERSION = '1.0.0';

  // ------------------------------------------------------------------ utils
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(s) {
    var m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(s || '').trim());
    if (!m) return null; var h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) {
    return 'rgba(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ',' + (a == null ? 1 : Math.round(clamp(a, 0, 1) * 1000) / 1000) + ')';
  }
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = ((t % 1) + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  // hue shift / saturation scale / absolute lightness
  function hs(c, dh, ds, l) { var x = toHsl(c); return fromHsl(x[0] + dh, clamp(x[1] * (ds == null ? 1 : ds), 0, 1), l == null ? x[2] : l); }

  // value noise
  var PERM = (function () {
    var r = rng(1337), p = [], i, j, t; for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { j = (r() * (i + 1)) | 0; t = p[i]; p[i] = p[j]; p[j] = t; }
    var q = new Uint8Array(512); for (i = 0; i < 512; i++) q[i] = p[i & 255]; return q;
  })();
  function vn(x, y) {
    var ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = PERM[PERM[ix & 255] + (iy & 255)], b = PERM[PERM[(ix + 1) & 255] + (iy & 255)],
      c = PERM[PERM[ix & 255] + ((iy + 1) & 255)], d = PERM[PERM[(ix + 1) & 255] + ((iy + 1) & 255)];
    return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) / 255;
  }
  function fbm(x, y, o) {
    var s = 0, a = 0.5, f = 1, n = o || 3, tot = 0;
    for (var i = 0; i < n; i++) { s += a * vn(x * f + i * 17.3, y * f + i * 9.1); tot += a; f *= 2.03; a *= 0.5; }
    return s / tot;
  }

  // canvas helpers
  function mk(w, h) { var c = document.createElement('canvas'); c.width = max(1, Math.round(w)); c.height = max(1, Math.round(h)); return c; }
  function lin(x, x0, y0, x1, y1, st) {
    var g = x.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < st.length; i++) g.addColorStop(st[i][0], st[i][1]);
    return g;
  }
  function rad(x, cx, cy, r0, r1, st) {
    var g = x.createRadialGradient(cx, cy, r0, cx, cy, r1);
    for (var i = 0; i < st.length; i++) g.addColorStop(st[i][0], st[i][1]);
    return g;
  }
  // cheap gaussian-ish blur: repeated half-size down/up scaling (works everywhere, no ctx.filter)
  function blurC(src, passes) {
    var cur = src, i, s, w = src.width, h = src.height, chain = [src];
    for (i = 0; i < passes; i++) {
      w = max(2, w >> 1); h = max(2, h >> 1); s = mk(w, h); var x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); chain.push(s); cur = s;
    }
    for (i = passes - 1; i >= 0; i--) {
      var t = chain[i], y = mk(t.width, t.height), yx = y.getContext('2d'); yx.imageSmoothingQuality = 'high'; yx.drawImage(cur, 0, 0, t.width, t.height); cur = y;
    }
    return cur;
  }
  var glowCache = {}, glowN = 0;
  function glowSprite(c, size, core) {
    var key = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ':' + size + ':' + (core || 0);
    if (glowCache[key]) return glowCache[key];
    if (glowN > 80) { glowCache = {}; glowN = 0; }
    var s = mk(size, size), x = s.getContext('2d'), h = size / 2;
    x.fillStyle = rad(x, h, h, 0, h, [[0, rgba(c, 1)], [core || 0.18, rgba(c, 0.62)], [0.5, rgba(c, 0.17)], [1, rgba(c, 0)]]);
    x.fillRect(0, 0, size, size); glowN++; return (glowCache[key] = s);
  }
  var grainTile = (function () {
    var t = null;
    return function () {
      if (t) return t; t = mk(160, 160); var x = t.getContext('2d'), im = x.createImageData(160, 160), r = rng(99), d = im.data;
      for (var i = 0; i < d.length; i += 4) { var v = r() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = r() * r() * 46; }
      x.putImageData(im, 0, 0); return t;
    };
  })();
  // bakes vignette + film grain (breaks gradient banding) into one transparent overlay
  function makeFin(E, vig, grain) {
    var W = E.W, H = E.H, c = mk(W, H), x = c.getContext('2d');
    var vc = E.dark ? [0, 2, 4] : [34, 46, 40];
    x.fillStyle = rad(x, W / 2, H * 0.47, min(W, H) * 0.3, hypot(W, H) * 0.56, [[0, rgba(vc, 0)], [1, rgba(vc, vig)]]);
    x.fillRect(0, 0, W, H);
    x.globalAlpha = grain; x.fillStyle = x.createPattern(grainTile(), 'repeat'); x.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------------ scenes
  // Each scene: function (E) -> { frame(t) } (animated) or draws once into E.x and returns null (static).
  // E: { x, W, H, u (device px per 1/360 of short side), land, dark, a (accent), ac (accent adapted to mode), bg }

  // ---------- 1. Samara Drift -------------------------------------------------
  function samaraDrift(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(7), land = W > H, i;
    var top = mix(d ? [5, 15, 28] : [226, 241, 235], E.bg, 0.18), mid = mix(d ? [8, 38, 44] : [192, 227, 215], E.ac, d ? 0.07 : 0.12),
      bot = mix(d ? [13, 70, 60] : [148, 203, 184], E.ac, d ? 0.14 : 0.2);
    var bg = mk(W, H), bx = bg.getContext('2d');
    bx.fillStyle = lin(bx, 0, 0, 0, H, [[0, rgba(top)], [0.55, rgba(mid)], [1, rgba(bot)]]); bx.fillRect(0, 0, W, H);
    var gx = W * 0.2, gy = -H * 0.05, lc = d ? [150, 255, 222] : [255, 252, 232];
    bx.fillStyle = rad(bx, gx, gy, 0, max(W, H) * 0.95, [[0, rgba(lc, d ? 0.3 : 0.75)], [1, rgba(lc, 0)]]); bx.fillRect(0, 0, W, H);
    bx.fillStyle = rad(bx, W * 0.6, H * 1.02, 0, max(W, H) * 0.7, [[0, rgba(mix(bot, E.ac, 0.4), d ? 0.5 : 0.35)], [1, rgba(bot, 0)]]); bx.fillRect(0, 0, W, H);
    // light shafts
    var pad = Math.round(16 * u), sh = mk(W + pad * 2, H), sx = sh.getContext('2d'), Lf = hypot(W, H) * 1.35;
    sx.translate(pad, 0);
    for (i = 0; i < 5; i++) {
      var th = 0.7 + i * 0.15 + R() * 0.06, hw = (0.05 + R() * 0.06) * Lf, dx = cos(th), dy = sin(th);
      var fx = gx + dx * Lf, fy = gy + dy * Lf, nx = -dy * hw, ny = dx * hw, k = d ? 0.15 : 0.26;
      sx.fillStyle = lin(sx, gx, gy, fx, fy, [[0, rgba(lc, 0)], [0.12, rgba(lc, k * (0.5 + R() * 0.7))], [1, rgba(lc, 0)]]);
      sx.beginPath(); sx.moveTo(gx, gy); sx.lineTo(fx + nx, fy + ny); sx.lineTo(fx - nx, fy - ny); sx.closePath(); sx.fill();
    }
    var shaft = blurC(sh, 4); bx.globalCompositeOperation = d ? 'lighter' : 'source-over'; bx.globalAlpha = 0.85; bx.drawImage(shaft, -pad, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    E.bake(bx);
    // seeds
    var N = land ? 14 : 17, seeds = [];
    for (i = 0; i < N; i++) {
      var z = R(); seeds.push({
        z: z, L: (26 + z * 64) * u, v: (10 + z * 28) * u, x0: R() * W, y0: R(), f: 0.35 + R() * 0.45, ph: R() * TAU, A: (8 + z * 20) * u,
        w: (0.9 + R() * 0.8) * (R() < 0.5 ? -1 : 1) * (0.7 + z * 0.5), ph2: R() * TAU, tilt: 0.25 + R() * 0.4, warm: R() < 0.28
      });
    }
    seeds.sort(function (a, b) { return a.z - b.z; });
    var maxL = 90 * u, Hr = H + maxL * 2.2;
    var motes = []; for (i = 0; i < 26; i++) motes.push({ x: R() * W, y: R() * H, s: (0.5 + R() * 1.1) * u, v: (2 + R() * 6) * u, ph: R() * TAU, f: 0.3 + R() * 0.8 });
    var face = d ? [196, 255, 236] : [36, 118, 106], back = d ? [92, 196, 174] : [24, 82, 76],
      wface = d ? [255, 230, 176] : [152, 104, 50], wback = d ? [206, 164, 104] : [112, 76, 40];
    return {
      frame: function (t) {
        x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.drawImage(bg, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = d ? 'lighter' : 'source-over';
        var m, s, c;
        x.fillStyle = d ? 'rgb(190,255,235)' : 'rgb(255,255,240)';
        for (i = 0; i < motes.length; i++) {
          m = motes[i]; var my = ((m.y - m.v * t) % H + H) % H, mx = m.x + sin(t * m.f + m.ph) * 9 * u;
          x.globalAlpha = (0.12 + 0.28 * (0.5 + 0.5 * sin(t * m.f * 2 + m.ph))) * (d ? 1 : 1.4);
          x.beginPath(); x.arc(mx, my, m.s, 0, TAU); x.fill();
        }
        x.globalCompositeOperation = 'source-over';
        for (i = 0; i < seeds.length; i++) {
          s = seeds[i];
          var py = (s.y0 * Hr + s.v * t) % Hr - maxL * 1.1, px = s.x0 + sin(t * s.f + s.ph) * s.A + py * 0.08;
          var ph = s.ph2 + s.w * t, cp = cos(ph), sg = cp < 0 ? -1 : 1, cs = sg * max(0.16, abs(cp));
          var ang = -PI / 2 + sin(t * s.f * 0.8 + s.ph) * s.tilt, L = s.L;
          c = s.warm ? (sg > 0 ? wface : wback) : (sg > 0 ? face : back);
          x.save(); x.translate(px, py); x.rotate(ang);
          x.globalAlpha = 0.3 + s.z * 0.6;
          x.fillStyle = rgba(c);
          x.beginPath(); x.ellipse(L * 0.07, 0, L * 0.17, L * 0.034, 0, 0, TAU); x.fill();
          x.save(); x.scale(1, cs);
          x.beginPath(); x.moveTo(L * 0.1, 0); x.bezierCurveTo(L * 0.35, L * 0.2, L * 0.8, L * 0.25, L, 0); x.bezierCurveTo(L * 0.85, -L * 0.07, L * 0.4, -L * 0.06, L * 0.1, 0);
          x.fill(); x.restore();
          x.globalAlpha *= 0.55; x.strokeStyle = rgba(mix(c, d ? [0, 30, 28] : [255, 255, 255], 0.5)); x.lineWidth = max(1, L * 0.014);
          x.beginPath(); x.moveTo(L * 0.1, 0); x.lineTo(L * 0.94, 0); x.stroke();
          x.restore();
        }
        x.globalAlpha = 1;
      }
    };
  }

  // ---------- 2. Ash Rings ----------------------------------------------------
  function ashRings(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(21), land = W > H, i, k;
    var cx = W * 0.5, cy = H * (land ? 0.5 : 0.45), Rmax = hypot(max(cx, W - cx), max(cy, H - cy)) * 1.05, n = 46;
    var wood1 = d ? [88, 62, 40] : [234, 210, 170], wood2 = d ? [64, 44, 29] : [210, 176, 130], teal = d ? mix([14, 66, 60], E.ac, 0.1) : mix([176, 228, 208], E.ac, 0.12);
    var rs = [0], tot = 0, ws = [];
    for (i = 0; i < n; i++) { var w = 0.5 + vn(i * 0.83, 3.3) * 1.05; ws.push(w); tot += w; }
    var acc = 0; for (i = 0; i < n; i++) { acc += ws[i]; rs.push(acc / tot * Rmax); }
    var PTS = 90, cc = [], ss = []; for (i = 0; i < PTS; i++) { cc.push(cos(i / PTS * TAU)); ss.push(sin(i / PTS * TAU)); }
    var rings = []; for (i = 0; i < n; i++) {
      var f = (rs[i] + rs[i + 1]) / 2 / Rmax, base = mix(wood1, wood2, (i % 2 ? 0.55 : 0.05) + vn(i * 1.7, 9) * 0.3);
      var tm = sstep(0.55, 0.02, f); base = mix(base, teal, tm * (d ? 0.78 : 0.7));
      rings.push({ f: f, out: rs[i + 1] * 1.0, mid: (rs[i] + rs[i + 1]) / 2, w: (rs[i + 1] - rs[i]) * 1.22, c: base });
    }
    var glow = glowSprite(d ? E.ac : mix(E.ac, [255, 255, 255], 0.4), 256, 0.1), accRGB = d ? mix(E.ac, [255, 255, 255], 0.2) : E.ac;
    x.lineJoin = 'round';
    return {
      frame: function (t) {
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
        x.fillStyle = rgba(mix(wood2, teal, 0.5)); x.fillRect(0, 0, W, H);
        var pulse = (t * 0.075) % 1.3, br = 1 + 0.006 * sin(t * 0.5);
        for (k = n - 1; k >= 0; k--) {
          var r = rings[k], col = r.c, pk = exp(-Math.pow((r.f - pulse) / 0.07, 2)) * 0.5;
          if (pk > 0.02) col = mix(col, accRGB, d ? pk * 0.32 : pk * 0.3);
          x.fillStyle = rgba(col); x.beginPath();
          var amp = 0.03 + r.f * 0.05, base = r.out * br, kk = k + 1;
          for (i = 0; i < PTS; i++) {
            var nn = vn(cc[i] * 1.15 + kk * 0.1 + t * 0.018, ss[i] * 1.15 + kk * 0.07 - t * 0.026) * 0.7 + vn(cc[i] * 2.7 - t * 0.03, ss[i] * 2.7 + kk * 0.2) * 0.3;
            var rr = base * (1 + (nn - 0.5) * 2 * amp);
            if (i) x.lineTo(cx + cc[i] * rr, cy + ss[i] * rr); else x.moveTo(cx + cc[i] * rr, cy + ss[i] * rr);
          }
          x.closePath(); x.fill();
        }
        // pith glow + slow medullary rays
        var gs = 0.9 + 0.1 * sin(t * 0.6), gr = Rmax * 0.4 * gs;
        x.globalCompositeOperation = d ? 'lighter' : 'source-over'; x.globalAlpha = d ? 0.2 : 0.3;
        x.drawImage(glow, cx - gr, cy - gr, gr * 2, gr * 2);
        x.globalAlpha = d ? 0.07 : 0.06; x.strokeStyle = rgba(d ? accRGB : [255, 255, 255]); x.lineWidth = max(1, u);
        x.beginPath();
        for (i = 0; i < 18; i++) { var a = i / 18 * TAU + t * 0.012; x.moveTo(cx + cos(a) * Rmax * 0.08, cy + sin(a) * Rmax * 0.08); x.lineTo(cx + cos(a) * Rmax, cy + sin(a) * Rmax); }
        x.stroke(); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
    };
  }

  // ---------- 3. Canopy Light -------------------------------------------------
  function leaf(x, R, px, py, ang, len) {
    x.save(); x.translate(px, py); x.rotate(ang);
    x.lineWidth = max(1, len * 0.03); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, len); x.stroke();
    var pairs = 3 + ((R() * 2) | 0), k, sd;
    for (k = 0; k < pairs; k++) {
      var tt = 0.16 + 0.72 * k / pairs, ll = len * (0.46 - 0.12 * abs(k / pairs - 0.5)), ww = ll * 0.27;
      for (sd = -1; sd <= 1; sd += 2) {
        x.save(); x.translate(0, len * tt); x.rotate(sd * (0.95 + R() * 0.3));
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(ww, ll * 0.5, 0, ll); x.quadraticCurveTo(-ww, ll * 0.5, 0, 0); x.fill(); x.restore();
      }
    }
    x.translate(0, len * 0.96); var tl = len * 0.42, tw = tl * 0.26;
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(tw, tl * 0.5, 0, tl); x.quadraticCurveTo(-tw, tl * 0.5, 0, 0); x.fill();
    x.restore();
  }
  function canopyLight(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(33), i;
    var c0 = d ? [8, 40, 30] : [168, 214, 150], c1 = d ? [28, 92, 60] : [238, 240, 176];
    c0 = mix(c0, E.ac, d ? 0.05 : 0.04);
    var bg = mk(W, H), bx = bg.getContext('2d');
    bx.fillStyle = lin(bx, 0, 0, W * 0.5, H, [[0, rgba(c0)], [1, rgba(c1)]]); bx.fillRect(0, 0, W, H);
    var sun = d ? [255, 238, 150] : [255, 252, 205];
    bx.fillStyle = rad(bx, W * 0.85, H * 0.1, 0, max(W, H) * 0.9, [[0, rgba(sun, d ? 0.26 : 0.6)], [1, rgba(sun, 0)]]); bx.fillRect(0, 0, W, H);
    var K = 1, lw = Math.ceil(W * 1.3 * K), lh = Math.ceil(H * 1.3 * K), shade = d ? [1, 13, 9] : [26, 74, 40];
    function layer(count, len, alpha, blur, avoid, seed) {
      var Rl = rng(seed), c = mk(lw, lh), cx = c.getContext('2d'), tries = 0, n = 0;
      cx.fillStyle = cx.strokeStyle = rgba(shade); cx.lineCap = 'round';
      while (n < count && tries++ < count * 6) {
        var px = Rl() * lw, py = Rl() * lh, fx = (px / lw - 0.115) / 0.77, fy = (py / lh - 0.115) / 0.77;
        if (avoid && Rl() < avoid(fx, fy)) continue;
        leaf(cx, Rl, px, py, Rl() * TAU, len * K * (0.75 + Rl() * 0.5)); n++;
      }
      return { c: blurC(c, blur), a: alpha };
    }
    var cen = function (p) { return function (fx, fy) { var dx = (fx - 0.5) / 0.4, dy = (fy - 0.5) / 0.42, q = dx * dx + dy * dy; return q < 1 ? p * (1 - q * 0.6) : 0; }; };
    var layers = [
      layer(80, 44 * u, d ? 0.2 : 0.2, 1, null, 5),
      layer(34, 74 * u, d ? 0.34 : 0.3, 1, cen(0.85), 6),
      layer(10, 140 * u, d ? 0.46 : 0.38, 2, cen(0.97), 8)
    ];
    // far layer is static: bake it into the backdrop (saves a full-screen blit per frame)
    bx.globalAlpha = layers[0].a; bx.drawImage(layers[0].c, -W * 0.15, -H * 0.15, W * 1.3, H * 1.3); bx.globalAlpha = 1; layers = layers.slice(1);
    var spots = []; for (i = 0; i < 24; i++) spots.push({ x: R() * W, y: R() * H, s: (14 + R() * 34) * u, ph: R() * TAU, f: 0.25 + R() * 0.5 });
    var sp = glowSprite(sun, 128, 0.3), par = [[0.1, 9, 0.014], [0.13, 15, 0.02]];
    return {
      frame: function (t) {
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.drawImage(bg, 0, 0);
        x.globalCompositeOperation = d ? 'lighter' : 'source-over';
        for (i = 0; i < spots.length; i++) {
          var s = spots[i], a = (0.5 + 0.5 * sin(t * s.f + s.ph)) * (d ? 0.2 : 0.4), r = s.s * (0.9 + 0.1 * sin(t * s.f * 1.7 + s.ph));
          x.globalAlpha = a; x.drawImage(sp, s.x + sin(t * 0.2 + s.ph) * 6 * u - r, s.y - r, r * 2, r * 2);
        }
        x.globalCompositeOperation = 'source-over';
        for (i = 0; i < layers.length; i++) {
          var L = layers[i], p = par[i];
          x.save(); x.translate(W / 2, 0); x.rotate(sin(t * p[0] + i) * p[2]);
          x.globalAlpha = L.a; x.drawImage(L.c, -W * 0.65 + sin(t * p[0] * 1.3 + i * 2) * p[1] * u, -H * 0.15 + cos(t * p[0] * 0.9 + i) * p[1] * 0.5 * u, W * 1.3, H * 1.3);
          x.restore();
        }
        x.globalAlpha = 1;
      }
    };
  }

  // ---------- 4. Night Grove --------------------------------------------------
  function nightGrove(E) {
    var W = E.W, H = E.H, u = E.u, x = E.x, R = rng(45), land = W > H, i;
    var acc = E.a, bgc = mix([4, 9, 22], E.bg, 0.12);
    var bg = mk(W, H), bx = bg.getContext('2d');
    bx.fillStyle = lin(bx, 0, 0, 0, H, [[0, rgba(bgc)], [0.55, rgba([7, 22, 36])], [0.82, rgba(mix([12, 52, 56], acc, 0.12))], [1, rgba([8, 30, 32])]]);
    bx.fillRect(0, 0, W, H);
    // stars
    var ns = Math.round(W * H / (land ? 2600 : 3200)), stars = [];
    for (i = 0; i < ns; i++) {
      var sx = R() * W, sy = Math.pow(R(), 1.5) * H * 0.78, sz = (0.4 + Math.pow(R(), 4) * 1.5) * u, al = (0.25 + R() * 0.65) * (1 - sy / H * 0.7);
      bx.fillStyle = rgba(mix([255, 255, 255], acc, R() * 0.25), al); bx.beginPath(); bx.arc(sx, sy, sz, 0, TAU); bx.fill();
      if (sz > 1.2 * u) stars.push({ x: sx, y: sy, s: sz, ph: R() * TAU, f: 0.5 + R() * 1.4 });
    }
    // moon
    var mx = W * (land ? 0.17 : 0.23), my = H * (land ? 0.27 : 0.13), mr = 17 * u, moon = mix([232, 255, 246], acc, 0.15);
    bx.fillStyle = rad(bx, mx, my, mr * 0.5, mr * 7, [[0, rgba(moon, 0.26)], [0.25, rgba(moon, 0.08)], [1, rgba(moon, 0)]]); bx.fillRect(0, 0, W, H);
    bx.fillStyle = rgba(moon, 0.95); bx.beginPath(); bx.arc(mx, my, mr, 0, TAU); bx.fill();
    bx.fillStyle = rgba([150, 190, 190], 0.3); bx.beginPath(); bx.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.28, 0, TAU); bx.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.2, 0, TAU); bx.fill();
    // distant ridges
    function ridge(y0, amp, fr, seed, col, a) {
      bx.beginPath(); bx.moveTo(0, H);
      for (var px = 0; px <= W + 4; px += 4) bx.lineTo(px, y0 - amp * (fbm(px / (u * fr) + seed, seed * 1.7, 4) - 0.35));
      bx.lineTo(W, H); bx.closePath(); bx.fillStyle = rgba(col, a); bx.fill();
    }
    ridge(H * 0.76, 70 * u, 190, 3, [14, 46, 52], 0.9); ridge(H * 0.83, 54 * u, 150, 8, [8, 30, 36], 0.95);
    // ash tree (portrait: right of centre, landscape: right third)
    var tx = W * (land ? 0.74 : 0.7), gy = H * 0.94, tl = H * (land ? 0.22 : 0.15), leaves = [];
    function branch(x0, y0, ang, len, wid, dep) {
      var x1 = x0 + cos(ang) * len, y1 = y0 + sin(ang) * len, bend = (R() - 0.5) * len * 0.25;
      bx.lineWidth = max(1, wid); bx.beginPath(); bx.moveTo(x0, y0); bx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); bx.stroke();
      if (dep <= 0) { leaves.push([x1, y1, len]); return; }
      var kids = dep > 4 ? 2 : (R() < 0.35 ? 3 : 2);
      for (var k = 0; k < kids; k++) {
        var a = ang + (k - (kids - 1) / 2) * (0.55 + R() * 0.3) + (R() - 0.5) * 0.25; a += (-PI / 2 - a) * 0.14;
        branch(x1, y1, a, len * (0.7 + R() * 0.1), wid * 0.68, dep - 1);
      }
      if (dep > 1 && dep < 6 && R() < 0.55) leaves.push([x1, y1, len * 0.8]);
    }
    bx.lineCap = 'round'; bx.strokeStyle = rgba([2, 10, 13]);
    branch(tx, gy, -PI / 2 + 0.03, tl, 8 * u, 7);
    // crown foliage: rim-lit back pass then dark front pass
    for (var pass = 0; pass < 2; pass++) {
      bx.fillStyle = pass ? rgba([3, 12, 15]) : rgba(mix([26, 78, 80], acc, 0.15), 0.55);
      var off = pass ? 0 : -2.2 * u;
      for (i = 0; i < leaves.length; i++) {
        var lf = leaves[i], r0 = max(3 * u, lf[2] * 0.3);
        for (var j = 0; j < 7; j++) { bx.beginPath(); bx.ellipse(lf[0] + off + (R() - 0.5) * r0 * 1.6, lf[1] + off + (R() - 0.5) * r0 * 1.2, r0 * (0.55 + R() * 0.5), r0 * (0.28 + R() * 0.22), R() * PI, 0, TAU); bx.fill(); }
      }
    }
    // foreground ground
    bx.beginPath(); bx.moveTo(0, H);
    for (var gx = 0; gx <= W + 4; gx += 4) bx.lineTo(gx, H * 0.915 - 16 * u * (fbm(gx / (u * 120) + 4, 2, 3) - 0.3));
    bx.lineTo(W, H); bx.closePath(); bx.fillStyle = rgba([2, 10, 12]); bx.fill();
    bx.strokeStyle = rgba([2, 10, 12]); bx.lineWidth = max(1, u * 1.2);
    for (i = 0; i < W / (5 * u); i++) {
      var bxp = R() * W, byp = H * 0.915 - 16 * u * (fbm(bxp / (u * 120) + 4, 2, 3) - 0.3) + 2 * u, hh = (5 + R() * 11) * u, lean = (R() - 0.5) * 8 * u;
      bx.beginPath(); bx.moveTo(bxp, byp); bx.quadraticCurveTo(bxp + lean * 0.3, byp - hh * 0.6, bxp + lean, byp - hh); bx.stroke();
    }
    // mist
    var mc = mk(W, H), mcx = mc.getContext('2d');
    for (i = 0; i < 5; i++) { var my2 = H * (0.7 + R() * 0.2), mx2 = R() * W, mr2 = max(W, H) * 0.4; mcx.save(); mcx.translate(mx2, my2); mcx.scale(1, 0.2); mcx.fillStyle = rad(mcx, 0, 0, 0, mr2, [[0, rgba([120, 190, 190], 0.12)], [1, rgba([120, 190, 190], 0)]]); mcx.fillRect(-mr2, -mr2, mr2 * 2, mr2 * 2); mcx.restore(); }
    var mist = blurC(mc, 2), my0 = H * 0.5, mh = H * 0.5; var ms = mk(W, mh); ms.getContext('2d').drawImage(mist, 0, -my0); E.bake(bx);
    var flies = []; for (i = 0; i < (land ? 18 : 24); i++) flies.push({ x: R() * W, y: H * (0.45 + R() * 0.46), ax: (14 + R() * 40) * u, ay: (8 + R() * 24) * u, f: 0.15 + R() * 0.35, g: 0.12 + R() * 0.3, ph: R() * TAU, bl: 0.35 + R() * 0.7, s: (7 + R() * 7) * u });
    var fc = mix([200, 255, 120], acc, 0.35), fs = glowSprite(fc, 64, 0.2), shoot = null;
    return {
      frame: function (t) {
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.drawImage(bg, 0, 0);
        x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgb(255,255,255)';
        for (i = 0; i < stars.length; i++) { var s = stars[i]; x.globalAlpha = 0.16 + 0.34 * (0.5 + 0.5 * sin(t * s.f + s.ph)); x.fillRect(s.x - s.s, s.y - s.s, s.s * 2, s.s * 2); }
        var ct = t % 17; // occasional shooting star
        if (ct > 15.2) { var p = (ct - 15.2) / 0.8, sx0 = W * 0.9 - p * W * 0.5, sy0 = H * 0.08 + p * H * 0.14; x.globalAlpha = 0.6 * (1 - p); x.strokeStyle = 'rgb(220,255,245)'; x.lineWidth = u; x.beginPath(); x.moveTo(sx0, sy0); x.lineTo(sx0 + 28 * u, sy0 - 9 * u); x.stroke(); }
        x.globalAlpha = 0.9; x.drawImage(ms, sin(t * 0.04) * 20 * u, my0);
        for (i = 0; i < flies.length; i++) {
          var f = flies[i], fx = f.x + sin(t * f.f + f.ph) * f.ax + sin(t * f.f * 2.3 + f.ph * 2) * f.ax * 0.3, fy = f.y + cos(t * f.g + f.ph) * f.ay + sin(t * f.g * 3.1) * f.ay * 0.2;
          var bl = sstep(0.1, 0.9, 0.5 + 0.5 * sin(t * f.bl * 2.2 + f.ph * 3)); x.globalAlpha = 0.12 + 0.78 * bl;
          var rr = f.s * (0.75 + 0.35 * bl); x.drawImage(fs, fx - rr, fy - rr, rr * 2, rr * 2);
        }
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
    };
  }

  // ---------- 5. Aurora Veil --------------------------------------------------
  function auroraVeil(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(52), i, land = W > H;
    var acc = E.ac;
    var bg = mk(W, H), bx = bg.getContext('2d');
    var t0 = d ? mix([3, 7, 20], E.bg, 0.12) : [214, 224, 240], t1 = d ? [6, 24, 38] : [236, 244, 244], t2 = d ? mix([10, 40, 48], acc, 0.1) : [246, 244, 238];
    bx.fillStyle = lin(bx, 0, 0, 0, H, [[0, rgba(t0)], [0.6, rgba(t1)], [1, rgba(t2)]]); bx.fillRect(0, 0, W, H);
    if (d) for (i = 0; i < W * H / 3400; i++) { var sy = Math.pow(R(), 1.4) * H * 0.7; bx.fillStyle = rgba([255, 255, 255], (0.2 + R() * 0.6) * (1 - sy / H)); bx.beginPath(); bx.arc(R() * W, sy, (0.4 + Math.pow(R(), 5) * 1.3) * u, 0, TAU); bx.fill(); }
    var base = H * 0.92, sil = d ? [3, 12, 16] : [96, 124, 120];
    bx.fillStyle = rgba(sil, d ? 0.98 : 0.55); bx.beginPath(); bx.moveTo(0, H);
    for (var px = 0; px <= W + 3; px += 3) bx.lineTo(px, base - 22 * u * fbm(px / (u * 140) + 9, 1, 3));
    bx.lineTo(W, H); bx.closePath(); bx.fill();
    for (i = 0; i < W / (7 * u); i++) {
      var tx = R() * W, ty = base - 22 * u * fbm(tx / (u * 140) + 9, 1, 3) + 3 * u, th = (9 + R() * 16) * u;
      bx.beginPath(); bx.moveTo(tx - th * 0.18, ty); bx.lineTo(tx, ty - th); bx.lineTo(tx + th * 0.18, ty); bx.closePath(); bx.fill();
    }
    var hue = d ? [acc, hs(acc, 52, 1, 0.6), hs(acc, -42, 1, 0.55)] : [hs(acc, 0, 0.9, 0.5), hs(acc, 55, 0.8, 0.55), hs(acc, -40, 0.8, 0.5)];
    // each curtain: soft body (vertical gradient polygon between a wavy hem and a higher wavy top) + bright hem + faint rays
    var curt = [{ c: hue[0], b: 0.32, a: 1, ph: R() * 9, h: 0.3 }, { c: hue[1], b: 0.23, a: 0.7, ph: R() * 9, h: 0.26 }, { c: hue[2], b: 0.42, a: 0.5, ph: R() * 9, h: 0.22 }];
    var NC = 40, rayN = 22, pts = [], tops = [];
    return {
      frame: function (t) {
        x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.drawImage(bg, 0, 0);
        x.globalCompositeOperation = d ? 'lighter' : 'source-over';
        for (var c = 0; c < curt.length; c++) {
          var cu = curt[c], p = cu.ph, k, ymin = 1e9, ymax = 0;
          for (k = 0; k <= NC; k++) {
            var xs = k / NC, yb = H * (cu.b + 0.07 * sin(xs * 4.1 + t * 0.12 + p) + 0.045 * sin(xs * 9.3 - t * 0.2 + p * 2) + 0.02 * sin(xs * 17 + t * 0.31 + p * 3));
            var it = sstep(0.2, 0.85, fbm(xs * 2.6 + p, t * 0.07 + p, 3)); pts[k] = yb; tops[k] = yb - H * cu.h * (0.4 + 0.9 * it);
            if (tops[k] < ymin) ymin = tops[k]; if (yb > ymax) ymax = yb;
          }
          var al = cu.a * (d ? 0.5 : 0.42), L = 5, bodyC = mix(cu.c, [255, 255, 255], 0.1), l;
          for (l = 1; l <= L; l++) {
            var fr = l / L; x.fillStyle = rgba(bodyC, al * (0.1 + 0.1 * (L - l) / L)); x.beginPath(); x.moveTo(0, pts[0]);
            for (k = 1; k <= NC; k++) x.lineTo(W * k / NC, pts[k]);
            for (k = NC; k >= 0; k--) x.lineTo(W * k / NC, pts[k] + (tops[k] - pts[k]) * fr);
            x.closePath(); x.fill();
          }
          x.strokeStyle = rgba(mix(cu.c, [255, 255, 255], 0.4), al * 0.55); x.lineWidth = 5 * u; x.lineJoin = 'round'; x.beginPath(); x.moveTo(0, pts[0]);
          for (k = 1; k <= NC; k++) x.lineTo(W * k / NC, pts[k]); x.stroke();
          x.lineWidth = max(1, u * 1.4); x.strokeStyle = rgba(mix(cu.c, [255, 255, 255], 0.2), al * 0.16); x.beginPath();
          for (k = 0; k < rayN; k++) {
            var rx = (k + 0.5) / rayN, ri = rx * NC, r0 = ri | 0, rf = ri - r0, y0 = pts[r0] + (pts[min(NC, r0 + 1)] - pts[r0]) * rf, y1 = tops[r0] + (tops[min(NC, r0 + 1)] - tops[r0]) * rf;
            var rv = vn(k * 1.7 + p, t * 0.2); x.moveTo(W * rx, y0); x.lineTo(W * rx, y0 - (y0 - y1) * (0.3 + rv * 0.7));
          }
          x.stroke();
        }
        x.globalCompositeOperation = 'source-over';
      }
    };
  }

  // ---------- 6. Ember Flow ---------------------------------------------------
  function emberFlow(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(61), i;
    var bg = mk(W, H), bx = bg.getContext('2d');
    bx.fillStyle = d ? lin(bx, 0, 0, 0, H, [[0, rgba([12, 7, 14])], [0.55, rgba([36, 13, 14])], [1, rgba([96, 30, 12])]])
      : lin(bx, 0, 0, 0, H, [[0, rgba([252, 238, 224])], [0.6, rgba([250, 214, 178])], [1, rgba([244, 170, 120])]]);
    bx.fillRect(0, 0, W, H);
    bx.fillStyle = rad(bx, W * 0.5, H * 1.08, 0, max(W, H) * 0.85, [[0, rgba(d ? [255, 130, 40] : [255, 150, 70], d ? 0.55 : 0.5)], [0.4, rgba(d ? [220, 70, 20] : [255, 170, 100], d ? 0.2 : 0.22)], [1, rgba([255, 120, 30], 0)]]);
    bx.fillRect(0, 0, W, H);
    for (i = 0; i < 5; i++) { var smx = R() * W, smy = H * (0.45 + R() * 0.5), smr = (110 + R() * 90) * E.u; bx.fillStyle = rad(bx, smx, smy, 0, smr, [[0, rgba(d ? [90, 36, 28] : [255, 196, 150], d ? 0.3 : 0.25)], [1, rgba([90, 36, 28], 0)]]); bx.fillRect(smx - smr, smy - smr, smr * 2, smr * 2); }
    E.bake(bx);
    var ramp = d ? [[255, 238, 176], [255, 184, 70], [255, 112, 34], [208, 52, 22], [120, 26, 18]] : [[255, 190, 90], [250, 130, 40], [222, 84, 24], [176, 52, 22], [130, 40, 20]];
    var cool = mix(E.a, [255, 255, 255], 0.3), spr = ramp.map(function (c) { return glowSprite(c, 64, 0.22); }), cspr = glowSprite(cool, 64, 0.22);
    var N = W > H ? 60 : 80, ps = [], Hr = H * 1.15;
    for (i = 0; i < N; i++) { var z = R(); ps.push({ x: R() * W, y: R(), v: (14 + z * 34 + R() * 12) * u, s: (4 + z * 10) * u, A: (8 + R() * 22) * u, f: 0.25 + R() * 0.6, ph: R() * TAU, cool: R() < 0.07, tw: 1 + R() * 3 }); }
    return {
      frame: function (t) {
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.drawImage(bg, 0, 0);
        var j;
        x.globalCompositeOperation = d ? 'lighter' : 'source-over';
        for (j = 0; j < ps.length; j++) {
          var p = ps[j], prog = (p.y * Hr + p.v * t) % Hr / Hr, py = H * 1.04 - prog * Hr, pxv = p.x + sin(t * p.f + p.ph + prog * 5) * p.A * (0.4 + prog) + prog * 18 * u;
          var al = sstep(0, 0.07, prog) * (1 - sstep(0.55, 1, prog)) * (0.55 + 0.45 * sin(t * p.tw * 2 + p.ph)), sz = p.s * (1 - 0.55 * prog) * (d ? 1 : 0.8);
          if (al < 0.02) continue; x.globalAlpha = al * (d ? 0.9 : 0.8);
          x.drawImage(p.cool ? cspr : spr[Math.min(4, (prog * 5.6) | 0)], pxv - sz, py - sz, sz * 2, sz * 2);
        }
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
    };
  }

  // ---------- 7. Tide Lines (flow-field streamlines) ---------------------------
  function tideLines(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(73), i, j;
    var bg = mk(W, H), bx = bg.getContext('2d'), c0 = d ? mix([5, 24, 36], E.bg, 0.1) : [226, 240, 240], c1 = d ? mix([9, 62, 68], E.ac, 0.1) : [188, 224, 224];
    bx.fillStyle = lin(bx, 0, 0, W, H, [[0, rgba(c0)], [1, rgba(c1)]]); bx.fillRect(0, 0, W, H);
    bx.fillStyle = rad(bx, W * 0.2, H * 0.12, 0, max(W, H) * 0.8, [[0, rgba(d ? E.ac : [255, 255, 255], d ? 0.16 : 0.55)], [1, rgba(E.ac, 0)]]); bx.fillRect(0, 0, W, H); E.bake(bx);
    var sp = 56 * u, cols = Math.ceil(W / sp) + 1, rows = Math.ceil(H / sp) + 1, lines = [];
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) lines.push({ x: i * sp + (R() - 0.5) * sp * 1.1, y: j * sp + (R() - 0.5) * sp * 1.1, k: (R() * 4) | 0, st: 16 + ((R() * 8) | 0) });
    var line1 = d ? mix(E.ac, [255, 255, 255], 0.2) : mix(E.ac, [0, 40, 50], 0.35), line2 = d ? [190, 255, 244] : [20, 90, 100], step = 8 * u, fs = 1 / (u * 150);
    var alphas = d ? [0.12, 0.2, 0.3, 0.44] : [0.14, 0.22, 0.32, 0.42], prof = [0.35, 0.8, 1, 0.8, 0.35], tin = 'source-over';
    return {
      frame: function (t) {
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.drawImage(bg, 0, 0); x.lineCap = 'butt'; x.lineJoin = 'round';
        var tx = t * 0.018, ty = -t * 0.012, buckets = [], c, q;
        for (c = 0; c < 4; c++) { buckets.push([]); for (q = 0; q < 5; q++) buckets[c].push([]); }
        for (i = 0; i < lines.length; i++) {
          var L = lines[i], px = L.x, py = L.y, pts = [px, py];
          for (var s = 0; s < L.st; s++) {
            var a = (fbm(px * fs + tx, py * fs + ty, 2) - 0.5) * 5.4 + 0.35;
            px += cos(a) * step; py += sin(a) * step; pts.push(px, py);
          }
          var per = (L.st / 5) | 0, bk = buckets[L.k];
          for (q = 0; q < 5; q++) bk[q].push(pts, q * per, q === 4 ? L.st : (q + 1) * per);
        }
        x.globalCompositeOperation = tin;
        for (c = 0; c < 4; c++) {
          x.strokeStyle = rgba(c % 2 ? line2 : line1); x.lineWidth = (1.2 + c * 0.55) * u;
          for (q = 0; q < 5; q++) {
            var b = buckets[c][q]; if (!b.length) continue; x.globalAlpha = alphas[c] * prof[q]; x.beginPath();
            for (var m = 0; m < b.length; m += 3) { var P = b[m], a0 = b[m + 1], a1 = b[m + 2]; x.moveTo(P[a0 * 2], P[a0 * 2 + 1]); for (var z = a0 + 1; z <= a1; z++) x.lineTo(P[z * 2], P[z * 2 + 1]); }
            x.stroke();
          }
        }
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
    };
  }

  // ---------- 8. Meridian (gradient mesh + wire globe) -------------------------
  function meridian(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(83), i, acc = E.ac, land = W > H;
    var base = d ? mix([6, 14, 28], E.bg, 0.12) : [236, 243, 246];
    var cols = d ? [acc, hs(acc, 62, 1, 0.5), hs(acc, -50, 0.9, 0.42), [50, 40, 150], hs(acc, 135, 0.8, 0.5)] : [hs(acc, 0, 0.8, 0.6), hs(acc, 62, 0.7, 0.72), hs(acc, -50, 0.7, 0.7), hs(acc, 110, 0.6, 0.78), hs(acc, 170, 0.6, 0.8)];
    var bl = []; for (i = 0; i < 5; i++) bl.push({ c: cols[i], r: (0.3 + R() * 0.16), fx: 0.03 + R() * 0.035, fy: 0.025 + R() * 0.035, px: R() * TAU, py: R() * TAU, cx: 0.2 + R() * 0.6, cy: 0.15 + R() * 0.7, ax: 0.3 + R() * 0.15, ay: 0.25 + R() * 0.15, a: d ? 0.5 : 0.5 });
    var gcx = W * 0.5, gcy = H * (land ? 0.5 : 0.48), GR = min(W, H) * 0.62 * (land ? 0.95 : 1.05), lc = d ? [200, 255, 244] : [20, 80, 84], mxs = max(W, H);
    return {
      frame: function (t) {
        x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = rgba(base); x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = 'source-over';
        for (var k = 0; k < bl.length; k++) {
          var b = bl[k], bx2 = (b.cx + sin(t * b.fx + b.px) * b.ax) * W, by2 = (b.cy + cos(t * b.fy + b.py) * b.ay) * H, r = b.r * mxs * (land ? 0.8 : 1);
          x.fillStyle = rad(x, bx2, by2, 0, r, [[0, rgba(b.c, b.a)], [0.55, rgba(b.c, b.a * 0.3)], [1, rgba(b.c, 0)]]); x.fillRect(max(0, bx2 - r), max(0, by2 - r), r * 2, r * 2);
        }
        x.globalCompositeOperation = 'source-over';
        x.lineWidth = max(1, u * 0.9); x.strokeStyle = rgba(lc); x.globalAlpha = d ? 0.16 : 0.2;
        x.beginPath(); x.arc(gcx, gcy, GR, 0, TAU); x.stroke(); x.beginPath(); x.arc(gcx, gcy, GR * 1.12, 0, TAU); x.globalAlpha *= 0.5; x.stroke(); x.globalAlpha = d ? 0.13 : 0.16;
        var rot = t * 0.025, tilt = -0.28; x.save(); x.translate(gcx, gcy); x.rotate(tilt);
        for (var m = 0; m < 7; m++) { var rx = GR * abs(cos(m / 7 * PI + rot)); x.beginPath(); x.ellipse(0, 0, max(0.5, rx), GR, 0, 0, TAU); x.stroke(); }
        for (var p = -2; p <= 2; p++) { var lat = p / 3 * 1.1, rr = GR * cos(lat), yy = GR * sin(lat) * 0.45; x.beginPath(); x.ellipse(0, yy, rr, rr * 0.2, 0, 0, TAU); x.stroke(); }
        x.restore(); x.globalAlpha = 1;
      }
    };
  }

  // ---------- 9. Mist Valley (static) -----------------------------------------
  function mistValley(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(91), i, land = W > H;
    var sk0 = d ? mix([10, 22, 44], E.bg, 0.1) : [190, 210, 226], sk1 = d ? [38, 78, 96] : [226, 234, 238], sk2 = d ? mix([150, 168, 150], E.ac, 0.15) : [252, 242, 226];
    var haze = d ? mix([104, 138, 140], E.ac, 0.1) : [226, 234, 232], near = d ? [5, 20, 26] : mix([84, 118, 110], E.ac, 0.1);
    x.fillStyle = lin(x, 0, 0, 0, H * 0.7, [[0, rgba(sk0)], [0.6, rgba(sk1)], [1, rgba(sk2)]]); x.fillRect(0, 0, W, H);
    var sx = W * (land ? 0.7 : 0.68), sy = H * 0.38, sc = d ? [255, 238, 206] : [255, 248, 224];
    x.fillStyle = rad(x, sx, sy, 0, max(W, H) * 0.7, [[0, rgba(sc, d ? 0.5 : 0.8)], [0.3, rgba(sc, d ? 0.16 : 0.3)], [1, rgba(sc, 0)]]); x.fillRect(0, 0, W, H);
    x.fillStyle = rgba(sc, 0.92); x.beginPath(); x.arc(sx, sy, 11 * u, 0, TAU); x.fill();
    var n = 8;
    for (i = 0; i < n; i++) {
      var t = i / (n - 1), y0 = H * (0.42 + 0.46 * Math.pow(t, 1.15)), amp = H * (land ? 0.12 : 0.065) * (1.3 - t * 0.2), fr = 230 - t * 120, col = mix(haze, near, Math.pow(t, 0.9) * 0.97), sd = i * 7.3 + 2;
      // mist pooling in front of the ridge behind it
      x.fillStyle = lin(x, 0, y0 - H * 0.07, 0, y0 + H * 0.05, [[0, rgba(haze, 0)], [0.7, rgba(haze, d ? 0.3 : 0.42)], [1, rgba(haze, 0)]]); x.fillRect(0, y0 - H * 0.07, W, H * 0.12);
      x.beginPath(); x.moveTo(0, H);
      for (var px = 0; px <= W + 3; px += 3) {
        var nn = fbm(px / (u * fr) + sd, sd * 0.37, 4), rg = 1 - abs(2 * nn - 1); x.lineTo(px, y0 - amp * ((nn * 0.7 + rg * 0.55) - 0.55));
      }
      x.lineTo(W, H); x.closePath();
      x.fillStyle = lin(x, 0, y0 - amp, 0, y0 + H * 0.2, [[0, rgba(col)], [1, rgba(mix(col, haze, 0.55 - t * 0.3))]]); x.fill();
    }
    x.fillStyle = lin(x, 0, H * 0.78, 0, H, [[0, rgba(haze, 0)], [1, rgba(near, d ? 0.5 : 0.25)]]); x.fillRect(0, H * 0.78, W, H * 0.22);
    return null;
  }

  // ---------- 10. Moss Stone (static voronoi) ----------------------------------
  function clipHalf(poly, sx, sy, tx, ty) {
    var mx = (sx + tx) / 2, my = (sy + ty) / 2, nx = tx - sx, ny = ty - sy, out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n], dp = (p[0] - mx) * nx + (p[1] - my) * ny, dq = (q[0] - mx) * nx + (q[1] - my) * ny;
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var k = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
    }
    return out;
  }
  function mossStone(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(101), i, j, it;
    var sp = 56 * u, cols = Math.ceil(W / sp), rows = Math.ceil(H / sp), pts = [];
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) pts.push([(i + 0.15 + R() * 0.7) * W / cols, (j + 0.15 + R() * 0.7) * H / rows]);
    var m = sp, cells;
    function cellsOf() {
      return pts.map(function (p, a) {
        var poly = [[-m, -m], [W + m, -m], [W + m, H + m], [-m, H + m]];
        for (var b = 0; b < pts.length && poly.length > 2; b++) { if (b === a) continue; var q = pts[b]; if (abs(q[0] - p[0]) > sp * 3 || abs(q[1] - p[1]) > sp * 3) continue; poly = clipHalf(poly, p[0], p[1], q[0], q[1]); }
        return poly;
      });
    }
    function centroid(poly) {
      var a = 0, cx = 0, cy = 0, n = poly.length; if (n < 3) return null;
      for (var k = 0; k < n; k++) { var p = poly[k], q = poly[(k + 1) % n], cr = p[0] * q[1] - q[0] * p[1]; a += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; }
      return a ? [cx / (3 * a), cy / (3 * a)] : null;
    }
    for (it = 0; it < 2; it++) { cells = cellsOf(); for (i = 0; i < pts.length; i++) { var c = centroid(cells[i]); if (c) { pts[i][0] += (c[0] - pts[i][0]) * 0.7; pts[i][1] += (c[1] - pts[i][1]) * 0.7; } } }
    cells = cellsOf();
    var gap = d ? [3, 12, 9] : [118, 138, 112], lo = d ? [22, 48, 34] : [172, 196, 156], hi = d ? [58, 98, 60] : [214, 228, 186], teal = mix(d ? [20, 82, 70] : [150, 206, 184], E.ac, 0.18);
    x.fillStyle = rgba(gap); x.fillRect(0, 0, W, H);
    for (i = 0; i < cells.length; i++) {
      var poly = cells[i], ce = centroid(poly); if (!ce) continue;
      var tone = R(), base = mix(mix(lo, hi, tone * 0.85), teal, R() < 0.16 ? 0.55 : 0.08), inset = 2.6 * u, ins = [];
      var ar = 0; for (j = 0; j < poly.length; j++) ar = max(ar, hypot(poly[j][0] - ce[0], poly[j][1] - ce[1]));
      var kk = max(0.5, 1 - inset / max(ar, 1));
      for (j = 0; j < poly.length; j++) ins.push([ce[0] + (poly[j][0] - ce[0]) * kk, ce[1] + (poly[j][1] - ce[1]) * kk]);
      function path(off) { x.beginPath(); for (var k = 0; k < ins.length; k++) { var px = ins[k][0] + off, py = ins[k][1] + off; if (k) x.lineTo(px, py); else x.moveTo(px, py); } x.closePath(); }
      x.lineJoin = 'round'; x.lineWidth = 4.5 * u; x.strokeStyle = x.fillStyle = rgba([0, 0, 0], d ? 0.4 : 0.18); path(1.5 * u); x.fill(); x.stroke();
      x.lineWidth = 5 * u; x.strokeStyle = rgba(base); path(0);
      x.fillStyle = rad(x, ce[0] - ar * 0.3, ce[1] - ar * 0.35, 0, ar * 1.5, [[0, rgba(mix(base, [255, 255, 235], d ? 0.12 : 0.3))], [1, rgba(mix(base, [0, 8, 4], d ? 0.35 : 0.16))]]); x.fill(); x.stroke();
      x.save(); path(0); x.clip();
      for (j = 0; j < 14; j++) {
        var bx2 = ce[0] + (R() - 0.5) * ar * 1.8, by2 = ce[1] + (R() - 0.5) * ar * 1.8, br = (3 + R() * 9) * u, lite = R() < 0.5;
        x.fillStyle = rad(x, bx2, by2, 0, br, [[0, rgba(lite ? [200, 235, 150] : [8, 28, 14], (d ? 0.12 : 0.1) * (0.5 + R()))], [1, rgba([0, 0, 0], 0)]]); x.fillRect(bx2 - br, by2 - br, br * 2, br * 2);
      }
      x.restore();
      x.lineWidth = u * 1.1; x.strokeStyle = rgba([255, 255, 230], d ? 0.1 : 0.32); x.beginPath();
      for (j = 0; j < ins.length; j++) { var p0 = ins[j], p1 = ins[(j + 1) % ins.length], nx = p1[1] - p0[1], ny = -(p1[0] - p0[0]); if (nx + ny < 0) { x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); } }
      x.stroke();
    }
    return null;
  }

  // ---------- 11. Midnight Bloom (static phyllotaxis) --------------------------
  function midnightBloom(E) {
    var W = E.W, H = E.H, u = E.u, x = E.x, land = W > H, i, acc = E.a;
    x.fillStyle = rad(x, W * 0.5, H * 0.5, 0, hypot(W, H) * 0.6, [[0, rgba(mix([11, 28, 52], acc, 0.06))], [0.6, rgba([5, 11, 30])], [1, rgba([2, 5, 16])]]); x.fillRect(0, 0, W, H);
    var cx = W * 0.5, cy = H * 0.5, N = 560, Rmax = (land ? W * 0.5 : W * 0.96), ga = PI * (3 - sqrt(5));
    var cA = acc, cB = hs(acc, 62, 0.9, 0.55), cC = hs(acc, 118, 0.85, 0.42);
    function bloom(cx2, cy2, Rm, alpha, rot) {
      for (i = N; i >= 1; i--) {
        var f = sqrt(i / N), r = f * Rm, a = i * ga + rot, size = (2 + f * 26) * u * (Rm / (W * 0.96)) * 1.0 + 1.5 * u;
        var col = f < 0.5 ? mix(cA, cB, f * 2) : mix(cB, cC, (f - 0.5) * 2);
        x.save(); x.translate(cx2 + cos(a) * r, cy2 + sin(a) * r); x.rotate(a);
        x.beginPath(); x.moveTo(-size * 0.2, 0); x.bezierCurveTo(size * 0.2, -size * 0.55, size * 1.1, -size * 0.45, size * 1.35, 0); x.bezierCurveTo(size * 1.1, size * 0.45, size * 0.2, size * 0.55, -size * 0.2, 0); x.closePath();
        x.fillStyle = lin(x, -size * 0.2, 0, size * 1.35, 0, [[0, rgba(col, 0.04 * alpha)], [1, rgba(col, (0.1 + (1 - f) * 0.2) * alpha)]]); x.fill();
        x.lineWidth = max(0.7, u * 0.8); x.strokeStyle = rgba(mix(col, [255, 255, 255], 0.35), (0.15 + (1 - f) * 0.35) * alpha); x.stroke(); x.restore();
      }
    }
    bloom(cx, cy, Rmax, 1, 0.3);
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = rad(x, cx, cy, 0, Rmax * 0.4, [[0, rgba(mix(acc, [255, 255, 255], 0.5), 0.5)], [0.2, rgba(acc, 0.22)], [1, rgba(acc, 0)]]); x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = rgba(mix(acc, [255, 255, 255], 0.75), 0.95); x.beginPath(); x.arc(cx, cy, 2.2 * u, 0, TAU); x.fill();
    return null;
  }

  // ---------- 12. Paper Grain (static, light friendly) -------------------------
  function paperGrain(E) {
    var W = E.W, H = E.H, u = E.u, d = E.dark, x = E.x, R = rng(121), i, ac = E.ac;
    var p0 = d ? [30, 34, 30] : [247, 243, 233], p1 = d ? [22, 26, 24] : [233, 226, 210];
    x.fillStyle = lin(x, 0, 0, W, H, [[0, rgba(p0)], [1, rgba(p1)]]); x.fillRect(0, 0, W, H);
    x.fillStyle = rad(x, W * 0.9, H * 0.95, 0, max(W, H) * 0.8, [[0, rgba(ac, d ? 0.12 : 0.13)], [1, rgba(ac, 0)]]); x.fillRect(0, 0, W, H);
    x.fillStyle = rad(x, W * 0.05, H * 0.02, 0, max(W, H) * 0.7, [[0, rgba(d ? [255, 255, 255] : [255, 255, 250], d ? 0.05 : 0.6)], [1, rgba([255, 255, 255], 0)]]); x.fillRect(0, 0, W, H);
    // watermark tree rings
    var cx = W * (W > H ? 0.8 : 0.78), cy = H * (W > H ? 0.5 : 0.84), rr = min(W, H) * 0.12; x.lineWidth = max(1, u * 1.4);
    for (i = 0; i < 20; i++) {
      x.strokeStyle = rgba(d ? [255, 255, 240] : [90, 70, 40], d ? 0.035 : 0.05); x.beginPath();
      for (var a = 0; a <= 72; a++) { var an = a / 72 * TAU, r = rr * (1 + i * 0.34) * (1 + 0.05 * (vn(cos(an) + i * 0.2, sin(an) + 3) - 0.5)); a ? x.lineTo(cx + cos(an) * r, cy + sin(an) * r) : x.moveTo(cx + cos(an) * r, cy + sin(an) * r); }
      x.closePath(); x.stroke();
    }
    // fibres
    x.lineCap = 'round';
    for (i = 0; i < W * H / (d ? 70 : 55) / u / u * 0.5; i++) {
      var fx = R() * W, fy = R() * H, l = (3 + R() * 9) * u, an2 = R() * TAU;
      x.strokeStyle = rgba(d ? [220, 230, 220] : [118, 98, 70], (d ? 0.02 : 0.035) + R() * (d ? 0.035 : 0.05)); x.lineWidth = max(0.6, u * (0.4 + R() * 0.5));
      x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + cos(an2) * l * 0.5 + (R() - 0.5) * l * 0.5, fy + sin(an2) * l * 0.5 + (R() - 0.5) * l * 0.5, fx + cos(an2) * l, fy + sin(an2) * l); x.stroke();
    }
    for (i = 0; i < 90; i++) { x.fillStyle = rgba(d ? [200, 215, 200] : [120, 100, 70], 0.05 + R() * 0.07); x.beginPath(); x.arc(R() * W, R() * H, (0.5 + R() * 1.2) * u, 0, TAU); x.fill(); }
    return null;
  }

  // ------------------------------------------------------------------ registry
  var DEFS = [
    { id: 'samara-drift', name: 'Samara Drift', animated: true, tags: ['samara', 'seeds', 'light', 'teal', 'calm'], build: samaraDrift, vig: 0.32, grain: 0.55,
      css: 'radial-gradient(70% 38% at 18% 0%,rgba(160,255,228,.42),transparent 70%),linear-gradient(112deg,transparent 30%,rgba(190,255,235,.1) 38%,transparent 46%),radial-gradient(ellipse 9% 2.2% at 62% 42%,rgba(200,255,238,.75),transparent 90%),radial-gradient(ellipse 7% 1.8% at 30% 66%,rgba(255,232,180,.6),transparent 90%),linear-gradient(170deg,#06141f,#0a2b30 55%,#0f4a40)' },
    { id: 'ash-rings', res: 0.5, name: 'Ash Rings', animated: true, tags: ['rings', 'wood', 'tree', 'warm'], build: ashRings, vig: 0.34, grain: 0.35,
      css: 'radial-gradient(circle at 50% 45%,rgba(0,255,204,.55),transparent 32%),repeating-radial-gradient(circle at 50% 45%,#7a5632 0 5px,#4f341c 5px 11px)' },
    { id: 'canopy-light', res: 0.5, name: 'Canopy Light', animated: true, tags: ['leaves', 'sun', 'green', 'forest'], build: canopyLight, vig: 0.28, grain: 0.35,
      css: 'radial-gradient(circle at 22% 28%,rgba(255,240,170,.5),transparent 20%),radial-gradient(circle at 72% 58%,rgba(255,240,170,.42),transparent 18%),radial-gradient(ellipse 30% 16% at 85% 12%,rgba(2,14,10,.7),transparent 90%),radial-gradient(ellipse 28% 14% at 10% 85%,rgba(2,14,10,.65),transparent 90%),linear-gradient(160deg,#0a3a2a,#1c6b3c 60%,#0d3c2a)' },
    { id: 'night-grove', res: 0.75, name: 'Night Grove', animated: true, tags: ['night', 'stars', 'fireflies', 'tree', 'dark'], build: nightGrove, vig: 0.3, grain: 0.5, dark: true,
      css: 'radial-gradient(circle at 24% 13%,#effff8 0 3px,rgba(170,255,232,.25) 4px,transparent 24px),radial-gradient(ellipse 30% 30% at 72% 76%,#02090c 0 60%,transparent 62%),radial-gradient(circle at 40% 70%,#d8ff80 0 1.5px,transparent 6px),radial-gradient(circle at 56% 84%,#d8ff80 0 1.5px,transparent 6px),linear-gradient(180deg,#040a18,#08202e 62%,#0e3a38)' },
    { id: 'aurora-veil', res: 0.5, name: 'Aurora Veil', animated: true, tags: ['aurora', 'sky', 'night', 'ribbons'], build: auroraVeil, vig: 0.3, grain: 0.3,
      css: 'linear-gradient(105deg,transparent 18%,rgba(0,255,204,.5) 38%,rgba(120,100,255,.42) 58%,transparent 76%),linear-gradient(75deg,transparent 30%,rgba(90,255,150,.25) 50%,transparent 70%),linear-gradient(180deg,#030814,#07243a 70%,#0a2c34)' },
    { id: 'ember-flow', res: 0.6, name: 'Ember Flow', animated: true, tags: ['embers', 'fire', 'warm', 'particles'], build: emberFlow, vig: 0.3, grain: 0.45,
      css: 'radial-gradient(circle at 30% 62%,#ffd27a 0 1.5px,transparent 5px),radial-gradient(circle at 66% 42%,#ffb04a 0 1.5px,transparent 5px),radial-gradient(circle at 48% 26%,#ff7a2a 0 1px,transparent 4px),radial-gradient(70% 40% at 50% 100%,#ff8a2a,transparent 72%),linear-gradient(180deg,#0e060d,#3a120c 70%,#8a2c0e)' },
    { id: 'tide-lines', res: 0.6, name: 'Tide Lines', animated: true, tags: ['flow', 'lines', 'water', 'teal'], build: tideLines, vig: 0.28, grain: 0.5,
      css: 'repeating-linear-gradient(168deg,transparent 0 6px,rgba(120,255,230,.26) 6px 7px),repeating-linear-gradient(190deg,transparent 0 11px,rgba(0,255,204,.2) 11px 12px),linear-gradient(160deg,#06222e,#0a4a52)' },
    { id: 'meridian', res: 0.4, name: 'Meridian', animated: true, tags: ['gradient', 'mesh', 'globe', 'calm'], build: meridian, vig: 0.26, grain: 0.28,
      css: 'repeating-radial-gradient(circle at 50% 48%,transparent 0 22px,rgba(200,255,244,.16) 22px 23px),radial-gradient(circle at 20% 24%,rgba(0,255,204,.5),transparent 48%),radial-gradient(circle at 82% 70%,rgba(110,120,255,.5),transparent 52%),linear-gradient(160deg,#08111f,#102a40)' },
    { id: 'mist-valley', name: 'Mist Valley', animated: false, tags: ['landscape', 'mist', 'ridges', 'calm'], build: mistValley, vig: 0.24, grain: 0.5,
      css: 'radial-gradient(circle at 68% 33%,#fff0d0 0 5px,rgba(255,236,200,.4) 6px,transparent 38px),linear-gradient(180deg,#0e1a30 0,#3c6676 34%,#8aa59c 38%,#547d88 48%,#7b9d9c 53%,#37606c 66%,#5d868a 70%,#1f4450 82%,#0b222b 100%)' },
    { id: 'moss-stone', name: 'Moss Stone', animated: false, tags: ['stone', 'moss', 'cells', 'texture'], build: mossStone, vig: 0.34, grain: 0.6,
      css: 'radial-gradient(circle at 26% 24%,#5b9360 0 11%,transparent 12%),radial-gradient(circle at 66% 20%,#437650 0 13%,transparent 14%),radial-gradient(circle at 46% 52%,#4e8a58 0 12%,transparent 13%),radial-gradient(circle at 18% 70%,#3a6b46 0 12%,transparent 13%),radial-gradient(circle at 74% 66%,#2f6a5a 0 13%,transparent 14%),radial-gradient(circle at 50% 90%,#4a8454 0 12%,transparent 13%),#0b1f14' },
    { id: 'midnight-bloom', name: 'Midnight Bloom', animated: false, tags: ['flower', 'geometry', 'dark', 'accent'], build: midnightBloom, vig: 0.3, grain: 0.5, dark: true,
      css: 'radial-gradient(circle,#c8fff2 0 2px,rgba(0,255,204,.45) 3px,transparent 26%),repeating-conic-gradient(from 8deg at 50% 50%,rgba(0,255,204,.34) 0 5deg,rgba(100,110,255,.2) 5deg 10deg),radial-gradient(circle,#0c2a4a,#040814 72%)' },
    { id: 'paper-grain', name: 'Paper Grain', animated: false, tags: ['light', 'paper', 'minimal', 'texture'], build: paperGrain, vig: 0.1, grain: 0.7,
      css: 'repeating-radial-gradient(circle at 78% 84%,transparent 0 9px,rgba(120,90,50,.07) 9px 10px),radial-gradient(circle at 88% 92%,rgba(0,160,130,.2),transparent 50%),linear-gradient(160deg,#f8f4ea,#e8e0cc)' }
  ];
  var byId = {}; DEFS.forEach(function (w) { byId[w.id] = w; });
  var LIST = DEFS.map(function (w) { return { id: w.id, name: w.name, animated: !!w.animated, css: w.css, tags: w.tags.slice() }; });

  // ------------------------------------------------------------------ mount
  function mount(id, el, opts) {
    var def = byId[id]; if (!def) throw new Error('SamaraWallpapers: unknown wallpaper "' + id + '"');
    if (!el || !el.appendChild) throw new Error('SamaraWallpapers: mount target missing');
    var doc = el.ownerDocument || document, win = doc.defaultView || root;
    var cv = doc.createElement('canvas'), ctx = null, alive = true, userPaused = false, raf = 0, last = null, tAcc = def.t0 || 0, reduced = false;
    var baked = false, W = 0, H = 0, E = null, scene = null, fin = null, ro = null, mql = null, resizeQ = 0, o = norm(opts), prevPos = null, mqlFn = null;
    cv.setAttribute('data-samara-wallpaper', id); cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    try { if (win.getComputedStyle(el).position === 'static') { prevPos = el.style.position; el.style.position = 'relative'; } } catch (e) {}
    el.insertBefore(cv, el.firstChild);
    var reqF = win.requestAnimationFrame ? function (f) { return win.requestAnimationFrame(f); } : function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
    var canF = win.cancelAnimationFrame ? function (h) { win.cancelAnimationFrame(h); } : clearTimeout;

    function norm(p) {
      p = p || {}; var dark = p.dark !== false, a = hex(p.accent) || [0, 255, 204], bg = hex(p.bg) || (dark ? [7, 20, 15] : [238, 243, 238]);
      return { dark: dark, a: a, bg: bg };
    }
    function adaptAccent(a, dark) { var h = toHsl(a); return dark ? fromHsl(h[0], h[1], clamp(h[2], 0.5, 0.72)) : fromHsl(h[0], clamp(h[1], 0.35, 0.85), clamp(h[2], 0.28, 0.4)); }
    function measure() {
      var cw = el.clientWidth, ch = el.clientHeight, r = el.getBoundingClientRect();
      if (!cw || !ch) { cw = r.width; ch = r.height; } if (!cw || !ch) return false;
      var k = el.offsetWidth ? r.width / el.offsetWidth : 1; if (!(k > 0) || !isFinite(k)) k = 1;
      var ratio = clamp((win.devicePixelRatio || 1) * k, 1, def.animated ? 2 : 3) * (def.res || 1), px = cw * ch * ratio * ratio, cap = def.animated ? 1.5e6 : 3.1e6;
      if (px > cap) ratio *= sqrt(cap / px); ratio = max(ratio, 0.5);
      var nw = Math.round(cw * ratio), nh = Math.round(ch * ratio);
      if (nw === W && nh === H && scene !== undefined && E) return false;
      W = nw; H = nh; return true;
    }
    function rebuild() {
      cv.width = W; cv.height = H; ctx = cv.getContext('2d', { alpha: false }); if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      E = { x: ctx, W: W, H: H, u: min(W, H) / 360, land: W > H, dark: def.dark ? true : o.dark, a: o.a, bg: o.bg };
      if (def.dark && !o.dark) E.bg = [7, 20, 15];
      E.ac = adaptAccent(o.a, E.dark);
      fin = makeFin(E, def.vig, def.grain);
      E.bake = function (c) { c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.drawImage(fin, 0, 0); baked = true; };
      baked = false; scene = def.build(E);
      if (!scene) { ctx.drawImage(fin, 0, 0); } else draw();
    }
    function draw(t) {
      if (!ctx || !scene) return; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      scene.frame(t == null ? tAcc : t); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; if (!baked) ctx.drawImage(fin, 0, 0);
    }
    function running() { return alive && !userPaused && !doc.hidden && def.animated && !reduced; }
    function tick(ts) {
      raf = 0; if (!running()) return;
      if (last == null) last = ts; var dt = ts - last;
      if (dt >= 28) { last = ts; tAcc += min(dt, 100) / 1000; draw(); }
      raf = reqF(tick);
    }
    function start() { if (!raf && running()) { last = null; raf = reqF(tick); } }
    function halt() { if (raf) { canF(raf); raf = 0; } last = null; }
    function resize() { if (!alive) return; if (measure()) { rebuild(); } }
    function onVis() { if (doc.hidden) halt(); else start(); }
    function onRM() { reduced = !!(mql && mql.matches); if (reduced) { halt(); if (scene) draw(def.still || 8); } else start(); }

    try { mql = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)'); reduced = !!(mql && mql.matches); } catch (e) { mql = null; }
    if (mql) { mqlFn = onRM; if (mql.addEventListener) mql.addEventListener('change', mqlFn); else if (mql.addListener) mql.addListener(mqlFn); }
    doc.addEventListener('visibilitychange', onVis);
    if (win.ResizeObserver) { ro = new win.ResizeObserver(function () { if (resizeQ) return; resizeQ = reqF(function () { resizeQ = 0; resize(); }); }); ro.observe(el); }
    measure(); rebuild();
    if (reduced && scene) draw(def.still || 8);
    start();

    return {
      id: id, canvas: cv,
      stop: function () {
        if (!alive) return; alive = false; halt(); if (resizeQ) { canF(resizeQ); resizeQ = 0; }
        if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
        doc.removeEventListener('visibilitychange', onVis);
        if (mql && mqlFn) { if (mql.removeEventListener) mql.removeEventListener('change', mqlFn); else if (mql.removeListener) mql.removeListener(mqlFn); }
        if (cv.parentNode) cv.parentNode.removeChild(cv);
        if (prevPos !== null) el.style.position = prevPos;
        scene = fin = E = ctx = null; cv.width = cv.height = 1;
      },
      pause: function () { userPaused = true; halt(); },
      resume: function () { if (!alive) return; userPaused = false; start(); },
      resize: resize,
      // re-theme in place (theme / accent change) without remounting
      setOptions: function (p) { if (!alive) return; opts = p; o = norm(p); W = H = 0; measure(); rebuild(); if (reduced && scene) draw(def.still || 8); },
      // test helper: render one frame at time t (seconds) and return CPU+raster milliseconds
      _renderOnce: function (t, noFlush) {
        if (!alive || !scene) return 0; var a = (win.performance || Date).now(); draw(t); if (!noFlush) try { ctx.getImageData(0, 0, 1, 1); } catch (e) {} return (win.performance || Date).now() - a;
      }
    };
  }

  // ------------------------------------------------------------------ custom (imported) wallpaper
  //   SamaraWallpapers.custom.importFile(file, {max:2560, quality:.86}) -> Promise<{ dataUrl, mime:'image/jpeg', w, h, bytes, srcMime, srcName }>
  //       decodes png/jpg/webp/gif(first frame)/avif/jxl (whatever this browser can decode), downscales to <= max px on a canvas and re-encodes (JPEG).
  //   SamaraWallpapers.custom.fitSize(w, h, max) -> {w, h}                 (pure; tested under node)
  //   SamaraWallpapers.custom.css({dataUrl, fit:'fill'|'fit'|'center', dim:0..0.85}, bgColor) -> CSS `background` value
  //   SamaraWallpapers.custom.accept                                       <input accept> string
  // The kernel owns the image (K.setCustomWallpaper); persist.js stores it in IndexedDB and in the GitHub backup.
  var custom = {
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/jxl,.png,.jpg,.jpeg,.webp,.gif,.avif,.jxl',
    maxDim: 2560,
    fitSize: function (w, h, max) {
      max = max || 2560; if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
      var k = Math.min(1, max / Math.max(w, h)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
    },
    css: function (c, bg) {
      var img = 'url("' + c.dataUrl + '")', fit = c.fit === 'fit' ? 'center/contain' : c.fit === 'center' ? 'center/auto' : 'center/cover', d = clamp(+c.dim || 0, 0, 0.85);
      var layers = []; if (d > 0) layers.push('linear-gradient(rgba(0,0,0,' + d.toFixed(2) + '),rgba(0,0,0,' + d.toFixed(2) + '))');
      layers.push(img + ' ' + fit + ' no-repeat'); layers.push(bg || '#000');
      return layers.join(',');
    },
    importFile: function (file, o) {
      o = o || {};
      var max = o.max || custom.maxDim, q = o.quality || 0.86, D = root.document;
      return new Promise(function (resolve, reject) {
        if (!file) return reject(new Error('No file chosen'));
        if (!D || !root.URL || !root.URL.createObjectURL) return reject(new Error('Image import needs a browser'));
        var name = file.name || 'image', type = file.type || '', ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '';
        if (!/^image\//.test(type) && !/^(png|jpe?g|webp|gif|avif|jxl)$/i.test(ext)) return reject(new Error('That is not an image file (use PNG, JPEG, WebP, GIF, AVIF or JXL).'));
        var url = root.URL.createObjectURL(file), im = new root.Image();
        function done(w, h, drawFn) {
          try {
            var sz = custom.fitSize(w, h, max), cv = D.createElement('canvas'); cv.width = sz.w; cv.height = sz.h;
            var cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, sz.w, sz.h);
            cx.imageSmoothingQuality = 'high'; drawFn(cx, sz.w, sz.h);
            var out = cv.toDataURL('image/jpeg', q);
            if (out.length > 4 * 1024 * 1024 && max > 1280) { var s2 = custom.fitSize(sz.w, sz.h, 1600); cv.width = s2.w; cv.height = s2.h; cx.drawImage(im, 0, 0, s2.w, s2.h); out = cv.toDataURL('image/jpeg', 0.8); sz = s2; }   // keep it storable
            resolve({ dataUrl: out, mime: 'image/jpeg', w: sz.w, h: sz.h, bytes: Math.round(out.length * 0.75), srcMime: type || ('image/' + ext), srcName: name });
          } catch (e) { reject(e); } finally { root.URL.revokeObjectURL(url); }
        }
        im.onload = function () { done(im.naturalWidth || im.width, im.naturalHeight || im.height, function (cx, w, h) { cx.drawImage(im, 0, 0, w, h); }); };
        im.onerror = function () {
          root.URL.revokeObjectURL(url);
          reject(new Error(/jxl/i.test(type + ext) ? 'This browser cannot decode JPEG XL. Convert it to PNG or JPEG first.' : /avif/i.test(type + ext) ? 'This browser cannot decode AVIF.' : 'Could not decode that image.'));
        };
        im.src = url;
      });
    }
  };

  var api = { version: VERSION, list: LIST, mount: mount, ids: LIST.map(function (w) { return w.id; }), custom: custom };
  root.SamaraWallpapers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
