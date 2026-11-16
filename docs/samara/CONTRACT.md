# SAMARA — phone OS for Ash  (architecture contract, v0.1)

An ash tree's winged seed is a *samara*. Everything in this stack is named from it.

| Thing | Name |
|---|---|
| Phone hardware (Justin's custom device) | **Samara One** |
| Operating system | **Samara OS** |
| IDE tab (web only) | **Grove** (the phone lab) |
| Source file extension | **`.ashos`** (Ash phone source; plain text, Ash node syntax) |
| Compiled ROM / OS image | **`.seed`** (a "seed" you plant in the simulator) |
| Compiler | **Seedpress** (`.ashos` -> `.seed`) |
| Simulator | **Canopy** |
| Calculator app | **Tally** |
| Notepad app | **Leaf** |
| Web browser app | **Drift** |
| Home / launcher | **Crown**; lock screen **Bark**; settings **Rings** |
| Embed page | `embed.html?src=<raw .seed URL>` |

## Files (OWNERSHIP — never edit another worker's files)
- Worker SYNTAX: `js/phone/samara-syntax.js`, `js/phone/seedpress.js`, `docs/samara/SYNTAX.md`, `tests/seedpress.test.js`
- Worker OS: `js/phone/samara-os.js`, `js/phone/canopy.js`, `css/canopy.css`
- Worker APPS: `phone/os/samara.ashos` (the demo OS: theme, layout, menus), `phone/apps/tally.ashos`, `leaf.ashos`, `drift.ashos`, `docs/samara/APPS.md`
- Worker GROVE: `js/phone/grove.js`, `js/github-auth.js`, `css/grove.css`, `embed.html`, edits to `index.html` + `js/app.js` (ONLY this worker touches those two; minimal additive edits, tab id `grove`)
- Worker PARITY: report only at `docs/samara/PARITY.md`; may fix small web bugs but not in files above.

## Pattern (Justin's Ash syntax, keep exactly)
```
import (SamaraHW)
{{env:Samara}}
[[script:tally-v1]]
(Name):-: {
  [net: ...] [poly: ...]
  with var (s) var (c) {
    irin ("Data: key=value key2=value2")
    ...statements...
  }
  irout ("Result: " placeto (s))
}|';'|
```
Natural tools Hammer/Puzzle/Stick/Maze/Envelope/Knife/Scissors keep their AshRuntime meaning. `Research (expr)` evaluates arithmetic (Tally uses it).

## Statement namespaces (one per hardware block; same dispatch style as ash-exec.js: every effect goes through `host.<ns>`)
- `sys.*`   sys.theme (name) | sys.layout (grid=4x5 dock=4) | sys.app (id) name= icon= glyph= color= entry=Node | sys.launch (id) | sys.home | sys.back | sys.notify (text) | sys.clock | sys.battery | sys.setting (key) value
- `ui.*`    ui.screen (id) title= | ui.text (id) text= size= align= | ui.button (id) label= | ui.input (id) placeholder= multiline= | ui.list (id) items= | ui.icon (id) glyph= | ui.row/ui.col/ui.grid | ui.set (id) prop=value | ui.on (id) tap|change|submit { ...statements... } | ui.menu (id) items=
- `gfx.*`    gfx.canvas (id) w= h= | gfx.rect/circle/line/text/image | gfx.clear | gfx.gl.<same as existing gl.* GL table> (maps to GLDrivers nodes)
- `cam.*`    cam.open (front|back) | cam.snap placeto (var) | cam.close  (getUserMedia in browser; synthetic test-pattern fallback when unavailable)
- `net.*`    net.fetch (url) placeto (var) | net.listen (node) {when (evt) = X} (existing) | net.status placeto (var)
- `store.*`  store.get (key) placeto (var) | store.set (key) with (var)   (per-seed localStorage namespace)
- `snd.*`, `sensor.*` (tilt/location), `power.*` (battery) : stubs with sensible simulator behaviour
- `input.*`  hardware keys: input.on (home|back|power|volup|voldown)

## ROM format `.seed` (JSON text, UTF-8)
```
{ "magic":"SAMARA-SEED", "format":1, "os":{"name":"Samara OS","version":"1.0.0"},
  "built":"ISO", "sha256":"<hex of canonical body>",
  "sources":{ "<path>": "<ashos text>" },      // kept so IDE can round-trip
  "manifest":{ "theme":"...", "layout":{...}, "apps":[{id,name,glyph,color,entry}], "boot":"Crown" },
  "program":{ "<NodeName>":[ {op:"ui.button", args:{...}, handlers:{tap:[...ops]}} , ...] } }
```
Seedpress API: `Seedpress.compile({files:{path:text}, entry:'phone/os/samara.ashos'}) -> {ok, seed, diagnostics:[{level,file,line,msg}]}`; `Seedpress.verify(seed)`; `Seedpress.serialize/parse`.
Canopy API: `Canopy.create(mountEl, {seed, theme?, onLog}) -> {boot(), shutdown(), press(key), screenshot(), destroy()}`; `Canopy.mountEmbed(el, seedUrl)`.
OS runtime is pure JS, no build step, runs under node for tests with a fake DOM-less host (`SamaraOS.createKernel(seed, host)`), the DOM layer lives in canopy.js.
All scripts attach to `window` (IIFE style like ash-exec.js) and `module.exports` when under node. No external deps except existing three.js CDN. Cache-bust `?v=`.

## GitHub (Grove)
- Sign in via GitHub OAuth *device flow* (client id `Ov23li2K0njEqO1WTSdD`, same as iOS app); browser CORS blocks github.com device endpoints, so route through the existing GAS proxy if it supports it, else fall back to Personal Access Token paste (stored in localStorage only; never commit tokens). 
- Private repo `Ash-Tree-IDE-Projects` (auto-created on first sign in, already exists for iOS users). Grove saves under `phone/<project>/` (sources) and `phone/<project>/build/<name>.seed`.
- Embed link: raw URL of a private file can't be fetched anonymously, so Grove offers (1) "Publish embed" -> writes the seed to a GitHub Gist/Pages-readable location the user chooses, and (2) token-less embed using a URL-fragment-encoded seed (`embed.html#seed=<base64url gzip>`) for small ROMs; embed.html also accepts `?repo=owner/name&path=...&token=` is NOT supported (never put tokens in URLs). Be explicit in UI about what is private vs public.

## Persistence (`js/phone/persist.js`, PERSIST pass)
Pure and host-injected (`{get,set,remove,blobGet,blobSet,blobRemove}`; `memoryHost()` for node, `browserHost()` = localStorage + IndexedDB).
Snapshot: `{magic:'SAMARA-SESSION', v:1, seedId, project, os, savedAt, settings, prefs, session, store, customWallpaper}` saved under
`samara:session:v1:<ns>`; `ns` = `seed:<sha12>` (plus `proj:<name>` fallback so edited ROMs keep their session). `parse()` never throws
(reasons: empty, corrupt, magic, version, newer, shape; bad text kept under `:invalid`). `attach({kernel,host,seedId,project})` gives
`saveNow/scheduleSave/flush/restore/factoryReset/exportBackup/importBackup/detach`; autosave is debounced, skipped while powered off.
Restore shows the toast "Restored last session". Kernel side: `exportSession/importSession/factoryReset/storageUsage/clearAppData`,
`setCustomWallpaper/clearCustomWallpaper`, `toast`, `getPref/setPref`.
GitHub (Grove): Save writes `phone/<project>/session/state.json` (+ `session/wallpaper.<ext>`); Open restores them via `GitHubAuth.putFiles`
(accepts `{base64}`) / `readBlobBase64`. Tokens are never stored in the snapshot.
Canopy extension points: `Canopy.registerLeaf(tag, fn)`, `Canopy.hook('kernel'|'boot'|'destroy', fn)`, `Canopy.create(el,{persist:false, project})`.
New leaf tags: listrow, switch, themecard, approw, bar, kv, filebtn. New system action ids: `@rings:*`, `@pref:*`, `@field:*`, `@act:*`, `@drawer:*`.
