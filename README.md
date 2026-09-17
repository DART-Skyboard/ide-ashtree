# Ash Tree IDE — Web

A browser-based coding environment for the **Ash Edge Language**, compiled by the **LEATR v2** engine, with the **Ash Map** visual mind-mapping tool.

Live at **[ide.leatr.xyz](https://ide.leatr.xyz)**.

Built by DART Meadow / Radical Deepscale LLC. This is a web port of the native [Ash Tree IDE iOS app](https://github.com/DART-Skyboard/AshtreeIDE-iOS) — same LEATR compiler, same Ash Map mind-mapping model, running entirely client-side (no server, no build step).

## Structure

- `index.html` — app shell
- `css/` — styling (base tokens, layout, editor, mind map, help)
- `js/leatr-engine.js` — LEATR v2 lexer/parser/compiler
- `js/mash-model.js` — Ash Map data model, themes, undo/redo, ASH⇄map generator
- `js/mash-canvas.js` — Ash Map interactive canvas (pan/zoom/drag/sockets)
- `js/editor.js` — syntax-highlighted Ash source editor
- `js/terminal.js`, `js/storage.js`, `js/help-content.js`, `js/app.js` — supporting modules

## Local development

No build step — just serve the directory:

```
python3 -m http.server 8080
```

Deployed automatically to GitHub Pages on every push to `main`.
