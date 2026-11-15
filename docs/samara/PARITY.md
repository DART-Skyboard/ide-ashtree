# Web IDE vs iOS app parity audit

Compared: web `DART-Skyboard/ide-ashtree` (branch `samara-parity`) against `DART-Skyboard/AshtreeIDE-iOS` (default branch, shallow clone, read-only). Date 2026-11-15.

## At parity (no action)
- Ash syntax definitions: keywords, declarations, Natural Tools, tag lexing, switch equation `(xa²√xa) ±1`, dotted Ash 2.1 keywords (`net.`/`shell64.`/`journal.`/`gl.`).
- Examples menu: all 11 iOS examples exist on web, including Arc Edge Vector, Journal Listener, Reckon Calculator (Ash + C++). Ash bodies match iOS after whitespace normalization (only string-escape differences). Web additionally ships a graphical C++ variant.
- Terminal: `run set status emit shell64 load|info radian info clear help exit` identical; non-Ash terminal (`run list clear help exit`) identical.
- Tool Radian, Shell 64, GL output with Arc Edge viewer, Maze (2D/3D), Lead Edge Cryptology, Ash Map mind map, Interface tab: all present on web. Web GL uses Three.js (iOS uses SceneKit); web GLDrivers is the richer `gl.*` table.

## Gaps, ranked by value
1. **Language environments: 5 on web vs 21 on iOS.** Missing: HTML5, CSS3, TypeScript, Three.js, React/JSX, Vue, PHP, Bash, Ruby, Python-ML, R, Swift, Rust, Go, Kotlin, Dart (C#/C/Java appear in iOS help/new-file picker). iOS runs web langs in a WebView, Python via Pyodide, SQL via SQL.js, and C++/Java/Go/Rust/Swift/C#/Kotlin/Ruby/Bash/R/PHP/TS via Judge0 CE (`https://ce.judge0.com/submissions/?base64_encoded=false&wait=true`, Dart via Piston). **Done here:** `js/lang-envs.js` holds the full 21-entry table (id, name, ext, category, color, Ash-wrapped template, runner, Judge0 id). **Needs lead (patch below).**
2. **No app-wide theme system.** iOS has 9 themes (Dark, Stealth, Ash Tree, Neon, Arctic, Solar, Molten, Quantum, Light) via `ThemeSystem.swift`; web has dark only (mind map and calculator have their own pickers). Needs `index.html` + `css/base.css` variable sets; not safe for me to edit.
3. **Projects, folders and local multi-file storage.** iOS has named per-language projects with folders, rename/delete, import, "Restore Default Examples". Web has tabs plus a flat Files panel (`storage.js`). Needs app.js.
4. **GitHub sign-in and Repo Files browser.** iOS: GitHub device flow, Apple sign-in, repo list, file tree, open/edit, sync-on-save push, create repo and push project, inline image/PDF/video preview. Web: none yet (`js/github-auth.js` is the Grove worker's). See auth section.
5. **Remote compile for non-browser languages** (Judge0/Piston). Belongs with gap 1; needs a runner hook in app.js `runCompile`.
6. **Editor snippet bar.** iOS keyboard accessory inserts `(Node):-:{`, `}|';'|`, `{{env:}}`, `[[owner:]]`, `[poly:]`, `[net:]`, `irin ("")`, `irout ("")`, `thenplace`, `var ()`, `import ()`, `Maze`, `gl.scene`. Useful on phones; needs index.html + css.
7. **Mobile/Desktop viewport toggle for web output** (iOS inject width=device-width vs 1280px). Needs output panel markup.
8. **Welcome screen / sign-in gate, avatar side drawer, About (version, author, links).** Low value on web.
9. **Docs tab** (compiler standard, node structure blocks). Covered by the web Help panel.

## Fixed in this change (allowed files)
- `js/help-content.js`: full terminal command table (set, status, emit, shell64, radian, exit), new Tool Radian, Languages and examples, Output/3D/Interface/Arc Edge math, Maze and Cryptology sections.
- `js/lang-envs.js` (new): data for gap 1, `LangEnvs.byId/byExt/extOf/templateOf`. Syntax checked with `node --check`.

## Patches for the lead (files I may not edit)
**index.html**: add `<script src="js/lang-envs.js"></script>` before `js/app.js`; replace the five `<option>`s in `#langSelect` with a build at init (below); extend `#uploadInput accept` with `.html,.css,.ts,.jsx,.vue,.php,.sh,.rb,.r,.swift,.rs,.go,.kt,.dart`.

**js/app.js**:
```js
// after LANG_EXT / LANG_TEMPLATES definitions
LangEnvs.all.forEach(e => { if (!(e.id in LANG_EXT)) { LANG_EXT[e.id] = e.ext; LANG_TEMPLATES[e.id] = e.template; } });
// initEditorToolbar(): populate picker
document.getElementById("langSelect").innerHTML = LangEnvs.all.map(e => `<option value="${e.id}">${e.name}</option>`).join("");
// uploadInput handler: replace extToLang lookup with
const env = LangEnvs.byExt(ext); openTab(file.name, reader.result, env ? env.id : "ash");
```
Runner (inside existing non-Ash dispatch), for `run === "judge0"`:
```js
const r = await fetch("https://ce.judge0.com/submissions/?base64_encoded=false&wait=true",
  {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({language_id:env.judge0,source_code:code,stdin:""})});
const j = await r.json(); // j.stdout, j.stderr, j.compile_output, j.time, j.memory -> langConsole
```
For `run === "web"` render in a sandboxed iframe `srcdoc` (`sandbox="allow-scripts"`), wrapping css/js/react/vue/three templates with the CDN tags iOS injects (`IDECompilerService.buildWebHTML`). Confirm Judge0 CE CORS from ide.leatr.xyz before shipping; fall back to Piston if blocked.

## GitHub token / PAT audit (values masked; no token printed or reused)
(a) **Hardcoded secrets.** Scanned both repos for `ghp_`, `gho_`, `github_pat_`, `ghs_`, `AKfy`, `script.google.com`, `macros/s/`, `Bearer` literals, plus `Info.plist`, `project.yml`, `.github/workflows/testflight.yml`, `scripts/asc_submit.py`, README. **No PAT or GAS URL in either repo's working tree.** The only embedded GitHub value is the OAuth App **client_id** `Ov23li…[masked]` in `GitHub/GitHubAuth.swift` (device flow, scopes `repo,read:user`); a client_id is public by design, not a secret. CI uses only GitHub Actions secrets (`APP_STORE_CONNECT_API_KEY_CONTENT`, `APP_STORE_CONNECT_ISSUER_ID`, `PROVISIONING_PROFILE_BASE64`). No `.xcconfig` exists. Not checked: git history (shallow clone), so an old PAT could still be in older commits; if the old PAT was ever committed, rotation already covers it, but scrub if desired.
(b) **How each obtains GitHub auth.**
- iOS: no GAS involvement. User token comes from the device flow, or an existing Keychain item `ide_github_pat` (read at launch and in `startGitHubDeviceFlow`), validated via `GET /user`. Calls use `Authorization: Bearer <token>` to `api.github.com`. The `get/post/put` helpers ignore HTTP status, so a revoked token yields a decode failure; `startGitHubDeviceFlow` then falls through to a fresh device flow and overwrites the Keychain item. A rotated PAT therefore self-heals, but a stale `ide_github_pat` is never explicitly cleared on 401.
- Web: no GitHub auth exists in the audited tree; `js/github-auth.js` (Grove worker) is the place. No GAS-served key is consumed anywhere.
(c) **What to adjust.**
1. Neither app reads a GAS-served PAT, so the rotation breaks nothing here. Anything that did hold the old PAT (Grove worker code, Autumn, other repos, GitHub Actions secrets, local Termux scripts) must be checked by its owner.
2. If the web Grove worker fetches the key from the Apps Script web app, fetch it at runtime, keep it in memory only (never localStorage, never committed), and handle failure by prompting for sign-in. Prefer a per-user OAuth/device-flow token over a shared PAT: a shared PAT served to browsers is readable by any visitor of ide.leatr.xyz, so scope it to read-only on the specific public repos, or serve it only behind a check.
3. iOS optional hardening: in `IDEGitHubClient.get/post/put` check `HTTPURLResponse.statusCode == 401` and call `clearToken()` so a rotated token is dropped immediately instead of on the next failed decode. If iOS should use the GAS key, add a fetch from the Apps Script URL stored in an Info.plist or build-time value (not source), save via `setToken`, and keep the device flow as fallback.
