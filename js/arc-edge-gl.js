// ============================================================
//  arc-edge-gl.js — Arc Edge Vector GL Driver (web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Direct port of ArcEdgeGLDriver.swift: the tangent-weighted
//  quadratic-Bezier spline system per axis (X/Y/Z), physics-driven
//  handle offsets (gravity/wind/temperature/humidity/pressure),
//  sigma-point meridian joining across axes, animated at 60fps,
//  same orbit/pan/pinch camera rig as the maze/generic GL scenes.
// ============================================================

const ArcEdgeMath = {
  DOC: 3.0,
  ARC_S: 2.3,
  STEPS: 72,

  circumference(d) { return Math.pow(Math.sqrt(d * this.DOC), 2); },
  area(d) { return Math.pow(this.circumference(d), 2); },
  volume(d) { return Math.pow(this.area(d), 3); },
  sphereSA(d) { return this.volume(d) * 0.25; },
  branchArc(d) { return this.circumference(d) * 0.125; },
  arcDeviation(t, phase, influence) {
    return Math.sin(this.DOC * t + phase) * influence * 0.48;
  }
};

function newAxisState() {
  return {
    handles: [[0, 0], [0, 0], [0, 0]],
    smooth: true,
    influence: 0,
    phase: 0,
    physTargets: [true, true, true],
    visible: true
  };
}

class ArcEdgeGL {
  constructor(canvas) {
    this.canvas = canvas;
    this.axisX = newAxisState();
    this.axisY = newAxisState();
    this.axisZ = newAxisState();
    this.physics = { wind: 0, temperature: 72, gravity: 9.81, humidity: 50, pressure: 14.7 };
    this.grid = {
      enabled: false,
      xzEnabled: true, xzCountX: 5, xzCountZ: 5,
      xyEnabled: true, xyCountX: 5, xyCountY: 5,
      zyEnabled: true, zyCountZ: 5, zyCountY: 5
    };
    this.meridianJoin = true;
    this.tangentEnabled = true;
    this.simTime = 0;
    this.sigmaM = new THREE.Vector3(0, 0, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a10);
    this.scene.fog = new THREE.Fog(0x060a10, 15, 50);

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0x00e5ff, 1.0);
    dir.position.set(5, 8, 5);
    this.scene.add(dir);

    this.splineXNode = new THREE.Group();
    this.splineYNode = new THREE.Group();
    this.splineZNode = new THREE.Group();
    this.axisNode = new THREE.Group();
    this.gridNode = new THREE.Group();
    this.handleNode = new THREE.Group();
    this.sigmaNode = new THREE.Group();
    for (const n of [this.splineXNode, this.splineYNode, this.splineZNode,
                     this.axisNode, this.gridNode, this.handleNode, this.sigmaNode]) {
      this.scene.add(n);
    }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.001, 2000);

    this._buildAxisLines();
    this.rebuild();

    this._bindOrbit();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    this.resize();

    this._running = true;
    this._animate();

    this._buildPanel();
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  axisState(ax) { return ax === "X" ? this.axisX : ax === "Y" ? this.axisY : this.axisZ; }

  physOffset(axis, hIdx) {
    const sp = this.axisState(axis);
    if (!sp.physTargets[hIdx]) return [0, 0];
    const t = hIdx * 0.5;
    const gn = this.physics.gravity / 9.81, wn = this.physics.wind / 100;
    const tn = (this.physics.temperature - 72) / 48, hn = this.physics.humidity / 100;
    const pn = (this.physics.pressure - 14.7) / 15.3;
    const gravBell = 4 * t * (1 - t);
    const gravSag = (gn - 1) * 0.55 * gravBell;
    const wA = Math.sin(this.simTime * ArcEdgeMath.DOC * 0.26 + sp.phase + hIdx) * wn * 0.45;
    const wB = Math.cos(this.simTime * ArcEdgeMath.DOC * 0.20 + sp.phase + hIdx * 1.5) * wn * 0.28;
    const hA = Math.sin(this.simTime * ArcEdgeMath.DOC * 0.64 + hIdx * 2.0) * hn * 0.13;
    const pA = pn * 0.08;
    let da = 0, db = 0;
    if (axis === "X") { da = -gravSag + wA + tn * 0.18 + hA + pA; db = wB; }
    else if (axis === "Y") { da = wA + tn * 0.14 + hA + pA; db = wB; }
    else { da = wA + pA; db = -gravSag + wB + tn * 0.18 + hA; }
    return [da * sp.influence, db * sp.influence];
  }

  effHandle(axis, idx) {
    const sp = this.axisState(axis);
    const po = this.tangentEnabled ? this.physOffset(axis, idx) : [0, 0];
    return [sp.handles[idx][0] + po[0], sp.handles[idx][1] + po[1]];
  }

  naturalMidpoint(axis) {
    const sp = this.axisState(axis);
    const eHW = this.effHandle(axis, 0), eHE = this.effHandle(axis, 2);
    const po = this.tangentEnabled ? this.physOffset(axis, 1) : [0, 0];
    const eHM = [sp.handles[1][0] + po[0], sp.handles[1][1] + po[1]];
    const bA = 0.25 * eHW[0] + 0.5 * eHM[0] + 0.25 * eHE[0];
    const bB = 0.25 * eHW[1] + 0.5 * eHM[1] + 0.25 * eHE[1];
    const arc = this.tangentEnabled ? ArcEdgeMath.arcDeviation(0.5, sp.phase, sp.influence) : 0;
    if (axis === "X") return new THREE.Vector3(0, bA + arc, bB);
    if (axis === "Y") return new THREE.Vector3(bA + arc, 0, bB);
    return new THREE.Vector3(bA + arc, bB, 0);
  }

  computeSigmaM() {
    let sx = 0, sy = 0, sz = 0, nx = 0, ny = 0, nz = 0;
    for (const ax of ["X", "Y", "Z"]) {
      if (!this.axisState(ax).visible) continue;
      const mp = this.naturalMidpoint(ax);
      if (ax === "X") { sy += mp.y; ny++; sz += mp.z; nz++; }
      else if (ax === "Y") { sx += mp.x; nx++; sz += mp.z; nz++; }
      else { sx += mp.x; nx++; sy += mp.y; ny++; }
    }
    this.sigmaM.set(nx > 0 ? sx / nx : 0, ny > 0 ? sy / ny : 0, nz > 0 ? sz / nz : 0);
  }

  sigmaMHandle(axis, eHW, eHE) {
    const sp = this.axisState(axis);
    const arc = this.tangentEnabled ? ArcEdgeMath.arcDeviation(0.5, sp.phase, sp.influence) : 0;
    let ta, tb;
    if (axis === "X") { ta = this.sigmaM.y; tb = this.sigmaM.z; }
    else if (axis === "Y") { ta = this.sigmaM.x; tb = this.sigmaM.z; }
    else { ta = this.sigmaM.x; tb = this.sigmaM.y; }
    return [2 * (ta - arc) - 0.5 * (eHW[0] + eHE[0]), 2 * tb - 0.5 * (eHW[1] + eHE[1])];
  }

  genSpline(axis) {
    const sp = this.axisState(axis);
    const eHW = this.effHandle(axis, 0), eHE = this.effHandle(axis, 2);
    const eHM = (this.tangentEnabled && this.meridianJoin && sp.visible)
      ? this.sigmaMHandle(axis, eHW, eHE) : this.effHandle(axis, 1);
    const eH = [eHW, eHM, eHE];
    const pts = [];
    for (let i = 0; i <= ArcEdgeMath.STEPS; i++) {
      const t = i / ArcEdgeMath.STEPS;
      const s = (t * 2 - 1) * ArcEdgeMath.ARC_S;
      let x = 0, y = 0, z = 0;
      if (axis === "X") x = s; else if (axis === "Y") y = s; else z = s;
      if (this.tangentEnabled) {
        const wW = (1 - t) * (1 - t), wM = 2 * t * (1 - t), wE = t * t;
        const bA = eH[0][0] * wW + eH[1][0] * wM + eH[2][0] * wE;
        const bB = eH[0][1] * wW + eH[1][1] * wM + eH[2][1] * wE;
        const arc = ArcEdgeMath.arcDeviation(t, sp.phase, sp.influence);
        if (axis === "X") { y += bA + arc; z += bB; }
        else if (axis === "Y") { x += bA + arc; z += bB; }
        else { x += bA + arc; y += bB; }
      }
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }

  rebuild() {
    if (this.tangentEnabled && this.meridianJoin) this.computeSigmaM();
    for (const n of [this.splineXNode, this.splineYNode, this.splineZNode, this.handleNode, this.sigmaNode]) {
      while (n.children.length) {
        const c = n.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
    const cols = { X: 0xff3d5a, Y: 0x39ff82, Z: 0x00e5ff };
    for (const ax of ["X", "Y", "Z"]) {
      if (!this.axisState(ax).visible) continue;
      const pts = this.genSpline(ax);
      const node = ax === "X" ? this.splineXNode : ax === "Y" ? this.splineYNode : this.splineZNode;
      this._addSpline(node, pts, cols[ax]);

      const eHW = this.effHandle(ax, 0), eHE = this.effHandle(ax, 2);
      const eHM = (this.tangentEnabled && this.meridianJoin) ? this.sigmaMHandle(ax, eHW, eHE) : this.effHandle(ax, 1);
      [eHW, eHM, eHE].forEach((eff, i) => {
        const t = i * 0.5, s = (t * 2 - 1) * ArcEdgeMath.ARC_S;
        let x = 0, y = 0, z = 0;
        if (ax === "X") x = s; else if (ax === "Y") y = s; else z = s;
        if (ax === "X") { y += eff[0]; z += eff[1]; }
        else if (ax === "Y") { x += eff[0]; z += eff[1]; }
        else { x += eff[0]; y += eff[1]; }
        const color = i === 1 ? 0xffffff : 0xffde52;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(i === 1 ? 0.055 : 0.04, 8, 8),
          new THREE.MeshBasicMaterial({ color })
        );
        sphere.position.set(x, y, z);
        this.handleNode.add(sphere);
      });
    }
    if (this.tangentEnabled && this.meridianJoin) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sphere.position.copy(this.sigmaM);
      this.sigmaNode.add(sphere);
    }
    while (this.gridNode.children.length) {
      const c = this.gridNode.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    if (this.grid.enabled) this._buildGridPlanes();
  }

  _addSpline(node, pts, color) {
    if (pts.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color });
    node.add(new THREE.Line(geo, mat));
    const glowMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    node.add(new THREE.Line(geo.clone(), glowMat));
  }

  _buildAxisLines() {
    while (this.axisNode.children.length) this.axisNode.remove(this.axisNode.children[0]);
    const s = ArcEdgeMath.ARC_S * 1.22;
    this._addLine(new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0), 0xff3d5a, 0.5, this.axisNode);
    this._addLine(new THREE.Vector3(0, -s, 0), new THREE.Vector3(0, s, 0), 0x39ff82, 0.5, this.axisNode);
    this._addLine(new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 0, s), 0x00e5ff, 0.5, this.axisNode);

    const gH = ArcEdgeMath.ARC_S * 1.1, step = (ArcEdgeMath.ARC_S * 2.2) / 12;
    for (let i = 0; i <= 12; i++) {
      const p = -gH + i * step;
      this._addLine(new THREE.Vector3(p, 0, -gH), new THREE.Vector3(p, 0, gH), 0x122030, 0.9, this.axisNode);
      this._addLine(new THREE.Vector3(-gH, 0, p), new THREE.Vector3(gH, 0, p), 0x122030, 0.9, this.axisNode);
    }
    const origin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.axisNode.add(origin);
  }

  _addLine(a, b, color, opacity, parent) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    parent.add(new THREE.Line(geo, mat));
  }

  _buildGridPlanes() {
    const s = ArcEdgeMath.ARC_S;
    if (this.grid.xzEnabled) this._addGridLines(this.grid.xzCountX, this.grid.xzCountZ, "x", "z", 0x39ff82, 0.4, s);
    if (this.grid.xyEnabled) this._addGridLines(this.grid.xyCountX, this.grid.xyCountY, "x", "y", 0xff3d5a, 0.4, s);
    if (this.grid.zyEnabled) this._addGridLines(this.grid.zyCountZ, this.grid.zyCountY, "z", "y", 0x00e5ff, 0.4, s);
  }

  _addGridLines(n1, n2, ax1, ax2, color, opacity, s) {
    const pt = (a, b) => {
      const v = new THREE.Vector3(0, 0, 0);
      v[ax1] = a; v[ax2] = b;
      return v;
    };
    for (let i = 0; i <= n1; i++) {
      const a = -s + i * ((s * 2) / Math.max(n1, 1));
      this._addLine(pt(a, -s), pt(a, s), color, opacity, this.gridNode);
    }
    for (let j = 0; j <= n2; j++) {
      const b = -s + j * ((s * 2) / Math.max(n2, 1));
      this._addLine(pt(-s, b), pt(s, b), color, opacity, this.gridNode);
    }
  }

  _bindOrbit() {
    const el = this.canvas;
    this.camQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.52)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.38));
    this.radius = 8;
    this.pivot = new THREE.Vector3(0, 0, 0);
    this._commitCam();

    let pointers = new Map();
    let mode = null, last = { x: 0, y: 0 }, pinchStartDist = null, pinchStartRadius = null;

    el.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { mode = "orbit"; last = { x: e.clientX, y: e.clientY }; }
      else if (pointers.size === 2) {
        mode = "pinch";
        const pts = [...pointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartRadius = this.radius;
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === "orbit" && pointers.size === 1) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ);
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.006);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * 0.006);
        this.camQ.premultiply(qYaw).premultiply(qPitch).normalize();
        this._commitCam();
      } else if (mode === "pinch" && pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStartDist) this.radius = Math.max(0.5, Math.min(200, pinchStartRadius / (d / pinchStartDist)));
        this._commitCam();
      }
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) { mode = null; pinchStartDist = null; }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.radius = Math.max(0.5, Math.min(200, this.radius * (1 + e.deltaY * 0.001)));
      this._commitCam();
    }, { passive: false });
    el.addEventListener("dblclick", () => this.resetView());
  }

  resetView() {
    this.camQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.52)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.38));
    this.radius = 8; this.pivot.set(0, 0, 0);
    this._commitCam();
  }

  _commitCam() {
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camQ);
    this.camera.position.copy(this.pivot.clone().add(dir.multiplyScalar(this.radius)));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pivot);
  }

  _animate() {
    if (!this._running) return;
    this.simTime += 1 / 60;
    this.rebuild();
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(() => this._animate());
  }

  _buildPanel() {
    const wrap = this.canvas.parentElement;
    const panel = document.createElement("div");
    panel.className = "arcedge-panel";
    panel.innerHTML = this._panelHtml();
    wrap.appendChild(panel);
    this.panelEl = panel;

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "arcedge-collapse-btn";
    collapseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    collapseBtn.addEventListener("click", () => {
      const hidden = panel.style.display === "none";
      panel.style.display = hidden ? "block" : "none";
      collapseBtn.innerHTML = hidden
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    });
    wrap.appendChild(collapseBtn);
    this.collapseBtnEl = collapseBtn;

    this._wirePanel(panel);
  }

  _panelHtml() {
    const axisRow = (label, color, key) => `
      <div class="arcedge-axis">
        <div class="arcedge-axis-head">
          <span class="dot" style="background:${color}"></span>
          <span class="lbl" style="color:${color}">${label}</span>
          <button class="vis-btn" data-vis="${key}" style="color:${color}">${this[key].visible ? "ON" : "OFF"}</button>
        </div>
        <div class="arcedge-slider-row">
          <span>Influence</span>
          <input type="range" min="0" max="1" step="0.01" value="${this[key].influence}" data-inf="${key}">
          <span class="val" data-infval="${key}">${this[key].influence.toFixed(2)}</span>
        </div>
        <div class="arcedge-slider-row">
          <span>Phase</span>
          <input type="range" min="0" max="6.28" step="0.01" value="${this[key].phase}" data-phase="${key}">
          <span class="val" data-phaseval="${key}">${this[key].phase.toFixed(2)}</span>
        </div>
      </div>`;

    const envSlider = (label, key, min, max, unit) => `
      <div class="arcedge-slider-row">
        <span>${label}</span>
        <input type="range" min="${min}" max="${max}" step="0.1" value="${this.physics[key]}" data-phys="${key}">
        <span class="val" data-physval="${key}">${this.physics[key].toFixed(1)} ${unit}</span>
      </div>`;

    return `
      <div class="arcedge-panel-head">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="title">&#9670; ARC EDGE VECTOR</span>
      </div>
      <div class="arcedge-panel-body">
        <label class="arcedge-toggle"><input type="checkbox" data-toggle="tangentEnabled" ${this.tangentEnabled ? "checked" : ""}> Tangent System</label>
        <label class="arcedge-toggle"><input type="checkbox" data-toggle="meridianJoin" ${this.meridianJoin ? "checked" : ""}> Join Meridians &Sigma;</label>
        <hr>
        ${axisRow("X AXIS", "#ff3d5a", "axisX")}
        ${axisRow("Y AXIS", "#39ff82", "axisY")}
        ${axisRow("Z AXIS", "#00e5ff", "axisZ")}
        <hr>
        <div class="arcedge-section-label">ENVIRONMENT</div>
        ${envSlider("Gravity", "gravity", 0, 20, "m/s\u00B2")}
        ${envSlider("Wind", "wind", 0, 200, "mph")}
        ${envSlider("Temp", "temperature", 0, 120, "\u00B0F")}
        ${envSlider("Humidity", "humidity", 0, 100, "%")}
        ${envSlider("Pressure", "pressure", 0, 30, "PSI")}
        <hr>
        <label class="arcedge-toggle"><input type="checkbox" data-toggle="gridEnabled" ${this.grid.enabled ? "checked" : ""}> Grid Planes</label>
        <div class="arcedge-section-label">ARC EDGE MATH (doc=3.0)</div>
        <div class="arcedge-math">Circ=sqrt(d\u00B73)\u00B2  Area=Circ\u00B2<br>Vol=Area\u00B3  SA=Vol\u00B70.25<br>Branch=Circ/8</div>
      </div>`;
  }

  _wirePanel(panel) {
    panel.querySelectorAll("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.toggle;
        if (key === "gridEnabled") this.grid.enabled = input.checked;
        else this[key] = input.checked;
      });
    });
    panel.querySelectorAll("[data-vis]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.vis;
        this[key].visible = !this[key].visible;
        btn.textContent = this[key].visible ? "ON" : "OFF";
      });
    });
    panel.querySelectorAll("[data-inf]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.inf;
        this[key].influence = parseFloat(input.value);
        panel.querySelector(`[data-infval="${key}"]`).textContent = this[key].influence.toFixed(2);
      });
    });
    panel.querySelectorAll("[data-phase]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.phase;
        this[key].phase = parseFloat(input.value);
        panel.querySelector(`[data-phaseval="${key}"]`).textContent = this[key].phase.toFixed(2);
      });
    });
    panel.querySelectorAll("[data-phys]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.phys;
        this.physics[key] = parseFloat(input.value);
        const units = { gravity: "m/s\u00B2", wind: "mph", temperature: "\u00B0F", humidity: "%", pressure: "PSI" };
        panel.querySelector(`[data-physval="${key}"]`).textContent = `${this.physics[key].toFixed(1)} ${units[key]}`;
      });
    });
  }

  dispose() {
    this._running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.panelEl) this.panelEl.remove();
    if (this.collapseBtnEl) this.collapseBtnEl.remove();
    this.renderer.dispose();
  }
}
