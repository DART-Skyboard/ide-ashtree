# Samara OS apps (APPS worker)

Files: `phone/os/samara.ashos` (OS manifest + Crown/Bark/shade/menu + Rings + Lens), `phone/apps/tally.ashos`, `leaf.ashos`, `drift.ashos`.
Compile all four together (entry `phone/os/samara.ashos`); they compile with zero diagnostics under Seedpress (`samara-syntax.js` grammar in `SYNTAX.md`).

## Why the sources look the way they do

Ash has no `if`, loops, string slicing or dynamic lists. Everything below is built from what exists: `thenplace` (copy / interpolate into a var), `Research` (real arithmetic), `store.*`, `net.fetch`, and `ui.*`. So:

* **State shifting is explicit.** Undo stacks and history are chains of `thenplace (a) placeto (b)`.
* **Fixed slots instead of lists** (Leaf has 8 notes; Drift has 10 bookmarks, 10 recents and 8-deep back/forward stacks).
* **Branch-free error handling** (Drift pre-loads an error page, a successful fetch overwrites it).
* Repetitive sections of the three app files were expanded by a script; the committed source is plain Ash and can be edited by hand.

## Kernel behaviours these sources rely on

Please confirm in the OS kernel (docs/ by the OS worker):

1. `thenplace "<text with ${var}>" placeto (v)`: the source string is interpolated with `${name}`; a source that is a var name copies the var; `""` clears.
2. `ui.input (id) value=(var)` is two-way bound: typing updates `var`, `ui.set (id) value=(var)` pushes `var` into the field. `ui.text text=(var)` and `ui.button label=(var)` re-read the var when `ui.set` is called.
3. `ui.screen (id)` with an id that was declared earlier **shows** that screen. A node ends with `ui.screen (<first screen>)`. `sys.home` shows Crown's screen with id `home`.
4. `store.get (key) placeto (v)` leaves `v` untouched when the key is missing (apps set a default first). `store.set (key) with (v)` writes the string value. Dotted keys such as `leaf.body.3` are plain keys.
5. `net.fetch ($var) placeto (page)` is host-mediated; the host returns a plain-text rendition of the response (HTML stripped, links listed as text). On failure it must leave `page` unchanged (Drift's error text then stays visible) or put its own message there.
6. `sys.setting (theme) <name>` switches theme at runtime (`sys.theme` is manifest-only). Themes expected: `ash` (default), `birch`, `dusk`, `ember`, `ink`. `sys.setting (brightness) 0..1`.
7. `ui.set (id) items=(var)` accepts a comma-separated string.
8. Multiple statements on one line are separated by `;` (Seedpress requirement).

## Samara OS (`samara.ashos`)

Manifest: `sys.theme (ash)`, `sys.layout grid=4x5 dock=4`, `sys.boot (Crown)`, apps Tally, Leaf, Drift, Lens, Rings.

* **Crown** (boot node): `home` screen with big clock widget (`sys.clock`) and battery line; buttons: Notifications, All apps, Lock. `menu` screen: launch buttons for every app. `shade` screen: notification list, brightness presets, test notification (calls `sys.notify` and prepends to a list), clear. **Bark** (`bark` screen) is the lock screen shown at boot: clock, latest notification, Unlock. Hardware keys: home/back go to `home`, power sleeps and locks, volume keys set volume.
* **Rings**: theme buttons (Ash, Birch, Dusk, Ember, Ink), brightness 30/60/100, volume mute/50/100, about (version, battery, charging, network).
* **Lens**: opens `cam.open (back)`, Rear/Front switch, Shutter does `cam.snap` and draws the frame with `gfx.image` on a canvas. Falls back to the host test pattern when no camera. Gallery was left out.

## Tally (calculator)

Screen `calc`: two display lines (expression, live result), 4-column keypad `AC <- % /`, `7 8 9 *`, `4 5 6 -`, `1 2 3 +`, `+/- 0 . =`; History and Home buttons.

* Evaluation is real: the keypad appends text to the string var `expr` (`thenplace "${expr}7" placeto (expr)`) and `Research (expr) placeto (res)` evaluates it with the AshRuntime evaluator (+ - * / ^, parentheses, sqrt, sin, etc.). `res` previews after every key; an incomplete expression (ends in an operator) leaves the last preview.
* `%` wraps as `(expr)/100`, `+/-` as `-(expr)`.
* `<-` is a 6-deep undo stack (`u1..u6`); every key first pushes the old expression. It restores the prior expression rather than deleting one character, because Ash cannot slice strings.
* `=` evaluates, prepends `expr = res` to `hist`, stores it at `tally.hist` and sets `expr` to the result, so you can keep calculating from it.
* History screen `histscr`: list, Clear history, Back.

## Leaf (notepad)

List screen `list` with 8 slot buttons labelled with each note's title (`+ New note` = empty). Each slot has its own screen `edit1..edit8`: title input, multiline body input, Save, Delete, Back.

* Persistence: `leaf.title.N` and `leaf.body.N` through `store.set`, loaded at boot with `store.get`.
* Save updates the list label and notifies; Delete resets title/body and clears storage. Create = open an empty slot.
* Fixed slots are the price of Ash having no dynamic lists. To get more notes, raise `N` and regenerate the repeated blocks (see "Writing another app").

## Drift (browser)

A real browser: `ui.web` embeds each page in a sandboxed iframe, so the host browser engine renders everything (HTML5/CSS/SVG/WebGL/three.js/JS/wasm, video, audio, images). Source `phone/apps/drift.ashos` (generated from a template, committed as plain Ash; repetitive slot code is expanded). It needs three small kernel/syntax features that exist in the kernel: `call (Node)`, `if cond="..." { }` and `ui.on (web) load { }`; the syntax table now accepts them (see SYNTAX.md).

One screen, `main`, whose content switches by CSS class (`dhide`, set with `ui.set (id) cls=(var)` and recomputed by `DriftSync`), so Samara's app-bar back arrow never appears and the page is not torn down when you open the bookmark editor:

* **Toolbar row 1:** back, forward, reload (bumps the `reload=` counter), home (start page), mode toggle (`MOBILE ⇄` / `DESKTOP ⇄`, the label is the current mode), star (filled when the current address is bookmarked; tapping toggles the bookmark). **Row 2** (hidden on the start page): full-width address field, Go (Enter = `ui.on (urlin) submit`).
* **Start page** (`cur` is empty): big search/address field, bookmark tiles (`ui.grid cols=2`, 4 columns in landscape via `.cnp-device.landscape`), Edit bookmarks, Recent (last 10 addresses, hidden when empty), Clear history.
* **Browsing:** a one-time muted hint (persisted `drift.hint`) says links tapped inside a page navigate within the frame but the address bar cannot follow (cross-origin frames cannot report their URL or title), then the `ui.web` view fills the remaining height, then a slim footer status ("Loading ..." then "Loaded <address> - <mode> layout", set by `ui.on (view) load`). The frame's own chip opens a page that refuses embedding in a normal tab.
* **Typed text is passed through as-is.** The host's `normalizeUrl` turns it into `https://...` or a web search (Bing: DuckDuckGo refuses to be framed). `javascript:` / `data:` are rejected.
* **Mode:** `drift.mode` (`mobile` default, persisted with `drift.mode2`, `drift.modeL`, `drift.modeL2`, which are the swapped label/other-mode pair because Ash has no string compare to derive them). `mode=(mode)` on the web view re-lays out the page (desktop = 1280px layout scaled to fit) without reloading it.
* **History:** URL-only var stacks, back `h1..h8`, forward `f1..f8` (`-` = empty). Go, tiles, recents and the edit list run `DriftGo`: push `cur` on the back stack, clear forward, set `cur`, push recents, `DriftShow`. `DriftBack` / `DriftFwd` shift the stacks and re-navigate by setting `cur`. The empty address is the start page, so Back from the first page returns to the start page. Hardware Back: leave the editor, else Back, else home.
* **Bookmarks:** 10 slots `drift.bm.1..10`. Defaults: dartmeadow.com, radicaldeepscale.com, leatr.xyz, cube.leatr.xyz, then sites that allow framing (en.wikipedia.org, threejs.org/examples, developer.mozilla.org, archive.org, openstreetmap.org), one free slot. The star puts the current address in slot 1 (older ones shift down; the last falls off) or removes it if it is already bookmarked. "Edit bookmarks" lists the slots with a remove button each (`DriftRm1..10` shift the later ones up) and "Restore default bookmarks". Recents `drift.rc.1..10`.
* **Routines** are extra nodes run with `call`: `DriftGo DriftBack DriftFwd DriftShow DriftSync DriftSaveB DriftSaveR DriftDefaults DriftRm1..10`. They share the app's vars and widgets.
* **Limits, stated in the UI:** the address bar shows what you asked for, not where in-page links went; some sites refuse framing (blank page or "refused to connect", use the frame chip); desktop layout is scaled, not a different engine; opening the start page tears down the frame, so Forward re-loads the page.

## Writing another app

1. Create `phone/apps/<name>.ashos` with one node named like the app:
```
import (SamaraHW)
{{env:Samara}}
[[script:note-v1]]
(Note):-: {
  with var (s) var (msg) { irin ("Data: s=0") }
  thenplace "hello" placeto (msg)
  ui.screen (main) title="Note" {
    ui.text (t) text=(msg) size=20
    ui.button (go) label="Go"
  }
  ui.on (go) tap { thenplace "${msg}!" placeto (msg); ui.set (t) text=(msg) }
  input.on (back) { sys.home }
  ui.screen (main)
}|';'|
```
2. Register it in `samara.ashos`: `sys.app (note) name="Note" glyph="n" color=#ff2d55 entry=Note`, and add a launch button in Crown's `menu` screen (`sys.launch (note)`).
3. Include the file in the `files` map given to `Seedpress.compile`; node and screen/widget ids must be unique across the node (use prefixes such as `n1`, `ti1`).
4. Rules of thumb: separate same-line statements with `;`; persist with `store.get/set` using dotted keys prefixed by the app name; compute with `Research`; finish the node with `ui.screen (<first screen>)`; always provide a way back (`input.on (back)` and a Home button).

## Visual design layer (STYLE pass)

All styling lives in `css/canopy.css` (section "Samara OS design layer") and reads only theme variables (`--bg --surface --surface2 --text --dim --accent --on-accent --border --danger --ok`), so all six themes (Ash Dark, Ash Light, Ember, Moss, Mist, Midnight) stay legible. Spacing is an 8px scale; touch targets are >= 44px; `.cnp-input` is 16px+ and `flex:1; min-width:0`.

Button `kind=` values used by the apps (the canopy `button` leaf turns `kind=x` into class `k-x`; `kind` is not yet in the syntax table's known keys, so Seedpress reports a harmless "unknown key" warning):

| kind | look | used for |
|---|---|---|
| `primary` / `go` | accent gradient pill (`go` is a fixed 76px column) | Save, Shutter, Drift Go |
| `tonal` | accent-tinted | Home / History / Back-to-list |
| `danger` / `acc` | danger-tinted | Delete, Clear history, Tally AC |
| `card` | left-aligned list row with accent bar and chevron (compact tile inside a `ui.grid` in Drift) | Leaf notes, Drift bookmarks and recents |
| `tool` | square glyph button | Drift back/forward/reload/home/star |
| `mode` / `x` / `hint` | Drift: accent pill mode toggle, fixed 52px remove button, muted hint strip | Drift (`canopy-web.css`) |
| `tab` | 13px pill | Drift footer |
| `glass` | translucent blurred plate | Crown home shortcuts |
| `fn` / `op` / `eq` | Tally keypad: function, operator (accent tint), equals (accent solid) | Tally |

Layout hooks (no per-app class exists, so the CSS keys off structure): a `ui.text` with `size=40` / `22` inside a scroll that also contains a grid is the Tally display / result; `size=14` is the Drift reading card; `size=11` the status line; the first `ui.col` of a scroll is Drift's sticky toolbar. Tally keys use the unicode operators `÷ × − ⌫ ±` (labels only; the handlers still append ASCII).

Drift: row 1 `‹ › ↻ ⌂ MODE ☆`, row 2 full-width address field + Go, then the web view and a status footer; Drift's own CSS is at the end of `css/canopy-web.css`.

Orientation: every layout has a `.cnp-device.landscape` re-flow: home is widgets-left / icon grid + dock right, Tally is display-left / keypad-right, Leaf and Rings go two-column, Lens is viewfinder-left / controls-right, Drift's toolbar becomes one row, the lock screen puts clock left and notifications right. Icon labels, the clock and widget plates use translucent blurred plates and text halos so they stay readable over any wallpaper. The wallpaper layer (`.cnp-wall`) is not touched.
