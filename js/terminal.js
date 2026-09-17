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
        this.engine.handleTerminalCommand(cmd, this.getSource());
        this.render();
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

  render() {
    const lines = this.engine.terminalLines;
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
