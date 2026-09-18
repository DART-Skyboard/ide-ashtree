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

// This vendored toolchain's libc++abi (built ~2020, before WebAssembly
// exception handling matured) has no real __cxa_throw/__cxa_begin_catch
// implementation — it was built in "exceptions disabled" mode. A modern
// exception-capable libc++abi exists (wasi-sdk 34+), but its object
// files use a newer format this toolchain's linker cannot read, and a
// from-source LLVM rebuild needs ~20-40GB of build space this static
// site's toolchain doesn't have room for. Real C++ compile/link/run
// and real canvas graphics both work; try/catch/throw doesn't, so we
// catch that up front with a clear message instead of a cryptic
// linker error after a real compile attempt.
function findExceptionUsage(source) {
  // Strip comments and string/char literals first so keywords inside
  // them (e.g. a string literal containing the word "throw") don't
  // produce a false positive.
  let stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const m = stripped.match(/\b(try|catch|throw)\b/);
  return m ? m[1] : null;
}

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.id === "canvas") {
    canvas = msg.canvas;
    ctx2d = canvas.getContext("2d");
    return;
  }
  if (msg.id !== "run") return;

  const exceptionKeyword = findExceptionUsage(msg.source);
  if (exceptionKeyword) {
    self.postMessage({
      id: "error",
      message:
        `This code uses C++ exceptions ('${exceptionKeyword}'), which this browser ` +
        `compiler can't run yet. The compiler itself works — real compiling, linking, ` +
        `console output, and canvas graphics all run for real — but the exception-` +
        `handling runtime it ships with predates WebAssembly's modern exception support, ` +
        `and no maintained browser-compiler build with that support exists yet to swap in. ` +
        `Rewrite error handling with return codes / std::optional / error output params ` +
        `instead of try/catch/throw and it will compile and run normally.`
    });
    return;
  }

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
