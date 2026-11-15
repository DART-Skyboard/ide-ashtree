// ============================================================
//  lang-runners.js — runners for the extra language environments (web iframe
//  sandbox + Judge0 CE remote compiler). Existing local runners (Python/Pyodide,
//  JS, SQL, C++ wasm-clang) stay in app.js. Needs lang-envs.js loaded first.
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================
const LangRunners = (function () {
  // Real, runnable starters (the iOS Ash-wrapper stubs are config placeholders, not source).
  const STARTERS = {
    html: '<!doctype html>\n<html><head><meta charset="utf-8"><title>Hello</title></head>\n<body style="font-family:system-ui;background:#0d1117;color:#c9d1d9">\n<h1>Hello from Ash Tree IDE</h1>\n<p>Edit me and press RUN.</p>\n</body></html>\n',
    css: 'body { background:#0d1117; color:#c9d1d9; font-family:system-ui; padding:24px }\nh1 { color:#00ffcc }\n.card { border:1px solid #30363d; border-radius:12px; padding:16px }\n',
    threejs: 'const scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);\ncamera.position.z = 3;\nconst renderer = new THREE.WebGLRenderer({antialias:true});\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.appendChild(renderer.domElement);\nconst mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8,0.25,100,16), new THREE.MeshNormalMaterial());\nscene.add(mesh);\n(function loop(){ requestAnimationFrame(loop); mesh.rotation.x += 0.01; mesh.rotation.y += 0.013; renderer.render(scene, camera); })();\n',
    react: 'function App() {\n  const [n, setN] = React.useState(0);\n  return <div style={{fontFamily:"system-ui",padding:24}}>\n    <h1>Count: {n}</h1>\n    <button onClick={() => setN(n + 1)}>+1</button>\n  </div>;\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n',
    vue: '<template>\n  <div style="font-family:system-ui;padding:24px">\n    <h1>Count: {{ n }}</h1>\n    <button @click="n++">+1</button>\n  </div>\n</template>\n<script>\nexport default { data() { return { n: 0 }; } };\n</script>\n',
    typescript: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("Ash Tree"));\n',
    php: '<?php\necho "Hello, Ash Tree!\\n";\n',
    bash: 'echo "Hello, Ash Tree!"\n',
    ruby: 'puts "Hello, Ash Tree!"\n',
    r: 'cat("Hello, Ash Tree!\\n")\n',
    swift: 'print("Hello, Ash Tree!")\n',
    rust: 'fn main() {\n    println!("Hello, Ash Tree!");\n}\n',
    go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Ash Tree!")\n}\n',
    kotlin: 'fun main() {\n    println("Hello, Ash Tree!")\n}\n',
    dart: 'void main() {\n  print("Hello, Ash Tree!");\n}\n'
  };
  const CDN = {
    three: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    react: "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
    reactdom: "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
    babel: "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js",
    vue: "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.21/vue.global.prod.min.js"
  };
  function esc(s) { return String(s).replace(/<\/script/gi, "<\\/script"); }
  function buildWebHTML(id, src) {
    const base = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>html,body{margin:0}</style>";
    if (id === "html") return src;
    if (id === "css") return base + "<style>" + src + "</style></head><body><h1>CSS preview</h1><div class=card><p>Styled by your stylesheet.</p><button>Button</button></div></body></html>";
    if (id === "threejs") return base + "<script src='" + CDN.three + "'><\/script></head><body><script>" + esc(src) + "<\/script></body></html>";
    if (id === "react") return base + "<script src='" + CDN.react + "'><\/script><script src='" + CDN.reactdom + "'><\/script><script src='" + CDN.babel + "'><\/script></head><body><div id=root></div><script type='text/babel'>" + esc(src) + "<\/script></body></html>";
    if (id === "vue") {
      const t = /<template>([\s\S]*?)<\/template>/.exec(src), s = /<script>([\s\S]*?)<\/script>/.exec(src);
      const comp = s ? s[1].replace(/export\s+default/, "const Comp =") : "const Comp = {};";
      return base + "<script src='" + CDN.vue + "'><\/script></head><body><div id=app></div><script>" + esc(comp) + ";Comp.template=" + JSON.stringify(t ? t[1] : "<div/>") + ";Vue.createApp(Comp).mount('#app')<\/script></body></html>";
    }
    return src;
  }
  async function runJudge0(env, src, cb) {
    cb.onLoading && cb.onLoading();
    let res;
    try {
      res = await fetch("https://ce.judge0.com/submissions/?base64_encoded=false&wait=true", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_id: env.judge0, source_code: src, stdin: "" })
      });
    } catch (e) {
      return cb.onError("Couldn't reach the remote compiler (Judge0 CE). It may be offline or blocking this site (CORS). Details: " + e.message);
    }
    if (!res.ok) return cb.onError("Remote compiler returned HTTP " + res.status + (res.status === 429 ? " (rate limited — wait a moment and retry)" : ""));
    const j = await res.json();
    if (j.compile_output) cb.onOutput(j.compile_output.replace(/\n?$/, "\n"));
    if (j.stdout) cb.onOutput(j.stdout);
    if (j.stderr) cb.onOutput(j.stderr);
    const st = (j.status && j.status.id) || 0;
    if (st > 3 && !j.stderr && !j.compile_output) cb.onError((j.status && j.status.description) || "Run failed");
    cb.onDone(j.exit_code != null ? j.exit_code : (st === 3 ? 0 : 1));
  }
  async function runPiston(env, src, cb) {
    cb.onLoading && cb.onLoading();
    try {
      const r = await fetch("https://emkc.org/api/v2/piston/execute", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: env.piston || env.id, version: "*", files: [{ content: src }] }) });
      if (!r.ok) return cb.onError("Remote compiler (Piston) returned HTTP " + r.status + ". It may require access now; try another language runner.");
      const j = await r.json(), run = j.run || {};
      if (j.compile && j.compile.output) cb.onOutput(j.compile.output);
      if (run.output) cb.onOutput(run.output);
      cb.onDone(run.code || 0);
    } catch (e) { cb.onError("Couldn't reach the remote compiler (Piston): " + e.message); }
  }
  return { STARTERS, buildWebHTML, runJudge0, runPiston };
})();
if (typeof module !== "undefined") module.exports = LangRunners;
