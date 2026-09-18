// ============================================================
//  cpp-compiler.js — C/C++ real compile+run controller
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Drives vendor/wasm-clang/cpp-worker.js from the main thread.
//  Real Clang, real linking, real WASI execution — not a
//  simulation. Console programs stream stdout live; programs
//  that #include <canvas.h>/<canvas_main.h> draw into a real
//  <canvas> element via OffscreenCanvas.
// ============================================================

const CppCompiler = {
  worker: null,
  running: false,
  onOutput: null,
  onDone: null,
  onError: null,
  canvasEl: null,

  _ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker("vendor/wasm-clang/cpp-worker.js");
    this.worker.onmessage = (event) => {
      const msg = event.data;
      switch (msg.id) {
        case "stdout":
          if (this.onOutput) this.onOutput(msg.text);
          break;
        case "done":
          this.running = false;
          if (this.onDone) this.onDone(msg.exitCode);
          break;
        case "error":
          this.running = false;
          if (this.onError) this.onError(msg.message);
          break;
      }
    };
    this.worker.onerror = (e) => {
      this.running = false;
      if (this.onError) this.onError(e.message || "Worker error");
    };
    return this.worker;
  },

  attachCanvas(canvasEl) {
    this.canvasEl = canvasEl;
    const worker = this._ensureWorker();
    if (canvasEl.transferControlToOffscreen) {
      const offscreen = canvasEl.transferControlToOffscreen();
      worker.postMessage({ id: "canvas", canvas: offscreen }, [offscreen]);
    }
  },

  run(source) {
    if (this.running) return;
    this.running = true;
    const worker = this._ensureWorker();
    worker.postMessage({ id: "run", source });
  },

  stop() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.running = false;
  }
};
