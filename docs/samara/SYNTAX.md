# Samara OS source syntax (`.ashos`) and the `.seed` IR

Other workers depend on the IR described here. Source of truth: `js/phone/samara-syntax.js` (table + parser), `js/phone/seedpress.js` (compiler).

## IR reference (read this first)

`Seedpress.compile({files, entry})` returns `{ok, seed, diagnostics}`. `seed.program` maps each node name to an array of **ops**.

```
op := {
  op:       "ui.button",          // dotted statement name, see the table below, or a core op
  args:     { id:"b1", label:"OK", ... },   // always present, may be {}
  line:     12,                    // 1-based source line (debugging only)
  handlers: { tap:[op,...] },      // ONLY on ui.on / input.on / net.listen
  children: [op,...]               // ONLY on ui.screen / ui.row / ui.col / ui.grid that had a { } block
}
```

Argument values: `string`, `number`, `boolean`, `string[]` (only `items=`), or a **variable reference** `{ "$var": "name" }` (source `(name)` or `$name` where a value is expected, e.g. `text=(s)`). Strings may contain `${name}` for the kernel to interpolate; the compiler does not touch them. Positional `(x)` groups become named args per the table (`ui.button (go)` -> `args.id`). `placeto (v)` -> `args.placeto = "v"`, `with (v)` -> `args["with"] = "v"` (variable *names*, plain strings).

Core (Ash) ops, not in the namespace table:

| op | args | source |
|---|---|---|
| `var` | `{name}` | `var (x)`, also each `var (..)` inside `with var (a) var (b) {` |
| `irin` | `{vars:{k:v,...}}` for `"Data: k=v k2=v2"`; `{text}` for any other irin string | `irin ("Data: a=1 b=hi")` |
| `irout` | `{parts:[{lit:"Result: "},{$var:"s"}]}` | `irout ("Result: " placeto (s))` |
| `tool` | `{name:"Hammer"\|"Puzzle"\|"Stick"\|"Maze"\|"Envelope"\|"Knife"\|"Scissors", target?}` | natural tools, AshRuntime meaning |
| `research` | `{expr:"mass * g", placeto?}` | `Research (mass * g) placeto (s)` (arithmetic, see ash-runtime `_evalExpr`) |
| `report` | `{expr, placeto?}` | `Report (...)` |
| `thenplace` | `{src, placeto}` | `thenplace s placeto (t)` |
| `tag` | `{kind, value}` | `{{env:Samara}}` `[[script:x]]` `[net: ...]` `[poly: ...]`; tags before the node header or on a standalone line inside a node become `tag` ops in that node; `[net:..]` written on a `net.listen` line is stored as `args.tag` instead |

Behaviours the kernel can rely on:

* **Manifest statements are not ops.** `sys.theme`, `sys.layout`, `sys.app`, `sys.boot` are lifted into `seed.manifest` and removed from `program`. They may appear at top level or inside any node.
* `import (X)` is dropped from the program (kept nowhere but the sources).
* `ui.on (id) tap|change|submit { ... }` -> `{op:"ui.on", args:{id,event}, handlers:{tap:[...]}}`.
* `input.on (home|back|power|volup|voldown) { ... }` -> `{op:"input.on", args:{key}, handlers:{press:[...]}}`.
* `net.listen (node) [net:..] {when (evt) = X}` (Justin's one-line form) -> `{op:"net.listen", args:{node, when:"evt", event:"X", tag?}, handlers:{X:[...]}}`. In the one-line form **every op after it in the same node** is moved into `handlers.X` (exactly the ash-exec.js semantics: statements after a listen run once per matching event). The block form `net.listen (n) { when (evt) = X ... }` puts the block body in `handlers.X`.
* `gfx.gl.*` ops carry `args.glNode` (the GLDrivers node name: `ThreeScene`, `CameraNode`, ..., `startRenderLoop` for `gfx.gl.render`), `args.name` (explicit `(name)` or the enclosing node name), and `args.params`: the text of a colon-style `irin ("...")` directly before the statement (that irin op is consumed). Host call: `host.gl.call(glNode, params, name)`. The legacy spelling `gl.scene` etc. is accepted and emitted as `gfx.gl.scene`.
* `cam.open` always has `args.facing` (`"back"` default).
* Ops inside a `with var (..) { }` block are emitted flat into the node (the `with` wrapper is transparent).

> Versioning, release metadata (`seed.meta`, hashed when present) and OTA updates are specified in `docs/samara/UPDATES.md`.

## Seed envelope

```
{ magic:"SAMARA-SEED", format:1, os:{name:"Samara OS",version:"1.0.0"}, built:"ISO",
  sha256:"<hex>", sources:{path:text},
  manifest:{ theme:"ash", layout:{grid:"4x5",cols:4,rows:5,dock:4},
             apps:[{id,name,glyph,color,entry}], boot:"Crown" },
  program:{ NodeName:[op,...] } }
```

* `sha256` = SHA-256 (UTF-8) of the canonical JSON (keys sorted recursively, no whitespace) of `{magic, format, os, sources, manifest, program}`. `built` is excluded so rebuilds are reproducible. `Seedpress.verify(seedOrText)` -> `{ok, errors[], expected, actual}`; it also checks that `boot` and every app `entry` exist in `program`.
* Manifest defaults when undeclared: theme `ash`, layout 4x5 dock 4, boot `Crown`. `sys.app`: `name` defaults to the id, `glyph` falls back to `icon=` then the id's first letter, `color` to `#8899aa`, `entry=` is required.
* Diagnostics: `{level:"error"|"warn", file, line, msg}`. Errors (compile fails, `seed` is null): unknown statement, missing/extra required args, bad event/key, unbalanced braces, statement outside a node, duplicate node or app id, missing entry file, missing boot node, missing app entry node. Warnings: unknown `key=` on a known statement.
* API: `Seedpress.compile / verify / serialize(seed, pretty?) / parse(text) / sha256(str)`; `SamaraSyntax.TABLE / parseStatement(line) / parseSource(text, file)`.
* Load order in the browser: `samara-syntax.js` then `seedpress.js`. Node: `require` either.

## Source grammar

```
import (SamaraHW)                       // ignored by the compiler
{{env:Samara}}   [[script:tally-v1]]    // tags
(Name):-: {                             // node; closes with  }|';'|   (a bare } also works)
  [net: ...] [poly: ...]                // tags
  with var (s) var (c) {                // declares vars; block is transparent
    irin ("Data: s=0 c=1")
  }
  ns.statement (positional) key=value key="quoted value" key=(var) placeto (v) with (v)
  ui.on (id) tap { ...statements... }   // handler blocks nest
  irout ("Result: " placeto (s))
}|';'|
```

* One statement per line (or separate with `;`). Comments: `//` to end of line. Strings use `"` with `\"` escapes. Parentheses may span lines and nest (`Research (a * (b + 1))`).
* Key values: bare words (`color=#fff`, `grid=4x5`), numbers, `true/false`, quoted strings, `(var)`/`$var`. `items=a,b,c` becomes an array.
* One file = any number of nodes. All files passed to `compile` are parsed; node names must be unique across files.

## Statement table

Positional slots in `( )` are required, `[ ]` optional. `?` after `placeto` means optional. `host.X` is the function the kernel host implements (called with `op.args`).

| statement | arguments | host | meaning |
|---|---|---|---|
| `sys.theme` | (name) | `host.sys.theme` | Select the OS colour theme (manifest). |
| `sys.layout` | grid= dock= | `host.sys.layout` | Home grid "CxR" and dock slot count (manifest). |
| `sys.app` | (id) name= icon= glyph= color= entry= | `host.sys.app` | Register a launcher app (manifest). |
| `sys.boot` | (node) | `host.sys.boot` | Boot node (manifest); default Crown. |
| `sys.launch` | (id) | `host.sys.launch` | Launch an app by id. |
| `sys.home` |  | `host.sys.home` | Go to the home screen. |
| `sys.back` |  | `host.sys.back` | Navigate back. |
| `sys.notify` | (text) title= | `host.sys.notify` | Show a notification. |
| `sys.clock` | placeto (var)? | `host.sys.clock` | Current time string into var. |
| `sys.battery` | placeto (var)? | `host.sys.battery` | Battery percent into var. |
| `sys.setting` | (key) [value] placeto (var)? | `host.sys.setting` | Get (placeto) or set a system setting. |
| `sys.meta` | key=value... | manifest | Release metadata (version, build, channel, id, schema, minKernel, feed, notes) -> `seed.meta`. See UPDATES.md. |
| `sys.migrate` | (fromVer) op= key= to= value= | manifest | Declarative state migration (rename/set/default/delete) -> `seed.meta.migrations`. |
| `sys.about` | (refresh\|tapbuild\|copy) | `kernel` | System info into `about_*` variables. |
| `sys.update` | (action) [value] | `host.update` | OTA: check/download/apply/primary/rollback/channel/auto/schedule/simulate. |
| `sys.dev` | (action) [value] | `kernel` | Developer options: enable/disable/toggle/log/skipclock/factoryreset. |
| `ui.screen` | (id) title= parent= { children }? | `host.ui.screen` | Declare / show a screen. |
| `ui.text` | (id) text= size= align= color= parent= | `host.ui.text` | Static or bound text. |
| `ui.button` | (id) label= color= parent= w= h= | `host.ui.button` | Push button; pair with ui.on (id) tap. |
| `ui.input` | (id) placeholder= multiline= value= parent= | `host.ui.input` | Text field. |
| `ui.web` | (id) url= mode= reload= h= | `host.ui.web` | Real web view (sandboxed iframe): url=(var) mode=(var)\|desktop\|mobile reload=(counter var, bump to reload) h=N; `ui.on (id) load { }`. |
| `ui.list` | (id) items= parent= | `host.ui.list` | List of items (comma list or var). |
| `ui.icon` | (id) glyph= color= size= parent= | `host.ui.icon` | Glyph icon. |
| `ui.row` | (id) gap= parent= { children }? | `host.ui.row` | Horizontal container. |
| `ui.col` | (id) gap= parent= { children }? | `host.ui.col` | Vertical container. |
| `ui.grid` | (id) cols= gap= parent= { children }? | `host.ui.grid` | Grid container. |
| `ui.set` | (id) any key=value | `host.ui.set` | Set widget properties: ui.set (id) text=.. color=.. |
| `ui.on` | (id) (event) { handlers } | `host.ui.on` | Event handler block. Events: tap, change, submit, load (ui.web finished loading). |
| `call` | (node) | kernel `call` | Run another node's ops in this app (shared vars and widgets), like a subroutine (depth <= 16). |
| `if` | cond="..." { children } | kernel `if` | Conditional block: `if cond="${a}==${b}" { ... }` with `== != < > <= >=` after `${var}` interpolation; no else, use a second `if`. |
| `ui.menu` | (id) items= parent= | `host.ui.menu` | Menu of items. |
| `gfx.canvas` | (id) w= h= | `host.gfx.canvas` | 2D canvas surface. |
| `gfx.rect` | [id] x= y= w= h= color= fill= radius= | `host.gfx.rect` | Filled rectangle. |
| `gfx.circle` | [id] x= y= r= color= fill= | `host.gfx.circle` | Circle. |
| `gfx.line` | [id] x1= y1= x2= y2= color= width= | `host.gfx.line` | Line. |
| `gfx.text` | [id] x= y= text= size= color= | `host.gfx.text` | Text on canvas. |
| `gfx.image` | [id] x= y= w= h= src= | `host.gfx.image` | Image on canvas. |
| `gfx.clear` | [id] color= | `host.gfx.clear` | Clear canvas. |
| `gfx.gl.scene` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node ThreeScene (preceding irin ("..") text becomes params). |
| `gfx.gl.camera` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node CameraNode (preceding irin ("..") text becomes params). |
| `gfx.gl.light` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node LightNode (preceding irin ("..") text becomes params). |
| `gfx.gl.geometry` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node GeometryNode (preceding irin ("..") text becomes params). |
| `gfx.gl.material` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node MaterialNode (preceding irin ("..") text becomes params). |
| `gfx.gl.mesh` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node MeshNode (preceding irin ("..") text becomes params). |
| `gfx.gl.animate` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node AnimateNode (preceding irin ("..") text becomes params). |
| `gfx.gl.shader` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node ShaderNode (preceding irin ("..") text becomes params). |
| `gfx.gl.particle` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node ParticleNode (preceding irin ("..") text becomes params). |
| `gfx.gl.load` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node GLBLoader (preceding irin ("..") text becomes params). |
| `gfx.gl.ui` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node UIOverlayNode (preceding irin ("..") text becomes params). |
| `gfx.gl.arcedge` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node ArcEdgeNode (preceding irin ("..") text becomes params). |
| `gfx.gl.render` | [name] any key=value placeto (var)? | `host.gl.call` | GLDrivers node startRenderLoop (preceding irin ("..") text becomes params). |
| `cam.open` | [facing] | `host.cam.open` | Open camera: front|back (default back). |
| `cam.snap` | placeto (var) | `host.cam.snap` | Capture a frame into var. |
| `cam.close` |  | `host.cam.close` | Close camera. |
| `net.fetch` | (url) method= body= placeto (var)? | `host.net.fetch` | HTTP GET (host-mediated) into var. |
| `net.listen` | (node) { handlers } | `host.net.listen` | Listen for events: net.listen (n) [net:..] {when (evt) = X}. |
| `net.status` | placeto (var)? | `host.net.status` | Connectivity status into var. |
| `store.get` | (key) placeto (var) | `host.store.get` | Read per-seed storage into var. |
| `store.set` | (key) with (var) | `host.store.set` | Write var to per-seed storage. |
| `snd.play` | [src] volume= loop= | `host.snd.play` | Play a sound (stub). |
| `snd.stop` |  | `host.snd.stop` | Stop sound. |
| `snd.volume` | (level) | `host.snd.volume` | Set volume 0..1. |
| `snd.beep` | freq= ms= | `host.snd.beep` | Beep. |
| `sensor.tilt` | placeto (var)? | `host.sensor.tilt` | Tilt {x,y,z} into var. |
| `sensor.location` | placeto (var)? | `host.sensor.location` | Location {lat,lon} into var. |
| `power.battery` | placeto (var)? | `host.power.battery` | Battery percent into var. |
| `power.charging` | placeto (var)? | `host.power.charging` | Charging flag into var. |
| `power.sleep` |  | `host.power.sleep` | Screen off. |
| `power.wake` |  | `host.power.wake` | Screen on. |
| `input.on` | (key) { handlers } | `host.input.on` | Hardware key handler: home|back|power|volup|voldown. |
| `input.haptic` | [ms] | `host.input.haptic` | Vibrate. |

## Examples, one per namespace

```
// sys: manifest + control
sys.theme (ash)
sys.layout grid=4x5 dock=4
sys.app (tally) name="Tally" glyph="+" color=#ff9500 entry=Tally
(Bark):-: {
  with var (t) { }
  sys.clock placeto (t)
  sys.notify ("Welcome back")
  sys.setting (brightness) 0.8
  sys.setting (brightness) placeto (b)
}|';'|

// ui: screens, widgets, handlers
(Tally):-: {
  with var (s) { irin ("Data: s=0") }
  ui.screen (main) title="Tally"
  ui.row (r1) gap=8 {
    ui.text (disp) text=(s) size=40 align=right
    ui.button (eq) label="="
  }
  ui.on (eq) tap {
    Research (s) placeto (s)
    ui.set (disp) text=(s)
  }
  ui.list (hist) items=one,two,three
  ui.input (box) placeholder="Type" multiline=true
  ui.on (box) submit { sys.notify ("sent") }
}|';'|

// gfx: canvas + GLDrivers (identical GL table as ash-exec.js)
(Art):-: {
  gfx.canvas (cv) w=240 h=240
  gfx.clear (cv) color=#000
  gfx.rect (cv) x=10 y=10 w=50 h=30 color=#0f8
  gfx.circle (cv) x=120 y=120 r=40 color=#f08
  gfx.line (cv) x1=0 y1=0 x2=240 y2=240 color=#fff width=2
  gfx.text (cv) x=8 y=230 text="hello" size=14
  irin ("color=0x00ffcc size=2")
  gfx.gl.scene
  gfx.gl.mesh (cube)
  gfx.gl.render
}|';'|

// cam
(Snap):-: {
  cam.open (back)
  cam.snap placeto (photo)
  cam.close
}|';'|

// net (net.listen one-line form: later statements run per event)
(Feed):-: {
  net.fetch (https://example.com/feed.json) placeto (page)
  net.status placeto (st)
  net.listen (feed) [net: wss] {when (evt) = ping}
  irout ("got " placeto (evt))
}|';'|

// store (per-seed persistence)
(Leaf):-: {
  store.get (note) placeto (note)
  ui.on (ed) change { store.set (note) with (note) }
}|';'|

// snd
(Chime):-: {
  snd.volume (0.5)
  snd.beep freq=880 ms=120
  snd.play (chime.wav) loop=false
  snd.stop
}|';'|

// sensor
(Level):-: {
  sensor.tilt placeto (t)
  sensor.location placeto (loc)
}|';'|

// power
(Meter):-: {
  power.battery placeto (pct)
  power.charging placeto (chg)
  power.sleep
  power.wake
}|';'|

// input: hardware keys
(Keys):-: {
  input.on (home) { sys.home }
  input.on (back) { sys.back }
  input.on (power) { power.sleep }
  input.haptic (20)
}|';'|
```

Natural tools and Research (Ash core):

```
(Calc):-: {
  with var (mass) var (g) var (s) { irin ("Data: mass=2 g=9.81") }
  Research (mass * g) placeto (s)
  Hammer
  irout ("Force: " placeto (s))
}|';'|
```
