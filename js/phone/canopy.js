// ============================================================
//  canopy.js — Samara One simulator (DOM renderer for Samara OS view trees)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Canopy.create(mountEl, { seed, theme?, onLog, autoBoot?, fast?, height?, controls? })
//     -> { boot(), shutdown(), press(key), rotate(), screenshot(opts), setSeed(seed), kernel, destroy() }
//  Canopy.mountEmbed(el, seedUrl) -> Promise<instance>   (fetches a .seed, boots it)
//  Needs js/phone/samara-os.js and css/canopy.css.
// ============================================================
(function (global) {
  'use strict';
  var doc = global.document;
  var SCREEN = { portrait: { w: 360, h: 780 }, landscape: { w: 780, h: 360 } };
  var BEZEL = 14;

  function el(tag, cls, parent) { var e = doc.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function ownerOS() { return global.SamaraOS || (typeof require === 'function' ? require('./samara-os.js') : null); }
  var SIZE = { xs: 11, sm: 13, md: 16, lg: 20, xl: 32, xxl: 48, clock: 72 };

  // ---------- per-tag leaf fillers (replace inner content; skipped when props unchanged) ----------
  function glyphBox(parent, glyph, color) { var g = el('span', 'cnp-glyph', parent); g.textContent = glyph || ''; if (color) g.style.background = color; return g; }
  var LEAF = {
    statusbar: function (e, v) {
      var p = v.props; e.textContent = '';
      var l = el('span', 'cnp-sb-l', e); l.textContent = p.time;
      var m = el('span', 'cnp-sb-m', e); m.textContent = p.title || '';
      var r = el('span', 'cnp-sb-r', e);
      if (p.notifs) { var n = el('span', 'cnp-sb-n', r); n.textContent = p.notifs; }
      var sig = el('span', 'cnp-sig', r);
      for (var i = 1; i <= 4; i++) { var b = el('i', i <= p.signal ? 'on' : '', sig); b.style.height = (3 + i * 2) + 'px'; }
      var w = el('span', 'cnp-wifi', r); w.textContent = '◠';
      var bat = el('span', 'cnp-bat' + (p.charging ? ' chg' : '') + (p.battery <= 15 ? ' low' : ''), r);
      var lv = el('i', '', bat); lv.style.width = Math.max(4, p.battery) + '%';
      var bt = el('span', 'cnp-bat-t', r); bt.textContent = p.battery + '%';
    },
    appicon: function (e, v) {
      e.textContent = ''; glyphBox(e, v.props.glyph, v.props.color);
      var n = el('span', 'cnp-icon-name', e); n.textContent = v.props.name;
    },
    appbar: function (e, v) {
      e.textContent = '';
      if (v.props.back) { var b = el('button', 'cnp-ab-back', e); b.type = 'button'; b.textContent = '‹'; b.setAttribute('aria-label', 'Back'); b.addEventListener('click', function (ev) { ev.stopPropagation(); e._cnp.kernel.back(); }); }
      var t = el('span', 'cnp-ab-title', e); t.textContent = v.props.title;
    },
    text: function (e, v) {
      var p = v.props; e.textContent = p.text == null ? '' : p.text;
      e.style.fontSize = p.size ? ((SIZE[p.size] || parseFloat(p.size) || 16) + 'px') : '';
      e.style.textAlign = p.align || ''; e.style.fontWeight = p.weight || '';
      e.style.color = p.color === 'dim' ? 'var(--dim)' : p.color === 'accent' ? 'var(--accent)' : p.color === 'danger' ? 'var(--danger)' : (p.color || '');
      e.style.fontFamily = p.mono ? 'var(--mono)' : '';
      if (p.span) e.style.gridColumn = 'span ' + p.span;
      e.classList.toggle('cnp-clock', p.size === 'clock');
    },
    button: function (e, v) {
      var p = v.props; e.textContent = (p.glyph ? p.glyph + ' ' : '') + (p.label == null ? '' : p.label);
      e.className = 'cnp-button' + (p.kind ? ' k-' + p.kind : '');
      if (p.color) e.style.background = p.color; else e.style.background = '';
      if (p.span) e.style.gridColumn = 'span ' + p.span; else e.style.gridColumn = '';
      if (p.w) e.style.width = /^\d+$/.test(p.w) ? p.w + 'px' : p.w; if (p.h) e.style.height = /^\d+$/.test(p.h) ? p.h + 'px' : p.h;
    },
    key: function (e, v) { e.textContent = v.props.label; },
    icon: function (e, v) { e.textContent = v.props.glyph || ''; e.style.fontSize = (parseFloat(v.props.size) || 28) + 'px'; if (v.props.color) e.style.color = v.props.color; },
    listitem: function (e, v) { e.textContent = v.props.text; },
    chip: function (e, v) {
      e.textContent = v.props.label; e.classList.toggle('sel', !!v.props.selected);
      if (v.props.preview) e.style.backgroundImage = v.props.preview.indexOf('gradient') >= 0 ? v.props.preview : '';
    },
    swatch: function (e, v) {
      var p = v.props; e.textContent = ''; e.classList.toggle('sel', !!p.selected); e.style.background = p.bg; e.style.borderColor = p.selected ? p.accent : '';
      var d = el('span', 'cnp-sw-dot', e); d.style.background = p.accent;
      var s = el('span', 'cnp-sw-s', e); s.style.background = p.surface;
      var n = el('span', 'cnp-sw-n', e); n.textContent = p.name; n.style.color = p.text;
    },
    notif: function (e, v) {
      var p = v.props; e.textContent = '';
      var t = el('b', '', e); t.textContent = p.title; var x = el('span', '', e); x.textContent = p.text;
      if (p.dismiss) { var d = el('button', 'cnp-nx', e); d.type = 'button'; d.textContent = '×'; d.setAttribute('aria-label', 'Dismiss'); d.addEventListener('click', function (ev) { ev.stopPropagation(); e._cnp.kernel.dispatch(p.dismiss, 'tap'); }); }
    },
    banner: function (e, v) { e.textContent = ''; var t = el('b', '', e); t.textContent = v.props.title; var x = el('span', '', e); x.textContent = v.props.text; },
    toast: function (e, v) { e.textContent = v.props.text; },
    dots: function (e, v) { e.textContent = ''; for (var i = 0; i < v.props.n; i++) el('i', i === v.props.page ? 'on' : '', e); },
    pindot: function (e, v) { e.classList.toggle('on', !!v.props.filled); },
    homebar: function () {},
    image: function (e, v) { e.textContent = ''; if (v.props.src) { var im = el('img', '', e); im.alt = v.props.alt || ''; im.src = v.props.src; if (v.props.w) im.style.width = v.props.w + 'px'; } },
    section: null
  };

  var CONTAINERS = { device: 1, view: 1, homeview: 1, scroll: 1, row: 1, col: 1, grid: 1, list: 1, menu: 1, homegrid: 1, dock: 1, widgets: 1, shade: 1, lock: 1, section: 1 };
  var LEAF_TAGS = {};
  Object.keys(LEAF).forEach(function (k) { if (LEAF[k]) LEAF_TAGS[k] = 1; });
  LEAF_TAGS.input = 1; LEAF_TAGS.canvas = 1; LEAF_TAGS.camera = 1;

  // ---------- canvas 2D commands ----------
  function drawCmds(cv, v) {
    var w = parseFloat(v.props.w) || 240, h = parseFloat(v.props.h) || 240, ctx = cv.getContext && cv.getContext('2d');
    if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    (v.props.cmds || []).forEach(function (c) {
      var col = c.color || c.fill || '#fff';
      try {
        if (c.c === 'clear') { ctx.fillStyle = c.color || '#000'; ctx.fillRect(0, 0, w, h); }
        else if (c.c === 'rect') { ctx.fillStyle = col; ctx.fillRect(+c.x || 0, +c.y || 0, +c.w || 10, +c.h || 10); }
        else if (c.c === 'circle') { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(+c.x || 0, +c.y || 0, +c.r || 5, 0, 7); ctx.fill(); }
        else if (c.c === 'line') { ctx.strokeStyle = col; ctx.lineWidth = +c.width || 1; ctx.beginPath(); ctx.moveTo(+c.x1 || 0, +c.y1 || 0); ctx.lineTo(+c.x2 || 0, +c.y2 || 0); ctx.stroke(); }
        else if (c.c === 'text') { ctx.fillStyle = col; ctx.font = (+c.size || 14) + 'px sans-serif'; ctx.fillText(String(c.text == null ? '' : c.text), +c.x || 0, +c.y || 0); }
        else if (c.c === 'image' && c.src) { var im = new global.Image(); im.onload = function () { ctx.drawImage(im, +c.x || 0, +c.y || 0, +c.w || im.width, +c.h || im.height); }; im.src = c.src; }
      } catch (e) { /* bad cmd */ }
    });
  }

  // ---------- camera viewfinder: real stream, or animated test pattern ----------
  function fillCamera(e, v, inst) {
    var p = v.props, want = p.synthetic ? 'syn' : 'live';
    if (e._camMode === want && e._camFacing === p.facing) return;
    cleanup(e); e.textContent = ''; e._camMode = want; e._camFacing = p.facing;
    var stream = inst.host.camera && inst.host.camera.stream && inst.host.camera.stream();
    if (want === 'live' && stream) {
      var vid = el('video', '', e); vid.muted = true; vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.srcObject = stream;
      if (p.facing === 'front') vid.style.transform = 'scaleX(-1)'; try { vid.play(); } catch (x) { /* ignore */ }
      return;
    }
    var cv = el('canvas', '', e); cv.width = 320; cv.height = 240; var ctx = cv.getContext && cv.getContext('2d'), f = 0, stop = false;
    var bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    function frame() {
      if (stop || !ctx) return; f++;
      bars.forEach(function (c, i) { ctx.fillStyle = c; ctx.fillRect(i * 320 / 7, 0, 320 / 7 + 1, 170); });
      ctx.fillStyle = '#111'; ctx.fillRect(0, 170, 320, 70);
      ctx.fillStyle = '#0fc'; ctx.fillRect((f * 3) % 320, 176, 10, 10);
      ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.fillText('SAMARA SIM CAM ' + String(p.facing).toUpperCase(), 160, 212);
      e._anim = global.requestAnimationFrame ? global.requestAnimationFrame(frame) : setTimeout(frame, 66);
    }
    frame(); e._camStop = function () { stop = true; if (e._anim && global.cancelAnimationFrame) global.cancelAnimationFrame(e._anim); };
  }
  function cleanup(e) { if (e._camStop) { e._camStop(); e._camStop = null; } e._camMode = null; }
  function cleanupTree(e) { if (e._camStop) cleanup(e); if (e.children) for (var i = 0; i < e.children.length; i++) cleanupTree(e.children[i]); }

  // text fields inside the phone must stay selectable/focusable even though the screen itself disables selection
  (function () {
    if (!doc || doc.getElementById('cnp-input-fix')) return;
    var st = doc.createElement('style'); st.id = 'cnp-input-fix';
    st.textContent = '.cnp-screen input,.cnp-screen textarea,.cnp-input{-webkit-user-select:text;user-select:text;touch-action:manipulation;pointer-events:auto;-webkit-tap-highlight-color:rgba(0,255,204,.2)}' +
      '.cnp-input[type=range]{touch-action:pan-x}.cnp-screen .cnp-tappable,.cnp-screen button{cursor:pointer}';
    (doc.head || doc.documentElement).appendChild(st);
  })();

  // ---------- DOM creation / patching ----------
  function create(v, inst) {
    var tag = v.tag, e;
    if (tag === 'input') {
      var multi = v.props.multiline;
      e = multi ? el('textarea', 'cnp-input') : el('input', 'cnp-input');
      if (!multi) e.type = v.props.type || 'text';
      // real native field: Android/iOS soft keyboard (Gboard etc.), IME, paste, autofill all work
      e.setAttribute('autocomplete', 'off'); e.setAttribute('autocapitalize', 'none'); e.setAttribute('autocorrect', 'off'); e.spellcheck = false;
      e.setAttribute('enterkeyhint', multi ? 'enter' : (v.props.hint || 'go'));
      if (v.props.mode) e.setAttribute('inputmode', String(v.props.mode));          // e.g. mode=url | numeric | decimal | email
      else if (/url|address|search/i.test(v.id + ' ' + (v.props.placeholder || ''))) e.setAttribute('inputmode', 'url');
      var focusNow = function (ev) { if (v.props.type === 'range') return; ev.stopPropagation(); if (doc.activeElement !== e) { try { e.focus({ preventScroll: true }); } catch (x) { e.focus(); } } };
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });   // never let the phone's swipe/focus logic steal the tap
      e.addEventListener('pointerup', focusNow); e.addEventListener('click', focusNow);
      e.addEventListener('input', function () {
        var val = e._v.props.type === 'range' ? +e.value : e.value; inst.kernel.dispatch(e._v.id, 'change', { value: val });
      });
      e.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !(e._v.props.multiline && !ev.ctrlKey)) { if (e._v.on.indexOf('submit') >= 0) { ev.preventDefault(); inst.kernel.dispatch(e._v.id, 'submit', { value: e.value }); } }
      });
    } else if (tag === 'canvas') { e = el('canvas', 'cnp-canvas'); }
    else if (tag === 'camera') { e = el('div', 'cnp-camera'); }
    else if (tag === 'button' || tag === 'key') { e = el('button', 'cnp-' + tag); e.type = 'button'; }
    else e = el('div', 'cnp-' + tag);
    e._cnp = inst; e._tag = tag;
    e.addEventListener('click', function (ev) {
      if (inst.swallow) { inst.swallow = false; ev.stopPropagation(); return; }
      var v2 = e._v; if (!v2 || v2.on.indexOf('tap') < 0 || ev.defaultPrevented || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return;
      ev.stopPropagation(); inst.kernel.dispatch(v2.id, 'tap', { x: ev.offsetX, y: ev.offsetY });
    });
    return e;
  }
  function applyStyle(e, v) {
    var p = v.props, tag = v.tag;
    if (tag === 'row' || tag === 'col' || tag === 'grid') {
      e.style.gap = p.gap !== undefined ? (parseFloat(p.gap) || 0) + 'px' : '';
      e.style.flexWrap = p.wrap ? 'wrap' : '';
      e.style.justifyContent = p.justify || ''; e.style.alignItems = p.align || '';
      if (tag === 'grid') e.style.gridTemplateColumns = 'repeat(' + (parseInt(p.cols, 10) || 2) + ',minmax(0,1fr))';
      if (p.span) e.style.gridColumn = 'span ' + p.span;
    }
    if (tag === 'homegrid') { e.style.gridTemplateColumns = 'repeat(' + p.cols + ',minmax(0,1fr))'; e.style.gridTemplateRows = 'repeat(' + p.rows + ',1fr)'; }
    if (tag === 'dock') e.style.gridTemplateColumns = 'repeat(' + p.n + ',minmax(0,1fr))';
    if (tag === 'section' && !e._sec) { e._sec = true; }
  }
  function sig(v) { try { return JSON.stringify(v.props); } catch (x) { return String(Math.random()); } }
  function update(e, v, inst) {
    e._v = v;
    if (v.id != null) e.setAttribute('data-id', v.id);
    var cls = v.props && v.props.cls ? String(v.props.cls) : '';
    if (e._cls !== cls) { if (e._cls) e._cls.split(/\s+/).forEach(function (c) { if (c) e.classList.remove(c); }); cls.split(/\s+/).forEach(function (c) { if (c) e.classList.add(c); }); e._cls = cls; }
    var s = sig(v);
    if (e._sig !== s) {
      e._sig = s; applyStyle(e, v);
      if (v.tag === 'input') {
        e.placeholder = v.props.placeholder || '';
        if (v.props.type === 'range') { e.min = v.props.min; e.max = v.props.max; e.step = 1; }
        var val = String(v.props.value == null ? '' : v.props.value);
        if (e.value !== val && doc.activeElement !== e) e.value = val;
        else if (e.value !== val && v.props.type !== 'range' && doc.activeElement === e && val === '') e.value = val;
      } else if (v.tag === 'canvas') drawCmds(e, v);
      else if (v.tag === 'camera') fillCamera(e, v, inst);
      else if (LEAF[v.tag]) LEAF[v.tag](e, v);
      else if (v.tag === 'section') { /* title handled below */ }
    }
    e.classList.toggle('cnp-tappable', v.on.indexOf('tap') >= 0);
    if (v.tag === 'section') {
      var head = e.firstChild && e.firstChild.className === 'cnp-sec-h' ? e.firstChild : null;
      if (!head) { head = el('div', 'cnp-sec-h'); e.insertBefore(head, e.firstChild); }
      head.textContent = v.props.title || '';
      reconcile(e, v.children, inst, 1);
    } else if (!LEAF_TAGS[v.tag]) reconcile(e, v.children, inst, 0);
  }
  function reconcile(parent, kids, inst, skip) {
    var i, dom;
    for (i = 0; i < kids.length; i++) {
      dom = parent.childNodes[i + skip];
      var v = kids[i];
      if (dom && dom._tag === v.tag && (dom._v && dom._v.id === v.id)) { update(dom, v, inst); continue; }
      var ne = create(v, inst); update(ne, v, inst);
      if (dom) { cleanupTree(dom); parent.replaceChild(ne, dom); } else parent.appendChild(ne);
    }
    while (parent.childNodes.length > kids.length + skip) { cleanupTree(parent.lastChild); parent.removeChild(parent.lastChild); }
  }

  // ---------- gradient / screenshot painter (DOM -> PNG without libraries) ----------
  function splitTop(s) {
    var out = [], d = 0, cur = '';
    for (var i = 0; i < s.length; i++) { var c = s[i]; if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  function gradientFor(ctx, bg, x, y, w, h) {
    var m = /linear-gradient\((.*)\)\s*$/.exec(bg); if (!m) return null;
    var parts = splitTop(m[1]), ang = 180;
    if (/deg$/.test(parts[0])) ang = parseFloat(parts.shift());
    var rad = (ang - 90) * Math.PI / 180, cx = x + w / 2, cy = y + h / 2, len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
    var g = ctx.createLinearGradient(cx - Math.cos(rad) * len / 2, cy - Math.sin(rad) * len / 2, cx + Math.cos(rad) * len / 2, cy + Math.sin(rad) * len / 2);
    parts.forEach(function (st, i) {
      var mm = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(st); try { g.addColorStop(mm[2] !== undefined ? mm[2] / 100 : (parts.length > 1 ? i / (parts.length - 1) : 0), mm[1]); } catch (e) { /* bad stop */ }
    });
    return g;
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function paintScreen(screen) {
    var R = screen.getBoundingClientRect(), k = R.width / screen.offsetWidth || 1, W = screen.offsetWidth, H = screen.offsetHeight, DPR = 2;
    var cv = doc.createElement('canvas'); cv.width = W * DPR; cv.height = H * DPR; var ctx = cv.getContext('2d'); ctx.scale(DPR, DPR);
    rrect(ctx, 0, 0, W, H, 34); ctx.clip();
    (function walk(node) {
      var cs = global.getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      var r = node.getBoundingClientRect(), x = (r.left - R.left) / k, y = (r.top - R.top) / k, w = r.width / k, h = r.height / k;
      if (w > 0 && h > 0 && x < W && y < H && x + w > 0 && y + h > 0) {
        var rad = parseFloat(cs.borderTopLeftRadius) || 0, bg = cs.backgroundImage, col = cs.backgroundColor;
        var transparent = !col || col === 'transparent' || /rgba\(.*,\s*0\)$/.test(col);
        if (bg && bg.indexOf('linear-gradient') >= 0) { var g = gradientFor(ctx, bg, x, y, w, h); if (g) { ctx.fillStyle = g; rrect(ctx, x, y, w, h, rad); ctx.fill(); } }
        else if (!transparent) { ctx.fillStyle = col; rrect(ctx, x, y, w, h, rad); ctx.fill(); }
        var bw = parseFloat(cs.borderTopWidth) || 0;
        if (bw > 0 && cs.borderTopStyle !== 'none') { ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = bw; rrect(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, rad); ctx.stroke(); }
        if (node.tagName === 'CANVAS' || node.tagName === 'VIDEO' || node.tagName === 'IMG') { try { ctx.drawImage(node, x, y, w, h); } catch (e) { /* tainted */ } }
      }
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) { if (c.tagName !== 'CANVAS' && c.tagName !== 'VIDEO' && c.tagName !== 'IMG') walk(c); else walk(c); }
        else if (c.nodeType === 3 && c.nodeValue.trim()) paintText(c, cs);
      }
      function paintText(tn, cs2) {
        var fs = parseFloat(cs2.fontSize) || 14, txt = tn.nodeValue, words = txt.split(/(\s+)/), off = 0, rg = doc.createRange();
        ctx.font = cs2.fontStyle + ' ' + cs2.fontWeight + ' ' + fs + 'px ' + cs2.fontFamily; ctx.fillStyle = cs2.color; ctx.textBaseline = 'middle';
        for (var wi = 0; wi < words.length; wi++) {
          var wd = words[wi]; if (wd && !/^\s+$/.test(wd)) {
            rg.setStart(tn, off); rg.setEnd(tn, off + wd.length); var rr = rg.getClientRects()[0];
            if (rr) ctx.fillText(wd, (rr.left - R.left) / k, (rr.top - R.top + rr.height / 2) / k);
          }
          off += wd.length;
        }
      }
    })(screen);
    return cv.toDataURL('image/png');
  }

  // ======================================================================
  function create_(mount, opts) {
    opts = opts || {};
    if (!doc) throw new Error('Canopy needs a DOM');
    var OS = ownerOS(); if (!OS) throw new Error('samara-os.js not loaded');
    var inst = { swallow: false, host: {}, orientation: 'portrait' };
    var logLines = [], logOpen = opts.log === true;
    mount.classList.add('cnp-mount');

    // --- skeleton ---
    var root = el('div', 'cnp'); root.tabIndex = 0; root.setAttribute('aria-label', 'Samara One phone simulator');
    var bar = el('div', 'cnp-toolbar', root);
    var stage = el('div', 'cnp-stage', root);
    var fit = el('div', 'cnp-fit', stage);
    var device = el('div', 'cnp-device', fit);
    var sPower = el('button', 'cnp-side cnp-side-power', device), sUp = el('button', 'cnp-side cnp-side-up', device), sDn = el('button', 'cnp-side cnp-side-dn', device);
    [sPower, sUp, sDn].forEach(function (b) { b.type = 'button'; });
    sPower.title = 'Power (click: screen, hold: power off)'; sUp.title = 'Volume up'; sDn.title = 'Volume down';
    var bezel = el('div', 'cnp-bezel', device);
    var screen = el('div', 'cnp-screen', bezel);
    var wall = el('div', 'cnp-wall', screen);
    var view = el('div', 'cnp-view', screen);
    var dim = el('div', 'cnp-dim', screen);
    var bootEl = el('div', 'cnp-boot', screen);
    bootEl.innerHTML = '<div class="cnp-boot-logo">❦</div><div class="cnp-boot-name">samara</div><div class="cnp-boot-bar"><i></i></div>';
    var off = el('div', 'cnp-off', screen); off.textContent = 'Samara One';
    var notch = el('div', 'cnp-notch', bezel); el('i', '', notch);
    var hw = el('div', 'cnp-hw', root);
    var logEl = el('div', 'cnp-log', root); var logBody = el('div', 'cnp-log-body', logEl);
    root.appendChild(logEl);

    function tbtn(label, title, fn, cls) { var b = el('button', 'cnp-tb ' + (cls || ''), bar); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); return b; }
    var bPower = tbtn('⏻', 'Power on / off', function () { if (inst.kernel.state().powered) inst.shutdown(); else inst.boot(); });
    tbtn('↻', 'Rotate', function () { inst.rotate(); });
    tbtn('📷', 'Screenshot (PNG)', function () { inst.screenshot({ download: true }); });
    tbtn('☰', 'Device log', function () { logOpen = !logOpen; logEl.classList.toggle('open', logOpen); });
    var lbl = el('span', 'cnp-label', bar); lbl.textContent = 'Samara One';
    function hwbtn(label, key, title) { var b = el('button', 'cnp-hwb', hw); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', function () { inst.press(key); }); return b; }
    hwbtn('◁', 'back', 'Back'); hwbtn('○', 'home', 'Home'); hwbtn('⏻', 'power', 'Power'); hwbtn('−', 'voldown', 'Volume down'); hwbtn('+', 'volup', 'Volume up');
    logEl.classList.toggle('open', logOpen);

    // power side button: click = power, hold = long
    (function () {
      var t = null, longed = false;
      sPower.addEventListener('pointerdown', function () { longed = false; t = setTimeout(function () { longed = true; inst.press('powerlong'); }, 900); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { sPower.addEventListener(n, function () { clearTimeout(t); }); });
      sPower.addEventListener('click', function () { if (!longed) inst.press('power'); });
    })();
    sUp.addEventListener('click', function () { inst.press('volup'); }); sDn.addEventListener('click', function () { inst.press('voldown'); });

    // --- log ---
    function onLog(line, level) {
      logLines.push(line); if (logLines.length > 300) { logLines.shift(); if (logBody.firstChild) logBody.removeChild(logBody.firstChild); }
      var d = el('div', 'cnp-ll ' + (level || ''), logBody); d.textContent = line; logBody.scrollTop = logBody.scrollHeight;
      if (typeof opts.onLog === 'function') { try { opts.onLog(line, level); } catch (e) { /* ignore */ } }
    }

    // --- host (browser services) ---
    var camStream = null;
    inst.host = {
      now: function () { return Date.now(); },
      log: onLog,
      fetch: function (u) { return global.fetch(u); },
      haptic: function (ms) { try { if (global.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } },
      snd: {
        beep: function (f, ms) { try { var AC = global.AudioContext || global.webkitAudioContext; if (!AC) return; var c = inst._ac || (inst._ac = new AC()), o = c.createOscillator(), g = c.createGain(); o.frequency.value = +f || 660; g.gain.value = 0.05 * (inst.kernel.state().volume / 50); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (+ms || 120) / 1000); } catch (e) { /* ignore */ } },
        play: function () { inst.host.snd.beep(880, 160); }
      },
      sensors: {
        location: null
      },
      camera: {
        stream: function () { return camStream; },
        open: function (facing) {
          if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
          return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing === 'front' ? 'user' : 'environment' }, audio: false }).then(function (s) {
            if (camStream) camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = s; return true;
          }, function (e) { onLog('[warn] camera denied/unavailable (' + (e && e.name) + '); using test pattern', 'warn'); return false; });
        },
        snap: function () {
          var vid = view.querySelector('.cnp-camera video'); if (!vid || !vid.videoWidth) return null;
          var c = doc.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0); return c.toDataURL('image/jpeg', 0.85);
        },
        close: function () { if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; } }
      }
    };
    inst.host.onRender = function () { schedule(); };
    if (opts.hostOverrides) Object.assign(inst.host, opts.hostOverrides);

    // --- rendering ---
    var raf = null, lastDevSig = '';
    function schedule() {
      if (raf) return; var f = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      raf = f(function () { raf = null; render(); });
    }
    // animated / procedural wallpapers: SamaraWallpapers.mount(id, el, opts) -> {stop,pause,resume,resize}
    var liveWp = null, liveId = null;
    function syncLiveWallpaper(P, T) {
      var SW = global.SamaraWallpapers, want = P.wallpaperLive && SW && SW.mount ? P.wallpaperId : null;
      if (liveWp && liveId !== want) { try { liveWp.stop(); } catch (x) {} liveWp = null; liveId = null; wall.textContent = ''; }
      if (liveWp && liveWp.setOptions) { var ok = (T.dark ? 1 : 0) + '|' + T.accent + '|' + T.bg; if (liveWp._ok !== ok) { liveWp._ok = ok; try { liveWp.setOptions({ dark: !!T.dark, accent: T.accent, bg: T.bg }); } catch (x) {} } }
      if (want && !liveWp) { try { liveWp = SW.mount(want, wall, { dark: !!T.dark, accent: T.accent, bg: T.bg }); liveId = want; if (liveWp) liveWp._ok = (T.dark ? 1 : 0) + '|' + T.accent + '|' + T.bg; } catch (x) { liveWp = null; } }
      if (liveWp) { var live = P.powered && !P.screenOff; try { live ? liveWp.resume && liveWp.resume() : liveWp.pause && liveWp.pause(); } catch (x) {} }
    }
    function applyTheme(tree) {
      var P = tree.props, T = P.theme || {};
      var vars = { '--bg': T.bg, '--surface': T.surface, '--surface2': T.surface2, '--text': T.text, '--dim': T.dim, '--accent': T.accent, '--on-accent': T.onAccent, '--border': T.border, '--danger': T.danger, '--ok': T.ok };
      Object.keys(vars).forEach(function (k) { if (vars[k]) screen.style.setProperty(k, vars[k]); });
      screen.classList.toggle('dark', !!T.dark); screen.classList.toggle('light', !T.dark);
      wall.style.background = P.wallpaper || T.bg;
      syncLiveWallpaper(P, T);
      dim.style.opacity = String(Math.max(0, Math.min(0.85, 1 - (P.brightness == null ? 1 : P.brightness))));
      screen.classList.toggle('is-off', !P.powered || P.screenOff);
      screen.classList.toggle('is-locked', !!P.locked);
      if (P.orientation !== inst.orientation) { inst.orientation = P.orientation; layout(); }
      bPower.classList.toggle('on', !!P.powered);
    }
    function render() {
      var tree = inst.kernel.tree(); applyTheme(tree);
      off.style.display = (!tree.props.powered || tree.props.screenOff) && !inst.booting ? '' : 'none';
      lbl.textContent = tree.props.powered ? ('Samara One · ' + tree.props.themeName) : 'Samara One · off';
      reconcile(view, tree.children, inst, 0);
    }

    // --- scale to fit ---
    function layout() {
      var d = SCREEN[inst.orientation], W = d.w + BEZEL * 2, H = d.h + BEZEL * 2;
      device.style.width = W + 'px'; device.style.height = H + 'px';
      screen.style.width = d.w + 'px'; screen.style.height = d.h + 'px';
      device.classList.toggle('landscape', inst.orientation === 'landscape');
      var availW = Math.max(120, stage.clientWidth || mount.clientWidth || W);
      var availH = opts.height || (mount.clientHeight > 260 ? mount.clientHeight - bar.offsetHeight - hw.offsetHeight - 16 : Math.max(300, (global.innerHeight || 900) * 0.8 - 90));
      var sc = Math.min(1, availW / W, availH / H);
      fit.style.width = Math.floor(W * sc) + 'px'; fit.style.height = Math.floor(H * sc) + 'px';
      device.style.transform = 'scale(' + sc + ')'; inst.scale = sc;
    }
    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(function () { layout(); }); ro.observe(mount); } else global.addEventListener('resize', layout);

    // --- input: gestures (touch + mouse) ---
    (function () {
      var st = null;
      screen.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('input,textarea')) { st = null; return; }
        var r = screen.getBoundingClientRect(), k = inst.scale || 1;
        st = { x: e.clientX, y: e.clientY, ry: (e.clientY - r.top) / k, rx: (e.clientX - r.left) / k, t: Date.now(), id: e.pointerId };
        inst.swallow = false;
      });
      function end(e) {
        if (!st) return; var s = st; st = null;
        var k = inst.scale || 1, dx = (e.clientX - s.x) / k, dy = (e.clientY - s.y) / k, K = inst.kernel, S = K.state();
        if (!S.powered || S.screenOff) return;
        var H = SCREEN[inst.orientation].h, ax = Math.abs(dx), ay = Math.abs(dy), used = false;
        if (ay > 50 && ay > ax * 1.3) {
          if (dy > 0 && s.ry < 36 && !S.shade) { K.toggleShade(true); used = true; }
          else if (dy < 0 && S.shade) { K.toggleShade(false); used = true; }
          else if (dy < 0 && S.locked && !document_hasPasscode()) { K.unlock(); used = true; }
          else if (dy < 0 && s.ry > H - 40 && !S.locked) { K.home(); used = true; }
        } else if (ax > 60 && ax > ay * 1.3) {
          if (!S.locked && !S.fg && !S.shade) { K.dispatch('@page:' + Math.max(0, S.page + (dx < 0 ? 1 : -1)), 'tap'); used = true; }
          else if (!S.locked && S.fg && s.rx < 28 && dx > 0) { K.back(); used = true; }
        }
        if (used) inst.swallow = true;
        setTimeout(function () { inst.swallow = false; }, 50);
      }
      function document_hasPasscode() { return !!(inst.kernel && inst.seed && inst.seed.manifest && inst.seed.manifest.passcode); }
      screen.addEventListener('pointerup', end); screen.addEventListener('pointercancel', function () { st = null; });
    })();

    function visibleField() {
      var f = root.querySelectorAll('.cnp-input'), i;
      for (i = 0; i < f.length; i++) if (f[i].type !== 'range' && f[i].offsetParent !== null && !f[i].disabled) return f[i];
      return null;
    }
    // --- keyboard shortcuts ---
    root.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing && e.key !== 'Escape') return;
      // Bluetooth / physical keyboard: a printable key with a text field on screen types into it
      if (!typing && e.key && e.key.length === 1) {
        var fld = visibleField();
        if (fld) { try { fld.focus({ preventScroll: true }); } catch (x) { fld.focus(); } return; }   // keystroke then lands in the field
      }
      var map = { Escape: 'back', Home: 'home', h: 'home', b: 'back', p: 'power', ArrowUp: 'volup', ArrowDown: 'voldown', n: 'shade' };
      if (map[e.key]) { e.preventDefault(); inst.press(map[e.key]); }
      else if (e.key === 'r') { e.preventDefault(); inst.rotate(); }
      else if (e.key === 's') { e.preventDefault(); inst.screenshot({ download: true }); }
      else if (e.key === 'l') { e.preventDefault(); logOpen = !logOpen; logEl.classList.toggle('open', logOpen); }
    });
    screen.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('input,textarea')) return; if (root.focus) root.focus({ preventScroll: true }); });

    // --- timers ---
    var timer = setInterval(function () { if (inst.kernel) inst.kernel.tick(1000); }, 1000);

    // --- kernel lifecycle ---
    function makeKernel(seed) {
      if (typeof seed === 'string') seed = JSON.parse(seed);
      inst.seed = seed; inst.kernel = OS.createKernel(seed, inst.host);
      inst.kernel.subscribe(function () { schedule(); });
      inst.kernel.state(); return inst.kernel;
    }
    inst.setSeed = function (seed) {
      if (inst.kernel && inst.kernel.state().powered) inst.kernel.shutdown();
      makeKernel(seed); render(); return inst;
    };
    inst.boot = function () {
      var K = inst.kernel; if (!K) return Promise.reject(new Error('no seed'));
      if (K.state().powered) return Promise.resolve(inst);
      return new Promise(function (res) {
        function go() { inst.booting = false; bootEl.classList.remove('run'); K.boot(); render(); res(inst); }
        if (opts.fast) { go(); return; }
        inst.booting = true; off.style.display = 'none'; bootEl.classList.add('run'); setTimeout(go, 1300);
      });
    };
    inst.shutdown = function () { if (inst.kernel) inst.kernel.shutdown(); if (camStream) inst.host.camera.close(); render(); return inst; };
    inst.press = function (key) {
      var K = inst.kernel; if (!K) return false;
      if (key === 'power' && !K.state().powered) { inst.boot(); return true; }
      var r = K.press(key); render(); return r;
    };
    inst.rotate = function () { inst.kernel.rotate(); render(); layout(); return inst.orientation; };
    inst.screenshot = function (o) {
      render(); var url;
      try { url = paintScreen(screen); } catch (e) { onLog('[error] screenshot failed: ' + e.message, 'error'); return null; }
      if (o && o.download) { var a = doc.createElement('a'); a.href = url; a.download = 'samara-' + Date.now() + '.png'; doc.body.appendChild(a); a.click(); doc.body.removeChild(a); }
      return url;
    };
    inst.log = function () { return logLines.slice(); };
    inst.destroy = function () {
      if (liveWp) { try { liveWp.stop(); } catch (x) {} liveWp = null; }
      clearInterval(timer); if (ro) ro.disconnect(); else global.removeEventListener('resize', layout);
      if (inst.kernel && inst.kernel.state().powered) inst.kernel.shutdown();
      if (camStream) inst.host.camera.close(); cleanupTree(view);
      if (root.parentNode) root.parentNode.removeChild(root); mount.classList.remove('cnp-mount');
    };

    mount.appendChild(root);
    if (opts.seed) makeKernel(opts.seed);
    layout();
    if (inst.kernel) { render(); if (opts.autoBoot !== false) inst.boot(); }
    else { off.textContent = 'No seed loaded'; off.style.display = ''; }
    return inst;
  }

  function mountEmbed(mount, seedUrl, opts) {
    var note = doc.createElement('div'); note.className = 'cnp-embed-note'; note.textContent = 'Loading seed…'; mount.appendChild(note);
    return global.fetch(seedUrl).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + seedUrl);
      return r.text();
    }).then(function (txt) {
      var seed = global.Seedpress && global.Seedpress.parse ? global.Seedpress.parse(txt) : JSON.parse(txt);
      if (seed && seed.seed) seed = seed.seed;
      if (!seed || seed.magic !== 'SAMARA-SEED') throw new Error('not a Samara seed (missing SAMARA-SEED magic)');
      if (note.parentNode) note.parentNode.removeChild(note);
      return create_(mount, Object.assign({ seed: seed }, opts || {}));
    }).catch(function (e) {
      note.className = 'cnp-embed-note err';
      note.textContent = "Couldn't load seed: " + (e && e.message ? e.message : e) + (/Failed to fetch|NetworkError/i.test(String(e && e.message)) ? ' (the host may block cross-origin requests)' : '');
      throw e;
    });
  }

  var api = { create: create_, mountEmbed: mountEmbed, version: '1.0.0' };
  global.Canopy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
