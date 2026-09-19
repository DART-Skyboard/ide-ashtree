// ============================================================
//  leatr-engine.js — LEATR v2 Compiler Engine (web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Direct port of LeatrEngine.swift: lexer → parser → BRPN →
//  compiler log + terminal mirror. Same token kinds, same
//  switch-equation math, same output shape.
// ============================================================

const LEATR_KEYWORDS = new Set(["irin", "irout", "thenplace", "Research", "Report"]);
const LEATR_DECLARATIONS = new Set([
  "with", "var", "Var", "Input", "when", "where", "and", "or", "not",
  "for", "else", "is", "if", "end", "import", "return", "place", "placeto"
]);
const LEATR_NATURAL_TOOLS = new Set([
  "Maze", "Puzzle", "Envelope", "Hammer", "Stick", "Knife", "Scissors"
]);

class LeatrEngine {
  constructor() {
    this.compilerLines = [];   // { label, text, color, isError }
    this.terminalLines = [];   // { text, color, isSystem }
    this.isRunning = false;
    this.nodeCount = 0;
    this.shellType = "—";
    this.buoyancy = 0;
    this.onChange = null;      // callback(engine) fired after compile/terminal ops
  }

  // Switch equations: (xa²√xa) ± 1
  static encode(x, a) {
    const v = x * a * a * Math.sqrt(Math.abs(x * a));
    return Number.isNaN(v) ? 0 : v - 1;
  }
  static decode(x, a) {
    const v = x * a * a * Math.sqrt(Math.abs(x * a));
    return Number.isNaN(v) ? 0 : v + 1;
  }

  // ── Lexer ──────────────────────────────────────────────────
  lex(source) {
    const tokens = [];
    let i = 0;
    const n = source.length;
    const isLetter = (c) => /[A-Za-z]/.test(c);
    const isDigit = (c) => /[0-9]/.test(c);
    const isWordChar = (c) => /[A-Za-z0-9_]/.test(c);

    while (i < n) {
      const c = source[i];
      const c2 = source[i + 1];

      // Comment
      if (c === "/" && c2 === "/") {
        let end = i;
        while (end < n && source[end] !== "\n") end++;
        tokens.push({ kind: "comment", value: source.slice(i, end) });
        i = end;
        continue;
      }

      // {{outer-tag}}
      if (c === "{" && c2 === "{") {
        let j = i + 2;
        while (j < n) {
          if (source[j] === "}" && source[j + 1] === "}") { j += 2; break; }
          j++;
        }
        tokens.push({ kind: "outerTag", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // [[inner-tag]]
      if (c === "[" && c2 === "[") {
        let j = i + 2;
        while (j < n) {
          if (source[j] === "]" && source[j + 1] === "]") { j += 2; break; }
          j++;
        }
        tokens.push({ kind: "innerTag", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // [poly:...] or [net:...]
      if (c === "[") {
        let j = i + 1;
        while (j < n && source[j] !== "]") j++;
        if (j < n) j++;
        const tag = source.slice(i, j);
        tokens.push({ kind: tag.startsWith("[net:") ? "netTag" : "polyTag", value: tag });
        i = j;
        continue;
      }

      // String literal
      if (c === '"') {
        let j = i + 1;
        while (j < n && source[j] !== '"') {
          if (source[j] === "\\") j++;
          j++;
        }
        if (j < n) j++;
        tokens.push({ kind: "string", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // }|';'| node end
      if (c === "}") {
        if (source.slice(i, i + 6) === "}|';'|") {
          tokens.push({ kind: "nodeBlockEnd", value: "}|';'|" });
          i += 6;
          continue;
        }
        tokens.push({ kind: "blockClose", value: "}" });
        i++;
        continue;
      }

      // (NodeName):-:{  or  (ref) — depth-tracked so a nested paren, like
      // irout ("..." placeto (velocity)), doesn't truncate at the first
      // inner ")" and leave the outer one dangling as a stray character.
      if (c === "(") {
        let j = i + 1;
        let depth = 1;
        while (j < n && depth > 0) {
          if (source[j] === "(") depth++;
          else if (source[j] === ")") depth--;
          if (depth > 0) j++;
        }
        const inner = source.slice(i + 1, j);
        if (j < n) j++;
        const afterParen = source.slice(j).replace(/^\s+/, "");
        if (afterParen.startsWith(":-:")) {
          let k = j;
          while (k < n && source[k] !== "{") k++;
          if (k < n) k++;
          tokens.push({ kind: "nodeBlockStart", value: inner });
          i = k;
          continue;
        }
        const firstChar = inner[0] || "a";
        tokens.push({
          kind: /[A-Z]/.test(firstChar) ? "nodeRef" : "varRef",
          value: `(${inner})`
        });
        i = j;
        continue;
      }

      // |';'| pipe separator
      if (c === "|") {
        if (source.slice(i, i + 5) === "|';'|") {
          tokens.push({ kind: "pipeSep", value: "|';'|" });
          i += 5;
          continue;
        }
      }

      // Number
      if (isDigit(c) || (c === "-" && isDigit(c2))) {
        let j = i + 1;
        while (j < n && (isDigit(source[j]) || source[j] === ".")) j++;
        tokens.push({ kind: "number", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // Word
      if (isLetter(c) || c === "_") {
        let j = i + 1;
        while (j < n && isWordChar(source[j])) j++;
        const word = source.slice(i, j);
        let kind;
        if (word === "import") kind = "importStmt";
        else if (LEATR_KEYWORDS.has(word)) kind = "keyword";
        else if (LEATR_DECLARATIONS.has(word)) kind = "declaration";
        else if (LEATR_NATURAL_TOOLS.has(word)) kind = "naturalTool";
        else kind = "identifier";
        tokens.push({ kind, value: word });
        i = j;
        continue;
      }

      // Operators
      if ("=+\\-*/^!<>".includes(c)) {
        tokens.push({ kind: "op", value: c });
        i++;
        continue;
      }

      i++;
    }
    return tokens;
  }

  // ── Parser ─────────────────────────────────────────────────
  parse(tokens) {
    const root = { type: "Program", name: "", value: "", children: [] };
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];
      switch (t.kind) {
        case "outerTag":
        case "innerTag":
        case "polyTag":
        case "netTag":
          root.children.push({ type: "TagAnnotation", value: t.value, children: [] });
          i += 1;
          break;

        case "importStmt": {
          const module = i + 1 < tokens.length ? tokens[i + 1].value : "";
          root.children.push({ type: "ImportStatement", name: module, value: module, children: [] });
          i += 2;
          break;
        }

        case "nodeBlockStart": {
          const node = { type: "NodeBlock", name: t.value, value: "", children: [] };
          i += 1;
          let depth = 0;
          while (i < tokens.length) {
            const inner = tokens[i];
            if (inner.kind === "nodeBlockEnd" && depth === 0) { i += 1; break; }
            if (inner.kind === "blockOpen") depth += 1;
            if (inner.kind === "blockClose") depth -= 1;

            if (["outerTag", "innerTag", "polyTag", "netTag"].includes(inner.kind)) {
              node.children.push({ type: "TagAnnotation", value: inner.value, children: [] });
            } else if (inner.kind === "keyword" && inner.value === "thenplace") {
              // thenplace var (dest) with var (src) — copies src's current
              // value into dest at runtime. Shape is fixed: keyword,
              // declaration:var, varRef, declaration:with, declaration:var,
              // varRef. Captured as name=dest, value=src so the runtime
              // can execute the actual copy.
              let j = i + 1;
              const expect = (idx, kind, val) => tokens[idx] && tokens[idx].kind === kind && (val === undefined || tokens[idx].value === val);
              if (expect(j, "declaration", "var") && tokens[j + 1] && tokens[j + 1].kind === "varRef") {
                const dest = tokens[j + 1].value.replace(/^\(|\)$/g, "");
                j += 2;
                if (expect(j, "declaration", "with") && expect(j + 1, "declaration", "var") &&
                    tokens[j + 2] && tokens[j + 2].kind === "varRef") {
                  const srcName = tokens[j + 2].value.replace(/^\(|\)$/g, "");
                  node.children.push({ type: "KeywordStatement", name: "thenplace", value: srcName, dest, children: [] });
                  i = j + 2;
                } else {
                  node.children.push({ type: "KeywordStatement", name: "thenplace", value: "", dest, children: [] });
                  i = j - 1;
                }
              } else {
                node.children.push({ type: "KeywordStatement", name: "thenplace", value: "", children: [] });
              }
            } else if (inner.kind === "keyword") {
              // A keyword's payload is one following token: a string
              // literal ("Data: ..."), or a parenthesized blob — which
              // itself may mix a string prefix with a placeto(var) ref,
              // as irout does: irout ("Result: F=" placeto (velocity)).
              // Nested parens are depth-tracked by the lexer, so that
              // whole blob arrives as ONE varRef/nodeRef token whose
              // inner text still needs unwrapping.
              const next = i + 1 < tokens.length ? tokens[i + 1] : null;
              let val = "";
              if (next && next.kind === "string") {
                val = next.value.replace(/^"|"$/g, "");
                i += 1;
              } else if (next && (next.kind === "varRef" || next.kind === "nodeRef")) {
                let raw = next.value.replace(/^\(/, "").replace(/\)$/, "");
                raw = raw.replace(/"([^"]*)"/g, "$1").replace(/\bplaceto\s*\(([^)]+)\)/g, "$1");
                val = raw.trim();
                i += 1;
              }
              node.children.push({ type: "KeywordStatement", name: inner.value, value: val, children: [] });
            } else if (inner.kind === "naturalTool") {
              node.children.push({ type: "NaturalToolCall", name: inner.value, value: "", children: [] });
            } else if (inner.kind === "declaration" && inner.value === "var") {
              const raw = i + 1 < tokens.length ? tokens[i + 1].value : "";
              const vName = raw.replace(/^\(|\)$/g, ""); // varRef keeps its "(name)" shell — strip it
              node.children.push({ type: "VarDeclaration", name: vName, value: "", children: [] });
              i += 1;
            } else if (inner.kind === "importStmt") {
              const module = i + 1 < tokens.length ? tokens[i + 1].value : "";
              node.children.push({ type: "ImportStatement", name: module, value: "", children: [] });
              i += 1;
            }
            i += 1;
          }
          root.children.push(node);
          break;
        }

        default:
          i += 1;
      }
    }
    return root;
  }

  // ── BRPN — Buoyancy Reflex Pendulum Node ────────────────────
  brpn(nodeCount, hasOuter, hasInner) {
    const f = hasOuter ? 1.0 : 0.5;
    const r = hasInner ? 1.0 : 0.4;
    const p = nodeCount > 0 ? Math.min(1.0, nodeCount / 5.0) : 0.1;
    const frp = f * r * p;
    const b = frp * Math.sqrt(Math.abs(frp));
    const shell = b >= 0.76 ? "GEOLOGICAL" : b >= 0.44 ? "MARITIME" : "AEROSPACE";
    const n = Math.max(nodeCount, 1);
    const qs = f * r * p * Math.log(n + 1);
    return {
      f, r, p, frp, buoyancy: b, shell, qsVal: qs,
      encodeValue: LeatrEngine.encode(n, n),
      decodeValue: LeatrEngine.decode(n, n)
    };
  }

  // ── Full compile ─────────────────────────────────────────────
  compile(source, netMode = false) {
    this.compilerLines = [];
    const tokens = this.lex(source);
    const ast = this.parse(tokens);
    const nodes = ast.children.filter((c) => c.type === "NodeBlock");
    const imports = ast.children.filter((c) => c.type === "ImportStatement");
    const outerTags = ast.children.filter((c) => c.type === "TagAnnotation" && c.value.startsWith("{{"));
    const innerTags = ast.children.filter((c) => c.type === "TagAnnotation" && c.value.startsWith("[["));

    const log = (label, text, color = "#8ab4cc", err = false) => {
      this.compilerLines.push({ label, text, color, isError: err });
    };

    log("SYSTEM", "LEATR v2 Compiler · Ash Edge Language", "#00ffcc");
    log("1. LEXER", `${tokens.length} tokens`, "#4a8a7a");

    outerTags.forEach((t) => log("{{OUTER}}", t.value, "#ffd700"));
    innerTags.forEach((t) => log("[[INNER]]", t.value, "#bf5fff"));
    ast.children
      .filter((c) => c.type === "TagAnnotation" && c.value.startsWith("[poly:"))
      .forEach((t) => log("[POLY]", t.value, "#ff9500"));
    ast.children
      .filter((c) => c.type === "TagAnnotation" && c.value.startsWith("[net:"))
      .forEach((t) => log("[NET]", t.value, "#39ff14"));

    imports.forEach((imp) => log("↑ import", imp.name, "#ce9178"));

    log("2. PARSER", `${ast.children.length} top-level nodes`, "#4a8a7a");

    if (netMode) {
      log("NET", "⟳ Network compile — log-iterative mode", "#39ff14");
      nodes.forEach((node, idx) => {
        const lv = Math.log(idx + 1 + 1);
        log("NET", `[${idx + 1}] ${node.name}: log(n)=${lv.toFixed(4)}`, "#39ff14");
      });
    } else {
      nodes.forEach((node, idx) => {
        const nc = idx + 1;
        log("SWITCH ON", `${node.name} encode=${LeatrEngine.encode(nc, nc).toFixed(4)}`, "#00ffcc");
        node.children.forEach((child) => {
          switch (child.type) {
            case "TagAnnotation":
              if (child.value.startsWith("{{")) log("{{OUTER}}", child.value, "#ffd700");
              else if (child.value.startsWith("[[")) log("[[INNER]]", child.value, "#bf5fff");
              else if (child.value.startsWith("[poly:")) log("[POLY]", child.value, "#ff9500");
              else if (child.value.startsWith("[net:")) log("[NET]", child.value, "#39ff14");
              break;
            case "KeywordStatement": {
              const icon = child.name === "irin" ? "→" : child.name === "irout" ? "←" : "⟳";
              log(`${icon} ${child.name}`, child.value, "#9cdcfe");
              break;
            }
            case "NaturalToolCall":
              log("🔧 tool", `${child.name} [OOO]`, "#00ffcc");
              break;
            case "VarDeclaration":
              log("  var", child.name, "#9cdcfe");
              break;
            case "ImportStatement":
              log("↑ import", child.name, "#ce9178");
              break;
          }
        });
        log("SWITCH OFF", `${node.name} decode=${LeatrEngine.decode(nc, nc).toFixed(4)}`, "#4a8a7a");
        log("✓ NODE", node.name, "#00cc66");
      });
    }

    const result = this.brpn(nodes.length, outerTags.length > 0, innerTags.length > 0);
    log("PENDULUM", `f=${result.f.toFixed(2)} r=${result.r.toFixed(2)} p=${result.p.toFixed(3)}`, "#a78bfa");
    log("BUOYANCY", `${result.buoyancy.toFixed(4)} → ${result.shell}`, "#a78bfa");
    log("QS", `QuantumSocket: ${result.qsVal.toFixed(4)}`, "#a78bfa");
    log("COMPLETE", `${nodes.length} nodes · ${result.shell} shell`, "#00ffcc");

    this.nodeCount = nodes.length;
    this.shellType = result.shell;
    this.buoyancy = result.buoyancy;

    // Mirror to terminal
    const tline = (text, color, isSystem) => this.terminalLines.push({ text, color, isSystem });
    tline("[SYS] ─────────────────────────────", "#4a8a7a", true);
    tline("[SYS] LEATR App Runtime v2.0", "#00ffcc", true);
    tline(`[SYS] Compiled: ${nodes.length} node(s) · ${result.shell}`, "#8ab4cc", true);
    tline(`[SYS] Buoyancy: ${result.buoyancy.toFixed(4)}`, "#a78bfa", true);
    nodes.forEach((node) => {
      tline(`ash ▸ run ${node.name}`, "#00ffcc", false);
      const irin = node.children.find((c) => c.type === "KeywordStatement" && c.name === "irin");
      if (irin && irin.value) tline(`  → irin: ${irin.value}`, "#4a8a7a", false);
      tline(`  → ${node.name} executed.`, "#ffffff", false);
    });

    if (this.onChange) this.onChange(this);
    return result;
  }

  // ── Terminal command handler ─────────────────────────────────
  // ── Real terminal command handling — a live AshRuntime instance
  // parses the script's actual node/var/irin structure once (on
  // compile), then set/run/status genuinely operate on that state
  // for the rest of the session, same as any real interpreter. ──
  handleTerminalCommand(cmd, source) {
    const c = cmd.trim();
    const lc = c.toLowerCase();
    this.terminalLines.push({ text: `ash ▸ ${cmd}`, color: "#00ffcc", isSystem: false });

    if (!this.runtime || this._runtimeSource !== source) {
      try {
        const tokens = this.lex(source);
        const ast = this.parse(tokens);
        this.runtime = new AshRuntime(ast);
        this._runtimeSource = source;
      } catch (e) {
        this.runtime = null;
      }
    }

    const parts = c.split(/\s+/);
    const verb = (parts[0] || "").toLowerCase();

    if (lc === "run") {
      this.compile(source);
      if (this.runtime) {
        const outputs = this.runtime.run();
        outputs.forEach((line) => this.terminalLines.push({ text: `  → ${line}`, color: "#ffffff", isSystem: false }));
      }
    } else if (lc === "clear") {
      this.terminalLines = [];
      this.compilerLines = [];
    } else if (lc === "status") {
      if (this.runtime) {
        const s = this.runtime.status();
        this.terminalLines.push({ text: `  ${s || "(no variables declared)"}`, color: "#8ab4cc", isSystem: true });
      } else {
        this.terminalLines.push({ text: "  No script compiled yet — type 'run' first.", color: "#ff9500", isSystem: false });
      }
    } else if (verb === "set" && parts.length >= 3) {
      const varName = parts[1];
      const value = parts.slice(2).join(" ");
      if (this.runtime) {
        const result = this.runtime.setVar(varName, value);
        this.terminalLines.push({
          text: `  ${result.message}`,
          color: result.ok ? "#8ab4cc" : "#ff9500",
          isSystem: result.ok
        });
      } else {
        this.terminalLines.push({ text: "  No script compiled yet — type 'run' first.", color: "#ff9500", isSystem: false });
      }
    } else if (lc === "info") {
      this.terminalLines.push({ text: "  LEATR v2 · Ash Edge Language · DART Meadow", color: "#8ab4cc", isSystem: true });
      this.terminalLines.push({ text: "  Compiler Standard: (xa²√xa)±1", color: "#8ab4cc", isSystem: true });
    } else if (lc === "help") {
      this.terminalLines.push({ text: "  Commands: run · set <var> <value> · status · info · clear · exit · help", color: "#8ab4cc", isSystem: true });
      if (this.runtime && this.runtime.listVars().length) {
        this.terminalLines.push({ text: `  Declared variables: ${this.runtime.listVars().join(", ")}`, color: "#8ab4cc", isSystem: true });
      }
    } else if (lc === "exit") {
      this.terminalLines.push({ text: "  Session ended.", color: "#4a8a7a", isSystem: true });
    } else {
      this.terminalLines.push({ text: `  Unknown: '${cmd}' — type 'help'`, color: "#ff9500", isSystem: false });
    }
    if (this.onChange) this.onChange(this);
  }
}
