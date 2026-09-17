// ============================================================
//  app.js — Ash Tree IDE application shell
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const DEFAULT_SCRIPT = `// Ash Tree IDE · LEATR v2 · © 2025 DART Meadow | Radical Deepscale LLC.
{{env:MyProject}}
[[script:hello-world-v1]]

(CoreParameterNode):-: {
  {{env:MyProject}}
  [[owner:user]]
  with var (s) var (c) {
    irin ("Data: Hello from Ash!")
    Maze
    thenplace var (s) with var (c)
  }
  irout ("Result: " placeto (s))
}|';'|
`;

const EXAMPLES = [
  { name: "Hello World", code: `{{env:HelloWorld}}
[[script:hello-world-v1]]
(HelloWorldNode):-: {
  with var (s) {
    irin ("Data: Hello, World!")
    Maze
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|
` },
  { name: "Counter App", code: `{{env:CounterApp}}
[[script:counter-v1]]
(CounterNode):-: {
  with var (count) var (step) var (s) {
    irin ("Data: count=0 step=1")
    Puzzle
    thenplace var (count) with var (step)
    thenplace var (s) with var (count)
  }
  irout ("Result: count=" placeto (count))
}|';'|
` },
  { name: "Physics Sim", code: `{{env:PhysicsSim}}
[[script:gravity-node-v1]]
[poly: gravity-math]
(GravityNode):-: {
  {{env:PhysicsSim}}
  [poly: mass-velocity-pressure]
  with var (mass) var (gravity) var (velocity) var (s) {
    irin ("Data: mass=1 gravity=9.81")
    Hammer
    Research (mass * gravity)
    thenplace var (velocity) with var (s)
  }
  irout ("Result: F=" placeto (velocity))
}|';'|
` },
  { name: "Network Node", code: `{{env:NetworkLayer}}
[[script:network-sync-v1]]
[net: log-iter-mode]
(NetworkSyncNode):-: {
  [net: payload-router]
  with var (payload) var (iter) var (s) {
    irin ("Data: payload=sync iter=0")
    Stick
    thenplace var (iter) with var (s)
  }
  irout ("Result: " placeto (payload))
}|';'|
` },
  { name: "Autumn Core", code: `{{env:AutumnCore}}
[[script:autumn-core-logic-v1]]
(AutumnCoreLogicNode):-: {
  with var (s) var (c) {
    irin ("Data: Maze Puzzle Envelope Hammer Stick Knife Scissors")
    thenplace var (s) with var (c)
  }
  irout ("Result: " placeto (s))
}|';'|
` }
];

const engine = new LeatrEngine();
const mashStore = new MashStore();
let mashCanvas = null;
let modalNodeId = null;
let pendingImageDataUrl = null;

// ── Tab switching ─────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (name === "mindmap" && mashCanvas) {
    requestAnimationFrame(() => mashCanvas.render());
  }
  if (name === "maze") {
    // Three.js sizes off clientWidth/Height, which report 0 while the
    // panel was display:none. Create the renderer here (not lazily on
    // first Generate) and always force a resize on every visit — this
    // is what fixed "have to switch tabs away and back to see anything".
    MazeUI._initRendererIfNeeded();
    requestAnimationFrame(() => MazeUI.renderer3d.resize());
  }
}

// ── File state ────────────────────────────────────────────
const fileState = {
  currentFile: "untitled.ash",
  isDirty: false
};

function setStatus(kind, text) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");
  dot.className = "status-dot" + (kind ? " " + kind : "");
  label.textContent = text;
}

function markDirty(dirty) {
  fileState.isDirty = dirty;
  document.getElementById("dirtyDot").hidden = !dirty;
}

function updateFileChip() {
  document.getElementById("currentFileName").textContent = fileState.currentFile;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => { el.hidden = true; }, 200);
  }, 1800);
}

// ── Compile / run ─────────────────────────────────────────
function runCompile() {
  setStatus("running", "compiling…");
  const netMode = document.getElementById("netModeToggle").checked;
  try {
    const result = engine.compile(AshEditor.getValue(), netMode);
    renderOutput();
    AshTerminal.render();
    document.getElementById("shellInfo").textContent = `SHELL: ${result.shell}`;
    document.getElementById("buoyInfo").textContent = `BUOY: ${result.buoyancy.toFixed(4)}`;
    setStatus("ok", `compiled · ${result.shell.toLowerCase()}`);
    switchTab("output");
  } catch (err) {
    setStatus("err", "compile error");
    console.error(err);
  }
}

function renderOutput() {
  const log = document.getElementById("outputLog");
  if (engine.compilerLines.length === 0) {
    log.innerHTML = `<div class="output-empty">Press <strong>RUN</strong> to compile your Ash script.</div>`;
    return;
  }
  log.innerHTML = engine.compilerLines
    .map((l) => `<div class="output-line ${l.isError ? "err" : ""}">
        <span class="output-label" style="color:${l.color}">${escHtml(l.label)}</span>
        <span class="output-text">${escHtml(l.text)}</span>
      </div>`)
    .join("");
  log.scrollTop = log.scrollHeight;
}

function escHtml(s) {
  return (s + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Files panel ───────────────────────────────────────────
function renderFilesList() {
  const list = document.getElementById("filesList");
  const files = IDEStorage.listFiles();
  if (files.length === 0) {
    list.innerHTML = `<div class="files-empty">No local files yet. Save your work with the + button in the Editor toolbar.</div>`;
    return;
  }
  list.innerHTML = files.map((f) => `
    <div class="file-row ${f === fileState.currentFile ? "active" : ""}" data-file="${escHtml(f)}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="file-row-name">${escHtml(f)}</span>
      <button class="file-row-del" data-del="${escHtml(f)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`).join("");

  list.querySelectorAll(".file-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".file-row-del")) return;
      openLocalFile(row.dataset.file);
    });
  });
  list.querySelectorAll(".file-row-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      IDEStorage.deleteFile(btn.dataset.del);
      renderFilesList();
      toast(`Deleted ${btn.dataset.del}`);
    });
  });
}

function openLocalFile(name) {
  const content = IDEStorage.loadFile(name);
  if (content === null) return;
  AshEditor.setValue(content);
  fileState.currentFile = name;
  markDirty(false);
  updateFileChip();
  renderFilesList();
  switchTab("editor");
}

function saveCurrentFile() {
  IDEStorage.saveFile(fileState.currentFile, AshEditor.getValue());
  markDirty(false);
  renderFilesList();
}

function newFile() {
  const name = IDEStorage.uniqueFileName("untitled");
  const initial = `// ${name}\n// Ash Edge Language · LEATR v2\n{{env:MyProject}}\n[[script:new-script]]\n\n`;
  IDEStorage.saveFile(name, initial);
  AshEditor.setValue(initial);
  fileState.currentFile = name;
  markDirty(false);
  updateFileChip();
  renderFilesList();
}

// ── Node editor modal (Ash Map) ──────────────────────────
function openNodeModal(id) {
  const doc = mashStore.activeDoc;
  const node = doc.nodes[id];
  if (!node) return;
  modalNodeId = id;
  pendingImageDataUrl = node.imageData || null;

  document.getElementById("nodeTextInput").value = node.text;
  document.getElementById("nodeBoldInput").checked = !!node.bold;
  document.getElementById("nodeItalicInput").checked = !!node.italic;

  const custom = !!(node.fillColor || node.borderColor || node.textColor);
  document.getElementById("nodeCustomColorToggle").checked = custom;
  document.getElementById("nodeColorRow").hidden = !custom;
  document.getElementById("nodeFillColor").value = node.fillColor || "#00ffcc";
  document.getElementById("nodeBorderColor").value = node.borderColor || "#00ffcc";
  document.getElementById("nodeTextColor").value = node.textColor || "#ffffff";

  const preview = document.getElementById("nodeImagePreview");
  const removeBtn = document.getElementById("nodeImageRemove");
  if (node.imageData) {
    preview.src = node.imageData; preview.hidden = false; removeBtn.hidden = false;
  } else {
    preview.hidden = true; removeBtn.hidden = true;
  }

  document.getElementById("nodeModalBackdrop").hidden = false;
}
function closeNodeModal() {
  document.getElementById("nodeModalBackdrop").hidden = true;
  modalNodeId = null;
}
function saveNodeModal() {
  const doc = mashStore.activeDoc;
  const node = doc.nodes[modalNodeId];
  if (!node) return closeNodeModal();
  mashStore.pushHistory(doc);
  node.text = document.getElementById("nodeTextInput").value || "Untitled";
  node.bold = document.getElementById("nodeBoldInput").checked;
  node.italic = document.getElementById("nodeItalicInput").checked;
  const custom = document.getElementById("nodeCustomColorToggle").checked;
  if (custom) {
    node.fillColor = document.getElementById("nodeFillColor").value;
    node.borderColor = document.getElementById("nodeBorderColor").value;
    node.textColor = document.getElementById("nodeTextColor").value;
  } else {
    node.fillColor = null; node.borderColor = null; node.textColor = null;
  }
  node.imageData = pendingImageDataUrl;
  mashStore.updateDocument(doc);
  closeNodeModal();
  mashCanvas.render();
}

// ── Document picker modal ─────────────────────────────────
function openDocModal() {
  renderDocList();
  document.getElementById("docModalBackdrop").hidden = false;
}
function closeDocModal() {
  document.getElementById("docModalBackdrop").hidden = true;
}
function renderDocList() {
  const list = document.getElementById("docList");
  if (mashStore.documents.length === 0) {
    list.innerHTML = `<div class="files-empty">No mind maps yet.</div>`;
    return;
  }
  list.innerHTML = mashStore.documents.map((d) => `
    <div class="doc-row ${d.id === mashStore.activeDocId ? "active" : ""}" data-doc="${d.id}">
      <div style="flex:1;min-width:0">
        <div class="doc-row-title">${escHtml(d.title)}</div>
        <div class="doc-row-meta">${Object.keys(d.nodes).length} nodes · ${new Date(d.modified).toLocaleDateString()}</div>
      </div>
      <button class="doc-row-del" data-deldoc="${d.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`).join("");
  list.querySelectorAll(".doc-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".doc-row-del")) return;
      mashStore.activeDocId = row.dataset.doc;
      mashStore.save();
      refreshMindMapChrome();
      mashCanvas.render();
      closeDocModal();
    });
  });
  list.querySelectorAll(".doc-row-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      mashStore.deleteDocument(btn.dataset.deldoc);
      if (!mashStore.activeDoc && mashStore.documents.length === 0) {
        mashStore.newDocument("New Mind Map");
      }
      refreshMindMapChrome();
      mashCanvas.render();
      renderDocList();
    });
  });
}

function refreshMindMapChrome() {
  const doc = mashStore.activeDoc;
  if (!doc) return;
  document.getElementById("mmDocTitle").textContent = doc.title;
  document.getElementById("mmLayoutSelect").value = doc.layout;
  document.getElementById("mmThemeSelect").value = doc.themeId;
  document.getElementById("mmUndoBtn").disabled = !mashStore.canUndo(doc.id);
  document.getElementById("mmRedoBtn").disabled = !mashStore.canRedo(doc.id);
}

// ── Mind map toolbar wiring ───────────────────────────────
function initMindMap() {
  if (mashStore.documents.length === 0) {
    mashStore.newDocument("New Mind Map");
  } else if (!mashStore.activeDocId) {
    mashStore.activeDocId = mashStore.documents[0].id;
  }

  const layoutSel = document.getElementById("mmLayoutSelect");
  layoutSel.innerHTML = MASH_LAYOUTS.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  const themeSel = document.getElementById("mmThemeSelect");
  themeSel.innerHTML = MASH_THEMES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  mashCanvas = new MashCanvas({
    store: mashStore,
    onNodeDblClick: openNodeModal,
    onSelectionChange: () => {}
  });

  refreshMindMapChrome();
  mashCanvas.render();

  document.getElementById("mmDocChip").addEventListener("click", openDocModal);
  document.getElementById("docModalClose").addEventListener("click", closeDocModal);
  document.getElementById("docNewBtn").addEventListener("click", () => {
    mashStore.newDocument("New Mind Map");
    refreshMindMapChrome();
    mashCanvas.render();
    closeDocModal();
  });

  layoutSel.addEventListener("change", () => {
    const doc = mashStore.activeDoc;
    mashStore.pushHistory(doc);
    doc.layout = layoutSel.value;
    // Radial is the freeform default; every other layout rearranges
    // nodes immediately when selected, same as the iOS app.
    if (doc.layout !== "radial") mashCanvas.applyAutoLayout(doc);
    mashStore.updateDocument(doc);
    mashCanvas.render();
  });
  themeSel.addEventListener("change", () => {
    const doc = mashStore.activeDoc;
    mashStore.pushHistory(doc);
    doc.themeId = themeSel.value;
    mashStore.updateDocument(doc);
    mashCanvas.render();
  });

  document.getElementById("mmUndoBtn").addEventListener("click", () => {
    if (mashStore.undo()) { refreshMindMapChrome(); mashCanvas.render(); }
  });
  document.getElementById("mmRedoBtn").addEventListener("click", () => {
    if (mashStore.redo()) { refreshMindMapChrome(); mashCanvas.render(); }
  });
  document.getElementById("mmExportBtn").addEventListener("click", () => mashCanvas.exportPng());
  document.getElementById("mmDeleteBtn").addEventListener("click", () => {
    if (!confirm(`Delete "${mashStore.activeDoc.title}"? This can't be undone.`)) return;
    mashStore.deleteDocument(mashStore.activeDocId);
    if (mashStore.documents.length === 0) mashStore.newDocument("New Mind Map");
    refreshMindMapChrome();
    mashCanvas.render();
  });

  // Tool rail
  document.querySelectorAll(".mm-tool[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mm-tool[data-tool]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mashCanvas.setTool(btn.dataset.tool);
    });
  });
  document.querySelectorAll(".mm-tool[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleToolAction(btn.dataset.action));
  });

  mashStore.onChange = () => refreshMindMapChrome();
}

function handleToolAction(action) {
  switch (action) {
    case "addChild": mashCanvas.addChildToSelected("main"); break;
    case "addFree": mashCanvas.addFreeNode(); break;
    case "addMain": mashCanvas.addMainBranch(); break;
    case "addImage": pendingImageTargetIsNew = true; document.getElementById("nodeImageInput").click(); break;
    case "addAsh": mashCanvas.addTypedNode("ash_code", "// ASH code here"); break;
    case "addTerminal": mashCanvas.addTypedNode("out_terminal", "output.terminal()"); break;
    case "add2D": mashCanvas.addTypedNode("out_2d", "canvas.render()"); break;
    case "add3D": mashCanvas.addTypedNode("out_3d", "scene.render()"); break;
    case "addInput": mashCanvas.addTypedNode("input_form", "input.form()"); break;
    case "addOutput": mashCanvas.addTypedNode("output_form", "output.display()"); break;
    case "toAsh": {
      const code = MashAshCodeGenerator.toAshSource(mashStore.activeDoc);
      AshEditor.setValue(code);
      fileState.currentFile = `${mashStore.activeDoc.title.replace(/[^a-z0-9]/gi, "_") || "generated"}.ash`;
      markDirty(true);
      updateFileChip();
      switchTab("editor");
      toast("Generated Ash code from mind map");
      break;
    }
  }
}
let pendingImageTargetIsNew = false;

// ── Wiring ────────────────────────────────────────────────
function initEditorToolbar() {
  const sel = document.getElementById("exampleSelect");
  sel.innerHTML = `<option value="">Examples…</option>` +
    EXAMPLES.map((e, i) => `<option value="${i}">${escHtml(e.name)}</option>`).join("");
  sel.addEventListener("change", () => {
    if (sel.value === "") return;
    const ex = EXAMPLES[+sel.value];
    AshEditor.setValue(ex.code);
    fileState.currentFile = `${ex.name.replace(/\s+/g, "-").toLowerCase()}.ash`;
    markDirty(false);
    updateFileChip();
    sel.value = "";
  });

  document.getElementById("newFileBtn").addEventListener("click", newFile);
  document.getElementById("filesNewBtn").addEventListener("click", newFile);

  document.getElementById("downloadBtn").addEventListener("click", () => {
    const blob = new Blob([AshEditor.getValue()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileState.currentFile;
    a.click();
  });

  document.getElementById("uploadInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      AshEditor.setValue(reader.result);
      fileState.currentFile = file.name;
      markDirty(false);
      updateFileChip();
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("clearOutputBtn").addEventListener("click", () => {
    engine.compilerLines = [];
    renderOutput();
  });
}

function initNodeModal() {
  document.getElementById("nodeModalClose").addEventListener("click", closeNodeModal);
  document.getElementById("nodeModalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "nodeModalBackdrop") closeNodeModal();
  });
  document.getElementById("nodeSaveBtn").addEventListener("click", saveNodeModal);
  document.getElementById("nodeCustomColorToggle").addEventListener("change", (e) => {
    document.getElementById("nodeColorRow").hidden = !e.target.checked;
  });
  document.getElementById("nodeDeleteBtn").addEventListener("click", () => {
    if (!modalNodeId) return;
    mashCanvas.deleteNode(modalNodeId);
    closeNodeModal();
  });
  document.getElementById("nodeDuplicateBtn").addEventListener("click", () => {
    if (!modalNodeId) return;
    mashCanvas.duplicateNode(modalNodeId);
    closeNodeModal();
  });
  document.getElementById("nodeImageInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (pendingImageTargetIsNew) {
        pendingImageTargetIsNew = false;
        const node = mashCanvas.addChildToSelected("main");
        node.imageData = reader.result;
        node.type = "image";
        mashStore.updateDocument(mashStore.activeDoc);
        mashCanvas.render();
      } else {
        pendingImageDataUrl = reader.result;
        const preview = document.getElementById("nodeImagePreview");
        preview.src = reader.result; preview.hidden = false;
        document.getElementById("nodeImageRemove").hidden = false;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });
  document.getElementById("nodeImageRemove").addEventListener("click", () => {
    pendingImageDataUrl = null;
    document.getElementById("nodeImagePreview").hidden = true;
    document.getElementById("nodeImageRemove").hidden = true;
  });
}

// ── Boot ──────────────────────────────────────────────────
function boot() {
  initTabs();
  AshEditor.init();
  AshEditor.onChange = () => { markDirty(true); };

  const savedContent = IDEStorage.loadFile("untitled.ash");
  AshEditor.setValue(savedContent !== null ? savedContent : DEFAULT_SCRIPT);
  markDirty(false);
  updateFileChip();

  AshTerminal.init(engine, () => AshEditor.getValue());
  initEditorToolbar();
  initNodeModal();
  initMindMap();
  MazeUI.init(() => AshEditor.getValue());
  renderFilesList();

  document.getElementById("helpContent").innerHTML = HELP_HTML;

  document.getElementById("runBtn").addEventListener("click", runCompile);
  window.addEventListener("ash:run", runCompile);

  // Autosave current buffer periodically + on tab switch away from editor
  setInterval(() => { if (fileState.isDirty) saveCurrentFile(); }, 4000);
  window.addEventListener("beforeunload", () => { if (fileState.isDirty) saveCurrentFile(); });

  setStatus("", "ready");
}

document.addEventListener("DOMContentLoaded", boot);
