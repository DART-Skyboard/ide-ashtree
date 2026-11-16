// ============================================================
//  grove.js — Grove: the Samara OS phone lab (web only)
//  .ashos project tree, editor, Seedpress build, Canopy simulator,
//  GitHub backup and embed links.  Ash Tree IDE · DART Meadow.
//  Degrades gracefully when Seedpress / Canopy are not loaded.
// ============================================================
(function (root) {
  "use strict";

  var DEMO_FILES = ["phone/os/samara.ashos", "phone/apps/tally.ashos", "phone/apps/leaf.ashos", "phone/apps/drift.ashos", "phone/apps/widow.ashos"];
  var DEFAULT_ENTRY = "phone/os/samara.ashos";
  var LH = 20.8;
  var K_CUR = "grove_current", K_LIST = "grove_projects", K_PROJ = "grove_project_";

  var S = {
    project: "samara-demo", files: {}, active: null,
    seed: null, seedText: "", diag: [], sim: null, powered: false,
    ui: {}, saveT: null, shown: false
  };

  function $(sel, el) { return (el || S.root).querySelector(sel); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function toastMsg(m) { try { if (typeof toast === "function") return toast(m); } catch (e) {} console.log("[grove]", m); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function slug(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project"; }
  function bytes(n) { return n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB"; }

  // ── project storage ─────────────────────────────────────
  function listProjects() { try { return JSON.parse(lsGet(K_LIST) || "[]"); } catch (e) { return []; } }
  function saveProject() {
    lsSet(K_PROJ + S.project, JSON.stringify({ files: S.files }));
    var l = listProjects(); if (l.indexOf(S.project) < 0) { l.push(S.project); lsSet(K_LIST, JSON.stringify(l)); }
    lsSet(K_CUR, S.project);
  }
  function loadProject(name) {
    var raw = lsGet(K_PROJ + name), p = null;
    try { p = raw && JSON.parse(raw); } catch (e) {}
    S.project = name; S.files = (p && p.files) || {};
    S.active = Object.keys(S.files)[0] || null; S.seed = null; S.seedText = ""; S.diag = [];
    lsSet(K_CUR, name);
  }
  function scheduleSave() { clearTimeout(S.saveT); S.saveT = setTimeout(saveProject, 600); }

  // ── UI skeleton ─────────────────────────────────────────
  function build() {
    S.root.innerHTML =
      '<div class="gv-root">' +
      '<div class="gv-bar">' +
        '<select class="gv-sel" id="gvProj" title="Project"></select>' +
        '<button class="gv-btn" id="gvNewProj" title="New project">+ Project</button>' +
        '<button class="gv-btn" id="gvDemo">Load demo OS</button>' +
        '<button class="gv-btn primary" id="gvBuild">Build</button>' +
        '<button class="gv-btn" id="gvDl">Download .seed</button>' +
        '<button class="gv-btn" id="gvOpen">Open .seed</button>' +
        '<input type="file" id="gvFile" accept=".seed,.json,.ashos,.txt" hidden>' +
        '<span class="sp"></span>' +
        '<button class="gv-btn" id="gvSave">Save to GitHub</button>' +
        '<button class="gv-btn" id="gvLoadGh">Load from GitHub</button>' +
        '<button class="gv-btn" id="gvEmbed">Embed link</button>' +
        '<span id="gvAuth"></span>' +
      '</div>' +
      '<div class="gv-body">' +
        '<div class="gv-col"><div class="gv-h">PROJECT<span class="sp"></span><button class="gv-btn" id="gvAddFile" style="padding:2px 7px">+ file</button></div><div class="gv-tree" id="gvTree"></div></div>' +
        '<div class="gv-col"><div class="gv-h" id="gvFname">EDITOR</div>' +
          '<div class="gv-wrap"><div class="gv-gutter" id="gvGut"></div><textarea class="gv-ta" id="gvTa" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea><pre class="gv-hl" id="gvHl" aria-hidden="true"></pre></div>' +
          '<div class="gv-h">DIAGNOSTICS<span class="sp"></span><span id="gvDiagN"></span></div><div class="gv-diag" id="gvDiag"></div></div>' +
        '<div class="gv-col gv-side"><div class="gv-h">ROM</div><div class="gv-card" id="gvRom">Not built yet.</div>' +
          '<div class="gv-h">CANOPY</div><div class="gv-sim" id="gvSim"></div>' +
          '<div class="gv-simbar"><button class="gv-btn" id="gvPower">Power</button><button class="gv-btn" id="gvReset">Reset</button><button class="gv-btn" id="gvShot">Screenshot</button><button class="gv-btn" id="gvWall" title="Import a wallpaper image (also in Rings > Wallpapers & themes)">Import wallpaper</button><button class="gv-btn primary" id="gvPop" title="Float the phone in a draggable overlay">Pop out</button></div>' +
          '<div class="gv-log" id="gvLog">Simulator log.</div></div>' +
      '</div></div>';

    var ui = S.ui;
    ["gvProj", "gvTree", "gvTa", "gvHl", "gvGut", "gvDiag", "gvDiagN", "gvRom", "gvSim", "gvLog", "gvAuth", "gvFname", "gvFile"].forEach(function (id) { ui[id] = $("#" + id); });

    ui.gvTa.addEventListener("input", onEdit);
    ui.gvTa.addEventListener("scroll", syncScroll);
    ui.gvTa.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { e.preventDefault(); var t = ui.gvTa, s = t.selectionStart; t.value = t.value.slice(0, s) + "  " + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2; onEdit(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); doBuild(); }
    });
    ui.gvProj.addEventListener("change", function () { saveProject(); loadProject(ui.gvProj.value); refreshAll(); });
    $("#gvNewProj").onclick = newProject;
    $("#gvDemo").onclick = function () { loadDemo(true); };
    $("#gvBuild").onclick = function () { doBuild(); };
    $("#gvDl").onclick = downloadSeed;
    $("#gvOpen").onclick = function () { ui.gvFile.click(); };
    ui.gvFile.addEventListener("change", openFromDisk);
    $("#gvAddFile").onclick = addFile;
    $("#gvPower").onclick = power;
    $("#gvReset").onclick = reset;
    $("#gvShot").onclick = screenshot;
    $("#gvWall").onclick = function () { if (S.sim && S.sim.pickWallpaper) S.sim.pickWallpaper(); else toastMsg("Build the phone first, then import a wallpaper"); };
    $("#gvPop").onclick = function () { if (root.GroveFloat) GroveFloat.toggle(); else toastMsg("Overlay module not loaded"); };
    $("#gvSave").onclick = saveToGitHub;
    $("#gvLoadGh").onclick = loadFromGitHub;
    $("#gvEmbed").onclick = embedFlow;
    GitHubAuth && GitHubAuth.onChange(renderAuth);
  }

  // ── editor ──────────────────────────────────────────────
  function hlHtml(t) {
    try { if (typeof AshEditor !== "undefined" && AshEditor.highlightSource) return AshEditor.highlightSource(t); } catch (e) {}
    return esc(t);
  }
  function renderEditor() {
    var ui = S.ui, t = ui.gvTa.value;
    ui.gvHl.innerHTML = hlHtml(t) + "\n";
    var n = t.split("\n").length, marks = {}, h = "";
    S.diag.forEach(function (d) { if (d.file === S.active && d.line) { var k = d.level === "error" ? "err" : "warn"; if (marks[d.line] !== "err") marks[d.line] = k; } });
    for (var i = 1; i <= n; i++) h += '<div' + (marks[i] ? ' class="' + marks[i] + '"' : "") + ">" + i + "</div>";
    ui.gvGut.innerHTML = h; syncScroll();
  }
  function syncScroll() { var ui = S.ui; ui.gvHl.scrollTop = ui.gvTa.scrollTop; ui.gvHl.scrollLeft = ui.gvTa.scrollLeft; ui.gvGut.scrollTop = ui.gvTa.scrollTop; }
  function onEdit() { if (S.active) { S.files[S.active] = S.ui.gvTa.value; scheduleSave(); } renderEditor(); }
  function openFile(path) {
    S.active = path; var ui = S.ui;
    ui.gvTa.value = path ? (S.files[path] || "") : ""; ui.gvTa.disabled = !path;
    ui.gvFname.textContent = path ? path : "EDITOR (no file)";
    renderTree(); renderEditor();
  }
  function gotoLine(file, line) {
    if (file && S.files[file] !== undefined && file !== S.active) openFile(file);
    var ta = S.ui.gvTa, lines = ta.value.split("\n"), idx = 0;
    line = Math.max(1, Math.min(line || 1, lines.length));
    for (var i = 0; i < line - 1; i++) idx += lines[i].length + 1;
    ta.focus(); ta.setSelectionRange(idx, idx + lines[line - 1].length);
    ta.scrollTop = Math.max(0, (line - 3) * LH + 14); syncScroll();
  }

  function renderTree() {
    var paths = Object.keys(S.files).sort(), dirs = {}, h = "";
    paths.forEach(function (p) { var d = p.indexOf("/") >= 0 ? p.slice(0, p.lastIndexOf("/")) : ""; (dirs[d] = dirs[d] || []).push(p); });
    Object.keys(dirs).sort().forEach(function (d) {
      h += '<div class="gv-dir">' + esc(d || "/") + "</div>";
      dirs[d].forEach(function (p) {
        h += '<div class="gv-file' + (p === S.active ? " active" : "") + '" data-p="' + esc(p) + '">' + esc(p.split("/").pop()) + '<button class="x" data-del="' + esc(p) + '" title="Delete">x</button></div>';
      });
    });
    if (!paths.length) h = '<div class="gv-muted">Empty project. Use "Load demo OS" or "+ file".</div>';
    S.ui.gvTree.innerHTML = h;
    Array.prototype.forEach.call(S.ui.gvTree.querySelectorAll(".gv-file"), function (el) {
      el.onclick = function (e) {
        var del = e.target.getAttribute && e.target.getAttribute("data-del");
        if (del) { if (confirm("Delete " + del + "?")) { delete S.files[del]; saveProject(); openFile(S.active === del ? Object.keys(S.files)[0] || null : S.active); } return; }
        openFile(el.getAttribute("data-p"));
      };
    });
  }
  function addFile() {
    var n = prompt("New file path (e.g. phone/apps/notes.ashos)", "phone/apps/new.ashos");
    if (!n) return; n = n.trim().replace(/^\/+/, "");
    if (!/\.ashos$/.test(n)) n += ".ashos";
    if (S.files[n] === undefined) S.files[n] = "import (SamaraHW)\n{{env:Samara}}\n[[script:" + slug(n.split("/").pop().replace(/\.ashos$/, "")) + "-v1]]\n";
    saveProject(); openFile(n);
  }
  function newProject() {
    var n = prompt("Project name", "my-phone"); if (!n) return;
    saveProject(); S.project = slug(n); S.files = {}; S.active = null; S.seed = null; S.diag = [];
    saveProject(); refreshAll();
  }
  function refreshProjSelect() {
    var l = listProjects(); if (l.indexOf(S.project) < 0) l.push(S.project);
    S.ui.gvProj.innerHTML = l.map(function (n) { return '<option value="' + esc(n) + '"' + (n === S.project ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
  }
  function refreshAll() { refreshProjSelect(); renderDiag(); renderRom(); openFile(S.active && S.files[S.active] !== undefined ? S.active : Object.keys(S.files)[0] || null); }

  // ── demo ────────────────────────────────────────────────
  async function loadDemo(confirmOverwrite) {
    var got = {}, miss = [];
    for (var i = 0; i < DEMO_FILES.length; i++) {
      try {
        var r = await fetch(DEMO_FILES[i] + "?v=" + Date.now());
        var t = r.ok ? await r.text() : null;
        if (t && !/^\s*<(!doctype|html)/i.test(t)) got[DEMO_FILES[i]] = t; else miss.push(DEMO_FILES[i]);
      } catch (e) { miss.push(DEMO_FILES[i]); }
    }
    var keys = Object.keys(got);
    if (!keys.length) { toastMsg("Demo OS sources not found on this host yet"); S.ui.gvDiag.innerHTML = '<div class="gv-muted">Could not fetch ' + esc(miss.join(", ")) + " (not deployed yet?).</div>"; return false; }
    var clash = keys.some(function (k) { return S.files[k] !== undefined && S.files[k] !== got[k]; });
    if (confirmOverwrite && clash && !confirm("Replace your edited copies of the demo files?")) return false;
    keys.forEach(function (k) { S.files[k] = got[k]; });
    saveProject(); S.active = got[DEFAULT_ENTRY] ? DEFAULT_ENTRY : keys[0]; refreshAll();
    toastMsg("Demo OS loaded" + (miss.length ? " (missing: " + miss.length + ")" : ""));
    return true;
  }

  // ── build ───────────────────────────────────────────────
  function findEntry() {
    if (S.files[DEFAULT_ENTRY] !== undefined) return DEFAULT_ENTRY;
    var k = Object.keys(S.files).filter(function (p) { return /\/os\/[^\/]+\.ashos$/.test(p) || /(^|\/)samara\.ashos$/.test(p); });
    return k[0] || Object.keys(S.files)[0];
  }
  async function doBuild() {
    if (S.active) S.files[S.active] = S.ui.gvTa.value;
    saveProject();
    if (!root.Seedpress || !Seedpress.compile) { S.diag = [{ level: "error", file: "", line: 0, msg: "Seedpress compiler is not loaded (js/phone/seedpress.js)." }]; renderDiag(); return null; }
    if (!Object.keys(S.files).length) { S.diag = [{ level: "error", file: "", line: 0, msg: "Project is empty." }]; renderDiag(); return null; }
    var res;
    try { res = await Seedpress.compile({ files: S.files, entry: findEntry() }); }
    catch (e) { res = { ok: false, diagnostics: [{ level: "error", file: "", line: 0, msg: "Compiler crashed: " + e.message }] }; }
    S.diag = res.diagnostics || [];
    if (res.ok && res.seed) {
      S.seed = res.seed;
      try { S.seedText = Seedpress.serialize ? Seedpress.serialize(res.seed) : JSON.stringify(res.seed, null, 1); } catch (e) { S.seedText = JSON.stringify(res.seed); }
      var ver = null;
      try { if (Seedpress.verify) { var v = Seedpress.verify(res.seed); ver = v && typeof v === "object" ? (v.ok !== false) : !!v; } } catch (e) { ver = false; }
      S.verified = ver;
      renderDiag(); renderRom(); await startSim(true);
    } else { S.seed = null; S.seedText = ""; renderDiag(); renderRom(); }
    renderEditor();
    return res;
  }
  function renderDiag() {
    var d = S.diag, ui = S.ui;
    var ne = d.filter(function (x) { return x.level === "error"; }).length, nw = d.filter(function (x) { return x.level === "warn" || x.level === "warning"; }).length;
    ui.gvDiagN.textContent = d.length ? ne + " error(s), " + nw + " warning(s)" : "";
    if (!d.length) { ui.gvDiag.innerHTML = '<div class="gv-muted">No diagnostics. Press Build (Ctrl/Cmd+Enter).</div>'; return; }
    ui.gvDiag.innerHTML = d.map(function (x, i) {
      return '<div class="gv-d" data-i="' + i + '"><b class="' + esc(x.level) + '">' + esc(x.level) + '</b><span>' + esc(x.msg) + '</span><span class="loc">' + esc((x.file || "").split("/").pop()) + (x.line ? ":" + x.line : "") + "</span></div>";
    }).join("");
    Array.prototype.forEach.call(ui.gvDiag.querySelectorAll(".gv-d"), function (el) {
      el.onclick = function () { var x = S.diag[+el.getAttribute("data-i")]; if (x.line) gotoLine(x.file, x.line); else if (x.file && S.files[x.file] !== undefined) openFile(x.file); };
    });
  }
  function renderRom() {
    var el = S.ui.gvRom;
    if (!S.seed) { el.innerHTML = "Not built yet." + (root.Seedpress ? "" : '<br><span class="gv-warn">Seedpress not loaded.</span>'); return; }
    var sd = S.seed, name = (sd.os && sd.os.name || "Samara OS") + " " + (sd.os && sd.os.version || "");
    var size = new TextEncoder().encode(S.seedText).length;
    el.innerHTML = "<b>" + esc(name) + "</b><br>Size: <b>" + bytes(size) + "</b><br>Built: " + esc(sd.built || "?") +
      "<br>Apps: " + esc(((sd.manifest && sd.manifest.apps) || []).map(function (a) { return a.name; }).join(", ") || "none") +
      "<br>SHA-256: <code>" + esc(sd.sha256 || "(none)") + "</code>" +
      (S.verified === true ? '<br><span style="color:var(--accent)">verified</span>' : S.verified === false ? '<br><span class="gv-warn">verify failed</span>' : "");
  }

  // ── seed files ──────────────────────────────────────────
  function download(name, text, type) {
    var b = new Blob([text], { type: type || "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function ensureSeed() { if (!S.seed) await doBuild(); return !!S.seed; }
  async function downloadSeed() { if (await ensureSeed()) download(S.project + ".seed", S.seedText); else toastMsg("Build failed; fix diagnostics first"); }
  function openFromDisk() {
    var f = S.ui.gvFile.files[0]; S.ui.gvFile.value = ""; if (!f) return;
    var rd = new FileReader();
    rd.onload = async function () {
      var text = String(rd.result);
      if (/\.ashos$/.test(f.name)) { var p = "phone/apps/" + f.name; S.files[p] = text; saveProject(); openFile(p); return; }
      var seed;
      try { seed = root.Seedpress && Seedpress.parse ? Seedpress.parse(text) : JSON.parse(text); if (seed && seed.seed && seed.magic === undefined) { if (seed.ok === false) throw new Error(seed.error || "invalid seed"); seed = seed.seed; } } catch (e) { toastMsg("Not a valid .seed: " + e.message); return; }
      if (!seed || seed.magic !== "SAMARA-SEED") { toastMsg("Not a SAMARA-SEED file"); return; }
      S.seed = seed; S.seedText = text; S.verified = null;
      try { if (root.Seedpress && Seedpress.verify) { var v = Seedpress.verify(seed); S.verified = v && typeof v === "object" ? v.ok !== false : !!v; } } catch (e) { S.verified = false; }
      if (seed.sources && !Object.keys(S.files).length) { Object.keys(seed.sources).forEach(function (k) { S.files[k] = seed.sources[k]; }); saveProject(); }
      refreshAll(); renderRom(); startSim(true); toastMsg("Opened " + f.name);
    };
    rd.readAsText(f);
  }

  // ── Canopy ──────────────────────────────────────────────
  function simLog(m) { var el = S.ui.gvLog; if (!el) return; el.textContent += "\n" + (typeof m === "string" ? m : JSON.stringify(m)); el.scrollTop = el.scrollHeight; }
  function destroySim() { if (S.sim) { try { S.sim.shutdown && S.sim.shutdown(); } catch (e) {} try { S.sim.destroy && S.sim.destroy(); } catch (e) {} S.sim = null; } S.powered = false; S.ui.gvSim.innerHTML = ""; }
  async function startSim(boot) {
    destroySim();
    if (!root.Canopy || !Canopy.create) { S.ui.gvSim.innerHTML = '<div class="gv-muted">Canopy simulator is not loaded (js/phone/canopy.js).</div>'; return; }
    if (!S.seed) { S.ui.gvSim.innerHTML = '<div class="gv-muted">Build or open a .seed first.</div>'; return; }
    try {
      S.sim = Canopy.create(S.ui.gvSim, { seed: S.seed, onLog: simLog, project: S.project });   // project = fallback key so editing sources keeps the session
      if (S.sim.setSessionGithub) S.sim.setSessionGithub(sessionGithubApi());
      if (boot) { await S.sim.boot(); S.powered = true; }
    } catch (e) { simLog("Canopy error: " + e.message); }
  }
  async function power() {
    if (!S.seed && !(await ensureSeed())) return;
    if (!S.sim) { await startSim(true); return; }
    if (S.powered) { try { S.sim.shutdown(); } catch (e) {} S.powered = false; S.ui.gvSim.style.opacity = ".6"; }
    else { try { await S.sim.boot(); S.powered = true; S.ui.gvSim.style.opacity = ""; } catch (e) { simLog("boot failed: " + e.message); } }
  }
  async function reset() { if (!S.seed && !(await ensureSeed())) return; S.ui.gvSim.style.opacity = ""; await startSim(true); }
  async function screenshot() {
    if (!S.sim || !S.sim.screenshot) return toastMsg("Power on the simulator first");
    try {
      var s = await S.sim.screenshot(), url = null;
      if (typeof s === "string") url = s;
      else if (s && s.toDataURL) url = s.toDataURL("image/png");
      else if (s instanceof Blob) url = URL.createObjectURL(s);
      if (!url) return toastMsg("Simulator returned no image");
      var a = document.createElement("a"); a.href = url; a.download = S.project + "-screenshot.png"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toastMsg("Screenshot failed: " + e.message); }
  }

  // ── modal helper ────────────────────────────────────────
  function modal(html) {
    var m = document.createElement("div"); m.className = "gv-modal";
    m.innerHTML = '<div class="gv-dlg">' + html + "</div>";
    m.addEventListener("mousedown", function (e) { if (e.target === m) close(); });
    document.body.appendChild(m);
    function close() { m.remove(); if (m._onclose) m._onclose(); }
    m.close = close; return m;
  }

  // ── GitHub auth UI ──────────────────────────────────────
  function renderAuth() {
    var el = S.ui.gvAuth; if (!el) return;
    if (GitHubAuth.isSignedIn()) {
      var u = GitHubAuth.user();
      el.innerHTML = '<span class="gv-chip" id="gvChip" title="Click to sign out"><img src="' + esc(u.avatar) + '" alt="">' + esc(u.login) + "</span>";
      $("#gvChip").onclick = function () { if (confirm("Sign out of GitHub on this browser?")) GitHubAuth.signOut(); };
    } else el.innerHTML = '<button class="gv-btn" id="gvSignIn">Sign in with GitHub</button>', $("#gvSignIn").onclick = signInDialog;
  }
  function signInDialog() {
    return new Promise(function (resolve) {
      var cancelled = false;
      var m = modal('<h3>Sign in with GitHub</h3><p id="gvProbe">Checking which sign-in path works from this browser...</p><div id="gvDev"></div>' +
        '<p><b>Personal Access Token</b> (fallback, always works). Create a classic token with <code>repo</code> scope (add <code>gist</code> only if you want Gist embeds) at github.com/settings/tokens. It is stored only in this browser and sent only to api.github.com.</p>' +
        '<input type="password" id="gvPat" placeholder="paste token" autocomplete="off"><p id="gvErr" class="gv-warn"></p>' +
        '<details><summary>Auth relay (advanced)</summary><p>Default is the DART Apps Script service used by the iOS app. Leave blank to disable.</p><input type="text" id="gvPx"></details>' +
        '<div class="row"><button class="gv-btn" id="gvDevBtn" hidden>Use device code</button><button class="gv-btn primary" id="gvPatBtn">Sign in with token</button><button class="gv-btn" id="gvX">Close</button></div>');
      m._onclose = function () { cancelled = true; resolve(GitHubAuth.isSignedIn()); };
      var q = function (s) { return m.querySelector(s); };
      q("#gvX").onclick = function () { m.close(); };
      q("#gvPx").value = GitHubAuth.getProxy();
      q("#gvPx").onchange = function () { GitHubAuth.setProxy(q("#gvPx").value); GitHubAuth.probe(true).then(showProbe); };
      function showProbe(p) {
        q("#gvProbe").innerHTML = "Device flow: <b>" + (p.deviceFlow ? "available (" + esc(p.via) + ")" : "not available") + "</b>. " + esc(p.note);
        q("#gvDevBtn").hidden = !p.deviceFlow;
      }
      GitHubAuth.probe().then(showProbe);
      q("#gvPatBtn").onclick = async function () {
        q("#gvErr").textContent = "";
        try { await GitHubAuth.signInWithToken(q("#gvPat").value, "token"); await finishSignIn(); m.close(); } catch (e) { q("#gvErr").textContent = e.message; }
      };
      q("#gvDevBtn").onclick = async function () {
        q("#gvErr").textContent = "";
        try {
          var dev = await GitHubAuth.startDeviceFlow();
          q("#gvDev").innerHTML = '<p>Open <b>' + esc(dev.verification_uri) + '</b> and enter:</p><div class="gv-code">' + esc(dev.user_code) + "</div><p>Waiting for approval...</p>";
          window.open(dev.verification_uri, "_blank", "noopener");
          await GitHubAuth.pollDeviceFlow(dev, function () { return cancelled; });
          await finishSignIn(); m.close();
        } catch (e) { q("#gvErr").textContent = e.message; }
      };
    });
  }
  async function finishSignIn() {
    try { var r = await GitHubAuth.ensureRepo(); toastMsg("Signed in. Repo " + r.full_name + (r.private ? " (private)" : " (PUBLIC!)")); }
    catch (e) { toastMsg("Signed in, but repo check failed: " + e.message); }
  }
  async function needAuth() { if (GitHubAuth.isSignedIn()) return true; await signInDialog(); return GitHubAuth.isSignedIn(); }

  // ── repo save / load ────────────────────────────────────
  function repoPath(p) { return "phone/" + S.project + "/" + p.replace(/^phone\//, ""); }
  async function saveToGitHub() {
    if (!(await needAuth())) return;
    if (S.active) S.files[S.active] = S.ui.gvTa.value; saveProject();
    var out = {}; Object.keys(S.files).forEach(function (p) { out[repoPath(p)] = S.files[p]; });
    if (!S.seed) await doBuild();
    if (S.seed) out["phone/" + S.project + "/build/" + S.project + ".seed"] = S.seedText;
    var sess = await sessionFiles(); if (sess) Object.keys(sess).forEach(function (k) { out[k] = sess[k]; });   // phone/<project>/session/state.json (+ wallpaper.<ext>)
    if (!Object.keys(out).length) return toastMsg("Nothing to save");
    try {
      toastMsg("Saving to GitHub...");
      var r = await GitHubAuth.putFiles(out, "Grove: save " + S.project);
      toastMsg("Saved " + Object.keys(out).length + " files to private repo " + r.repo.full_name);
    } catch (e) { toastMsg("Save failed: " + e.message); alert("Save to GitHub failed: " + e.message); }
  }
  // ── session backup (state.json + custom wallpaper) ───────
  // Files for phone/<project>/session/. Uses the running simulator's persistence controller; null when no phone is running.
  async function sessionFiles() {
    if (!S.sim || !S.sim.persist) return null;
    try {
      var b = await S.sim.persist.exportBackup(), out = {}, base = "phone/" + S.project + "/";
      out[base + b.statePath] = b.state;
      if (b.wallpaper) out[base + b.wallpaperPath] = { base64: b.wallpaper.base64 };
      return out;
    } catch (e) { simLog("session export failed: " + e.message); return null; }
  }
  // Applies a project's session (state.json + wallpaper) from the repo listing; live if a phone is running, else into storage for the next boot.
  async function restoreSession(files, name) {
    var st = files.filter(function (f) { return f.path === "phone/" + name + "/session/state.json"; })[0];
    if (!st) return false;
    var wf = files.filter(function (f) { return /^phone\/[^\/]+\/session\/wallpaper\.[a-z0-9]+$/i.test(f.path) && f.path.indexOf("phone/" + name + "/") === 0; })[0];
    var text = await GitHubAuth.readBlob(st.sha), wp = null;
    if (wf) wp = { ext: wf.path.split(".").pop(), base64: await GitHubAuth.readBlobBase64(wf.sha) };
    if (S.sim && S.sim.persist && slug(name) === S.project) { var r = await S.sim.persist.importBackup(text, wp, true); return !!(r && r.ok); }
    if (!root.SamaraPersist) return false;
    var r2 = await SamaraPersist.writeSession(SamaraPersist.browserHost(), null, name, text, wp); return !!(r2 && r2.ok);
  }
  function sessionGithubApi() {
    return {
      status: function () { var u = GitHubAuth.isSignedIn() ? GitHubAuth.user() : null; return { signedIn: !!u, user: u ? u.login : "", project: S.project }; },
      backup: async function () {
        if (!GitHubAuth.isSignedIn()) throw new Error("Sign in with GitHub in Grove first");
        var files = await sessionFiles(); if (!files) throw new Error("Nothing to back up");
        var r = await GitHubAuth.putFiles(files, "Grove: session backup " + S.project);
        return "Backed up to " + r.repo.full_name + " (phone/" + S.project + "/session/)";
      },
      restore: async function () {
        if (!GitHubAuth.isSignedIn()) throw new Error("Sign in with GitHub in Grove first");
        var projects = await GitHubAuth.listProjects(), list = projects[S.project];
        if (!list || !(await restoreSession(list, S.project))) throw new Error("No session backup for this project in the repo yet");
        return "Restored session from GitHub";
      }
    };
  }

  async function loadFromGitHub() {
    if (!(await needAuth())) return;
    var projects;
    try { projects = await GitHubAuth.listProjects(); } catch (e) { return alert("Could not list projects: " + e.message); }
    var names = Object.keys(projects);
    if (!names.length) return alert("No projects under phone/ in " + GitHubAuth.REPO_NAME + " yet. Use Save to GitHub first.");
    var m = modal("<h3>Load project from GitHub</h3><p>Private repo: " + esc(GitHubAuth.user().login + "/" + GitHubAuth.REPO_NAME) + "</p>" +
      names.map(function (n) { return '<label class="opt"><input type="radio" name="gvp" value="' + esc(n) + '"> ' + esc(n) + " (" + projects[n].filter(function (f) { return /\.ashos$/.test(f.path); }).length + " sources)</label>"; }).join("") +
      '<div class="row"><button class="gv-btn primary" id="gvGo">Load</button><button class="gv-btn" id="gvX">Cancel</button></div>');
    m.querySelector("#gvX").onclick = m.close;
    m.querySelector("#gvGo").onclick = async function () {
      var c = m.querySelector("input[name=gvp]:checked"); if (!c) return;
      var name = c.value, files = {};
      try {
        var list = projects[name].filter(function (f) { return /\.ashos$/.test(f.path); });
        for (var i = 0; i < list.length; i++) {
          var rel = list[i].path.slice(("phone/" + name + "/").length);
          files["phone/" + rel] = await GitHubAuth.readBlob(list[i].sha);
        }
      } catch (e) { return alert("Load failed: " + e.message); }
      saveProject(); S.project = slug(name); S.files = files; S.active = Object.keys(files)[0] || null; S.seed = null; S.diag = [];
      destroySim(); var restored = false; try { restored = await restoreSession(projects[name], name); } catch (e) { simLog("session restore failed: " + e.message); }   // phone/<name>/session/state.json
      saveProject(); refreshAll(); m.close(); toastMsg("Loaded " + name + (restored ? " (session restored)" : ""));
    };
  }

  // ── embed link ──────────────────────────────────────────
  async function toFragment(text) {
    var raw = new TextEncoder().encode(text), out = raw;
    if (root.CompressionStream) {
      var cs = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
      out = new Uint8Array(await new Response(cs).arrayBuffer());
    }
    var bin = ""; for (var i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function embedBase() { return new URL("embed.html", location.href).href; }
  async function embedFlow() {
    if (!(await ensureSeed())) return alert("Build the project first (fix diagnostics).");
    var signed = GitHubAuth.isSignedIn();
    var m = modal('<h3>Embed link</h3>' +
      '<p class="gv-warn"><b>Your GitHub repo is private, so its files cannot be embedded.</b> Anonymous visitors cannot fetch raw files from a private repo, and tokens are never put in URLs. Pick where the ROM copy lives:</p>' +
      '<label class="opt"><input type="radio" name="gvm" value="frag" checked> <b>In the link itself</b> (no server, nothing uploaded). Works for small ROMs; the link is long. Anyone with the link can read the ROM.</label>' +
      '<label class="opt"><input type="radio" name="gvm" value="secret"> <b>Secret Gist</b> (uploads the ROM). Unlisted, <u>not private</u>: anyone with the URL can read it. Needs a token with <code>gist</code> scope' + (signed ? "" : " (sign in first)") + '.</label>' +
      '<label class="opt"><input type="radio" name="gvm" value="public"> <b>Public Gist</b> (uploads the ROM). Listed on your public profile. Same token needs.</label>' +
      '<label class="opt"><input type="radio" name="gvm" value="url"> <b>My own URL</b> to a hosted .seed (must allow CORS, e.g. GitHub Pages or a public repo raw link).</label>' +
      '<input type="text" id="gvUrl" placeholder="https://.../my.seed" hidden>' +
      '<p id="gvEmbErr" class="gv-warn"></p><div id="gvEmbOut"></div>' +
      '<div class="row"><button class="gv-btn primary" id="gvMk">Create link</button><button class="gv-btn" id="gvX">Close</button></div>');
    var q = function (s) { return m.querySelector(s); };
    q("#gvX").onclick = m.close;
    Array.prototype.forEach.call(m.querySelectorAll("input[name=gvm]"), function (r) { r.onchange = function () { q("#gvUrl").hidden = r.value !== "url" || !r.checked; }; });
    q("#gvMk").onclick = async function () {
      var mode = q("input[name=gvm]:checked").value, link, note;
      q("#gvEmbErr").textContent = "";
      try {
        if (mode === "frag") {
          var frag = await toFragment(S.seedText);
          link = embedBase() + "#seed=" + frag;
          note = "Contains the whole ROM (" + bytes(link.length) + " of URL)." + (link.length > 60000 ? " <b class='gv-warn'>Large: some chat apps and servers truncate long links; prefer a Gist or hosted URL.</b>" : "") +
                 " Anyone holding this link can read the ROM and its embedded sources. Not private.";
        } else if (mode === "url") {
          var u = q("#gvUrl").value.trim(); if (!/^https:\/\//.test(u)) throw new Error("Enter an https:// URL");
          link = embedBase() + "?src=" + encodeURIComponent(u); note = "Loads the ROM from your URL. Public if that URL is public.";
        } else {
          if (!(await needAuth())) throw new Error("Sign in first");
          var g = await GitHubAuth.createGist(S.project + ".seed", S.seedText, mode === "public", "Samara seed: " + S.project);
          link = embedBase() + "?src=" + encodeURIComponent(g.raw);
          note = (mode === "public" ? "Public gist" : "Secret gist (unlisted, readable by anyone with the URL)") + ": " + esc(g.html_url) + ". Re-publish after rebuilding to update it.";
        }
      } catch (e) {
        q("#gvEmbErr").textContent = /Resource not accessible|Not Found|403|404/.test(e.message) ? e.message + " (Gist creation needs a classic token with the gist scope; device-flow tokens from the shared service do not include it.)" : e.message; return;
      }
      var snippet = '<iframe src="' + link + '" width="360" height="720" style="border:0;border-radius:24px" allow="camera; microphone; geolocation" title="Samara OS"></iframe>';
      q("#gvEmbOut").innerHTML = "<p>" + note + '</p><p><b>Link</b></p><textarea readonly id="gvL"></textarea><div class="row" style="margin-top:4px"><button class="gv-btn" id="gvCpL">Copy link</button></div><p><b>iframe snippet</b></p><textarea readonly id="gvS"></textarea><div class="row" style="margin-top:4px"><button class="gv-btn" id="gvCpS">Copy snippet</button><a class="gv-btn" href="' + esc(link) + '" target="_blank" rel="noopener">Open</a></div>';
      q("#gvL").value = link; q("#gvS").value = snippet;
      function cp(id) { var t = q(id); t.select(); try { navigator.clipboard.writeText(t.value).then(function () { toastMsg("Copied"); }, function () { document.execCommand("copy"); }); } catch (e) { document.execCommand("copy"); } }
      q("#gvCpL").onclick = function () { cp("#gvL"); }; q("#gvCpS").onclick = function () { cp("#gvS"); };
    };
  }

  // ── init ────────────────────────────────────────────────
  var Grove = {
    state: S,
    onShow: function () {
      if (!S.root) return;
      requestAnimationFrame(renderEditor);
      if (!S.shown) {
        S.shown = true;
        if (!Object.keys(S.files).length) loadDemo(false);
      }
    },
    build: doBuild,
    loadDemo: loadDemo
  };
  function init() {
    S.root = document.getElementById("panel-grove");
    if (!S.root) return;
    if (!root.GitHubAuth) root.GitHubAuth = { onChange: function () {}, isSignedIn: function () { return false; }, probe: function () { return Promise.resolve({ note: "GitHub module missing" }); }, getProxy: function () { return ""; }, setProxy: function () {} };
    build();
    var cur = lsGet(K_CUR) || S.project; loadProject(cur);
    renderAuth(); refreshAll();
  }
  Grove.getSim = function () { return S.sim; };
  Grove.simMount = function () { return S.ui && S.ui.gvSim; };
  root.Grove = Grove;
  if (typeof document === "undefined") { /* node: no DOM */ } else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  if (typeof module !== "undefined" && module.exports) module.exports = Grove;
})(typeof window !== "undefined" ? window : globalThis);
