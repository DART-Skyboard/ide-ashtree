// ============================================================
//  python-compiler.js — Real Python 3 execution via Pyodide
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Pyodide (CPython compiled to WebAssembly) loaded lazily from
//  the jsDelivr CDN on first use — real interpreter, real stdout/
//  stderr, real exceptions and tracebacks. Not a simulation.
// ============================================================

const PythonCompiler = {
  pyodide: null,
  loading: null,

  async _ensure() {
    if (this.pyodide) return this.pyodide;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (!window.loadPyodide) {
        await this._loadScript("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
      }
      this.pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
      });
      return this.pyodide;
    })();
    return this.loading;
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  },

  async run(source, opts) {
    opts = opts || {};
    const onOutput = opts.onOutput, onDone = opts.onDone, onError = opts.onError, onLoading = opts.onLoading;
    try {
      if (!this.pyodide && onLoading) onLoading();
      const py = await this._ensure();

      py.setStdout({ batched: (text) => onOutput && onOutput(text + "\n") });
      py.setStderr({ batched: (text) => onOutput && onOutput(text + "\n") });

      await py.runPythonAsync(source);
      onDone && onDone(0);
    } catch (err) {
      onError && onError(err && err.message ? err.message : String(err));
    }
  }
};
