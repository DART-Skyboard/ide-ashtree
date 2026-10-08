// ============================================================
//  terminal.js — Terminal panel rendering + input handling
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const AshTerminal = {
  logEl: null,
  inputEl: null,
  engine: null,
  getSource: null,

  init(engine, getSource) {
    this.engine = engine;
    this.getSource = getSource;
    this.logEl = document.getElementById("terminalLog");
    this.inputEl = document.getElementById("terminalInput");

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const cmd = this.inputEl.value;
        if (cmd.trim() === "") return;
        this.inputEl.value = "";
        this.handleCommand(cmd);
      }
    });

    // Seed with a welcome line
    engine.terminalLines.push({
      text: "Ash Tree IDE · LEATR v2 Terminal — type 'help' for commands",
      color: "#4a8a7a",
      isSystem: true
    });
    this.render();
  },

  _nonAshLines: [],

  // Ash commands go to the Ash engine; every other language is run by its own real compiler.
  handleCommand(cmd) {
    const lang = typeof currentLang !== "undefined" ? currentLang : "ash";
    if (lang !== "ash") { this._handleNonAshCommand(cmd, lang); return; }
    this.engine.handleTerminalCommand(cmd, this.getSource());
    this.render();
  },

  _line(text, color) {
    const clean = String(text).replace(/\x1b\[[0-9;]*m/g, "");
    clean.split("\n").forEach((t, i, a) => {
      if (t === "" && i === a.length - 1) return;
      this._nonAshLines.push({ text: t, color: color || "#9cdcfe" });
    });
    if (this._nonAshLines.length > 2000) this._nonAshLines.splice(0, this._nonAshLines.length - 2000);
    this.render();
  },

  _handleNonAshCommand(cmd, lang) {
    const c = cmd.trim().toLowerCase();
    this._line("$ " + cmd, "#4a8a7a");
    if (c === "clear") { this._nonAshLines.length = 0; this.render(); return; }
    if (c === "help") { this._line("Commands for " + lang + ": run · list · clear · help (the editor's language is " + lang + ")"); return; }
    if (c === "list") { this._line(this.getSource()); return; }
    if (c === "exit") { this._line("(terminal stays open; switch the editor language to use Ash commands)"); return; }
    if (c !== "run") { this._line("Unknown command for " + lang + ". Type 'help'.", "#ff6b6b"); return; }
    if (typeof runCompile === "function") { runCompile(); } else this._line("Run unavailable", "#ff6b6b");
  },

  render() {
    const lang = typeof currentLang !== "undefined" ? currentLang : "ash";
    const lines = lang !== "ash" ? this._nonAshLines : this.engine.terminalLines;
    this.logEl.innerHTML = lines
      .map((l) => `<div class="term-line" style="color:${l.color}">${escHtml(l.text)}</div>`)
      .join("");
    this.logEl.scrollTop = this.logEl.scrollHeight;
  },

  focus() {
    this.inputEl.focus();
  }
};

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
