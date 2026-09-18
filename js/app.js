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
` },
  { name: "3D Animation", code: `// ASH TREE 3D — Arc Edge Geometry · LEATR v2
// Arc Edge math: Circumference=sqrt(d*3)^2  Area=circ^2
// Volume=area^3  Sphere SA=vol*0.25  Branch=1/8 arc
import (GLDrivers)

{{env:AshTree-3D}}
[[script:ash-tree-arcedge-v1]]
[net: webgl-runtime]
[poly: arc-edge-geometry]

(ThreeScene):-: {
  {{env:AshTree-3D}}
  with var (scene) var (s) {
    irin ("background:0x000814 fov:55 py:3 pz:14 fog:true")
    gl.scene
    gl.render
    thenplace var (scene) with var (s)
  }
  irout ("Result: " placeto (scene))
}|';'|

(ArcEdgeNode):-: {
  [poly: arc-edge-geometry]
  with var (d) var (levels) var (s) {
    irin ("name:ashTree d:1.8 levels:5 segs:18 color:0x00ffcc emissive:0x003322 ry:0.0025")
    thenplace var (s) with var (d)
  }
  irout ("Result: " placeto (s))
}|';'|

(AnimateNode):-: {
  with var (s) {
    irin ("target:ashTree ry:0.0025")
    gl.animate
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|
` },
  { name: "Neural Scene", code: `// NEURAL BRPN SCENE — 3D animated brain nodes · LEATR v2
// Visualizes the Lead Edge Ash Tree Reflex neural network
// Each node: 3-shell BRPN (Aerospace/Maritime/Geological)
import (GLDrivers)

{{env:NeuralScene}}
[[script:brpn-neural-v1]]
[poly: neural-geometry]
[net: reflex-signal]

(ThreeScene):-: {
  {{env:NeuralScene}}
  with var (scene) var (s) {
    irin ("background:0x000814 fov:60 py:0 pz:20 fog:true")
    gl.scene
    gl.render
    thenplace var (scene) with var (s)
  }
  irout ("Result: " placeto (scene))
}|';'|

(NeuralNode):-: {
  [poly: brpn-shell-geometry]
  with var (nodeId) var (shells) var (s) {
    irin ("count:12 aerospace:true maritime:true geological:true pulse:true")
    gl.mesh
    thenplace var (shells) with var (nodeId)
    thenplace var (s) with var (shells)
  }
  irout ("Result: " placeto (s))
}|';'|

(SynapseNode):-: {
  [net: signal-propagation]
  with var (from) var (to) var (signal) var (s) {
    irin ("speed:0.8 color:0x00ffcc emissive:0x003322")
    gl.animate
    thenplace var (signal) with var (from)
    thenplace var (s) with var (to)
  }
  irout ("Result: " placeto (s))
}|';'|

(AnimateNode):-: {
  with var (s) {
    irin ("target:neural pulse:true freq:1.2")
    gl.animate
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|
` },
  { name: "Arc Edge Vector", code: `// ARC EDGE VECTOR — Three-axis tangent spline system · LEATR v2
// Port of arc-edge-vector.html to Ash syntax
// Arc Edge math (Justin Craig Venable, doc=3.0 replaces \u03c0):
//   Circumference: sqrt(d \u00d7 3)\u00b2
//   Area: circ\u00b2    Volume: area\u00b3    Sphere SA: vol \u00d7 0.25
//   Branch arc: circ / 8  (every branch = 1/8-circle arc)
import (GLDrivers)

{{env:ArcEdgeVector}}
[[script:arc-edge-v1]]
[poly: arc-edge-geometry]
[net: vector-physics]

(ArcEdgeScene):-: {
  {{env:ArcEdgeVector}}
  [[owner:DART-Meadow]]
  with var (scene) var (s) {
    irin ("background:0x060a10 fov:60 doc:3.0")
    gl.scene
    gl.render
    thenplace var (scene) with var (s)
  }
  irout ("Result: " placeto (scene))
}|';'|

(ArcVectorNode):-: {
  [poly: arc-edge-spline]
  with var (d) var (s) {
    irin ("axis:X influence:0.5 phase:0.0 smooth:true phys:true")
    thenplace var (s) with var (d)
  }
  irout ("Result: " placeto (s))
}|';'|

(ArcVectorNode):-: {
  [poly: arc-edge-spline]
  with var (d) var (s) {
    irin ("axis:Y influence:0.4 phase:1.047 smooth:true phys:true")
    thenplace var (s) with var (d)
  }
  irout ("Result: " placeto (s))
}|';'|

(ArcVectorNode):-: {
  [poly: arc-edge-spline]
  with var (d) var (s) {
    irin ("axis:Z influence:0.6 phase:2.094 smooth:true phys:true")
    thenplace var (s) with var (d)
  }
  irout ("Result: " placeto (s))
}|';'|

(ArcPhysicsNode):-: {
  [net: physics-environment]
  with var (s) {
    irin ("gravity:9.81 wind:15 temp:72 humidity:60 pressure:14.7")
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|

(ArcGridNode):-: {
  [poly: grid-integration]
  with var (s) {
    irin ("enabled:true xz:true xy:true zy:true arcToGrid:true")
    thenplace var (s) with var (s)
  }
  irout ("Result: " placeto (s))
}|';'|
` },
  { name: "Reckon Calculator (Ash)", code: `// RECKON CALCULATOR — scientific calculator, in Ash Edge Language
// Real port of the Reckon engine (see "Reckon Calculator (C++)" for
// the original): tokenizer -> recursive-descent parser -> evaluator,
// same operator precedence chain, same scientific functions.
// A working version of this exact logic runs live as the IDE's
// built-in calculator — open it from the calculator icon in the
// top bar. This file expresses that same pipeline as Ash nodes.
{{env:ReckonCalculator}}
[[script:reckon-calc-v1]]
[poly: expression-tree]

(TokenizerNode):-: {
  {{env:ReckonCalculator}}
  with var (src) var (tokens) {
    irin ("chars:0-9,.,+,-,*,/,^,(,),!,% words:sin,cos,tan,ln,log,sqrt,cbrt,abs,pi,e,nrt")
    thenplace var (tokens) with var (src)
  }
  irout ("Result: " placeto (tokens))
}|';'|

(ParserNode):-: {
  [poly: precedence-chain]
  with var (tokens) var (ast) {
    irin ("expr:term(+|-)* term:power(*|/)* power:unary(^|nrt)? unary:(-|+)?postfix postfix:primary(!|%)*")
    thenplace var (ast) with var (tokens)
  }
  irout ("Result: " placeto (ast))
}|';'|

(EvaluatorNode):-: {
  [poly: recursive-eval]
  with var (ast) var (deg) var (result) {
    irin ("mode:deg fns:sin,cos,tan,asin,acos,atan,sinh,cosh,tanh,ln,log,exp,sqrt,cbrt,abs consts:pi,e")
    thenplace var (result) with var (ast)
  }
  irout ("Result: " placeto (result))
}|';'|

(FormatNode):-: {
  with var (value) var (display) {
    irin ("precision:12 tidy:round-if-near-integer errorText:Error,Overflow,Syntax error,Cannot divide by zero,Mismatched parentheses,Invalid input")
    thenplace var (display) with var (value)
  }
  irout ("Result: " placeto (display))
}|';'|

(TapeNode):-: {
  with var (expr) var (result) var (history) {
    irin ("action:record max:24 storage:localStorage")
    thenplace var (history) with var (expr)
  }
  irout ("Result: " placeto (history))
}|';'|
` },
  { name: "Reckon Calculator (C++)", code: null, fetchPath: "assets/calculator.cpp", lang: "cpp" }
];

// ── Starter templates for real-language mode ──────────────
const LANG_TEMPLATES = {
  python: `# Python 3 — real CPython via Pyodide
def greet(name):
    return f"Hello, {name}!"

for i in range(3):
    print(greet("Ash Tree"), i)
`,
  cpp: `// C / C++ — real Clang, compiled and linked to WebAssembly, run via WASI
#include <cstdio>

int main() {
    printf("Hello from real C++!\\n");
    for (int i = 0; i < 3; i++) {
        printf("count: %d\\n", i);
    }
    return 0;
}
`,
  javascript: `// JavaScript — runs natively
function greet(name) {
  return \`Hello, \${name}!\`;
}

for (let i = 0; i < 3; i++) {
  console.log(greet("Ash Tree"), i);
}
`,
  sql: `-- SQL — real SQLite (sql.js), fresh in-memory database each run
CREATE TABLE nodes (id INTEGER PRIMARY KEY, name TEXT, kind TEXT);
INSERT INTO nodes (name, kind) VALUES ('root', 'main'), ('leaf1', 'note'), ('leaf2', 'note');

SELECT * FROM nodes;
`
};

const CPP_GRAPHICS_TEMPLATE = `// C++ graphical output — draws to a real <canvas> via canvas.h
#include <canvas_main.h>

Canvas canvas(320, 240);

void setup() {
    canvas.setFillStyle("#00ffcc");
}

void loop(double t, double dt) {
    canvas.clearRect(0, 0, 320, 240);
    canvas.beginPath();
    canvas.arc(160, 120, 40 + 20 * (t - (int)t), 0, 6.283);
    canvas.fill(FILL_RULE_NONZERO);
}
`;

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
let currentLang = "ash";

// ── Open-file tabs — each buffer stays live in memory so switching
// tabs is instant and never re-prompts to save; closing a tab
// discards its in-memory buffer (the file itself is untouched if it
// was already saved via the Files panel). ──
let openTabs = [];   // { name, lang, content, dirty }
let activeTabIdx = -1;

function openTab(name, content, lang) {
  // Reuse an existing tab for this filename rather than duplicating it.
  const existingIdx = openTabs.findIndex((t) => t.name === name);
  if (existingIdx >= 0) {
    saveActiveTabContent();
    activeTabIdx = existingIdx;
  } else {
    saveActiveTabContent();
    openTabs.push({ name, lang, content, dirty: false });
    activeTabIdx = openTabs.length - 1;
  }
  const tab = openTabs[activeTabIdx];
  AshEditor.setValue(tab.content);
  setLanguage(tab.lang);
  fileState.currentFile = tab.name;
  markDirty(tab.dirty);
  updateFileChip();
  renderTabstrip();
}

function saveActiveTabContent() {
  if (activeTabIdx >= 0 && openTabs[activeTabIdx]) {
    openTabs[activeTabIdx].content = AshEditor.getValue();
    openTabs[activeTabIdx].dirty = fileState.isDirty;
  }
}

function switchEditorTab(idxOrEvent) {
  const idx = typeof idxOrEvent === "number" ? idxOrEvent : null;
  if (idx === null || idx === activeTabIdx) return;
  saveActiveTabContent();
  activeTabIdx = idx;
  const tab = openTabs[idx];
  AshEditor.setValue(tab.content);
  setLanguage(tab.lang);
  fileState.currentFile = tab.name;
  markDirty(tab.dirty);
  updateFileChip();
  renderTabstrip();
}

function closeTab(idx) {
  const wasActive = idx === activeTabIdx;
  openTabs.splice(idx, 1);
  if (openTabs.length === 0) {
    activeTabIdx = -1;
    renderTabstrip();
    return;
  }
  if (wasActive) {
    const nextIdx = Math.min(idx, openTabs.length - 1);
    activeTabIdx = -1; // force switchEditorTab to actually reload, not no-op
    switchEditorTab(nextIdx);
  } else {
    if (idx < activeTabIdx) activeTabIdx -= 1;
    renderTabstrip();
  }
}

function renderTabstrip() {
  const strip = document.getElementById("editorTabstrip");
  strip.innerHTML = openTabs.map((t, i) => `
    <div class="editor-tab ${i === activeTabIdx ? "active" : ""} ${t.dirty ? "dirty" : ""}" data-idx="${i}">
      <span class="editor-tab-dot"></span>
      <span class="editor-tab-name">${escHtml(t.name)}</span>
      <button class="editor-tab-close" data-closeidx="${i}" title="Close">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join("");
  strip.querySelectorAll(".editor-tab").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".editor-tab-close")) return;
      switchEditorTab(+el.dataset.idx);
    });
  });
  strip.querySelectorAll(".editor-tab-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(+btn.dataset.closeidx);
    });
  });
}

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

// ── Real file-system download, not an in-browser view ──────
// Some mobile browsers open a downloaded file inline (as a text/html
// or text/plain viewer tab) instead of prompting a save-to-device
// dialog, which looks like "the browser kept it" rather than a real
// save. Forcing application/octet-stream — the same trick native
// download managers use — makes every browser treat it as a binary
// attachment and hand it straight to the OS's save flow instead of
// trying to render it.
function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Language switching ─────────────────────────────────────
const LANG_EXT = { ash: ".ash", python: ".py", cpp: ".cpp", javascript: ".js", sql: ".sql" };
const LANG_LABEL = { python: "PYTHON 3", cpp: "C / C++", javascript: "JAVASCRIPT", sql: "SQL" };

function setLanguage(lang) {
  currentLang = lang;
  document.getElementById("langSelect").value = lang;
  const isAsh = lang === "ash";
  document.getElementById("ashFooter").hidden = !isAsh;
  document.getElementById("langConsole").hidden = isAsh;
  if (!isAsh) {
    document.getElementById("langConsoleTitle").textContent = LANG_LABEL[lang];
  }
  // Ash keeps its own Output-tab flow; other languages don't use it.
  document.getElementById("glOutputSection").hidden = true;
  GLOutput.teardown();
}

function langConsoleClear() {
  document.getElementById("langConsoleOutput").innerHTML = "";
  document.getElementById("langCanvas").hidden = true;
}

function langConsoleWrite(text, isStderr) {
  const out = document.getElementById("langConsoleOutput");
  const placeholder = out.querySelector(".placeholder");
  if (placeholder) placeholder.remove();
  // wasm-clang's own log lines carry ANSI color codes meant for a
  // terminal; strip them since this is a plain HTML <div>.
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const span = document.createElement("span");
  if (isStderr) span.className = "stderr-line";
  span.textContent = clean;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function langConsoleStatus(kind, text) {
  const el = document.getElementById("langConsoleStatus");
  el.className = "lang-console-status" + (kind ? " " + kind : "");
  el.textContent = text;
}

// ── Compile / run ─────────────────────────────────────────
function runCompile() {
  if (currentLang !== "ash") return runOtherLanguage();

  setStatus("running", "compiling…");
  const netMode = document.getElementById("netModeToggle").checked;
  try {
    const source = AshEditor.getValue();
    const result = engine.compile(source, netMode);
    renderOutput();
    AshTerminal.render();
    document.getElementById("shellInfo").textContent = `SHELL: ${result.shell}`;
    document.getElementById("buoyInfo").textContent = `BUOY: ${result.buoyancy.toFixed(4)}`;
    setStatus("ok", `compiled · ${result.shell.toLowerCase()}`);
    updateGLOutputSection(source);
    switchTab("output");
  } catch (err) {
    setStatus("err", "compile error");
    console.error(err);
  }
}

// Real multi-language execution — Python (Pyodide), C/C++ (wasm-clang),
// JavaScript (native), SQL (sql.js). Each is a genuine interpreter/
// compiler, not a simulation; output streams into the console panel
// beneath the editor exactly as it's produced.
function runOtherLanguage() {
  const source = AshEditor.getValue();
  langConsoleClear();
  setStatus("running", `running ${currentLang}…`);
  langConsoleStatus("running", "Running…");

  const onOutput = (text) => langConsoleWrite(text, false);
  const onDone = (code) => {
    setStatus("ok", `${currentLang} · exit ${code}`);
    langConsoleStatus("ok", `Finished (exit ${code})`);
  };
  const onError = (message) => {
    setStatus("err", `${currentLang} error`);
    langConsoleStatus("err", "Error");
    langConsoleWrite(message + "\n", true);
  };
  const onLoading = () => {
    langConsoleStatus("running", "Loading runtime… (first run only)");
  };

  if (currentLang === "python") {
    PythonCompiler.run(source, { onOutput, onDone, onError, onLoading });
  } else if (currentLang === "javascript") {
    JsCompiler.run(source, { onOutput, onDone, onError });
  } else if (currentLang === "sql") {
    SqlCompiler.run(source, { onOutput, onDone, onError, onLoading });
  } else if (currentLang === "cpp") {
    const needsCanvas = source.includes("canvas.h") || source.includes("canvas_main.h") || source.includes("Canvas ");
    const canvasEl = document.getElementById("langCanvas");
    if (needsCanvas) {
      canvasEl.hidden = false;
      canvasEl.width = 320; canvasEl.height = 240;
      CppCompiler.attachCanvas(canvasEl);
    } else {
      canvasEl.hidden = true;
    }
    CppCompiler.onOutput = onOutput;
    CppCompiler.onDone = onDone;
    CppCompiler.onError = onError;
    langConsoleStatus("running", "Compiling (clang) → linking (lld) → running…");
    CppCompiler.run(source);
  }
}

// ── GL output panel: shown only when the compiled script imports
// GLDrivers or calls gl.scene — matches hasGLOutput in
// IDECompilerOutputView.swift. Auto-renders on every compile, same
// as the iOS .task{} on IDEGLOutputPanel. ──
function updateGLOutputSection(source) {
  const section = document.getElementById("glOutputSection");
  const shouldShow = GLOutput.hasGLOutput(source);
  section.hidden = !shouldShow;
  if (!shouldShow) {
    GLOutput.teardown();
    return;
  }
  renderGLOutput(source);
}

function renderGLOutput(source) {
  const canvas = document.getElementById("glOutputCanvas");
  const empty = document.getElementById("glOutputEmpty");
  const resetBtn = document.getElementById("glResetBtn");
  canvas.hidden = false;
  empty.hidden = true;
  resetBtn.hidden = false;
  GLOutput.render(source, canvas);
  requestAnimationFrame(() => {
    if (GLOutput.arcEdge) GLOutput.arcEdge.resize();
    if (GLOutput.three) GLOutput.three.resize();
  });
}

function resetGLOutput() {
  GLOutput.teardown();
  document.getElementById("glOutputCanvas").hidden = true;
  document.getElementById("glOutputEmpty").hidden = false;
  document.getElementById("glResetBtn").hidden = true;
}

// ── GL output layout: top/bottom/left/right + collapse ──────
// Default stays "bottom" (stacked under the compiler log) unless the
// user has picked something else before — persisted so it sticks
// across sessions, same as any other display preference.
function initGlLayoutControls() {
  const body = document.getElementById("outputBody");
  const posBtn = document.getElementById("glPositionBtn");
  const posMenu = document.getElementById("glPositionOptions");
  const collapseBtn = document.getElementById("glCollapseBtn");
  const collapseIcon = document.getElementById("glCollapseIcon");

  const savedPos = IDEStorage.get("gl_output_position", "bottom");
  body.dataset.glPosition = savedPos;

  posBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    posMenu.hidden = !posMenu.hidden;
  });
  document.addEventListener("click", () => { posMenu.hidden = true; });
  posMenu.addEventListener("click", (e) => e.stopPropagation());

  posMenu.querySelectorAll("[data-pos]").forEach((btn) => {
    btn.addEventListener("click", () => {
      body.dataset.glPosition = btn.dataset.pos;
      IDEStorage.set("gl_output_position", btn.dataset.pos);
      posMenu.hidden = true;
      // Three.js/WebGL canvases need an explicit resize after their
      // container's dimensions change — a plain CSS reflow doesn't
      // trigger it on its own.
      requestAnimationFrame(() => {
        if (GLOutput.three) GLOutput.three.resize();
        if (GLOutput.arcEdge) GLOutput.arcEdge.resize();
      });
    });
  });

  collapseBtn.addEventListener("click", () => {
    const collapsed = body.classList.toggle("gl-collapsed");
    collapseIcon.innerHTML = collapsed
      ? '<polyline points="18 15 12 9 6 15"/>'
      : '<polyline points="6 9 12 15 18 9"/>';
    if (!collapsed) {
      requestAnimationFrame(() => {
        if (GLOutput.three) GLOutput.three.resize();
        if (GLOutput.arcEdge) GLOutput.arcEdge.resize();
      });
    }
  });
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
  const extToLang = { ".ash": "ash", ".py": "python", ".cpp": "cpp", ".cc": "cpp", ".c": "cpp", ".js": "javascript", ".sql": "sql" };
  const ext = "." + name.split(".").pop().toLowerCase();
  openTab(name, content, extToLang[ext] || "ash");
  renderFilesList();
  switchTab("editor");
}

function saveCurrentFile() {
  IDEStorage.saveFile(fileState.currentFile, AshEditor.getValue());
  markDirty(false);
  if (activeTabIdx >= 0) openTabs[activeTabIdx].dirty = false;
  renderTabstrip();
  renderFilesList();
}

function newFile() {
  // uniqueFileName only checks saved files — a freshly-opened, not-yet-
  // saved tab (like the initial untitled.ash from boot()) wouldn't be
  // seen as taken, so also check against currently open tab names.
  let name = IDEStorage.uniqueFileName("untitled");
  while (openTabs.some((t) => t.name === name)) {
    const m = name.match(/^untitled(?:_(\d+))?\.ash$/);
    const n = m && m[1] ? parseInt(m[1], 10) + 1 : 1;
    name = `untitled_${n}.ash`;
  }
  const initial = `// ${name}\n// Ash Edge Language · LEATR v2\n{{env:MyProject}}\n[[script:new-script]]\n\n`;
  IDEStorage.saveFile(name, initial);
  openTab(name, initial, "ash");
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
  document.getElementById("mmCurveSelect").value = mashCurveStyleId(doc);
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
  const curveSel = document.getElementById("mmCurveSelect");
  curveSel.innerHTML = MASH_CURVE_STYLES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
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
  curveSel.addEventListener("change", () => {
    const doc = mashStore.activeDoc;
    mashStore.pushHistory(doc);
    // Independent of theme and layout — switching this never touches
    // node positions or colors, and switching back later restores
    // exactly what was there before with nothing to "rebuild".
    doc.curveStyle = curveSel.value;
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
      const name = `${mashStore.activeDoc.title.replace(/[^a-z0-9]/gi, "_") || "generated"}.ash`;
      openTab(name, code, "ash");
      markDirty(true);
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
  sel.addEventListener("change", async () => {
    if (sel.value === "") return;
    const ex = EXAMPLES[+sel.value];
    const lang = ex.lang || "ash";
    const extMap = { ash: ".ash", cpp: ".cpp" };
    const name = `${ex.name.replace(/\s+/g, "-").toLowerCase()}${extMap[lang] || ".ash"}`;
    if (ex.fetchPath) {
      // Real C++ example fetched from the same bundled asset the
      // built-in calculator's "C++ source" tab reads — one file,
      // two places it's shown, always in sync.
      try {
        const res = await fetch(ex.fetchPath);
        const code = await res.text();
        openTab(name, code, lang);
      } catch (e) {
        toast("Could not load " + ex.fetchPath);
      }
    } else {
      openTab(name, ex.code, lang);
    }
    markDirty(false);
    sel.value = "";
  });

  document.getElementById("langSelect").addEventListener("change", (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    // Loading a language's starter template is a convenience, not a
    // requirement — only do it when the buffer is still the default/
    // untouched Ash script or another language's untouched template,
    // so switching languages never silently discards real work.
    const isBlankish = !fileState.isDirty;
    if (lang !== "ash" && isBlankish) {
      openTab(`untitled${LANG_EXT[lang]}`, LANG_TEMPLATES[lang], lang);
    } else if (lang === "ash" && isBlankish) {
      openTab("untitled.ash", DEFAULT_SCRIPT, "ash");
    }
  });

  document.getElementById("langConsoleClearBtn").addEventListener("click", langConsoleClear);

  document.getElementById("newFileBtn").addEventListener("click", newFile);
  document.getElementById("filesNewBtn").addEventListener("click", newFile);

  document.getElementById("downloadBtn").addEventListener("click", () => {
    downloadTextFile(fileState.currentFile, AshEditor.getValue());
  });

  document.getElementById("uploadInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      const extToLang = { ".ash": "ash", ".py": "python", ".cpp": "cpp", ".cc": "cpp", ".c": "cpp", ".js": "javascript", ".sql": "sql" };
      openTab(file.name, reader.result, extToLang[ext] || "ash");
      markDirty(false);
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
  AshEditor.onChange = () => {
    markDirty(true);
    if (activeTabIdx >= 0) {
      openTabs[activeTabIdx].dirty = true;
      renderTabstrip();
    }
  };

  const savedContent = IDEStorage.loadFile("untitled.ash");
  openTab("untitled.ash", savedContent !== null ? savedContent : DEFAULT_SCRIPT, "ash");
  markDirty(false);

  AshTerminal.init(engine, () => AshEditor.getValue());
  initEditorToolbar();
  initNodeModal();
  initMindMap();
  MazeUI.init(() => AshEditor.getValue());
  CalcWindow.init();
  renderFilesList();

  document.getElementById("helpContent").innerHTML = HELP_HTML;

  document.getElementById("runBtn").addEventListener("click", runCompile);
  window.addEventListener("ash:run", runCompile);

  document.getElementById("glRenderBtn").addEventListener("click", () => renderGLOutput(AshEditor.getValue()));
  document.getElementById("glResetBtn").addEventListener("click", resetGLOutput);
  initGlLayoutControls();

  // Autosave current buffer periodically + on tab switch away from editor
  setInterval(() => { if (fileState.isDirty) saveCurrentFile(); }, 4000);
  window.addEventListener("beforeunload", () => { if (fileState.isDirty) saveCurrentFile(); });

  setStatus("", "ready");
}

document.addEventListener("DOMContentLoaded", boot);
