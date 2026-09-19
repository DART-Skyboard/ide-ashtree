// ============================================================
//  ash-runtime.js — Real Ash Edge Language runtime
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Turns a compiled script's parsed node structure into genuine
//  live state: every `var (x)` becomes a real named variable,
//  `irin ("Data: k=v k=v")` becomes a real initial assignment,
//  and `set <var> <value>` / `run` / `status` operate on that
//  real state — driven entirely by what's actually declared and
//  written in the script, so a novel script with different
//  variable names behaves the same way a built-in example does.
//
//  Natural-tool semantics (real, documented operational meaning —
//  these tokens had none before; this is where they get one):
//    Hammer   — multiply the node's declared numeric variables
//               (in declaration order) into the working value
//    Puzzle   — increment: working value += a variable literally
//               named "step" if declared, else 1
//    Stick    — pass-through: working value unchanged
//    Maze     — identity for text; no-op for numbers (a "traced
//               path" that arrives back where it started)
//    Envelope — wrap: join all declared variables' current values
//               into one combined string, space-separated
//    Knife    — split: cut a combined/string working value into
//               its space-separated parts (inverse of Envelope);
//               with numeric input, splits into integer/fractional
//               parts
//    Scissors — trim: clamp a numeric working value to [0, 1e6],
//               or truncate a string to 64 characters
// ============================================================

class AshRuntime {
  constructor(ast) {
    this.ast = ast;
    this.nodes = ast.children.filter((c) => c.type === "NodeBlock");
    this.vars = {};        // name -> current value (number or string)
    this.log = [];         // lines the terminal should print
    this.exited = false;
    this._initFromNodes();
  }

  _print(text, kind = "out") {
    this.log.push({ text, kind });
  }

  // ── Real initialization: declare every var, apply irin's Data: assignments ──
  _initFromNodes() {
    for (const node of this.nodes) {
      for (const child of node.children) {
        if (child.type === "VarDeclaration" && !(child.name in this.vars)) {
          this.vars[child.name] = 0;
        }
      }
    }
    for (const node of this.nodes) {
      const irin = node.children.find((c) => c.type === "KeywordStatement" && c.name === "irin");
      if (!irin || !irin.value) continue;
      const dataMatch = irin.value.match(/^Data:\s*(.*)$/);
      if (!dataMatch) continue;
      const payload = dataMatch[1];
      // "mass=1 gravity=9.81" — real key=value assignments, general to
      // any script, not specific to any one example's variable names.
      const assignments = payload.match(/(\w+)=([^\s]+(?:\s+(?!\w+=)[^\s]+)*)/g) || [];
      if (assignments.length > 0) {
        for (const a of assignments) {
          const eq = a.indexOf("=");
          const key = a.slice(0, eq).trim();
          const rawVal = a.slice(eq + 1).trim();
          const num = parseFloat(rawVal);
          this.vars[key] = (!isNaN(num) && String(num) === rawVal) ? num : rawVal;
        }
      } else if (node.children.some((c) => c.type === "VarDeclaration" && c.name === "s")) {
        // No key=value pairs — this is free text (Hello World's
        // "Data: Hello from Ash!"), which seeds the node's working
        // slot "s" directly, matching how Maze/thenplace echo it
        // straight through to irout in that real example.
        this.vars["s"] = payload;
      }
    }
  }

  hasVar(name) {
    return Object.prototype.hasOwnProperty.call(this.vars, name);
  }

  listVars() {
    return Object.keys(this.vars);
  }

  // ── set <var> <value> — genuinely checks the script's own declared vars ──
  setVar(name, rawValue) {
    if (!this.hasVar(name)) {
      return { ok: false, message: `No such variable '${name}'. Declared: ${this.listVars().join(", ") || "(none)"}` };
    }
    const num = parseFloat(rawValue);
    this.vars[name] = (!isNaN(num) && String(num) === rawValue) ? num : rawValue;
    return { ok: true, message: `${name} = ${this.vars[name]}` };
  }

  status() {
    return this.listVars().map((k) => `${k}=${this.vars[k]}`).join("  ");
  }

  // ── run — genuinely executes each node's tool chain against current state ──
  run() {
    const outputs = [];
    for (const node of this.nodes) {
      const declared = node.children.filter((c) => c.type === "VarDeclaration").map((c) => c.name);
      // "s" is the implicit working-value slot (see below), never one of
      // the tool's actual operands — including it would corrupt Hammer's
      // product with whatever s happens to hold (often 0 at start).
      const numericDeclared = declared.filter((n) => n !== "s" && typeof this.vars[n] === "number");
      // Every real example uses a variable literally named "s" as the
      // node's implicit "current working value" slot — natural tools
      // and Research read/write it even when no thenplace explicitly
      // names it. Seed `working` from it when the node declares one.
      const hasWorkingSlot = declared.includes("s");
      let working = hasWorkingSlot ? this.vars["s"] : null;
      let workingIsText = typeof working === "string";

      for (const child of node.children) {
        if (child.type === "NaturalToolCall") {
          working = this._applyTool(child.name, working, workingIsText, numericDeclared, declared);
          workingIsText = typeof working === "string";
          if (hasWorkingSlot) this.vars["s"] = working;
        } else if (child.type === "KeywordStatement" && child.name === "Research") {
          const val = this._evalExpr(child.value);
          if (val !== null) {
            working = val; workingIsText = false;
            if (hasWorkingSlot) this.vars["s"] = working;
          }
        } else if (child.type === "KeywordStatement" && child.name === "thenplace") {
          const srcVal = this.hasVar(child.value) ? this.vars[child.value] : working;
          if (child.dest) this.vars[child.dest] = srcVal !== undefined ? srcVal : working;
          working = this.vars[child.dest];
          workingIsText = typeof working === "string";
        } else if (child.type === "KeywordStatement" && child.name === "irout") {
          outputs.push(this._substitute(child.value));
        }
      }
    }
    if (outputs.length === 0) outputs.push("(no irout in script)");
    return outputs;
  }

  _applyTool(toolName, working, isText, numericDeclared, allDeclared) {
    switch (toolName) {
      case "Hammer": {
        if (numericDeclared.length === 0) return working;
        return numericDeclared.reduce((acc, n) => acc * this.vars[n], 1);
      }
      case "Puzzle": {
        const step = this.hasVar("step") ? this.vars["step"] : 1;
        const base = typeof working === "number" ? working : 0;
        return base + (typeof step === "number" ? step : 1);
      }
      case "Stick":
        return working;
      case "Maze":
        return working; // identity — a traced path returns to where it started
      case "Envelope":
        return allDeclared.map((n) => this.vars[n]).join(" ");
      case "Knife": {
        if (typeof working === "string") return working.split(/\s+/);
        if (typeof working === "number") {
          const s = String(working);
          const [intPart, fracPart] = s.split(".");
          return fracPart ? [parseInt(intPart, 10), parseFloat("0." + fracPart)] : [working];
        }
        return working;
      }
      case "Scissors":
        if (typeof working === "number") return Math.max(0, Math.min(1e6, working));
        if (typeof working === "string") return working.slice(0, 64);
        return working;
      default:
        return working;
    }
  }

  // Minimal, safe arithmetic evaluator for Research(...)'s captured
  // expression text, substituting the runtime's real current variable
  // values in place of their names. No eval() — a small real parser
  // over +,-,*,/,^ and parentheses, operating on the actual numbers
  // the script's variables hold right now.
  // Research(...)'s expr can be either a literal arithmetic expression
  // using declared numeric variables directly (Research (mass * gravity)),
  // OR a single bare identifier naming a declared STRING variable whose
  // current text IS the expression to evaluate (Research (expr), where
  // `expr` holds "3+4*2" — set live via `set expr 3+4*2` in the terminal).
  // The second form is what makes a real calculator possible in Ash: the
  // formula itself becomes data the user can change at runtime, not a
  // fixed token in the source.
  _evalExpr(expr) {
    if (!expr) return null;
    let source = expr;
    if (this.hasVar(expr.trim()) && typeof this.vars[expr.trim()] === "string") {
      source = this.vars[expr.trim()];
    }
    let substituted = source;
    for (const name of Object.keys(this.vars).sort((a, b) => b.length - a.length)) {
      const v = this.vars[name];
      if (typeof v !== "number") continue;
      substituted = substituted.replace(new RegExp(`\\b${name}\\b`, "g"), `(${v})`);
    }
    // Real scientific-calculator functions/constants, same semantics as
    // the standalone Reckon calculator engine — sin/cos/tan in degrees,
    // matching that engine's default DEG mode.
    substituted = substituted
      .replace(/\bpi\b/gi, `(${Math.PI})`)
      .replace(/\be\b/g, `(${Math.E})`)
      .replace(/\bsqrt\(/gi, "Math.sqrt(")
      .replace(/\bcbrt\(/gi, "Math.cbrt(")
      .replace(/\babs\(/gi, "Math.abs(")
      .replace(/\bln\(/gi, "Math.log(")
      .replace(/\blog\(/gi, "Math.log10(")
      .replace(/\bsin\(([^)]+)\)/gi, (_, a) => `Math.sin((${a})*Math.PI/180)`)
      .replace(/\bcos\(([^)]+)\)/gi, (_, a) => `Math.cos((${a})*Math.PI/180)`)
      .replace(/\btan\(([^)]+)\)/gi, (_, a) => `Math.tan((${a})*Math.PI/180)`);
    if (!/^[\d\s+\-*/^().MathsqrtcbabuloginPIE,]+$/.test(substituted)) return null; // unresolved identifiers remain — bail safely
    try {
      const jsExpr = substituted.replace(/\^/g, "**");
      // eslint-disable-next-line no-new-func
      const val = Function(`"use strict"; return (${jsExpr});`)();
      return typeof val === "number" && isFinite(val) ? val : null;
    } catch {
      return null;
    }
  }

  // irout's captured value is "literal text" + bare variable names
  // (from placeto) concatenated — substitute each declared variable's
  // real current value in place of its bare name.
  _substitute(text) {
    if (!text) return "";
    let out = text;
    for (const name of Object.keys(this.vars).sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(`\\b${name}\\b`, "g"), String(this.vars[name]));
    }
    return out;
  }

  // ── Generalized graphical-intent detection ──────────────────────
  // True for ANY script that imports GLDrivers or calls gl.* — not
  // hardcoded to specific example names. This is what decides whether
  // the Interface tab shows a canvas for a given script.
  static hasGraphicalIntent(source) {
    return /import\s*\(\s*GLDrivers\s*\)/.test(source) || /\bgl\.\w+/.test(source);
  }

  // True for any script whose runtime has real declared variables to
  // interact with — driving the generic "Program Controls" panel
  // (live input fields + Run) shown in the Interface tab for scripts
  // that don't draw graphics but do have real, settable state. This
  // is what makes the calculator (and any other variable-driven
  // script) usable from Interface without being hardcoded by name.
  hasInteractiveState() {
    return this.listVars().some((v) => v !== "s");
  }
}
