// ============================================================
//  mash-import.js — Mind map import: MASH, FreeMind, OPML
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Real parsers for three genuinely well-specified formats:
//  - MASH (.mash): this app's own JSON document, round-trips
//    exactly with exportMASH() in the iOS app.
//  - FreeMind (.mm): the classic <node TEXT="..."> XML tree,
//    round-trips with this app's own exportFreeMind().
//  - OPML (.opml): the standard outline-processor XML format
//    (<outline text="...">), used by many real outlining/mind-
//    mapping tools as a common interchange format.
//  MindNode's own file format is proprietary and undocumented,
//  so it isn't handled here — a MindNode user exports to OPML
//  or FreeMind first (both are options in MindNode's own export
//  menu), and that file imports normally through this module.
// ============================================================

const MashImport = {
  /// Detects format from filename extension and/or content sniffing,
  /// returns a real MashDocument, or throws with a clear message.
  fromFile(filename, text) {
    const ext = "." + filename.split(".").pop().toLowerCase();
    if (ext === ".mash" || ext === ".json") return this.fromMash(text);
    if (ext === ".mm") return this.fromFreeMind(text);
    if (ext === ".opml") return this.fromOpml(text);

    // Fall back to content sniffing if the extension is missing or
    // generic (e.g. a browser upload dialog stripped it).
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return this.fromMash(text);
    if (/<map\b/i.test(trimmed)) return this.fromFreeMind(text);
    if (/<opml\b/i.test(trimmed)) return this.fromOpml(text);
    throw new Error(`Unrecognized file type "${filename}" — expected .mash, .mm, or .opml`);
  },

  // ── MASH: this app's own format, already the right shape ──────
  fromMash(text) {
    const doc = JSON.parse(text);
    if (!doc.nodes || !doc.rootId) throw new Error("Not a valid MASH document (missing nodes/rootId)");
    // Re-key with fresh IDs so importing the same file twice, or a
    // file that collides with an existing doc's node IDs, never
    // corrupts anything — same defensive re-keying as the other
    // two importers below.
    return this._rekey(doc);
  },

  // ── FreeMind (.mm): <node TEXT="...">child nodes</node> tree ──
  fromFreeMind(text) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const parseError = xml.querySelector("parsererror");
    if (parseError) throw new Error("Malformed FreeMind XML: " + parseError.textContent.slice(0, 120));

    const rootEl = xml.querySelector("map > node");
    if (!rootEl) throw new Error("No root <node> found under <map> — not a valid FreeMind file");

    const doc = newMashDocument(this._attr(rootEl, "TEXT") || "Imported Mind Map");
    doc.nodes = {};
    const rootId = uuid();
    doc.rootId = rootId;

    const LEVEL_RADIUS = 220;

    const walk = (el, parentId, depth, angleStart, angleEnd) => {
      const text = this._attr(el, "TEXT") || "";
      const isRoot = parentId === null;
      const node = newMashNode(isRoot ? "root" : depth === 1 ? "main" : "subtitle", text, 0, 0, parentId);
      if (isRoot) node.id = rootId;
      doc.nodes[node.id] = node;
      if (parentId) doc.nodes[parentId].children.push(node.id);

      const childEls = [...el.children].filter((c) => c.tagName === "node");
      const span = (angleEnd - angleStart) / Math.max(1, childEls.length);
      childEls.forEach((childEl, i) => {
        const a = angleStart + span * (i + 0.5);
        const r = LEVEL_RADIUS * depth;
        const cx = node.x + Math.cos(a) * r * 0.4;
        const cy = node.y + Math.sin(a) * r * 0.4;
        const childId = walk(childEl, node.id, depth + 1, a - span / 2, a + span / 2);
        doc.nodes[childId].x = cx;
        doc.nodes[childId].y = cy;
      });
      return node.id;
    };

    walk(rootEl, null, 1, 0, Math.PI * 2);
    return doc;
  },

  // ── OPML: <outline text="..."> nested tree, wrapped in <opml><body> ──
  fromOpml(text) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const parseError = xml.querySelector("parsererror");
    if (parseError) throw new Error("Malformed OPML XML: " + parseError.textContent.slice(0, 120));

    const body = xml.querySelector("opml > body");
    if (!body) throw new Error("No <body> found under <opml> — not a valid OPML file");
    const topOutlines = [...body.children].filter((c) => c.tagName === "outline");
    if (topOutlines.length === 0) throw new Error("No <outline> elements found in OPML body");

    const titleEl = xml.querySelector("opml > head > title");
    const docTitle = (titleEl && titleEl.textContent.trim()) || "Imported Outline";
    const doc = newMashDocument(docTitle);
    doc.nodes = {};
    const rootId = uuid();
    doc.rootId = rootId;
    const root = newMashNode("root", docTitle, 0, 0, null);
    root.id = rootId;
    doc.nodes[rootId] = root;

    const LEVEL_RADIUS = 220;

    const outlineText = (el) => this._attr(el, "text") || this._attr(el, "title") || el.textContent.trim() || "";

    const walk = (el, parentId, depth, angleStart, angleEnd) => {
      const text = outlineText(el);
      const node = newMashNode(depth === 1 ? "main" : "subtitle", text, 0, 0, parentId);
      doc.nodes[node.id] = node;
      doc.nodes[parentId].children.push(node.id);

      const childEls = [...el.children].filter((c) => c.tagName === "outline");
      const span = (angleEnd - angleStart) / Math.max(1, childEls.length);
      childEls.forEach((childEl, i) => {
        const a = angleStart + span * (i + 0.5);
        const r = LEVEL_RADIUS * depth;
        const cx = node.x + Math.cos(a) * r * 0.4;
        const cy = node.y + Math.sin(a) * r * 0.4;
        const childId = walk(childEl, node.id, depth + 1, a - span / 2, a + span / 2);
        doc.nodes[childId].x = cx;
        doc.nodes[childId].y = cy;
      });
      return node.id;
    };

    const span = (Math.PI * 2) / topOutlines.length;
    topOutlines.forEach((el, i) => {
      const a = span * (i + 0.5);
      const r = LEVEL_RADIUS;
      const childId = walk(el, rootId, 1, a - span / 2, a + span / 2);
      doc.nodes[childId].x = Math.cos(a) * r;
      doc.nodes[childId].y = Math.sin(a) * r;
    });

    return doc;
  },

  _attr(el, name) {
    return el.getAttribute(name) || el.getAttribute(name.toLowerCase()) || el.getAttribute(name.toUpperCase());
  },

  // Re-key every node ID to a fresh UUID (keeping the tree structure
  // intact) so importing never collides with IDs already present in
  // the app's other open documents.
  _rekey(doc) {
    const idMap = {};
    for (const oldId of Object.keys(doc.nodes)) idMap[oldId] = uuid();
    const newNodes = {};
    for (const [oldId, node] of Object.entries(doc.nodes)) {
      const newNode = { ...node, id: idMap[oldId] };
      newNode.parentId = node.parentId ? idMap[node.parentId] || null : null;
      newNode.children = node.children.map((cid) => idMap[cid]).filter(Boolean);
      newNodes[newNode.id] = newNode;
    }
    doc.nodes = newNodes;
    doc.rootId = idMap[doc.rootId];
    doc.id = uuid();
    (doc.connections || []).forEach((c) => {
      c.fromId = idMap[c.fromId] || c.fromId;
      c.toId = idMap[c.toId] || c.toId;
    });
    return doc;
  }
};
