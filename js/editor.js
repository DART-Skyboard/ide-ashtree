// ============================================================
//  editor.js — Ash syntax editor (textarea + highlighted overlay)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const AshEditor = {
  textarea: null,
  highlight: null,
  gutter: null,
  onChange: null,

  init() {
    this.textarea = document.getElementById("editorTextarea");
    this.highlight = document.getElementById("editorHighlight");
    this.gutter = document.getElementById("editorGutter");

    this.textarea.addEventListener("input", () => this.render());
    this.textarea.addEventListener("scroll", () => this.syncScroll());
    this.textarea.addEventListener("keydown", (e) => this.handleKeydown(e));
    this.textarea.addEventListener("click", () => this.updateCursorInfo());
    this.textarea.addEventListener("keyup", () => this.updateCursorInfo());

    this.render();
  },

  setValue(text) {
    this.textarea.value = text;
    this.render();
    this.textarea.scrollTop = 0;
    this.textarea.scrollLeft = 0;
    this.syncScroll();
  },

  getValue() {
    return this.textarea.value;
  },

  focus() {
    this.textarea.focus();
  },

  handleKeydown(e) {
    // Tab inserts two spaces instead of moving focus
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this.textarea.selectionStart;
      const end = this.textarea.selectionEnd;
      const val = this.textarea.value;
      this.textarea.value = val.slice(0, start) + "  " + val.slice(end);
      this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
      this.render();
    }
    // Ctrl/Cmd+Enter → run
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("ash:run"));
    }
    // Auto-continue indentation on newline
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      const start = this.textarea.selectionStart;
      const val = this.textarea.value;
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const line = val.slice(lineStart, start);
      const indentMatch = line.match(/^[ \t]*/);
      let indent = indentMatch ? indentMatch[0] : "";
      if (line.trim().endsWith("{")) indent += "  ";
      if (indent) {
        e.preventDefault();
        const end = this.textarea.selectionEnd;
        this.textarea.value = val.slice(0, start) + "\n" + indent + val.slice(end);
        const pos = start + 1 + indent.length;
        this.textarea.selectionStart = this.textarea.selectionEnd = pos;
        this.render();
      }
    }
  },

  syncScroll() {
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
    this.gutter.scrollTop = this.textarea.scrollTop;
  },

  updateCursorInfo() {
    const val = this.textarea.value;
    const pos = this.textarea.selectionStart;
    const upTo = val.slice(0, pos);
    const line = (upTo.match(/\n/g) || []).length + 1;
    const col = pos - upTo.lastIndexOf("\n");
    const el = document.getElementById("cursorInfo");
    if (el) el.textContent = `Ln ${line}, Col ${col}`;
    const cc = document.getElementById("charCount");
    if (cc) cc.textContent = `${val.length} chars`;
  },

  render() {
    const text = this.textarea.value;
    this.highlight.innerHTML = this.highlightSource(text) + "\n";
    this.renderGutter(text);
    this.updateCursorInfo();
    if (this.onChange) this.onChange(text);
  },

  renderGutter(text) {
    const lineCount = text.split("\n").length;
    let html = "";
    for (let i = 1; i <= lineCount; i++) html += `<div>${i}</div>`;
    this.gutter.innerHTML = html;
  },

  escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  // Tokenize + wrap with span classes matching leatr-engine.js token kinds
  highlightSource(source) {
    if (!source) return "";
    let out = "";
    let i = 0;
    const n = source.length;
    const isLetter = (c) => /[A-Za-z]/.test(c);
    const isDigit = (c) => /[0-9]/.test(c);
    const isWordChar = (c) => /[A-Za-z0-9_]/.test(c);
    const esc = this.escapeHtml;

    while (i < n) {
      const c = source[i];
      const c2 = source[i + 1];

      if (c === "/" && c2 === "/") {
        let end = i;
        while (end < n && source[end] !== "\n") end++;
        out += `<span class="tok-comment">${esc(source.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      if (c === "{" && c2 === "{") {
        let j = i + 2;
        while (j < n) {
          if (source[j] === "}" && source[j + 1] === "}") { j += 2; break; }
          j++;
        }
        out += `<span class="tok-outer">${esc(source.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (c === "[" && c2 === "[") {
        let j = i + 2;
        while (j < n) {
          if (source[j] === "]" && source[j + 1] === "]") { j += 2; break; }
          j++;
        }
        out += `<span class="tok-inner">${esc(source.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (c === "[") {
        let j = i + 1;
        while (j < n && source[j] !== "]") j++;
        if (j < n) j++;
        const tag = source.slice(i, j);
        const cls = tag.startsWith("[net:") ? "tok-net" : "tok-poly";
        out += `<span class="${cls}">${esc(tag)}</span>`;
        i = j;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        while (j < n && source[j] !== '"') {
          if (source[j] === "\\") j++;
          j++;
        }
        if (j < n) j++;
        out += `<span class="tok-string">${esc(source.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (c === "}") {
        if (source.slice(i, i + 6) === "}|';'|") {
          out += `<span class="tok-punct">${esc("}|';'|")}</span>`;
          i += 6;
          continue;
        }
        out += `<span class="tok-punct">}</span>`;
        i++;
        continue;
      }
      if (c === "(") {
        let j = i + 1;
        while (j < n && source[j] !== ")") j++;
        const inner = source.slice(i + 1, j);
        if (j < n) j++;
        const afterParen = source.slice(j).replace(/^\s+/, "");
        if (afterParen.startsWith(":-:")) {
          out += `<span class="tok-node">(${esc(inner)})</span>`;
          i = j;
          continue;
        }
        const firstChar = inner[0] || "a";
        const cls = /[A-Z]/.test(firstChar) ? "tok-noderef" : "tok-varref";
        out += `<span class="${cls}">(${esc(inner)})</span>`;
        i = j;
        continue;
      }
      if (c === "|") {
        if (source.slice(i, i + 5) === "|';'|") {
          out += `<span class="tok-punct">${esc("|';'|")}</span>`;
          i += 5;
          continue;
        }
      }
      if (isDigit(c) || (c === "-" && isDigit(c2))) {
        let j = i + 1;
        while (j < n && (isDigit(source[j]) || source[j] === ".")) j++;
        out += `<span class="tok-number">${esc(source.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (isLetter(c) || c === "_") {
        let j = i + 1;
        while (j < n && isWordChar(source[j])) j++;
        const word = source.slice(i, j);
        let cls = "";
        if (word === "import") cls = "tok-decl";
        else if (LEATR_KEYWORDS.has(word)) cls = "tok-keyword";
        else if (LEATR_DECLARATIONS.has(word)) cls = "tok-decl";
        else if (LEATR_NATURAL_TOOLS.has(word)) cls = "tok-natural";
        out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
        i = j;
        continue;
      }
      if ("=+\\*/^!<>".includes(c)) {
        out += `<span class="tok-op">${esc(c)}</span>`;
        i++;
        continue;
      }
      out += esc(c);
      i++;
    }
    return out;
  }
};
