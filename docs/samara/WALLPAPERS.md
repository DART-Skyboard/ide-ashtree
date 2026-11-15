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
