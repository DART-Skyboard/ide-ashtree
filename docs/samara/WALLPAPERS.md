# Samara OS wallpapers

`js/phone/wallpapers.js` is a self-contained, fully procedural wallpaper pack (no network assets, ~58 KB).
It attaches `window.SamaraWallpapers` (and `module.exports`).

```js
SamaraWallpapers.list   // [{ id, name, animated, css, tags }]  css = CSS background used as the picker thumbnail
var h = SamaraWallpapers.mount(id, el, { dark: true, accent: '#00ffcc', bg: '#07140f' });
h.pause(); h.resume(); h.resize(); h.stop();
h.setOptions({ dark, accent, bg });   // re-theme in place (extra, optional)
```

`mount` inserts one `<canvas data-samara-wallpaper>` (absolute, `inset:0`, 100% x 100%) into `el`. It re-flows by aspect
ratio through a `ResizeObserver` (portrait 360x780 <-> landscape 780x360), renders at devicePixelRatio times the CSS scale
of the phone frame (animated cap 2, static cap 3, plus a pixel budget), runs at most 30 fps, pauses while
`document.hidden` or after `pause()`, draws a single still frame under `prefers-reduced-motion`, and `stop()` cancels the RAF,
disconnects the observers/listeners and removes the canvas.

## Pack

| id | name | animated | notes |
|----|------|----------|-------|
| samara-drift | Samara Drift | yes | winged ash seeds spiralling through soft light shafts |
| ash-rings | Ash Rings | yes | growth rings, warm wood to teal pith, travelling pulse |
| canopy-light | Canopy Light | yes | dappled sun through ash leaves, parallax sway |
| night-grove | Night Grove | yes | stars, moon, fireflies, silhouetted ash (always dark) |
| aurora-veil | Aurora Veil | yes | layered sine-field curtains over a conifer ridge |
| ember-flow | Ember Flow | yes | rising embers (warm; a few accent sparks) |
| tide-lines | Tide Lines | yes | flow-field streamlines drifting through a noise field |
| meridian | Meridian | yes | slow gradient-mesh blobs and a turning wire globe |
| mist-valley | Mist Valley | no | layered ridgelines with atmospheric perspective |
| moss-stone | Moss Stone | no | relaxed Voronoi stones with moss speckle |
| midnight-bloom | Midnight Bloom | no | phyllotaxis petals in the accent colour (always dark) |
| paper-grain | Paper Grain | no | fibres, tree-ring watermark; the light-theme friendly one |

All wallpapers honour `opts.dark` (light themes get pale variants; Night Grove and Midnight Bloom are intentionally dark),
`opts.accent` (adapted for contrast per mode) and `opts.bg`. Every one has vignette + film grain baked in against banding,
and keeps contrast moderate around the icon area.

## Performance design

Scenes bake their static layers on resize and composite only a few things per frame. Soft scenes (Ash Rings, Canopy Light,
Aurora Veil, Meridian, Ember Flow, Tide Lines, Night Grove) render at a reduced resolution factor (`res`) and let the browser
upscale the canvas; in headless Chromium (software raster, forced flush) a frame costs about 0.5-4 ms.
`handle._renderOnce(t[, noFlush])` is a test helper returning the milliseconds for one frame.

## Hooks

`samara-os.js` lists `SamaraWallpapers.list` entries as selectable wallpapers (`live:true`); `canopy.js` mounts the chosen id into
the wallpaper layer and pauses it when the screen is off. Note: Canopy mounts once per wallpaper id, so a theme change while a
live wallpaper is active does not re-theme it unless Canopy calls `handle.setOptions({dark, accent, bg})` or remounts.

## Theme art and custom wallpaper (PERSIST pass)

**Theme art** (`js/phone/theme-art.js`, `SamaraThemeArt`): six original SVG scenes, one per built-in theme
(Ash Dark, Ash Light, Ember, Moss, Mist, Midnight), generated from a seeded PRNG so they are tiny and deterministic.
`svg(theme,{w,h,tokens})`, `card`, `accent`, `dataUri`, `css`, `cardUri`, `accentUri`. Unknown (ROM-defined) themes fall back to the Ash Dark
scene tinted with that theme's own accent/bg. The pseudo-wallpaper **`themeart`** uses the current theme's scene as lock/home art.
Checked-in copies live in `phone/assets/themes/` (portrait, landscape, accent per theme); regenerate with `node tools/gen-theme-art.js`.

**Custom wallpaper** (`SamaraWallpapers.custom`, pseudo-wallpaper **`custom`**): the user imports png/jpg/webp/gif/avif (jxl only where the browser
decodes it; gif = first frame). The image is downscaled on a canvas to <= 2560 px, stored in IndexedDB (localStorage fallback) and referenced by
the session. Options: fit `fill|fit|center`, `dim` 0-80 %, `blur` 0-20 px (`wp.dim`, `wp.blur`, `@act:wp-fit:<mode>`). Entry points: Rings > Wallpapers & themes,
and the Grove toolbar "Import wallpaper" (`inst.importWallpaper(file)` / `inst.pickWallpaper()` / `inst.removeWallpaper()`).
ROM-defined wallpapers keep working; `custom` only appears in the chip list once an image exists. The image is included in the GitHub backup
(`session/wallpaper.<ext>`).
