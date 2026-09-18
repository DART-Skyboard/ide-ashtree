// ============================================================
//  js-compiler.js — Real JavaScript execution (native)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Runs user JS in a real function scope, capturing console.log/
//  warn/error/info so output appears in the terminal exactly like
//  every other language here. No transpiling, no simulation — this
//  is the actual JS engine executing the code.
// ============================================================

const JsCompiler = {
  running: false,

  async run(source, opts) {
    opts = opts || {};
    const onOutput = opts.onOutput, onDone = opts.onDone, onError = opts.onError;
    this.running = true;

    const fmt = (args) => args.map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a, null, 2); } catch (e) { return String(a); }
    }).join(" ");

    const sandboxConsole = {
      log: function () { onOutput && onOutput(fmt(Array.prototype.slice.call(arguments)) + "\n"); },
      info: function () { onOutput && onOutput(fmt(Array.prototype.slice.call(arguments)) + "\n"); },
      warn: function () { onOutput && onOutput("[warn] " + fmt(Array.prototype.slice.call(arguments)) + "\n"); },
      error: function () { onOutput && onOutput("[error] " + fmt(Array.prototype.slice.call(arguments)) + "\n"); }
    };

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction("console", source);
      const result = await fn(sandboxConsole);
      if (result !== undefined) onOutput && onOutput(fmt([result]) + "\n");
      this.running = false;
      onDone && onDone(0);
    } catch (err) {
      this.running = false;
      onError && onError(err && err.stack ? err.stack : String(err));
    }
  }
};
