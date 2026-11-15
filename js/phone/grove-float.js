// ============================================================
//  grove-float.js — pop the Canopy phone out of the Grove tab into a draggable,
//  phone-shaped floating overlay (with a floating header + hardware-key footer),
//  and snap it back. The simulator instance is never recreated; only its mount
//  element is moved, so state (apps, notes, boot) survives both ways.
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================
(function (root) {
  "use strict";
  var SCALES = [{ k: "S", v: 0.55 }, { k: "M", v: 0.75 }, { k: "L", v: 1 }];
  var F = { on: false, size: 1, x: null, y: null };
  var el = {};

  function ls(get, key, val) {
    try { if (get) return JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
  }
  function grove() { return root.Grove || {}; }
  function mount() { return grove().simMount && grove().simMount(); }
  function sim() { return grove().getSim && grove().getSim(); }
  function panelActive() { var p = document.getElementById("panel-grove"); return !!(p && p.classList.contains("active")); }

  function build() {
    var d = document.createElement("div");
    d.className = "gvf"; d.id = "gvFloat";
    d.innerHTML =
      '<div class="gvf-head" id="gvfHead">' +
        '<span class="gvf-grip" title="Drag to move">&#10303;</span><span class="gvf-title">Samara One</span>' +
        '<button type="button" data-a="power" title="Power on / off">&#9211;</button>' +
        '<button type="button" data-a="rotate" title="Rotate">&#8635;</button>' +
        '<button type="button" data-a="shot" title="Screenshot (PNG)">&#128247;</button>' +
        '<button type="button" data-a="log" title="Device log">&#9776;</button>' +
        '<button type="button" data-a="size" title="Size" id="gvfSize">M</button>' +
        '<button type="button" data-a="dock" class="gvf-dock" title="Snap back into the Grove tab">&#10515; Dock</button>' +
      '</div>' +
      '<div class="gvf-body" id="gvfBody"></div>' +
      '<div class="gvf-foot">' +
        '<button type="button" data-k="back" title="Back">&#9665;</button><button type="button" data-k="home" title="Home">&#9675;</button>' +
        '<button type="button" data-k="power" title="Power key">&#9211;</button><button type="button" data-k="voldown" title="Volume down">&minus;</button><button type="button" data-k="volup" title="Volume up">+</button>' +
      '</div>';
    document.body.appendChild(d);
    el.root = d; el.head = d.querySelector("#gvfHead"); el.body = d.querySelector("#gvfBody"); el.size = d.querySelector("#gvfSize");
    d.addEventListener("click", onClick);
    wireDrag();
    return d;
  }

  function onClick(e) {
    var b = e.target.closest("button"); if (!b) return;
    var a = b.getAttribute("data-a"), k = b.getAttribute("data-k"), s = sim();
    if (k) { if (s && s.press) s.press(k); return; }
    if (a === "dock") return dock();
    if (a === "power") { var pb = document.getElementById("gvPower"); if (pb) pb.click(); return; }
    if (a === "shot") { var sb = document.getElementById("gvShot"); if (sb) sb.click(); return; }
    if (a === "rotate") { if (s && s.rotate) s.rotate(); setTimeout(fit, 30); setTimeout(fit, 220); return; }
    if (a === "log") { var m = mount(), t = m && m.querySelector(".cnp-toolbar .cnp-tb:nth-child(4)"); if (t) t.click(); return; }
    if (a === "size") { F.size = (F.size + 1) % SCALES.length; ls(false, "gvf_size", F.size); fit(); }
  }

  // Size the mount to the phone at the chosen scale (Canopy's own ResizeObserver then rescales it).
  function fit() {
    var m = mount(); if (!m || !F.on) return;
    var dev = m.querySelector(".cnp-device");
    var W = (dev && parseFloat(dev.style.width)) || 388, H = (dev && parseFloat(dev.style.height)) || 808;
    F.lastDev = W + "x" + H + "@" + F.size + "@" + (root.innerWidth || 0) + "x" + (root.innerHeight || 0);
    var maxH = Math.max(240, (root.innerHeight || 800) - 130), maxW = Math.max(160, (root.innerWidth || 400) - 16);
    var sc = Math.min(SCALES[F.size].v, maxH / H, maxW / W);
    m.style.width = Math.ceil(W * sc) + 2 + "px"; m.style.height = Math.ceil(H * sc) + 2 + "px";
    if (el.size) el.size.textContent = SCALES[F.size].k;
    clamp(true);
  }

  // Follow the phone itself: any rotation (header button, kernel, keyboard shortcut, gesture) re-fits the overlay.
  function watchDevice() {
    var m = mount(), dev = m && m.querySelector(".cnp-device");
    if (F.mo) { F.mo.disconnect(); F.mo = null; }
    if (!dev || !root.MutationObserver) return;
    F.mo = new MutationObserver(function () {
      var W = parseFloat(dev.style.width), H = parseFloat(dev.style.height);
      var key = W + "x" + H + "@" + F.size + "@" + (root.innerWidth || 0) + "x" + (root.innerHeight || 0);
      if (key !== F.lastDev) fit();
    });
    F.mo.observe(dev, { attributes: true, attributeFilter: ["style", "class"] });
  }

  function clamp(fromFit) {
    var d = el.root; if (!d) return;
    var w = d.offsetWidth, h = d.offsetHeight, vw = root.innerWidth, vh = root.innerHeight;
    if (F.x == null) { F.x = Math.max(8, vw - w - 24); F.y = Math.max(8, 70); }
    if (fromFit && w <= vw - 16) F.x = Math.min(Math.max(8, F.x), vw - w - 8);   // resized/rotated: keep it fully on screen
    else F.x = Math.min(Math.max(8 - w + 120, F.x), vw - 120);                    // dragging: always keep part of the header reachable
    if (fromFit && h <= vh - 8) F.y = Math.min(Math.max(4, F.y), vh - h - 4);
    F.y = Math.min(Math.max(0, F.y), vh - 48);
    d.style.left = F.x + "px"; d.style.top = F.y + "px";
  }

  function wireDrag() {
    var drag = null;
    el.head.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      drag = { dx: e.clientX - F.x, dy: e.clientY - F.y, id: e.pointerId };
      try { el.head.setPointerCapture(e.pointerId); } catch (x) {}
      el.root.classList.add("dragging"); e.preventDefault();
    });
    el.head.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      F.x = e.clientX - drag.dx; F.y = e.clientY - drag.dy; clamp();
    });
    function end(e) {
      if (!drag) return; drag = null; el.root.classList.remove("dragging");
      try { el.head.releasePointerCapture(e.pointerId); } catch (x) {}
      ls(false, "gvf_pos", { x: F.x, y: F.y });
    }
    el.head.addEventListener("pointerup", end); el.head.addEventListener("pointercancel", end);
    el.head.addEventListener("dblclick", function (e) { if (!e.target.closest("button")) dock(); });
  }

  function syncVisible() {
    if (!el.root) return;
    el.root.style.display = (F.on && panelActive()) ? "" : "none";   // hide while docked or while another tab is open; state is kept
  }

  function pop() {
    if (F.on) return;
    var m = mount(); if (!m) return;
    var saved = ls(true, "gvf_pos"), sz = ls(true, "gvf_size");
    if (saved && typeof saved.x === "number") { F.x = saved.x; F.y = saved.y; }
    if (typeof sz === "number" && SCALES[sz]) F.size = sz;
    F.home = m.parentNode;
    F.ph = document.createElement("div"); F.ph.className = "gvf-ph";
    F.ph.innerHTML = 'Simulator is floating. <button type="button" class="gv-btn" id="gvfDockPh">Snap back</button>';
    F.home.insertBefore(F.ph, m);
    F.ph.querySelector("#gvfDockPh").onclick = dock;
    if (!el.root) build();
    el.body.appendChild(m); m.classList.add("gvf-mount");
    document.getElementById("panel-grove").classList.add("gv-popped");
    F.on = true; el.root.style.display = "";
    var pb = document.getElementById("gvPop"); if (pb) pb.textContent = "Snap back";
    fit(); setTimeout(fit, 120); watchDevice();
  }

  function dock() {
    if (!F.on) return;
    if (F.mo) { F.mo.disconnect(); F.mo = null; }
    var m = mount();
    if (m && F.home) { F.home.insertBefore(m, F.ph); m.classList.remove("gvf-mount"); m.style.width = ""; m.style.height = ""; }
    if (F.ph && F.ph.parentNode) F.ph.parentNode.removeChild(F.ph);
    if (el.root) el.root.style.display = "none";
    document.getElementById("panel-grove").classList.remove("gv-popped");
    F.on = false;
    var pb = document.getElementById("gvPop"); if (pb) pb.textContent = "Pop out";
    if (m && root.dispatchEvent) setTimeout(function () { root.dispatchEvent(new Event("resize")); }, 30);
  }

  root.addEventListener("resize", function () { if (F.on) fit(); });
  document.addEventListener("DOMContentLoaded", function () {
    var p = document.getElementById("panel-grove");
    if (p && root.MutationObserver) new MutationObserver(syncVisible).observe(p, { attributes: true, attributeFilter: ["class"] });
  });
  document.addEventListener("keydown", function (e) { if (F.on && e.key === "Escape" && panelActive() && !e.target.closest("input,textarea")) dock(); });

  root.GroveFloat = { pop: pop, dock: dock, toggle: function () { F.on ? dock() : pop(); }, isOut: function () { return F.on; } };
})(typeof window !== "undefined" ? window : globalThis);
