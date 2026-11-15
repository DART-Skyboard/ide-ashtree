# Samara OS apps (APPS worker)

Files: `phone/os/samara.ashos` (OS manifest + Crown/Bark/shade/menu + Rings + Lens), `phone/apps/tally.ashos`, `leaf.ashos`, `drift.ashos`.
Compile all four together (entry `phone/os/samara.ashos`); they compile with zero diagnostics under Seedpress (`samara-syntax.js` grammar in `SYNTAX.md`).

## Why the sources look the way they do

Ash has no `if`, loops, string slicing or dynamic lists. Everything below is built from what exists: `thenplace` (copy / interpolate into a var), `Research` (real arithmetic), `store.*`, `net.fetch`, and `ui.*`. So:

* **State shifting is explicit.** Undo stacks and history are chains of `thenplace (a) placeto (b)`.
* **Fixed slots instead of lists** (Leaf has 8 notes, Drift 6 bookmarks and 4 history pages).
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

Screens `browser` and `marks`.

* Top bar: Back `<`, Forward `>`, address input (submit = Go), Go, Reload `R`. Page area shows the text in var `page`. Footer: Home, Bookmark this, Bookmarks, Exit.
* Navigation (`ui.on (url) submit`, Go, bookmark buttons) pushes the current page onto a 4-deep back stack (address `ba1..4` plus page text `bp1..4`, so Back is instant and offline), clears forward, then:
  1. `thenplace "Could not load ${addr}. ... (CORS) ..." placeto (page)` pre-loads the in-app error page,
  2. `net.fetch ($addr) placeto (page)` overwrites it on success.
  So a CORS or offline failure shows a clear error page with advice, no crash, no blank screen.
* `drift://home` is a built-in page held in var `homepage` (works offline) listing the bookmarks and how to use Drift. Home restores it; typing `drift://home` in the bar is not a fetchable URL and shows the error page that says "press Home".
* Bookmarks: 6 slots `drift.bm.1..6` in `store.*`. "Bookmark this" shifts the list and puts the current address first. Defaults are CORS-friendly: GitHub zen/octocat, Wikipedia REST summary (Ash tree), catfact.ninja, httpbin uuid, and `https://example.com` (no CORS: demonstrates the error page).
* Limit: Ash cannot parse HTML, so link following is by URL bar and bookmarks, not by clicking links inside a fetched page. Rendering is whatever text the host returns.

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
