// ============================================================
//  calculator-window.js — Floating draggable calculator window
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Chrome around the embedded Reckon calculator: drag by the
//  header anywhere on screen, resize from the corner handle,
//  collapse to just the header bar, close entirely. State
//  (position/size/collapsed) persists across sessions.
// ============================================================

const CalcWindow = {
  el: null,
  header: null,
  resizeHandle: null,
  opened: false,

  init() {
    this.el = document.getElementById("calcFloatWindow");
    this.header = document.getElementById("calcFloatHeader");
    this.resizeHandle = document.getElementById("calcResizeHandle");

    document.getElementById("calcLauncherBtn").addEventListener("click", () => this.toggle());
    document.getElementById("calcCloseBtn").addEventListener("click", () => this.close());
    document.getElementById("calcCollapseBtn").addEventListener("click", () => this.toggleCollapse());

    this._restoreGeometry();
    this._bindDrag();
    this._bindResize();
  },

  toggle() {
    if (this.el.hidden) this.open();
    else this.close();
  },

  open() {
    this.el.hidden = false;
    if (!this.opened) {
      this.opened = true;
      ReckonCalculator.init();
    }
    // Keep the window on-screen even if the viewport shrank since last close.
    this._clampToViewport();
  },

  close() {
    this.el.hidden = true;
  },

  toggleCollapse() {
    const collapsed = this.el.classList.toggle("calc-collapsed");
    document.getElementById("calcCollapseIcon").innerHTML = collapsed
      ? '<polyline points="6 9 12 15 18 9"/>'
      : '<polyline points="18 15 12 9 6 15"/>';
    this._saveGeometry();
  },

  _bindDrag() {
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    this.header.addEventListener("pointerdown", (e) => {
      // Don't start a drag from a control inside the header (tabs,
      // theme button, collapse/close) — only the header background
      // and the drag-handle label itself should initiate a move.
      if (e.target.closest("button") || e.target.closest(".theme-wrap") || e.target.closest(".calc-theme-wrap")) return;
      dragging = true;
      this.el.classList.add("calc-dragging");
      startX = e.clientX; startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      this.header.setPointerCapture(e.pointerId);
    });

    this.header.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      this.el.style.left = `${startLeft + dx}px`;
      this.el.style.top = `${startTop + dy}px`;
      this.el.style.right = "auto";
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove("calc-dragging");
      this._clampToViewport();
      this._saveGeometry();
    };
    this.header.addEventListener("pointerup", endDrag);
    this.header.addEventListener("pointercancel", endDrag);
  },

  _bindResize() {
    let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;

    this.resizeHandle.addEventListener("pointerdown", (e) => {
      resizing = true;
      startX = e.clientX; startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      this.resizeHandle.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });

    this.resizeHandle.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newW = Math.max(320, startW + dx);
      const newH = Math.max(240, startH + dy);
      this.el.style.width = `${newW}px`;
      const body = document.getElementById("calcFloatBody");
      body.style.maxHeight = `${Math.max(120, newH - this.header.offsetHeight)}px`;
    });

    const endResize = () => {
      if (!resizing) return;
      resizing = false;
      this._saveGeometry();
    };
    this.resizeHandle.addEventListener("pointerup", endResize);
    this.resizeHandle.addEventListener("pointercancel", endResize);
  },

  _clampToViewport() {
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = rect.left, top = rect.top;
    if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 8);
    if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 8);
    if (left < 0) left = 8;
    if (top < 0) top = 8;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  },

  _saveGeometry() {
    const rect = this.el.getBoundingClientRect();
    IDEStorage.set("calc_window_geometry", {
      left: rect.left, top: rect.top, width: rect.width,
      collapsed: this.el.classList.contains("calc-collapsed")
    });
  },

  _restoreGeometry() {
    const g = IDEStorage.get("calc_window_geometry", null);
    if (!g) return;
    this.el.style.left = `${g.left}px`;
    this.el.style.top = `${g.top}px`;
    this.el.style.right = "auto";
    if (g.width) this.el.style.width = `${g.width}px`;
    if (g.collapsed) {
      this.el.classList.add("calc-collapsed");
      document.getElementById("calcCollapseIcon").innerHTML = '<polyline points="6 9 12 15 18 9"/>';
    }
  }
};
