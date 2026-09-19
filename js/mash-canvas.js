// ============================================================
//  mash-canvas.js — Ash Map interactive canvas
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Pointer-events based (not touch/mouse split) so it works
//  identically on desktop and mobile. One pointerdown handler
//  on the canvas wrapper decides pan vs node-drag vs socket-drag
//  by hit-testing what was actually touched — the same lesson
//  learned the hard way on the iOS build: never stack a
//  ScrollView/gesture recognizer on top of the canvas, and
//  never accumulate deltas frame-to-frame — always compute the
//  new position from the drag's start state.
// ============================================================

class MashCanvas {
  constructor(opts) {
    this.wrap = document.getElementById("mmCanvasWrap");
    this.svg = document.getElementById("mmSvg");
    this.nodeLayer = document.getElementById("mmNodeLayer");
    this.zoomReadout = document.getElementById("mmZoomReadout");
    this.hintEl = document.getElementById("mmHint");

    this.store = opts.store;
    this.onNodeDblClick = opts.onNodeDblClick || (() => {});
    this.onSelectionChange = opts.onSelectionChange || (() => {});

    this.tool = "select";           // 'select' | 'disconnect'
    this.selectedId = null;
    this.scale = 1;
    this.offset = { x: 0, y: 0 };

    // Drag state — always "start snapshot + live pointer", never accumulation
    this.drag = null;

    this._bind();
  }

  get doc() { return this.store.activeDoc; }

  setTool(tool) {
    this.tool = tool;
    this.wrap.classList.toggle("disconnect-mode", tool === "disconnect");
    this.showHint(tool === "disconnect" ? "Click a curve to disconnect it" : "");
  }

  showHint(text) {
    if (!text) { this.hintEl.classList.remove("show"); return; }
    this.hintEl.textContent = text;
    this.hintEl.classList.add("show");
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hintEl.classList.remove("show"), 2200);
  }

  /// Does this document's layout mode call for rigid auto-placement
  /// (as opposed to freeform manual dragging)?
  isStrictLayout(layout) {
    return ["tree", "fishbone", "flowchart", "orgchart", "timeline"].includes(layout);
  }

  /// Recompute every node's x/y for the document's current layout.
  /// Direct port of applyAutoLayout in IDEMindMapView.swift — same
  /// spacing constants, same recursive placement, so a layout looks
  /// the same shape here as it does in the iOS app.
  applyAutoLayout(doc) {
    switch (doc.layout) {
      case "radial":
        this._layoutRadial(doc, doc.rootId, 0, 0, 0, 2 * Math.PI, 0);
        break;
      case "tree":
        this._layoutTree(doc, doc.rootId, 0, 0);
        break;
      case "fishbone":
        this._layoutFishbone(doc);
        break;
      case "flowchart":
      case "orgchart":
        this._layoutOrg(doc, doc.rootId, 0, 0);
        break;
      case "timeline":
        this._layoutTimeline(doc);
        break;
    }
  }

  _layoutRadial(doc, id, cx, cy, sa, ea, depth) {
    const node = doc.nodes[id];
    if (!node) return;
    node.x = cx; node.y = cy;
    const children = node.children || [];
    if (children.length === 0) return;
    const span = (ea - sa) / children.length;
    const r = depth === 0 ? 220 : 160;
    children.forEach((cid, i) => {
      const a = sa + span * (i + 0.5);
      this._layoutRadial(doc, cid, cx + Math.cos(a) * r, cy + Math.sin(a) * r, a - span / 2, a + span / 2, depth + 1);
    });
  }

  _layoutTree(doc, id, x, y) {
    const node = doc.nodes[id];
    if (!node) return;
    node.x = x; node.y = y;
    const children = node.children || [];
    const sp = 160;
    const sx = x - ((children.length - 1) * sp) / 2;
    children.forEach((cid, i) => this._layoutTree(doc, cid, sx + i * sp, y + 180));
  }

  _layoutFishbone(doc) {
    const root = doc.nodes[doc.rootId];
    if (!root) return;
    root.x = 0; root.y = 0;
    const children = root.children || [];
    children.forEach((cid, i) => {
      const node = doc.nodes[cid];
      if (!node) return;
      node.x = i * 180 - ((children.length - 1) * 180) / 2;
      node.y = i % 2 === 0 ? -150 : 150;
    });
  }

  _layoutOrg(doc, id, x, y) {
    const node = doc.nodes[id];
    if (!node) return;
    node.x = x; node.y = y;
    const children = node.children || [];
    const sp = 160;
    const sx = x - ((children.length - 1) * sp) / 2;
    children.forEach((cid, i) => this._layoutOrg(doc, cid, sx + i * sp, y + 140));
  }

  _layoutTimeline(doc) {
    const root = doc.nodes[doc.rootId];
    if (!root) return;
    root.x = 0; root.y = 0;
    const children = root.children || [];
    children.forEach((cid, i) => {
      const node = doc.nodes[cid];
      if (!node) return;
      node.x = i * 200 - ((children.length - 1) * 200) / 2;
      node.y = 0;
    });
  }

  screenToWorld(sx, sy) {
    const r = this.wrap.getBoundingClientRect();
    const cx = r.width / 2 + this.offset.x;
    const cy = r.height / 2 + this.offset.y;
    return { x: (sx - r.left - cx) / this.scale, y: (sy - r.top - cy) / this.scale };
  }
  worldToScreen(wx, wy) {
    const r = this.wrap.getBoundingClientRect();
    const cx = r.width / 2 + this.offset.x;
    const cy = r.height / 2 + this.offset.y;
    return { x: cx + wx * this.scale, y: cy + wy * this.scale };
  }

  resetView() {
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.render();
  }

  // ── Pointer plumbing ─────────────────────────────────────
  _bind() {
    this.wrap.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    window.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.wrap.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });

    // Pinch zoom (two-touch) via native gesture events fallback: track two pointers
    this._activePointers = new Map();
    this.wrap.addEventListener("pointerdown", (e) => {
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    window.addEventListener("pointermove", (e) => {
      if (this._activePointers.has(e.pointerId)) {
        this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this._activePointers.size === 2) this._handlePinch();
    });
    window.addEventListener("pointerup", (e) => this._activePointers.delete(e.pointerId));
    window.addEventListener("pointercancel", (e) => this._activePointers.delete(e.pointerId));
  }

  _handlePinch() {
    const pts = [...this._activePointers.values()];
    if (pts.length !== 2) return;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    const dist = Math.hypot(dx, dy);
    if (this._pinchStartDist == null) {
      this._pinchStartDist = dist;
      this._pinchStartScale = this.scale;
      return;
    }
    const ratio = dist / this._pinchStartDist;
    this.scale = Math.min(3, Math.max(0.15, this._pinchStartScale * ratio));
    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.0018;
      this.scale = Math.min(3, Math.max(0.15, this.scale + this.scale * delta));
    } else {
      this.offset.x -= e.deltaX;
      this.offset.y -= e.deltaY;
    }
    this.render();
  }

  _onPointerDown(e) {
    if (this._activePointers.size > 1) return; // let pinch own it
    this._pinchStartDist = null;

    const targetNode = e.target.closest(".mm-node");
    const targetSocket = e.target.closest(".mm-socket");
    const targetEdge = e.target.closest(".mm-edge");

    // Disconnect tool: click a curve removes it, nothing else engages
    if (this.tool === "disconnect" && targetEdge) {
      this._disconnectEdge(targetEdge.dataset.edgeKind, targetEdge.dataset.edgeRef, targetEdge.dataset.edgeNode);
      return;
    }
    if (this.tool === "disconnect") return; // ignore drags while in disconnect mode

    if (targetSocket) {
      this._startSocketDrag(e, targetSocket);
      return;
    }
    if (targetNode) {
      this._startNodeDrag(e, targetNode);
      return;
    }
    // Empty canvas → pan
    this._startPan(e);
  }

  _startPan(e) {
    this.wrap.classList.add("panning");
    this.drag = {
      kind: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffset: { ...this.offset }
    };
    this.selectedId = null;
    this._closeNodeSelection();
  }

  _startNodeDrag(e, nodeEl) {
    const id = nodeEl.dataset.id;
    const node = this.doc.nodes[id];
    if (!node) return;
    // Select without a full innerHTML rebuild — rebuilding here would
    // replace nodeEl mid-gesture and silently swallow the browser's
    // native click/dblclick sequence for this pointer interaction.
    const prevSelected = this.nodeLayer.querySelector(".mm-node.selected");
    if (prevSelected) prevSelected.classList.remove("selected");
    nodeEl.classList.add("selected");
    this.selectedId = id;
    this.onSelectionChange(id);
    this.drag = {
      kind: "node",
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: node.x,
      startY: node.y,
      moved: false,
      pushedHistory: false
    };
    nodeEl.classList.add("dragging");
  }

  _startSocketDrag(e, socketEl) {
    const nodeId = socketEl.dataset.node;
    const isInput = socketEl.dataset.dir === "in";
    this.drag = {
      kind: "socket",
      nodeId,
      isInput,
      curX: e.clientX,
      curY: e.clientY
    };
    this.render();
  }

  _onPointerMove(e) {
    if (!this.drag) return;
    const d = this.drag;

    if (d.kind === "pan") {
      this.offset.x = d.startOffset.x + (e.clientX - d.startClientX);
      this.offset.y = d.startOffset.y + (e.clientY - d.startClientY);
      this.render();
      return;
    }

    if (d.kind === "node") {
      const dx = (e.clientX - d.startClientX) / this.scale;
      const dy = (e.clientY - d.startClientY) / this.scale;
      if (!d.moved && Math.hypot(dx, dy) > 2) {
        d.moved = true;
        if (!d.pushedHistory) { this.store.pushHistory(this.doc); d.pushedHistory = true; }
      }
      if (d.moved) {
        const node = this.doc.nodes[d.id];
        node.x = d.startX + dx;
        node.y = d.startY + dy;
        this.renderEdgesOnly();
        this._positionNodeEl(d.id);
      }
      return;
    }

    if (d.kind === "socket") {
      d.curX = e.clientX;
      d.curY = e.clientY;
      this.renderLiveWire();
    }
  }

  _onPointerUp(e) {
    if (!this.drag) return;
    const d = this.drag;
    let needsFullRender = false;

    if (d.kind === "pan") {
      this.wrap.classList.remove("panning");
      // Pan never changes node structure — no full render needed.
      // (Edges/transform already track live via renderEdgesOnly + the
      // nodeLayer transform set on every pointermove.)
    }

    if (d.kind === "node") {
      const nodeEl = this.nodeLayer.querySelector(`[data-id="${d.id}"]`);
      if (nodeEl) nodeEl.classList.remove("dragging");
      if (d.moved) {
        this._handleNodeDrop(d.id, e.clientX, e.clientY);
        // Strict template layouts snap back to their computed positions
        // after any manual drag, same as the iOS app — dragging can
        // still reparent/splice, but position itself isn't freeform.
        if (this.isStrictLayout(this.doc.layout)) this.applyAutoLayout(this.doc);
        this.store.updateDocument(this.doc);
        needsFullRender = true; // drop may have reparented / spliced structure
      }
      // If it never moved, this was a plain click/tap — leave the DOM
      // node exactly as-is so the browser's native click/dblclick
      // sequence for this element isn't interrupted by a rebuild.
    }

    if (d.kind === "socket") {
      this._finishSocketDrag(d, e.clientX, e.clientY);
      needsFullRender = true; // socket connect/disconnect changes structure
    }

    this.drag = null;
    if (needsFullRender) {
      this.render();
    } else {
      this.renderEdgesOnly(); // keep curves in sync without touching node DOM
    }
  }

  // Dropped a node — reparent onto a node under the cursor, or splice
  // into an edge under the cursor. Both checks use the same world-space
  // hit test used everywhere else in this file, so behavior matches
  // what the user sees regardless of pan/zoom.
  _handleNodeDrop(id, clientX, clientY) {
    const world = this.screenToWorld(clientX, clientY);
    const doc = this.doc;
    const node = doc.nodes[id];

    // (a) Dropped on a node
    for (const other of Object.values(doc.nodes)) {
      if (other.id === id) continue;
      const dist = Math.hypot(world.x - other.x, world.y - other.y);
      const r = Math.max(60, other.width * 0.55);
      if (dist < r) {
        if (mashIsDescendant(doc, other.id, id)) break; // cycle guard
        if (node.parentId) {
          const oldParent = doc.nodes[node.parentId];
          if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== id);
        }
        node.parentId = other.id;
        if (!other.children.includes(id)) other.children.push(id);
        return;
      }
    }

    // (b) Dropped on an edge midpoint → splice between parent and child
    const pairs = [];
    for (const p of Object.values(doc.nodes)) {
      if (p.id === id) continue;
      for (const cid of p.children) {
        if (cid === id) continue;
        const ch = doc.nodes[cid];
        if (ch) pairs.push([p.id, cid, (p.x + ch.x) / 2, (p.y + ch.y) / 2]);
      }
    }
    for (const [pid, cid, mx, my] of pairs) {
      if (Math.hypot(world.x - mx, world.y - my) < 45) {
        if (mashIsDescendant(doc, pid, id)) break;
        if (node.parentId) {
          const oldParent = doc.nodes[node.parentId];
          if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== id);
        }
        doc.nodes[pid].children = doc.nodes[pid].children.filter((c) => c !== cid);
        node.parentId = pid;
        doc.nodes[pid].children.push(id);
        doc.nodes[cid].parentId = id;
        if (!node.children.includes(cid)) node.children.push(cid);
        return;
      }
    }
  }

  _finishSocketDrag(d, clientX, clientY) {
    const world = this.screenToWorld(clientX, clientY);
    const doc = this.doc;
    let targetId = null;
    let bestDist = Infinity;
    for (const other of Object.values(doc.nodes)) {
      if (other.id === d.nodeId) continue;
      const dist = Math.hypot(world.x - other.x, world.y - other.y);
      const r = Math.max(60, other.width * 0.55);
      if (dist < r && dist < bestDist) { bestDist = dist; targetId = other.id; }
    }

    if (targetId) {
      if (d.isInput) {
        if (!mashIsDescendant(doc, targetId, d.nodeId)) {
          this.store.pushHistory(doc);
          const node = doc.nodes[d.nodeId];
          if (node.parentId) {
            const old = doc.nodes[node.parentId];
            if (old) old.children = old.children.filter((c) => c !== d.nodeId);
          }
          node.parentId = targetId;
          if (!doc.nodes[targetId].children.includes(d.nodeId)) doc.nodes[targetId].children.push(d.nodeId);
          this.store.updateDocument(doc);
        }
      } else {
        if (!mashIsDescendant(doc, d.nodeId, targetId)) {
          this.store.pushHistory(doc);
          const target = doc.nodes[targetId];
          if (target.parentId == null) {
            target.parentId = d.nodeId;
            if (!doc.nodes[d.nodeId].children.includes(targetId)) doc.nodes[d.nodeId].children.push(targetId);
          } else {
            doc.connections.push({ id: uuid(), fromId: d.nodeId, toId: targetId, arrowType: "forward", dashed: false });
          }
          this.store.updateDocument(doc);
        }
      }
    }
  }

  _disconnectEdge(kind, ref, nodeId) {
    const doc = this.doc;
    this.store.pushHistory(doc);
    if (kind === "parent") {
      const node = doc.nodes[nodeId];
      const parent = doc.nodes[node.parentId];
      if (parent) parent.children = parent.children.filter((c) => c !== nodeId);
      node.parentId = null;
    } else if (kind === "connection") {
      doc.connections = doc.connections.filter((c) => c.id !== ref);
    }
    this.store.updateDocument(doc);
    this.showHint("Disconnected");
    this.render();
  }

  _closeNodeSelection() {
    this.selectedId = null;
    this.onSelectionChange(null);
  }

  // ── Node factory helpers used by toolbar actions ─────────
  addChildToSelected(type = "main") {
    const doc = this.doc;
    if (!doc) return;
    this.store.pushHistory(doc);
    const parentId = this.selectedId || doc.rootId;
    const parent = doc.nodes[parentId];
    const siblingCount = parent.children.length;
    const x = parent.x + 190;
    const y = parent.y + siblingCount * 70 - (parent.children.length * 35);
    const node = newMashNode(type === "main" ? "main" : type, "New Node", x, y, parentId);
    doc.nodes[node.id] = node;
    parent.children.push(node.id);
    if (this.isStrictLayout(doc.layout)) this.applyAutoLayout(doc);
    this.store.updateDocument(doc);
    this.selectedId = node.id;
    this.render();
    return node;
  }

  addFreeNode() {
    const doc = this.doc;
    this.store.pushHistory(doc);
    const xs = Object.values(doc.nodes).map((n) => n.x);
    const ys = Object.values(doc.nodes).map((n) => n.y);
    const cx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) + 140;
    const cy = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length) + 140;
    const node = newMashNode("main", "New Node", cx, cy, null);
    doc.nodes[node.id] = node;
    this.store.updateDocument(doc);
    this.selectedId = node.id;
    this.render();
  }

  addMainBranch() {
    const doc = this.doc;
    this.store.pushHistory(doc);
    const maxX = Math.max(0, ...Object.values(doc.nodes).map((n) => n.x));
    const ys = Object.values(doc.nodes).map((n) => n.y);
    const avgY = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    const node = newMashNode("root", "Main Branch", maxX + 320, avgY, null);
    doc.nodes[node.id] = node;
    this.store.updateDocument(doc);
    this.selectedId = node.id;
    this.render();
  }

  addTypedNode(type, defaultText) {
    const doc = this.doc;
    this.store.pushHistory(doc);
    const parentId = this.selectedId || doc.rootId;
    const parent = doc.nodes[parentId];
    const node = newMashNode(type, defaultText, parent.x + 170, parent.y, parentId);
    doc.nodes[node.id] = node;
    parent.children.push(node.id);
    if (this.isStrictLayout(doc.layout)) this.applyAutoLayout(doc);
    this.store.updateDocument(doc);
    this.selectedId = node.id;
    this.render();
  }

  deleteNode(id) {
    const doc = this.doc;
    if (id === doc.rootId && Object.keys(doc.nodes).length > 1) {
      // don't delete the only root if it's the last main tree; allow otherwise
    }
    this.store.pushHistory(doc);
    const toDelete = new Set();
    const collect = (nid) => {
      toDelete.add(nid);
      (doc.nodes[nid]?.children || []).forEach(collect);
    };
    collect(id);
    const node = doc.nodes[id];
    if (node && node.parentId && doc.nodes[node.parentId]) {
      doc.nodes[node.parentId].children = doc.nodes[node.parentId].children.filter((c) => c !== id);
    }
    toDelete.forEach((nid) => delete doc.nodes[nid]);
    doc.connections = doc.connections.filter((c) => !toDelete.has(c.fromId) && !toDelete.has(c.toId));
    this.store.updateDocument(doc);
    this.selectedId = null;
    this.render();
  }

  duplicateNode(id) {
    const doc = this.doc;
    const node = doc.nodes[id];
    if (!node) return;
    this.store.pushHistory(doc);
    const copy = JSON.parse(JSON.stringify(node));
    copy.id = uuid();
    copy.x = node.x + 60;
    copy.y = node.y + 60;
    copy.parentId = null;   // unlinked — user connects manually
    copy.children = [];
    doc.nodes[copy.id] = copy;
    this.store.updateDocument(doc);
    this.selectedId = copy.id;
    this.render();
  }

  // ── Rendering ─────────────────────────────────────────────
  render() {
    const doc = this.doc;
    this.zoomReadout.textContent = `${Math.round(this.scale * 100)}%`;
    if (!doc) { this.nodeLayer.innerHTML = ""; this.svg.innerHTML = ""; return; }

    const theme = mashThemeById(doc.themeId);
    this.wrap.style.backgroundColor = theme.canvasBackground;

    this.nodeLayer.style.transform =
      `translate(${this.wrap.clientWidth / 2 + this.offset.x}px, ${this.wrap.clientHeight / 2 + this.offset.y}px) scale(${this.scale})`;

    // Nodes
    let nodeHtml = "";
    for (const node of Object.values(doc.nodes)) {
      nodeHtml += this._renderNode(node, theme);
    }
    this.nodeLayer.innerHTML = nodeHtml;

    this._wireNodeModalOpeners();
    this.renderEdgesOnly();
  }

  _renderNode(node, theme) {
    const typeInfo = MASH_NODE_TYPES[node.type] || MASH_NODE_TYPES.main;
    const fill = node.fillColor || MASH_TYPE_FILL[node.type] ||
      (node.type === "root" ? theme.rootFill :
        node.type === "main" ? theme.mainFill :
          node.type === "subtitle" ? theme.subtitleFill :
            node.type === "category" ? theme.categoryFill : theme.noteFill);
    const border = node.borderColor ||
      (node.type === "root" ? theme.rootBorder :
        node.type === "main" ? theme.mainBorder :
          node.type === "subtitle" ? theme.subtitleBorder :
            node.type === "category" ? theme.categoryBorder : theme.noteBorder);
    const textColor = node.textColor ||
      (node.type === "root" ? theme.rootText :
        node.type === "main" ? theme.mainText :
          node.type === "subtitle" ? theme.subtitleText :
            node.type === "category" ? theme.categoryText : theme.noteText);

    const selected = node.id === this.selectedId;
    const hasLinks = node.parentId || node.children.length > 0 ||
      this.doc.connections.some((c) => c.fromId === node.id || c.toId === node.id);
    const showSockets = hasLinks || selected;

    let inner = "";
    if (typeInfo.badge) {
      inner += `<div class="mm-node-badge" style="background:${typeInfo.badge.color}22;color:${typeInfo.badge.color}">${typeInfo.badge.icon} ${typeInfo.badge.label}</div>`;
    }
    if (node.imageData) {
      inner += `<img class="mm-node-img" src="${node.imageData}" style="max-height:${node.type === "root" ? 120 : 90}px">`;
    }
    const weight = node.bold ? "800" : "500";
    const style = node.italic ? "italic" : "normal";
    inner += `<div class="mm-node-text" style="color:${textColor};font-weight:${weight};font-style:${style};font-size:${typeInfo.fontSize}px">${escapeHtmlLite(node.text)}</div>`;

    const sockets = showSockets
      ? `<div class="mm-socket in ${node.parentId ? "connected" : ""}" data-node="${node.id}" data-dir="in"></div>
         <div class="mm-socket out ${node.children.length ? "connected" : ""}" data-node="${node.id}" data-dir="out"></div>`
      : "";

    return `<div class="mm-node ${selected ? "selected" : ""} type-${node.type}"
                 data-id="${node.id}"
                 style="left:${node.x}px;top:${node.y}px;min-width:${node.width}px;background:${fill};border-color:${border}">
              ${inner}
              ${sockets}
            </div>`;
  }

  _positionNodeEl(id) {
    const node = this.doc.nodes[id];
    const el = this.nodeLayer.querySelector(`[data-id="${id}"]`);
    if (el && node) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
  }

  renderEdgesOnly() {
    const doc = this.doc;
    if (!doc) return;
    const theme = mashThemeById(doc.themeId);
    const r = this.wrap.getBoundingClientRect();
    this.svg.setAttribute("width", r.width);
    this.svg.setAttribute("height", r.height);

    const cx = r.width / 2 + this.offset.x;
    const cy = r.height / 2 + this.offset.y;
    const toScreen = (x, y) => ({ x: cx + x * this.scale, y: cy + y * this.scale });

    let svg = "";
    const curveStyle = mashCurveStyleId(doc);
    // Parent → child tree edges (solid)
    for (const node of Object.values(doc.nodes)) {
      for (const cid of node.children) {
        const child = doc.nodes[cid];
        if (!child) continue;
        const a = toScreen(node.x, node.y);
        const b = toScreen(child.x, child.y);
        svg += this._edgePath(a, b, theme.connectionColor, curveStyle, false, "parent", "", cid);
      }
    }
    // Free-form reference connections (dashed) — always drawn as a
    // simple curve regardless of the document's curve style, so a
    // manual cross-link stays visually distinct from the tree edges.
    for (const conn of doc.connections) {
      const from = doc.nodes[conn.fromId], to = doc.nodes[conn.toId];
      if (!from || !to) continue;
      const a = toScreen(from.x, from.y);
      const b = toScreen(to.x, to.y);
      svg += this._edgePath(a, b, conn.color || theme.connectionColor, "curved", true, "connection", conn.id, conn.fromId);
    }
    this.svg.innerHTML = svg;
    this.renderLiveWire();
  }

  _edgePath(a, b, color, style, dashed, kind, ref, nodeId) {
    let d;
    if (style === "straight") {
      // Single elbow: one bend, midpoint break.
      const mx = (a.x + b.x) / 2;
      d = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
    } else if (style === "circuit") {
      // PCB-trace routing: horizontal run, then vertical, then
      // horizontal — three straight segments with sharp right-angle
      // corners, no diagonals, the way real circuit traces route.
      // This is what "Blueprint" curves are for — schematic-style
      // diagrams — independent of which color theme is active.
      const midX = a.x + (b.x - a.x) * 0.6;
      d = `M${a.x},${a.y} L${midX},${a.y} L${midX},${b.y} L${b.x},${b.y}`;
    } else if (style === "organic") {
      // Gentle asymmetric wobble so branches feel hand-drawn rather
      // than mechanically curved.
      const dx = (b.x - a.x) * 0.5;
      const dy = (b.y - a.y) * 0.15;
      d = `M${a.x},${a.y} C${a.x + dx * 0.7},${a.y + dy} ${b.x - dx * 1.2},${b.y - dy} ${b.x},${b.y}`;
    } else {
      // "curved" (default) — smooth symmetric bezier.
      const dx = (b.x - a.x) * 0.5;
      d = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    }
    const dashAttr = dashed ? `stroke-dasharray="5,4"` : "";
    const cls = this.tool === "disconnect" ? "mm-edge disconnectable" : "mm-edge";
    return `<path class="${cls}" data-edge-kind="${kind}" data-edge-ref="${ref}" data-edge-node="${nodeId}"
              d="${d}" stroke="${color}" stroke-width="2" fill="none" ${dashAttr} opacity="0.85"/>`;
  }

  renderLiveWire() {
    if (!this.drag || this.drag.kind !== "socket") return;
    const d = this.drag;
    const node = this.doc.nodes[d.nodeId];
    const start = this.worldToScreen(node.x, node.y);
    const r = this.wrap.getBoundingClientRect();
    const end = { x: d.curX - r.left, y: d.curY - r.top };
    const existing = this.svg.querySelector(".mm-live-wire");
    if (existing) existing.remove();
    const dx = (end.x - start.x) * 0.5;
    const path = `M${start.x},${start.y} C${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}`;
    this.svg.insertAdjacentHTML("beforeend",
      `<path class="mm-live-wire" d="${path}" stroke="#00ffcc" stroke-width="2" fill="none" stroke-dasharray="4,4"/>`);
  }

  _wireNodeModalOpeners() {
    this.nodeLayer.querySelectorAll(".mm-node").forEach((el) => {
      let lastTap = 0;
      el.addEventListener("dblclick", () => this.onNodeDblClick(el.dataset.id));
      el.addEventListener("touchend", () => {
        const now = Date.now();
        if (now - lastTap < 320) this.onNodeDblClick(el.dataset.id);
        lastTap = now;
      });
    });
  }

  exportPng() {
    const doc = this.doc;
    if (!doc) return;
    const canvas = this._renderToCanvas(2);
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.png`;
      a.click();
    });
  }

  // ── MASH — this app's own JSON format, byte-identical shape to
  // what iOS's exportMASH() produces (JSONEncoder().encode(doc)),
  // so a file exported here re-imports cleanly on either platform. ──
  exportMash() {
    const doc = this.doc;
    if (!doc) return;
    const json = JSON.stringify(doc, null, 2);
    downloadTextFile(`${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.mash`, json);
  }

  // ── FreeMind (.mm) — same <node TEXT="..."> shape as iOS's real
  // exportFreeMind(), so it round-trips with MashImport.fromFreeMind
  // on both platforms and opens correctly in FreeMind/MindNode/etc. ──
  exportFreeMind() {
    const doc = this.doc;
    if (!doc) return;
    let mm = `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n`;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nodeXML = (id, indent) => {
      const n = doc.nodes[id];
      if (!n) return "";
      let out = `${indent}<node TEXT="${esc(n.text)}">\n`;
      for (const childId of n.children) out += nodeXML(childId, indent + "  ");
      out += `${indent}</node>\n`;
      return out;
    };
    mm += nodeXML(doc.rootId, "  ");
    mm += "</map>";
    downloadTextFile(`${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.mm`, mm);
  }

  // ── Markdown — a nested bullet outline of the tree, same shape as
  // iOS's exportMarkdown() (heading for the root, indented bullets
  // for descendants). ──
  exportMarkdown() {
    const doc = this.doc;
    if (!doc) return;
    let md = `# ${doc.title}\n\n`;
    const walk = (id, depth) => {
      const n = doc.nodes[id];
      if (!n) return;
      if (depth > 0) md += `${"  ".repeat(depth - 1)}- ${n.text}\n`;
      for (const childId of n.children) walk(childId, depth + 1);
    };
    walk(doc.rootId, 0);
    downloadTextFile(`${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`, md);
  }

  // ── PDF — same layout math as exportPng (shared bounds/draw code),
  // rendered onto a canvas and dropped into a jsPDF page sized to
  // match, so the PDF looks identical to the PNG export. ──
  async exportPdf() {
    const doc = this.doc;
    if (!doc) return;
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Failed to load jsPDF"));
        document.head.appendChild(s);
      });
    }
    const canvas = this._renderToCanvas(2);
    if (!canvas) return;
    const { jsPDF } = window.jspdf;
    const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "pt", format: [canvas.width / 2, canvas.height / 2] });
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save(`${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`);
  }

  // Shared by exportPng and exportPdf — factored out so both produce
  // pixel-identical output instead of two copies of the same drawing
  // code drifting apart over time.
  _renderToCanvas(scale) {
    const doc = this.doc;
    const theme = mashThemeById(doc.themeId);
    const nodes = Object.values(doc.nodes);
    if (nodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const hw = n.width / 2 + 30, hh = 60;
      minX = Math.min(minX, n.x - hw); maxX = Math.max(maxX, n.x + hw);
      minY = Math.min(minY, n.y - hh); maxY = Math.max(maxY, n.y + hh);
    }
    const pad = 60;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const w = maxX - minX, h = maxY - minY;

    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = theme.canvasBackground;
    ctx.fillRect(0, 0, w, h);

    const px = (x) => x - minX, py = (y) => y - minY;

    ctx.strokeStyle = theme.connectionColor;
    ctx.lineWidth = 2;
    for (const node of nodes) {
      for (const cid of node.children) {
        const child = doc.nodes[cid];
        if (!child) continue;
        ctx.beginPath();
        ctx.moveTo(px(node.x), py(node.y));
        const dx = (px(child.x) - px(node.x)) * 0.5;
        ctx.bezierCurveTo(px(node.x) + dx, py(node.y), px(child.x) - dx, py(child.y), px(child.x), py(child.y));
        ctx.stroke();
      }
    }

    for (const node of nodes) {
      const fill = node.fillColor || MASH_TYPE_FILL[node.type] ||
        (node.type === "root" ? theme.rootFill : node.type === "main" ? theme.mainFill : theme.noteFill);
      const border = node.borderColor ||
        (node.type === "root" ? theme.rootBorder : node.type === "main" ? theme.mainBorder : theme.noteBorder);
      const textColor = node.textColor ||
        (node.type === "root" ? theme.rootText : node.type === "main" ? theme.mainText : theme.noteText);
      const nw = node.width, nh = 46;
      const x = px(node.x) - nw / 2, y = py(node.y) - nh / 2;
      ctx.fillStyle = fill;
      roundRect(ctx, x, y, nw, nh, 10);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, nw, nh, 10);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.font = `${node.bold ? "800" : "500"} ${node.type === "root" ? 15 : 12}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.text.slice(0, 40), px(node.x), py(node.y));
    }
    return canvas;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function escapeHtmlLite(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
