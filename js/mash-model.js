// ============================================================
//  mash-model.js — MASH mind map data model (web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Port of IDEMindMapModel.swift: node types, themes, document
//  shape, undo/redo history, and the ASH ⇄ mind-map generator.
// ============================================================

const MASH_NODE_TYPES = {
  root: { radius: 54, fontSize: 17 },
  main: { radius: 38, fontSize: 13 },
  subtitle: { radius: 30, fontSize: 11 },
  category: { radius: 34, fontSize: 12 },
  note: { radius: 24, fontSize: 10 },
  image: { radius: 44, fontSize: 10 },
  link: { radius: 26, fontSize: 10 },
  ash_code: { radius: 28, fontSize: 10, badge: { icon: "</>", label: "ASH", color: "#00ffcc" } },
  out_terminal: { radius: 28, fontSize: 10, badge: { icon: "▸", label: "TERMINAL", color: "#00ff66" } },
  out_2d: { radius: 28, fontSize: 10, badge: { icon: "▭", label: "2D OUT", color: "#aa77ff" } },
  out_3d: { radius: 28, fontSize: 10, badge: { icon: "◆", label: "3D OUT", color: "#ffaa00" } },
  input_form: { radius: 28, fontSize: 10, badge: { icon: "↓", label: "INPUT", color: "#00ccff" } },
  output_form: { radius: 28, fontSize: 10, badge: { icon: "↑", label: "OUTPUT", color: "#ff6688" } },
  return: { radius: 28, fontSize: 10, badge: { icon: "↩", label: "RETURN", color: "#ffee44" } }
};

const MASH_TYPE_FILL = {
  ash_code: "#0d1f2d", out_terminal: "#0a1a0a", out_2d: "#1a0d2e",
  out_3d: "#1a1200", input_form: "#0d1a1a", output_form: "#1a0d0d", return: "#1a1a0d"
};

const MASH_LAYOUTS = [
  { id: "radial", name: "Radial" },
  { id: "tree", name: "Tree" },
  { id: "fishbone", name: "Fishbone" },
  { id: "flowchart", name: "Flowchart" },
  { id: "orgchart", name: "Org Chart" },
  { id: "timeline", name: "Timeline" }
];

const MASH_THEMES = [
  {
    id: "dark-ash", name: "Dark Ash",
    canvasBackground: "#0d1117",
    rootFill: "#00ffcc", rootBorder: "#00ccaa", rootText: "#000000",
    mainFill: "#0d2b3e", mainBorder: "#00e5ff", mainText: "#00e5ff",
    subtitleFill: "#0a1a2a", subtitleBorder: "#4488aa", subtitleText: "#88ccdd",
    categoryFill: "#1a1a2e", categoryBorder: "#8866ff", categoryText: "#bb99ff",
    noteFill: "#111827", noteBorder: "#334455", noteText: "#8a9ab0",
    connectionColor: "#00e5ff", connectionStyle: "curved"
  },
  {
    id: "neon-night", name: "Neon Night",
    canvasBackground: "#020008",
    rootFill: "#ff00ff", rootBorder: "#cc00cc", rootText: "#ffffff",
    mainFill: "#1a0022", mainBorder: "#ff00ff", mainText: "#ff88ff",
    subtitleFill: "#0d0018", subtitleBorder: "#8800ff", subtitleText: "#cc88ff",
    categoryFill: "#000d22", categoryBorder: "#0088ff", categoryText: "#66bbff",
    noteFill: "#0a000f", noteBorder: "#330066", noteText: "#9966cc",
    connectionColor: "#ff00ff", connectionStyle: "curved"
  },
  {
    id: "solar-punk", name: "Solar Punk",
    canvasBackground: "#0a1a08",
    rootFill: "#39ff14", rootBorder: "#22cc00", rootText: "#000000",
    mainFill: "#0d2610", mainBorder: "#39ff14", mainText: "#39ff14",
    subtitleFill: "#081a0a", subtitleBorder: "#228822", subtitleText: "#88dd88",
    categoryFill: "#1a1800", categoryBorder: "#ccaa00", categoryText: "#ffdd44",
    noteFill: "#0d1008", noteBorder: "#224422", noteText: "#669966",
    connectionColor: "#39ff14", connectionStyle: "organic"
  },
  {
    id: "blueprint", name: "Blueprint",
    canvasBackground: "#0a1628",
    rootFill: "#ffffff", rootBorder: "#ccddff", rootText: "#0a1628",
    mainFill: "#0a1628", mainBorder: "#ffffff", mainText: "#ffffff",
    subtitleFill: "#0d1e38", subtitleBorder: "#aabbdd", subtitleText: "#ccddff",
    categoryFill: "#081428", categoryBorder: "#6688aa", categoryText: "#aabbcc",
    noteFill: "#060e1c", noteBorder: "#334455", noteText: "#667788",
    connectionColor: "#ffffff", connectionStyle: "straight"
  },
  {
    id: "flowchart-theme", name: "Flowchart",
    canvasBackground: "#ffffff",
    rootFill: "#1a73e8", rootBorder: "#1557b0", rootText: "#ffffff",
    mainFill: "#e8f0fe", mainBorder: "#1a73e8", mainText: "#1a1a1a",
    subtitleFill: "#f8f9fa", subtitleBorder: "#4285f4", subtitleText: "#1a1a1a",
    categoryFill: "#fce8e6", categoryBorder: "#ea4335", categoryText: "#c5221f",
    noteFill: "#e6f4ea", noteBorder: "#34a853", noteText: "#137333",
    connectionColor: "#1a1a1a", connectionStyle: "straight"
  },
  {
    id: "ashmat", name: "AshMat",
    canvasBackground: "#08070c",
    rootFill: "#ff5fce", rootBorder: "#cc2fa0", rootText: "#0a0510",
    mainFill: "#1c0f2e", mainBorder: "#ff5fce", mainText: "#ffb3ec",
    subtitleFill: "#140a22", subtitleBorder: "#8a4fdd", subtitleText: "#c9a6ff",
    categoryFill: "#0f1c2e", categoryBorder: "#4fd1dd", categoryText: "#9beef4",
    noteFill: "#100b18", noteBorder: "#3a2a52", noteText: "#a48fc7",
    connectionColor: "#ff5fce", connectionStyle: "curved"
  }
];

function mashThemeById(id) {
  return MASH_THEMES.find((t) => t.id === id) || MASH_THEMES[0];
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function newMashNode(type, text, x, y, parentId = null) {
  return {
    id: uuid(),
    type,
    text,
    detail: "",
    url: "",
    imageData: null,   // data URL string
    x, y,
    width: type === "root" ? 160 : type === "main" ? 130 : 110,
    children: [],
    parentId,
    collapsed: false,
    fillColor: null,
    borderColor: null,
    textColor: null,
    bold: type === "root",
    italic: false
  };
}

function newMashDocument(title) {
  const rootId = uuid();
  const now = Date.now();
  const root = newMashNode("root", title, 0, 0, null);
  root.id = rootId;
  return {
    id: uuid(),
    title,
    created: now,
    modified: now,
    themeId: "dark-ash",
    nodes: { [rootId]: root },
    rootId,
    connections: [],
    canvasOffset: { x: 0, y: 0 },
    canvasScale: 1.0,
    layout: "radial"
  };
}

// ── Mash store: persistence + undo/redo (mirrors MashStore) ──
class MashStore {
  constructor() {
    this.documents = IDEStorage.get("mash_documents_v1", []);
    this.activeDocId = IDEStorage.get("mash_active_doc", null);
    this.undoStacks = IDEStorage.get("mash_undo_v2", {});
    this.redoStacks = IDEStorage.get("mash_redo_v2", {});
    this.undoCap = 60;
    this.onChange = null;
  }

  get activeDoc() {
    if (!this.activeDocId) return null;
    return this.documents.find((d) => d.id === this.activeDocId) || null;
  }

  save() {
    IDEStorage.set("mash_documents_v1", this.documents);
    IDEStorage.set("mash_active_doc", this.activeDocId);
  }
  saveHistory() {
    IDEStorage.set("mash_undo_v2", this.undoStacks);
    IDEStorage.set("mash_redo_v2", this.redoStacks);
  }

  newDocument(title, layout = "radial") {
    const doc = newMashDocument(title);
    doc.layout = layout;
    this.documents.push(doc);
    this.activeDocId = doc.id;
    this.save();
    this._fire();
    return doc;
  }

  deleteDocument(id) {
    this.documents = this.documents.filter((d) => d.id !== id);
    if (this.activeDocId === id) this.activeDocId = this.documents[0]?.id || null;
    delete this.undoStacks[id];
    delete this.redoStacks[id];
    this.save();
    this.saveHistory();
    this._fire();
  }

  // Deep-clone snapshot before mutating — call BEFORE every change.
  pushHistory(doc) {
    const id = doc.id;
    const snap = JSON.parse(JSON.stringify(doc));
    const stack = this.undoStacks[id] || [];
    stack.push(snap);
    if (stack.length > this.undoCap) stack.shift();
    this.undoStacks[id] = stack;
    this.redoStacks[id] = []; // a fresh action ends the redo branch
    this.saveHistory();
  }

  canUndo(docId) {
    return !!(this.undoStacks[docId] && this.undoStacks[docId].length > 0);
  }
  canRedo(docId) {
    return !!(this.redoStacks[docId] && this.redoStacks[docId].length > 0);
  }

  undo() {
    const id = this.activeDocId;
    const stack = this.undoStacks[id];
    if (!stack || stack.length === 0) return false;
    const prev = stack.pop();
    const cur = this.documents.find((d) => d.id === id);
    if (cur) {
      const r = this.redoStacks[id] || [];
      r.push(JSON.parse(JSON.stringify(cur)));
      if (r.length > this.undoCap) r.shift();
      this.redoStacks[id] = r;
    }
    const idx = this.documents.findIndex((d) => d.id === id);
    if (idx >= 0) {
      prev.modified = Date.now();
      this.documents[idx] = prev;
    }
    this.save();
    this.saveHistory();
    this._fire();
    return true;
  }

  redo() {
    const id = this.activeDocId;
    const stack = this.redoStacks[id];
    if (!stack || stack.length === 0) return false;
    const next = stack.pop();
    const cur = this.documents.find((d) => d.id === id);
    if (cur) {
      const u = this.undoStacks[id] || [];
      u.push(JSON.parse(JSON.stringify(cur)));
      if (u.length > this.undoCap) u.shift();
      this.undoStacks[id] = u;
    }
    const idx = this.documents.findIndex((d) => d.id === id);
    if (idx >= 0) {
      next.modified = Date.now();
      this.documents[idx] = next;
    }
    this.save();
    this.saveHistory();
    this._fire();
    return true;
  }

  updateDocument(doc) {
    const idx = this.documents.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      doc.modified = Date.now();
      this.documents[idx] = doc;
    }
    this.save();
    this._fire();
  }

  _fire() {
    if (this.onChange) this.onChange();
  }
}

// ── Is `candidate` an ancestor-or-self reachable from `id` walking parentId? ──
function mashIsDescendant(doc, candidateId, ancestorId) {
  let cur = candidateId;
  let hops = 0;
  while (cur && hops < 500) {
    if (cur === ancestorId) return true;
    cur = doc.nodes[cur] ? doc.nodes[cur].parentId : null;
    hops++;
  }
  return false;
}

// ── ASH ⇄ mind map generator (port of MashAshCodeGenerator) ──
const MashAshCodeGenerator = {
  toAshSource(doc) {
    const lines = [];
    lines.push("// ════════════════════════════════════════════");
    lines.push(`// ${doc.title} — generated from MASH mind map`);
    lines.push("// Ash Tree IDE · LEATR v2 · © 2025 DART Meadow | Radical Deepscale LLC.");
    lines.push("// ════════════════════════════════════════════");
    lines.push("");

    const processNode = (id, depth) => {
      const node = doc.nodes[id];
      if (!node) return;
      const indent = "  ".repeat(depth);
      const text = node.text;

      switch (node.type) {
        case "ash_code": lines.push(`${indent}${text}`); break;
        case "out_terminal": lines.push(`${indent}output.terminal("${text}")`); break;
        case "out_2d": lines.push(`${indent}output.canvas2d("${text}")`); break;
        case "out_3d": lines.push(`${indent}output.scene3d("${text}")`); break;
        case "input_form": lines.push(`${indent}input.form("${text}")`); break;
        case "output_form": lines.push(`${indent}output.form("${text}")`); break;
        case "return": lines.push(`${indent}return ${text}`); break;
        case "root":
          lines.push(`// Root: ${text}`);
          lines.push("");
          break;
        case "category":
          if (text.startsWith("ENV:")) lines.push(`{{env:${text.slice(4).trim()}}}`);
          else if (text.startsWith("SCRIPT:")) lines.push(`[[script:${text.slice(7).trim()}]]`);
          else lines.push(`// ${text}`);
          lines.push("");
          break;
        case "subtitle":
          if (text.startsWith("POLY:")) lines.push(`${indent}[poly: ${text.slice(5).trim()}]`);
          else if (text.startsWith("NET:")) lines.push(`${indent}[net: ${text.slice(4).trim()}]`);
          else if (text.startsWith("Tool:")) lines.push(`${indent}${text.slice(5).trim()}`);
          else lines.push(`${indent}// ${text}`);
          break;
        case "main": {
          lines.push("");
          const alnum = text.replace(/[^A-Za-z0-9]/g, "");
          const nodeName = alnum ? alnum[0].toUpperCase() + alnum.slice(1) : "Node";
          lines.push(`(${nodeName}):-: {`);
          lines.push("");
          lines.push("  with");
          lines.push("    var (s)  // Data Set");
          lines.push("");
          lines.push("  {");
          break;
        }
        case "note":
          if (text.startsWith("irin:")) lines.push(`${indent}irin (${text.slice(5).trim()})`);
          else if (text.startsWith("irout:")) lines.push(`${indent}irout (${text.slice(6).trim()})`);
          else if (text.startsWith("import:")) lines.push(`import (${text.slice(7).trim()})`);
          else lines.push(`${indent}// ${text}`);
          if (node.detail) lines.push(`${indent}// Note: ${node.detail}`);
          break;
        case "link":
          if (text.startsWith("import:")) lines.push(`import (${text.slice(7).trim()})`);
          break;
        case "image":
          lines.push(`${indent}// [image node: ${text}]`);
          break;
        default:
          lines.push(`${indent}// ${text}`);
      }

      node.children.forEach((childId) => processNode(childId, depth + 1));

      if (node.type === "main") {
        lines.push("  }");
        lines.push("");
        lines.push('  irout ("Result: "placeto (s))');
        lines.push("");
        lines.push("}|';'|");
      }
    };

    const topNodes = doc.nodes[doc.rootId] ? doc.nodes[doc.rootId].children : [];
    const categories = topNodes.filter((id) => doc.nodes[id] && doc.nodes[id].type === "category");
    const others = topNodes.filter((id) => !doc.nodes[id] || doc.nodes[id].type !== "category");

    categories.forEach((id) => processNode(id, 0));
    lines.push("");
    processNode(doc.rootId, 0);
    others.forEach((id) => processNode(id, 0));

    return lines.join("\n");
  }
};
