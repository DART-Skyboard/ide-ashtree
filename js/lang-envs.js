// ============================================================
//  lang-envs.js — Language environment table (parity with the iOS app's
//  IDELanguageEnvironment.swift). Data only; nothing here touches the DOM.
//  Wire-up (index.html <select id="langSelect"> + app.js LANG_EXT /
//  LANG_TEMPLATES / extToLang) is documented in docs/samara/PARITY.md.
//  run: leatr | web (iframe srcdoc) | pyodide | sqljs | judge0 (remote,
//  ce.judge0.com) | piston (remote).
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================
const LANG_ENVS = [
 {
  "id": "ash",
  "name": "Ash Edge Language",
  "ext": ".ash",
  "category": "native",
  "color": "#00ffcc",
  "wrapper": "",
  "template": "// Ash Edge Language · LEATR v2\n// © 2025 DART Meadow | Radical Deepscale LLC.\n{{env:MyProject}}\n[[script:main]]\n[poly: data-matrix]\n[net: layer-0]\n\n(MainNode):-: {\n    with var (s) {\n        irin (\"Hello: World\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "leatr"
 },
 {
  "id": "html",
  "name": "HTML5",
  "ext": ".html",
  "category": "web",
  "color": "#e34c26",
  "wrapper": "(HTMLNode)",
  "template": "// HTML5 via Ash Edge Language\n{{env:WebProject}}\n[[script:html-doc]]\n[poly: dom-tree]\n\n(HTMLNode):-: {\n    irin (\"doctype:html lang:en title:My Page\")\n    gl.dom\n    thenplace var (html) with var (doc)\n    irout (\"Result: \" placeto (html))\n}|';'|\n\n(HeadNode):-: {\n    with var (meta) {\n        irin (\"charset:UTF-8 viewport:width=device-width,initial-scale=1\")\n        thenplace var (meta) with var (meta)\n    }\n    irout (\"Result: \" placeto (meta))\n}|';'|\n\n(BodyNode):-: {\n    with var (content) {\n        irin (\"tag:h1 text:Hello World\")\n        irin (\"tag:p text:Built with Ash Edge Language\")\n        thenplace var (content) with var (content)\n    }\n    irout (\"Result: \" placeto (content))\n}|';'|",
  "run": "web"
 },
 {
  "id": "css",
  "name": "CSS3",
  "ext": ".css",
  "category": "web",
  "color": "#264de4",
  "wrapper": "(CSSNode)",
  "template": "// CSS3 via Ash Edge Language\n{{env:StyleProject}}\n[[script:stylesheet]]\n[poly: style-tree]\n\n(CSSNode):-: {\n    irin (\"selector:body bg:#0d1117 color:#c9d1d9 font:monospace\")\n    thenplace var (s) with var (s)\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "web"
 },
 {
  "id": "javascript",
  "name": "JavaScript",
  "ext": ".js",
  "category": "web",
  "color": "#f7df1e",
  "wrapper": "(JSNode)",
  "template": "// JavaScript via Ash Edge Language\n{{env:JSProject}}\n[[script:js-main]]\n[poly: js-runtime]\n[net: event-loop]\n\n(JSNode):-: {\n    with var (ctx) {\n        irin (\"runtime:browser strict:true\")\n        thenplace var (ctx) with var (ctx)\n    }\n    irout (\"Result: \" placeto (ctx))\n}|';'|\n\n(FunctionNode):-: {\n    with var (fn) var (result) {\n        irin (\"name:main args:none body:console.log\")\n        thenplace var (result) with var (fn)\n    }\n    irout (\"Result: \" placeto (result))\n}|';'|",
  "run": "web"
 },
 {
  "id": "typescript",
  "name": "TypeScript",
  "ext": ".ts",
  "category": "web",
  "color": "#3178c6",
  "wrapper": "(TSNode)",
  "template": "// TypeScript via Ash Edge Language\n{{env:TSProject}}\n[[script:ts-main]]\n[poly: ts-runtime]\n\n(TSNode):-: {\n    with var (ctx) {\n        irin (\"runtime:node strict:true module:commonjs\")\n        thenplace var (ctx) with var (ctx)\n    }\n    irout (\"Result: \" placeto (ctx))\n}|';'|",
  "run": "judge0",
  "judge0": 74
 },
 {
  "id": "threejs",
  "name": "Three.js",
  "ext": ".js",
  "category": "web",
  "color": "#049ef4",
  "wrapper": "(ThreeJSNode)",
  "template": "// Three.js 3D Scene via Ash Edge Language\nimport (GLDrivers)\n{{env:ThreeProject}}\n[[script:three-scene]]\n[poly: webgl-geometry]\n[net: render-loop]\n\n(ThreeJSNode):-: {\n    with var (scene) var (s) {\n        irin (\"renderer:WebGLRenderer antialias:true bg:#000000\")\n        irin (\"camera:PerspectiveCamera fov:75 near:0.1 far:1000 z:5\")\n        gl.scene\n        gl.render\n        thenplace var (scene) with var (s)\n    }\n    irout (\"Result: \" placeto (scene))\n}|';'|\n\n(MeshNode):-: {\n    [poly: mesh-geometry]\n    with var (mesh) {\n        irin (\"geometry:BoxGeometry w:1 h:1 d:1 material:MeshStandardMaterial color:#00ffcc\")\n        gl.mesh\n        thenplace var (mesh) with var (mesh)\n    }\n    irout (\"Result: \" placeto (mesh))\n}|';'|",
  "run": "web"
 },
 {
  "id": "react",
  "name": "React / JSX",
  "ext": ".jsx",
  "category": "web",
  "color": "#61dafb",
  "wrapper": "(ReactNode)",
  "template": "// React JSX via Ash Edge Language\n{{env:ReactProject}}\n[[script:react-app]]\n[poly: component-tree]\n[net: virtual-dom]\n\n(ReactNode):-: {\n    with var (component) {\n        irin (\"name:App state:count=0 props:none hooks:useState\")\n        thenplace var (component) with var (component)\n    }\n    irout (\"Result: \" placeto (component))\n}|';'|",
  "run": "web"
 },
 {
  "id": "vue",
  "name": "Vue.js",
  "ext": ".vue",
  "category": "web",
  "color": "#42b883",
  "wrapper": "(VueNode)",
  "template": "// Vue.js SFC via Ash Edge Language\n{{env:VueProject}}\n[[script:vue-component]]\n[poly: sfc-tree]\n\n(VueNode):-: {\n    with var (sfc) {\n        irin (\"template:div script:setup style:scoped lang:js\")\n        thenplace var (sfc) with var (sfc)\n    }\n    irout (\"Result: \" placeto (sfc))\n}|';'|",
  "run": "web"
 },
 {
  "id": "php",
  "name": "PHP",
  "ext": ".php",
  "category": "web",
  "color": "#8892bf",
  "wrapper": "(PHPNode)",
  "template": "// PHP via Ash Edge Language\n{{env:PHPProject}}\n[[script:php-script]]\n[poly: php-runtime]\n\n(PHPNode):-: {\n    with var (s) {\n        irin (\"version:8.2 strict:true namespace:App\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 68
 },
 {
  "id": "python",
  "name": "Python 3",
  "ext": ".py",
  "category": "scripting",
  "color": "#3776ab",
  "wrapper": "(PythonNode)",
  "template": "// Python 3 via Ash Edge Language\n{{env:PythonProject}}\n[[script:py-main]]\n[poly: py-runtime]\n[net: interpreter-loop]\n\n(PythonNode):-: {\n    with var (env) {\n        irin (\"version:3.11 strict:true encoding:utf-8\")\n        thenplace var (env) with var (env)\n    }\n    irout (\"Result: \" placeto (env))\n}|';'|\n\n(FunctionNode):-: {\n    [poly: py-function]\n    with var (fn) var (result) {\n        irin (\"name:main args:none returns:None body:print\")\n        thenplace var (result) with var (fn)\n    }\n    irout (\"Result: \" placeto (result))\n}|';'|",
  "run": "pyodide"
 },
 {
  "id": "bash",
  "name": "Bash / Shell",
  "ext": ".sh",
  "category": "scripting",
  "color": "#4eaa25",
  "wrapper": "(BashNode)",
  "template": "// Bash Script via Ash Edge Language\n{{env:ShellProject}}\n[[script:bash-main]]\n[poly: shell-runtime]\n\n(BashNode):-: {\n    with var (s) {\n        irin (\"shell:/bin/bash set:-euo pipefail\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 46
 },
 {
  "id": "ruby",
  "name": "Ruby",
  "ext": ".rb",
  "category": "scripting",
  "color": "#cc342d",
  "wrapper": "(RubyNode)",
  "template": "// Ruby via Ash Edge Language\n{{env:RubyProject}}\n[[script:rb-main]]\n[poly: ruby-runtime]\n\n(RubyNode):-: {\n    with var (s) {\n        irin (\"version:3.2 frozen_string_literal:true encoding:utf-8\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 72
 },
 {
  "id": "python_ml",
  "name": "Python · ML/Data",
  "ext": ".py",
  "category": "data",
  "color": "#ff6f00",
  "wrapper": "(MLNode)",
  "template": "// Python ML / Data Science via Ash Edge Language\n{{env:MLProject}}\n[[script:ml-pipeline]]\n[poly: tensor-graph]\n[net: neural-signal]\n\n(MLNode):-: {\n    with var (env) {\n        irin (\"libs:numpy,pandas,torch,sklearn version:3.11\")\n        thenplace var (env) with var (env)\n    }\n    irout (\"Result: \" placeto (env))\n}|';'|\n\n(DatasetNode):-: {\n    [poly: data-matrix]\n    with var (data) {\n        irin (\"source:csv path:data.csv target:label features:all\")\n        thenplace var (data) with var (data)\n    }\n    irout (\"Result: \" placeto (data))\n}|';'|\n\n(ModelNode):-: {\n    [poly: neural-geometry]\n    with var (model) var (result) {\n        irin (\"arch:transformer layers:6 heads:8 hidden:512 activation:relu\")\n        thenplace var (result) with var (model)\n    }\n    irout (\"Result: \" placeto (result))\n}|';'|",
  "run": "pyodide"
 },
 {
  "id": "sql",
  "name": "SQL",
  "ext": ".sql",
  "category": "data",
  "color": "#336791",
  "wrapper": "(SQLNode)",
  "template": "// SQL via Ash Edge Language\n{{env:SQLProject}}\n[[script:sql-query]]\n[poly: db-schema]\n\n(SQLNode):-: {\n    with var (db) {\n        irin (\"dialect:postgresql version:15 schema:public\")\n        thenplace var (db) with var (db)\n    }\n    irout (\"Result: \" placeto (db))\n}|';'|",
  "run": "sqljs"
 },
 {
  "id": "r",
  "name": "R",
  "ext": ".r",
  "category": "data",
  "color": "#276dc3",
  "wrapper": "(RStatNode)",
  "template": "// R Statistical Language via Ash Edge Language\n{{env:RProject}}\n[[script:r-analysis]]\n[poly: stat-model]\n\n(RStatNode):-: {\n    with var (s) {\n        irin (\"version:4.3 tidyverse:true ggplot2:true\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 80
 },
 {
  "id": "swift",
  "name": "Swift",
  "ext": ".swift",
  "category": "systems",
  "color": "#fa7343",
  "wrapper": "(SwiftNode)",
  "template": "// Swift via Ash Edge Language\n{{env:SwiftProject}}\n[[script:swift-main]]\n[poly: swift-runtime]\n\n(SwiftNode):-: {\n    with var (s) {\n        irin (\"version:5.10 platform:iOS,macOS strict:true\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 83
 },
 {
  "id": "rust",
  "name": "Rust",
  "ext": ".rs",
  "category": "systems",
  "color": "#dea584",
  "wrapper": "(RustNode)",
  "template": "// Rust via Ash Edge Language\n{{env:RustProject}}\n[[script:rust-main]]\n[poly: ownership-graph]\n\n(RustNode):-: {\n    with var (s) {\n        irin (\"edition:2021 features:async,tokio target:release\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 73
 },
 {
  "id": "go",
  "name": "Go",
  "ext": ".go",
  "category": "systems",
  "color": "#00acd7",
  "wrapper": "(GoNode)",
  "template": "// Go via Ash Edge Language\n{{env:GoProject}}\n[[script:go-main]]\n[poly: goroutine-graph]\n\n(GoNode):-: {\n    with var (s) {\n        irin (\"version:1.22 module:main goroutines:true\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 60
 },
 {
  "id": "cpp",
  "name": "C++",
  "ext": ".cpp",
  "category": "systems",
  "color": "#00599c",
  "wrapper": "(CppNode)",
  "template": "// C++ via Ash Edge Language\n{{env:CppProject}}\n[[script:cpp-main]]\n[poly: memory-graph]\n\n(CppNode):-: {\n    with var (s) {\n        irin (\"standard:c++23 compiler:clang optimize:O2\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 54
 },
 {
  "id": "kotlin",
  "name": "Kotlin",
  "ext": ".kt",
  "category": "mobile",
  "color": "#7f52ff",
  "wrapper": "(KotlinNode)",
  "template": "// Kotlin via Ash Edge Language\n{{env:KotlinProject}}\n[[script:kotlin-main]]\n[poly: jvm-runtime]\n\n(KotlinNode):-: {\n    with var (s) {\n        irin (\"version:1.9 target:android jvm:17\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "judge0",
  "judge0": 78
 },
 {
  "id": "dart",
  "name": "Dart / Flutter",
  "ext": ".dart",
  "category": "mobile",
  "color": "#54c5f8",
  "wrapper": "(DartNode)",
  "template": "// Dart / Flutter via Ash Edge Language\n{{env:DartProject}}\n[[script:dart-main]]\n[poly: widget-tree]\n\n(DartNode):-: {\n    with var (s) {\n        irin (\"sdk:dart version:3.3 flutter:3.19\")\n        thenplace var (s) with var (s)\n    }\n    irout (\"Result: \" placeto (s))\n}|';'|",
  "run": "piston"
 }
];
const LangEnvs = {
  all: LANG_ENVS,
  byId(id) { return LANG_ENVS.find((e) => e.id === id) || null; },
  byExt(ext) { ext = String(ext).toLowerCase(); return LANG_ENVS.find((e) => e.ext === ext && e.id !== "threejs" && e.id !== "python_ml") || null; },
  extOf(id) { const e = this.byId(id); return e ? e.ext : ".ash"; },
  templateOf(id) { const e = this.byId(id); return e ? e.template : ""; }
};
if (typeof module !== "undefined") module.exports = { LANG_ENVS, LangEnvs };
