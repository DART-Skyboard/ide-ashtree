// ============================================================
//  rings.js — Rings, the Samara OS Settings app (DOM-free, data-driven)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  HOW THIS FILE IS ORGANISED  (copy it when you build your own OS)
//  1. PAGES is a table:  id -> { title, parent, build(R) }.  `parent` is where Back goes; `main` has no parent (Back = leave Settings).
//     build(R) returns an array of view nodes made with the tiny helpers below. Add a page = add one table entry + one MENU row.
//  2. MENU is the data for the main page (groups of rows pointing at page ids).
//  3. Every control is a view node whose id is an *action string* the kernel (samara-os.js) understands:
//        @rings:page:<id>        navigate                     @pref:<key>:<value|toggle>   write a user preference
//        @set:<setting>:<value>  kernel setting (theme, wallpaper, layout, dock, dnd, clock24, ...)
//        @field:<key>            text / range inputs          @act:<name>:<arg>            do something (clear data, set PIN, ...)
//     So a page never mutates state itself: it only *describes* the screen from R (a read-only context) and names actions.
//  4. Honesty: anything the simulator cannot really do is labelled "simulated" in its own caption. Real = changes kernel behaviour.
//
//  R (context from the kernel): V, S (state), page, draft, apps, appInfo, pref(key), defaults, perms, themeNames(), themeTokens(n),
//     wallpapers(), online(), netBlock(), usage(), custom (meta|null), art (SamaraThemeArt|null), session (persistence host|null),
//     clockText(), dateText(), hasPin, hasPasscode, layouts, version, seedId, manifest.
//  Pages owned by the UPDATES worker (about, sysupdate, devopts) are registered at the bottom as placeholders.
// ============================================================
(function (global) {
  'use strict';

  // ---------- tiny view helpers (all return kernel VNodes) ----------
  function H(R) {
    var V = R.V;
    return {
      section: function (title, kids) { return V('section', null, { title: title }, kids); },
      note: function (text) { return V('text', null, { text: text, size: 'sm', color: 'dim' }); },
      text: function (text, o) { return V('text', null, Object.assign({ text: text }, o || {})); },
      // a tappable settings row: glyph, title, subtitle, chevron -> opens page `to`
      link: function (glyph, title, sub, to, color) { return V('listrow', '@rings:page:' + to, { glyph: glyph, title: title, sub: sub || '', color: color || '' }, [], ['tap']); },
      // an on/off row bound to a preference key (or a kernel setting via `id`)
      toggle: function (title, sub, key, on, id) { return V('switch', id || '@pref:' + key + ':toggle', { title: title, sub: sub || '', on: !!on }, [], ['tap']); },
      // a row of exclusive choices
      seg: function (key, cur, options, idPrefix) {
        return V('row', null, { wrap: true, gap: 8 }, options.map(function (o) {
          return V('chip', (idPrefix || '@pref:' + key + ':') + (idPrefix ? o[0] : o[0]), { label: o[1], selected: String(cur) === String(o[0]) }, [], ['tap']);
        }));
      },
      range: function (id, min, max, val) { return V('input', id, { type: 'range', min: min, max: max, value: val }, [], ['change']); },
      button: function (label, id, kind) { return V('button', id, { label: label, kind: kind || 'tonal' }, [], ['tap']); },
      kv: function (k, v) { return V('kv', null, { k: k, v: String(v) }); },
      bar: function (label, pct, right) { return V('bar', null, { label: label, pct: Math.max(0, Math.min(100, pct)), right: right || '' }); },
      field: function (key, placeholder, value, type, mode) { return V('input', '@field:' + key, { type: type || 'text', placeholder: placeholder, value: value || '', mode: mode }, [], ['change']); }
    };
  }
  function fmtBytes(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }
  function onoff(v) { return v ? 'On' : 'Off'; }
  function pct(v) { return Math.round(v * 100) + '%'; }

  // ---------- pages ----------
  var PAGES = {};
  function page(id, title, parent, build) { PAGES[id] = { id: id, title: title, parent: parent, build: build }; }

  // ---- Wallpapers & Themes ----
  page('themes', 'Wallpapers & themes', 'main', function (R) {
    var h = H(R), cur = R.S.theme, cards = R.themeNames().map(function (n) {
      var t = R.themeTokens(n);
      return R.V('themecard', '@set:theme:' + n, { name: n, art: R.art ? R.art.cardUri(n, t) : '', emblem: R.art ? R.art.accentUri(n, 64, t) : '', bg: t.bg, accent: t.accent, text: t.text, dark: !!t.dark, selected: n === cur }, [], ['tap']);
    });
    var wps = R.wallpapers().map(function (w) {
      return R.V('chip', '@set:wallpaper:' + w.id, { label: w.name, selected: w.id === R.S.wallpaper, preview: w.custom ? '@custom' : w.id === 'themeart' ? '@themeart' : w.css, rev: w.rev || 0 }, [], ['tap']);
    });
    var t = R.themeTokens(cur), kids = [
      h.section('Theme', [R.V('row', null, { gap: 12, align: 'center' }, [R.V('image', null, { src: R.art ? R.art.accentUri(cur, 64, t) : '', w: 56, alt: cur + ' emblem' }), h.text(cur + (t.dark ? '  ·  dark' : '  ·  light'), { size: 'md', weight: '650' })]),
        R.V('grid', null, { cols: 2, gap: 10 }, cards), h.note('Each theme ships its own illustration. Pick "Theme Art" below to use it as the wallpaper.')]),
      h.section('Wallpaper', [R.V('row', null, { wrap: true, gap: 8 }, wps)])
    ];
    var c = R.custom, cs = [R.V('filebtn', '@wallpaper:import', { label: c ? 'Replace image…' : 'Import wallpaper…', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/jxl,.png,.jpg,.jpeg,.webp,.gif,.avif,.jxl' })];
    if (c) {
      cs.push(h.note(c.w + ' × ' + c.h + ' px · ' + (c.mime || 'image').replace('image/', '').toUpperCase() + ' · ' + fmtBytes(c.bytes) + ' (downscaled to max 2560 px)'));
      cs.push(h.text('Fit', { size: 'sm', color: 'dim' }));
      cs.push(h.seg('', c.fit, [['fill', 'Fill'], ['fit', 'Fit'], ['center', 'Center']], '@act:wp-fit:'));
      cs.push(h.text('Dim  ' + Math.round(c.dim * 100) + '%', { size: 'sm', color: 'dim' })); cs.push(h.range('@field:wp.dim', 0, 85, Math.round(c.dim * 100)));
      cs.push(h.text('Blur  ' + Math.round(c.blur) + ' px', { size: 'sm', color: 'dim' })); cs.push(h.range('@field:wp.blur', 0, 24, Math.round(c.blur)));
      cs.push(h.button('Remove custom wallpaper', '@act:wp-remove', 'danger'));
    } else cs.push(h.note('PNG, JPEG, WebP, GIF (first frame), AVIF and JPEG XL (only where this browser can decode it). Stays on this device; it is saved with your session and included in a GitHub backup.'));
    kids.push(h.section('Custom wallpaper', cs));
    return kids;
  });

  // ---- Display ----
  page('display', 'Display', 'main', function (R) {
    var h = H(R), P = R.pref, now = R.S;
    return [
      h.section('Brightness', [h.text('Brightness  ' + pct(now.brightness), { size: 'sm', color: 'dim' }), h.range('@set:brightness', 10, 100, Math.round(now.brightness * 100))]),
      h.section('Orientation', [
        h.toggle('Lock orientation', 'Blocks rotate buttons, gestures and the shade tile', 'orientationLock', P('orientationLock')),
        h.text('Now: ' + now.orientation, { size: 'sm', color: 'dim' }), R.V('row', null, { gap: 8, wrap: true }, [R.V('chip', '@rotate', { label: 'Rotate now' }, [], ['tap'])])]),
      h.section('Text size', [h.seg('textSize', P('textSize'), [['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Largest']]), h.note('Scales text and buttons in every app. (Large text in Accessibility adds one more step.)')]),
      h.section('Dark / light', [h.toggle('Automatic', 'Switch to your last dark theme from 19:00 to 07:00, light theme otherwise', 'autoDark', P('autoDark')),
        h.note('Pick themes under Wallpapers & themes; Automatic remembers your last dark and last light theme.')]),
      h.section('Screen timeout', [h.seg('timeout', P('timeout'), [[0, 'Never'], [15, '15 s'], [30, '30 s'], [60, '1 min'], [300, '5 min']]), h.note('Real: the screen sleeps and locks after this long without input.')])
    ];
  });

  // ---- Home screen ----
  page('home', 'Home screen', 'main', function (R) {
    var h = H(R), S = R.S;
    return [h.section('Grid', [h.seg('', S.cols + 'x' + S.rows, R.layouts.map(function (l) { return [l, l.replace('x', ' × ')]; }), '@set:layout:'), h.note('Columns × rows of app icons per page.')]),
      h.section('Dock', [h.seg('', S.dock, [2, 3, 4, 5].map(function (d) { return [d, String(d)]; }), '@set:dock:'), h.note('The dock always ends with Settings (when 3+ slots) and the App Drawer button.')])];
  });

  // ---- Network ----
  var WIFI = [['Samara-Lab', 4, true], ['Grove Guest', 3, false], ['Ash-5G', 3, true], ['Cafe Free WiFi', 2, false]];
  page('network', 'Network', 'main', function (R) {
    var h = H(R), P = R.pref, air = P('airplane'), on = R.online();
    var wifi = WIFI.map(function (w) {
      return R.V('listrow', '@act:wifi-join:' + w[0], { glyph: '◠', title: w[0], sub: (w[2] ? 'Secured' : 'Open') + ' · signal ' + w[1] + '/4' + (P('wifi') && !air && P('ssid') === w[0] ? ' · Connected' : ''), color: '#0a84ff', check: P('wifi') && !air && P('ssid') === w[0] }, [], ['tap']);
    });
    return [
      h.section('Status', [h.kv('Internet', on ? 'Online' : 'Offline'), h.kv('Connection', air ? 'Airplane mode' : (P('wifi') ? P('ssid') : P('mobile') ? 'Mobile data' : 'None')),
        h.note('Real: net.fetch and the Drift browser are blocked while offline or when an app’s network permission is off.')]),
      h.section('Connections', [h.toggle('Airplane mode', 'Turns off Wi-Fi and mobile data', 'airplane', air), h.toggle('Wi-Fi', P('wifi') && !air ? 'Connected to ' + P('ssid') : 'Off', 'wifi', P('wifi')), h.toggle('Mobile data', 'Uses the simulated cellular link', 'mobile', P('mobile'))]),
      h.section('Wi-Fi networks (simulated list)', wifi.concat([h.note('Joining only changes the name shown here; the simulator has no real radio.')])),
      h.section('Network mode (simulated)', [h.seg('netmode', P('netmode'), [['auto', 'Auto'], ['5g', '5G'], ['lte', 'LTE'], ['3g', '3G'], ['2g', '2G']]), h.note('Shown in the status bar when on mobile data. It does not change real throughput.')]),
      h.section('VPN, DNS and proxy (stored only)', [h.field('vpn', 'VPN server', P('vpn')), h.field('dns', 'Private DNS host', P('dns')), h.field('proxy', 'HTTP proxy host:port', P('proxy')),
        h.note('Saved with your session, but the browser’s own network stack decides routing, so these are not applied.')])
    ];
  });

  // ---- Sound & haptics ----
  page('sound', 'Sound & haptics', 'main', function (R) {
    var h = H(R), P = R.pref;
    return [h.section('Volume', [h.text('Volume  ' + R.S.volume + '%', { size: 'sm', color: 'dim' }), h.range('@set:volume', 0, 100, R.S.volume), h.button('Play test sound', '@act:beep', 'tonal')]),
      h.section('Modes', [h.toggle('Silent mode', 'App sounds (snd.beep) are muted', 'silent', P('silent')), h.toggle('Haptics', 'Vibration where this browser supports it', 'haptics', P('haptics')), h.toggle('Touch sounds', 'Simulated: Samara plays no tap sound', 'touchSounds', P('touchSounds'))])];
  });

  // ---- Notifications ----
  page('notifications', 'Notifications', 'main', function (R) {
    var h = H(R), P = R.pref;
    var apps = R.apps.map(function (a) { return h.toggle(a.name, 'Allow notifications', 'notif.app.' + a.id, P('notif.app.' + a.id) !== false); });
    return [h.section('General', [h.toggle('Do not disturb', 'New notifications skip the banner but land in the shade', 'dnd', R.S.dnd, '@set:dnd:toggle'), h.toggle('On lock screen', 'Show recent notifications on Bark', 'notif.lock', P('notif.lock') !== false),
        h.button('Send test notification', '@act:notif-test:rings', 'tonal')]),
      h.section('Apps', apps)];
  });

  // ---- Accessibility ----
  page('access', 'Accessibility', 'main', function (R) {
    var h = H(R), P = R.pref;
    return [
      h.section('Vision', [h.toggle('Large text', 'One step bigger than your text size', 'a11y.large', P('a11y.large')), h.toggle('Bold text', null, 'a11y.bold', P('a11y.bold')), h.toggle('High contrast', 'Stronger borders and text', 'a11y.contrast', P('a11y.contrast')),
        h.text('Color filter', { size: 'sm', color: 'dim' }), h.seg('a11y.filter', P('a11y.filter'), [['none', 'None'], ['grayscale', 'Gray'], ['invert', 'Invert'], ['deuter', 'Deuteranopia'], ['protan', 'Protanopia'], ['tritan', 'Tritanopia']]),
        h.toggle('Screen reader labels', 'Adds descriptive aria-labels to every control for real screen readers', 'a11y.reader', P('a11y.reader'))]),
      h.section('Motion', [h.toggle('Reduce motion', 'Pauses animated wallpapers and removes transitions', 'a11y.motion', P('a11y.motion'))]),
      h.section('Interaction', [h.toggle('Navigation buttons', 'Always show Back and Home on screen (alternative to gestures)', 'a11y.switch', P('a11y.switch')), h.toggle('One-handed mode', 'Shrinks the screen content toward the bottom', 'a11y.onehand', P('a11y.onehand')),
        h.text('Touch and hold delay', { size: 'sm', color: 'dim' }), h.seg('a11y.hold', P('a11y.hold'), [[200, 'Short'], [400, 'Default'], [700, 'Long'], [1000, 'Longest']]), h.note('Applies to the Power button hold (power off).')]),
      h.section('Hearing', [h.toggle('Mono audio', 'Simulated: the simulator’s beeps are already single-channel', 'a11y.mono', P('a11y.mono')), h.toggle('Captions for sounds', 'Shows a caption when an app plays a sound', 'a11y.captions', P('a11y.captions'))])
    ];
  });

  // ---- Battery (simulated model) ----
  page('battery', 'Battery', 'main', function (R) {
    var h = H(R), P = R.pref, S = R.S;
    return [h.section('Level', [h.bar('Battery', S.battery, Math.round(S.battery) + '%' + (S.charging ? ' ⚡' : '')), h.kv('State', S.charging ? 'Charging' : 'On battery'), h.toggle('Charging', 'Plug the simulated charger in', 'charge', S.charging, '@set:charge'),
        h.note('Simulated: the percentage drains and charges on a model, not from real hardware.')]),
      h.section('Saving', [h.toggle('Battery saver', 'Drains about 40% slower (simulated)', 'bat.saver', P('bat.saver')), h.toggle('Show percentage', 'In the status bar', 'bat.pct', P('bat.pct') !== false)])];
  });

  // ---- Storage (real) ----
  page('storage', 'Storage', 'main', function (R) {
    var h = H(R), u = R.usage(), rows = u.apps.slice().sort(function (a, b) { return b.bytes - a.bytes; });
    var kids = [h.bar('Used by Samara', Math.min(100, u.total / 50000), fmtBytes(u.total))];
    rows.forEach(function (a) { kids.push(h.bar(a.name, u.total ? a.bytes / Math.max(u.total, 1) * 100 : 0, a.keys + ' keys · ' + fmtBytes(a.bytes))); });
    kids.push(h.kv('Settings', fmtBytes(u.system))); kids.push(h.kv('Custom wallpaper', fmtBytes(u.wallpaper)));
    return [h.section('Usage', kids.concat([h.note('Real: bytes of store.* data per app in this browser. Clear an app’s data under Apps.')])), h.section('Manage', [h.link('▦', 'Apps', 'Open an app to clear its data', 'apps', '#8e8e93')])];
  });

  // ---- Apps ----
  page('apps', 'Apps', 'main', function (R) {
    var h = H(R), u = R.usage();
    return [h.section(R.apps.length + ' apps', R.apps.map(function (a) {
      var e = u.apps.filter(function (x) { return x.id === a.id; })[0];
      return R.V('listrow', '@rings:page:app:' + a.id, { glyph: a.glyph || a.name.charAt(0), title: a.name, sub: (R.procs[a.id] ? 'Running' : 'Stopped') + ' · ' + fmtBytes(e ? e.bytes : 0), color: a.color }, [], ['tap']);
    }))];
  });
  function appPage(id) {
    return { id: 'app:' + id, title: id, parent: 'apps', build: function (R) {
      var h = H(R), a = R.appInfo(id), e = R.usage().apps.filter(function (x) { return x.id === id; })[0] || { bytes: 0, keys: 0 }, P = R.pref;
      var perms = [['cam', 'Camera'], ['mic', 'Microphone'], ['loc', 'Location'], ['net', 'Network']].map(function (p) {
        return R.V('chip', '@pref:perm.' + id + '.' + p[0] + ':toggle', { label: p[1], selected: P('perm.' + id + '.' + p[0]) !== false }, [], ['tap']);
      });
      return [h.section(a.name, [R.V('row', null, { gap: 12, align: 'center' }, [R.V('appicon', null, { name: '', glyph: a.glyph || a.name.charAt(0), color: a.color }, [], []), h.text(a.name + '\n' + (a.version ? 'Version ' + a.version : 'Version 1.0') + (a.system ? ' · system app' : ''), { size: 'md' })]),
          h.kv('App id', id), h.kv('Entry node', a.entry || '(system)'), h.kv('Status', R.procs[id] ? 'Running' : 'Stopped'), h.kv('Data', e.keys + ' keys · ' + fmtBytes(e.bytes))]),
        h.section('Actions', [h.button('Open', '@act:open-app:' + id, 'primary'), h.button('Stop', '@act:stop-app:' + id, 'tonal'), h.button('Clear data', '@act:clear-data:' + id, 'danger')]),
        h.section('Permissions', [R.V('row', null, { wrap: true, gap: 8 }, perms), h.note('Tap to allow or block. Enforced for camera, location and network; the microphone is stored only (no Samara op reads it yet).')]),
        h.section('Notifications', [h.toggle('Allow notifications', null, 'notif.app.' + id, P('notif.app.' + id) !== false)])];
    } };
  }

  // ---- Privacy & permissions ----
  page('privacy', 'Privacy & permissions', 'main', function (R) {
    var h = H(R), P = R.pref;
    var secs = R.apps.map(function (a) {
      return h.section(a.name, [R.V('row', null, { wrap: true, gap: 8 }, [['cam', 'Camera'], ['mic', 'Mic'], ['loc', 'Location'], ['net', 'Network']].map(function (p) {
        return R.V('chip', '@pref:perm.' + a.id + '.' + p[0] + ':toggle', { label: p[1], selected: P('perm.' + a.id + '.' + p[0]) !== false }, [], ['tap']);
      }))]);
    });
    return [h.section('About permissions', [h.note('Highlighted = allowed. Camera (cam.open), location (sensor.location) and network (net.fetch, Drift) are enforced by the kernel. Microphone is stored only: no Samara op reads it yet.')])].concat(secs);
  });

  // ---- Security ----
  page('security', 'Security', 'main', function (R) {
    var h = H(R), pin = R.draft.pin || '';
    return [h.section('Screen lock', [h.kv('Method', R.hasPin ? 'PIN' : R.hasPasscode ? 'PIN (set by the ROM)' : 'Swipe'),
        h.field('draft.pin', R.hasPin ? 'New PIN (4 to 6 digits)' : 'Choose a PIN (4 to 6 digits)', pin, 'password', 'numeric'),
        R.V('row', null, { gap: 8 }, [h.button('Set PIN', '@act:pin-set', 'primary')].concat(R.hasPin ? [h.button('Remove PIN', '@act:pin-clear', 'danger')] : [])),
        h.note('Bark (the lock screen) asks for this PIN. It is stored as plain text in this browser: this is a simulator, not a vault. Pattern lock is not available.')]),
      h.section('Lock', [h.button('Lock now', '@act:lock-now', 'tonal'), h.link('☼', 'Screen timeout', 'Display settings', 'display', '#8e8e93')])];
  });

  // ---- Language, region, date & time ----
  page('locale', 'Language, region & time', 'main', function (R) {
    var h = H(R), P = R.pref, tzs = [['auto', 'Device'], ['-480', 'UTC−8'], ['-300', 'UTC−5'], ['0', 'UTC'], ['60', 'UTC+1'], ['330', 'UTC+5:30'], ['540', 'UTC+9']];
    return [
      h.section('Language (simulated)', [h.seg('lang', P('lang'), [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語']]), h.note('Saved and exposed to ROMs as a setting; the demo’s own text is English only.')]),
      h.section('Region', [h.seg('region', P('region'), ['US', 'GB', 'ES', 'FR', 'DE', 'JP', 'IN', 'BR'].map(function (r) { return [r, r]; }))]),
      h.section('Date & time', [h.kv('Now', R.clockText() + '  ·  ' + R.dateText()), h.toggle('24-hour clock', null, 'clock24', R.S.clock24, '@set:clock24'),
        h.text('Date format', { size: 'sm', color: 'dim' }), h.seg('datefmt', P('datefmt'), [['MDY', 'Nov 15'], ['DMY', '15 Nov'], ['ISO', '2026-11-15']]),
        h.text('Time zone', { size: 'sm', color: 'dim' }), h.seg('tz', P('tz'), tzs), h.note('Real: clock, Bark and Crown follow this zone.')])
    ];
  });

  // ---- Backup & reset ----
  page('backup', 'Backup & reset', 'main', function (R) {
    var h = H(R), P = R.pref, se = R.session, info = se && se.info ? se.info() : null, gh = se && se.github && se.github.status ? se.github.status() : null;
    var last = info && info.lastSaved ? new Date(info.lastSaved).toLocaleString() : 'not yet';
    var kids = [h.section('This browser', [h.toggle('Autosave session', 'Theme, wallpaper, app data, last app and more', 'autosave', P('autosave') !== false),
        h.kv('Last saved', last), info && info.keys ? h.kv('Saved under', info.keys.join(', ')) : h.note('Persistence host not available here.'),
        R.V('row', null, { wrap: true, gap: 8 }, [h.button('Save now', '@act:save-now', 'tonal'), h.button('Restore saved', '@act:restore-now', 'tonal')])])];
    kids.push(h.section('GitHub backup', gh ? [h.kv('Account', gh.signedIn ? gh.user : 'Not signed in'), h.kv('Project', gh.project || '-'),
        gh.signedIn ? R.V('row', null, { wrap: true, gap: 8 }, [h.button('Back up now', '@act:github-backup', 'primary'), h.button('Restore from GitHub', '@act:github-restore', 'tonal')]) : h.note('Sign in with GitHub from Grove (IDE tab), then come back.'),
        h.note('Writes phone/<project>/session/state.json (and wallpaper.<ext>) to your private Ash-Tree-IDE-Projects repo.')] : [h.note('GitHub backup is only available inside the Grove IDE tab.')]));
    var confirming = R.draft.confirm === 'reset';
    kids.push(h.section('Reset', [h.note('Erases settings, app data, the custom wallpaper and the saved session for this ROM, then reboots the phone.'),
      confirming ? R.V('row', null, { gap: 8 }, [h.button('Erase everything', '@act:factory-reset', 'danger'), h.button('Cancel', '@act:cancel-reset', 'tonal')]) : h.button('Reset to factory', '@act:factory-reset', 'danger')]));
    return kids;
  });

  // ---- Pages owned by the UPDATES worker: navigable entries + placeholder bodies (do not implement here) ----
  function placeholder(title, what) {
    return function (R) { var h = H(R); return [h.section(title, [h.note(what), h.note('This page is provided by another module of Samara OS and is not part of this build yet.')])]; };
  }
  page('about', 'About phone', 'main', placeholder('About phone', 'Device name, model, OS build and seed version.'));
  page('sysupdate', 'System update', 'main', placeholder('System update', 'Check for, download and apply Samara OS updates.'));
  page('devopts', 'Developer options', 'main', placeholder('Developer options', 'Debug toggles, logs and the ROM inspector.'));

  // ---------- main menu (data) ----------
  // [group title, [ [glyph, title, page, color, subtitle(R)] ... ]]
  var MENU = [
    ['Connections', [['◠', 'Network', 'network', '#0a84ff', function (R) { return R.online() ? (R.pref('airplane') ? 'Airplane' : R.pref('wifi') ? R.pref('ssid') : 'Mobile data') : 'Offline'; }]]],
    ['Personalise', [
      ['◐', 'Wallpapers & themes', 'themes', '#bf5af2', function (R) { return R.S.theme + ' · ' + (R.wallpapers().filter(function (w) { return w.id === R.S.wallpaper; })[0] || { name: '' }).name; }],
      ['☼', 'Display', 'display', '#ff9f0a', function (R) { return 'Brightness ' + pct(R.S.brightness) + ' · text ' + R.pref('textSize').toUpperCase(); }],
      ['▦', 'Home screen', 'home', '#30d158', function (R) { return R.S.cols + ' × ' + R.S.rows + ' grid · dock ' + R.S.dock; }],
      ['♪', 'Sound & haptics', 'sound', '#ff375f', function (R) { return R.pref('silent') ? 'Silent' : 'Volume ' + R.S.volume + '%'; }],
      ['✉', 'Notifications', 'notifications', '#ff453a', function (R) { return R.S.dnd ? 'Do not disturb' : 'On'; }]]],
    ['Accessibility', [['♿', 'Accessibility', 'access', '#0a84ff', function (R) { var n = ['a11y.large', 'a11y.bold', 'a11y.contrast', 'a11y.motion', 'a11y.reader', 'a11y.switch', 'a11y.onehand'].filter(function (k) { return R.pref(k); }).length + (R.pref('a11y.filter') !== 'none' ? 1 : 0); return n ? n + ' on' : 'Default'; }]]],
    ['Device', [
      ['⚡', 'Battery', 'battery', '#30d158', function (R) { return Math.round(R.S.battery) + '%' + (R.S.charging ? ' charging' : '') + ' (simulated)'; }],
      ['▤', 'Storage', 'storage', '#8e8e93', function (R) { return fmtBytes(R.usage().total) + ' used'; }],
      ['☰', 'Apps', 'apps', '#5e5ce6', function (R) { return R.apps.length + ' apps'; }]]],
    ['Privacy & security', [
      ['⚑', 'Privacy & permissions', 'privacy', '#ff9f0a', function () { return 'Camera, location, network'; }],
      ['⚿', 'Security', 'security', '#64d2ff', function (R) { return R.hasPasscode ? 'PIN on' : 'Swipe to unlock'; }]]],
    ['System', [
      ['⌘', 'Language, region & time', 'locale', '#bf5af2', function (R) { return R.pref('lang').toUpperCase() + ' · ' + R.pref('region') + ' · ' + (R.pref('tz') === 'auto' ? 'device time' : 'fixed zone'); }],
      ['↻', 'Backup & reset', 'backup', '#30d158', function (R) { return R.pref('autosave') !== false ? 'Autosave on' : 'Autosave off'; }],
      ['ⓘ', 'About phone', 'about', '#8e8e93', function () { return 'Samara One'; }],
      ['⇣', 'System update', 'sysupdate', '#0a84ff', function () { return ''; }],
      ['⚙', 'Developer options', 'devopts', '#8e8e93', function () { return ''; }]]]
  ];
  page('main', 'Settings', null, function (R) {
    var h = H(R);
    return MENU.map(function (g) {
      return h.section(g[0], g[1].map(function (m) { return h.link(m[0], m[1], m[4] ? m[4](R) : '', m[2], m[3]); }));
    });
  });

  // ---------- API ----------
  function getDef(id, R) {
    if (PAGES[id]) return PAGES[id];
    var m = /^app:([\w-]+)$/.exec(id);
    if (m && R && R.appInfo(m[1])) return appPage(m[1]);
    return null;
  }
  var api = {
    PAGES: PAGES, MENU: MENU,
    has: function (id, R) { return !!getDef(id, R); },
    resolve: function (id, R) { return getDef(id, R) ? id : 'main'; },
    parent: function (id) { if (/^app:/.test(id)) return 'apps'; return PAGES[id] ? (PAGES[id].parent || 'main') : 'main'; },
    build: function (R, id) {
      var d = getDef(id, R) || PAGES.main, title = d.title;
      if (/^app:/.test(id) && R.appInfo(id.slice(4))) title = R.appInfo(id.slice(4)).name;
      return { title: title, kids: d.build(R) };
    },
    register: page   // page(id, title, parentId, build(R)) - how another module adds or replaces a page (e.g. about / sysupdate / devopts)
  };
  global.SamaraRings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
