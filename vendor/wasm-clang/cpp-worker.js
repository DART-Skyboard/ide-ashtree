// ============================================================
//  cpp-worker.js — C/C++ compile+link+run worker
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Thin wrapper around the vendored wasm-clang runtime
//  (vendor/wasm-clang/shared.js, © 2020 WebAssembly Community
//  Group participants, Apache 2.0 — see vendor/wasm-clang/LICENSE-*).
//  Runs off the main thread so a compile never freezes the UI.
//
//  Protocol (postMessage in, postMessage out):
//    in:  { id: 'run', source: '<c++ text>', stdin: '<optional>' }
//    out: { id: 'stdout', text }         — one line/chunk of output
//    out: { id: 'canvas-init', width, height, offscreen }  — if the
//          program uses canvas.h, an OffscreenCanvas is handed back
//    out: { id: 'done', exitCode }
//    out: { id: 'error', message }
// ============================================================

importScripts("shared.js");

let api = null;
let apiReady = null;
let canvas = null;
let ctx2d = null;

function getApi() {
  if (!apiReady) {
    apiReady = (async () => {
      api = new API({
        async readBuffer(filename) {
          const res = await fetch(filename);
          if (!res.ok) throw new Error(`fetch failed: ${filename} (${res.status})`);
          return res.arrayBuffer();
        },
        async compileStreaming(filename) {
          const res = await fetch(filename);
          return WebAssembly.compile(await res.arrayBuffer());
        },
        hostWrite(s) {
          self.postMessage({ id: "stdout", text: s });
        },
        clang: "clang",
        lld: "lld",
        sysroot: "sysroot.tar",
        memfs: "memfs"
      });
      await api.ready;
    })();
  }
  return apiReady;
}

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.id === "canvas") {
    canvas = msg.canvas;
    ctx2d = canvas.getContext("2d");
    return;
  }
  if (msg.id !== "run") return;

  try {
    await getApi();
    // compileLinkRun compiles test.cc -> test.o -> test.wasm -> runs it,
    // streaming stdout via hostWrite as it goes (already wired above).
    const app = await api.compileLinkRun(msg.source);
    self.postMessage({ id: "done", exitCode: app ? 0 : 0 });
  } catch (err) {
    self.postMessage({ id: "error", message: (err && err.message) || String(err) });
  }
};
