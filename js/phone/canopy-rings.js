// ============================================================
//  canopy-rings.js — DOM side of Rings, the App Drawer and session persistence
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Load after canopy.js, persist.js and wallpapers.js.  Adds to Canopy:
//   * leaf widgets used by js/phone/rings.js and the App Drawer: listrow, switch, themecard, filebtn, approw, bar, kv
//   * session persistence glue: every Canopy instance autosaves/restores through SamaraPersist (browser host: localStorage + IndexedDB)
//       inst.persist                 the SamaraPersist controller (see persist.js)
//       inst.importWallpaper(file)   -> Promise<bool>   import + downscale + set as wallpaper "custom"
//       inst.pickWallpaper()         open the file picker, then importWallpaper
//       inst.removeWallpaper()
//       inst.setSessionGithub({status(), backup(), restore()})   Grove injects its GitHub backup here (shown in Rings > Backup & reset)
//     Canopy.create(el, { persist:false })  turns persistence off;  { project:'name' }  adds the project fallback namespace.
// ============================================================
(function (global) {
  'use strict';
  var C = global.Canopy, doc = global.document;
  if (!C || !doc) return;
  var el = C.el;

  function two(parent, cls, a, b) {   // <span class=cls><b>a</b><i>b</i></span>
    var s = el('span', cls, parent), t = el('b', '', s); t.textContent = a || ''; if (b) { var i = el('i', '', s); i.textContent = b; } return s;
  }

  // ---------- leaf widgets ----------
  C.registerLeaf('listrow', function (e, v) {
    var p = v.props; e.textContent = '';
    var g = el('span', 'cnp-lr-g', e); g.textContent = p.glyph || ''; if (p.color) g.style.background = p.color;
    two(e, 'cnp-lr-t', p.title, p.sub);
    var c = el('span', 'cnp-lr-c', e); c.textContent = p.check ? '✓' : '›'; e.classList.toggle('chk', !!p.check);
  });
  C.registerLeaf('switch', function (e, v) {
    var p = v.props; e.textContent = '';
    two(e, 'cnp-sw2-t', p.title, p.sub);
    var k = el('span', 'cnp-sw2-k', e); el('i', '', k);
    e.classList.toggle('on', !!p.on); e.setAttribute('role', 'switch'); e.setAttribute('aria-checked', p.on ? 'true' : 'false'); e.setAttribute('aria-label', p.title || 'switch');
  });
  C.registerLeaf('themecard', function (e, v) {
    var p = v.props; e.textContent = ''; e.classList.toggle('sel', !!p.selected); e.style.borderColor = p.selected ? p.accent : '';
    var im = el('span', 'cnp-tc-art', e); if (p.art) im.style.backgroundImage = 'url("' + p.art + '")'; im.style.backgroundColor = p.bg;
    var bar = el('span', 'cnp-tc-bar', e); bar.style.background = p.bg; bar.style.color = p.text;
    if (p.emblem) { var em = el('img', 'cnp-tc-em', bar); em.src = p.emblem; em.alt = ''; }
    var n = el('span', 'cnp-tc-n', bar); n.textContent = p.name;
    var d = el('span', 'cnp-tc-d', bar); d.style.background = p.accent;
    e.setAttribute('aria-label', p.name + ' theme' + (p.selected ? ', selected' : ''));
  });
  C.registerLeaf('approw', function (e, v) {
    var p = v.props; e.textContent = '';
    var g = el('span', 'cnp-lr-g', e); g.textContent = p.glyph || ''; if (p.color) g.style.background = p.color;
    two(e, 'cnp-lr-t', p.name, p.sub);
  });
  C.registerLeaf('bar', function (e, v) {
    var p = v.props; e.textContent = '';
    var top = el('div', 'cnp-bar-h', e); two(top, '', p.label); var r = el('em', '', top); r.textContent = p.right || '';
    var tr = el('div', 'cnp-bar-t', e), f = el('i', '', tr); f.style.width = Math.max(p.pct > 0 ? 2 : 0, p.pct) + '%';
  });
  C.registerLeaf('kv', function (e, v) { e.textContent = ''; var k = el('span', 'cnp-kv-k', e); k.textContent = v.props.k; var x = el('span', 'cnp-kv-v', e); x.textContent = v.props.v; });
  C.registerLeaf('filebtn', function (e, v) {
    var p = v.props; e.textContent = '';
    var b = el('button', 'cnp-button k-primary', e); b.type = 'button'; b.textContent = p.label || 'Choose file';
    var inp = el('input', 'cnp-file', e); inp.type = 'file'; inp.accept = p.accept || 'image/*'; inp.hidden = true; inp.tabIndex = -1;
    b.addEventListener('click', function (ev) { ev.stopPropagation(); inp.click(); });
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      if (e._cnp && e._cnp.importWallpaper) e._cnp.importWallpaper(f);
    });
  });

  // ---------- persistence glue ----------
  var browserHost = null;
  function pHost() { return browserHost || (browserHost = global.SamaraPersist ? global.SamaraPersist.browserHost() : null); }

  C.hook('kernel', function (inst) {
    var K = inst.kernel, SP = global.SamaraPersist;
    inst.importWallpaper = function (file) {
      var W = global.SamaraWallpapers;
      if (!W || !W.custom) { K.toast('Wallpaper import is not available here'); return Promise.resolve(false); }
      K.toast('Importing wallpaper…', 4000);
      return W.custom.importFile(file).then(function (img) {
        K.setCustomWallpaper(img); K.toast('Custom wallpaper set (' + img.w + '×' + img.h + ')', 2500);
        if (inst.persist) inst.persist.scheduleSave(); return true;
      }, function (err) { K.toast(err && err.message ? err.message : 'Could not import that image', 3800); return false; });
    };
    inst.pickWallpaper = function () {
      var inp = doc.createElement('input'); inp.type = 'file'; inp.accept = (global.SamaraWallpapers && global.SamaraWallpapers.custom && global.SamaraWallpapers.custom.accept) || 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; if (inp.parentNode) inp.parentNode.removeChild(inp); if (f) inst.importWallpaper(f); });
      doc.body.appendChild(inp); inp.click();
    };
    inst.removeWallpaper = function () { K.clearCustomWallpaper(); K.toast('Custom wallpaper removed'); if (inst.persist) inst.persist.scheduleSave(); };

    if (inst.opts.persist === false || !SP || !pHost()) return;
    var project = typeof inst.opts.project === 'function' ? inst.opts.project() : inst.opts.project;
    var ctl = inst.persist = SP.attach({ kernel: K, host: pHost(), seedId: K.seedId, project: project || null, debounceMs: 1500 });
    var session = inst.host.session = {
      saveNow: function () { return ctl.saveNow(true); },
      restoreNow: function () { var r = ctl.restore(); if (!r.restored) K.toast('No saved session to restore'); return r.promise; },
      factoryReset: function () { return ctl.factoryReset(); },
      info: function () { return { lastSaved: ctl.lastSaved, keys: ctl.keys, enabled: ctl.enabled }; },
      github: null
    };
    inst.setSessionGithub = function (api) { session.github = api || null; K.toast && 0; };
    function flush() { try { ctl.flush(); } catch (e) { /* ignore */ } }
    function vis() { if (doc.visibilityState === 'hidden') flush(); }
    global.addEventListener('pagehide', flush); doc.addEventListener('visibilitychange', vis);
    inst._persistOff = function () { global.removeEventListener('pagehide', flush); doc.removeEventListener('visibilitychange', vis); ctl.flush(); ctl.detach(); };
  });
  C.hook('boot', function (inst) { if (inst.persist) inst.persist.restore(); });
  C.hook('destroy', function (inst) { if (inst._persistOff) inst._persistOff(); });
})(typeof window !== 'undefined' ? window : globalThis);
