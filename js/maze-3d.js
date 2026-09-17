// ============================================================
//  maze-3d.js — WebGL maze renderer (Three.js)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Port of the SceneKit glass-wall builder + ArcLake orbit
//  camera from IDEMazeView.swift: same wall/perimeter/marker
//  layout math, same liquid-glass material look, same
//  1-finger-orbit / 2-finger-pan / pinch-zoom / double-tap-reset
//  control scheme, rebuilt on Three.js for the browser.
// ============================================================

class Maze3DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000d0f, 10, 50);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x0d1117, 1);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);

    const ambient = new THREE.AmbientLight(0x00ffcc, 0.5);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0x00ffcc, 1.4);
    dir.position.set(5, 8, 5);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x0088ff, 0.9);
    fill.position.set(-5, -3, 5);
    this.scene.add(fill);

    this.mazeGroup = new THREE.Group();
    this.scene.add(this.mazeGroup);

    this.camQ = new THREE.Quaternion();
    this.defaultQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.52)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.38));
    this.camQ.copy(this.defaultQ);
    this.radius = 8;
    this.pivot = new THREE.Vector3(0, 0, 0);
    this._commit();

    this._bindControls();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    this.resize();

    this._animate();
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _commit() {
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camQ);
    const pos = this.pivot.clone().add(dir.multiplyScalar(this.radius));
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pivot);
  }

  resetView(animated = true) {
    const startQ = this.camQ.clone();
    const startPivot = this.pivot.clone();
    const startR = this.radius;
    if (!animated) {
      this.camQ.copy(this.defaultQ); this.pivot.set(0, 0, 0); this.radius = 8;
      this._commit();
      return;
    }
    const t0 = performance.now();
    const dur = 450;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.camQ.copy(startQ).slerp(this.defaultQ, ease);
      this.pivot.lerpVectors(startPivot, new THREE.Vector3(0, 0, 0), ease);
      this.radius = startR + (8 - startR) * ease;
      this._commit();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _bindControls() {
    const el = this.canvas;
    let mode = null;
    let last = { x: 0, y: 0 };
    let pointers = new Map();
    let pinchStartDist = null, pinchStartRadius = null;
    let lastTapTime = 0;

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    el.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        mode = "orbit";
        last = { x: e.clientX, y: e.clientY };
      } else if (pointers.size === 2) {
        mode = "pinch-or-pan";
        const pts = [...pointers.values()];
        pinchStartDist = dist(pts[0], pts[1]);
        pinchStartRadius = this.radius;
        last = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (mode === "orbit" && pointers.size === 1) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const spd = 0.006;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ);
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * spd);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * spd);
        this.camQ.premultiply(qYaw).premultiply(qPitch).normalize();
        this._commit();
      } else if (mode === "pinch-or-pan" && pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = dist(pts[0], pts[1]);
        const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;

        if (pinchStartDist) {
          this.radius = Math.max(1, Math.min(500, pinchStartRadius / (d / pinchStartDist)));
        }
        const dx = cx - last.x, dy = cy - last.y;
        last = { x: cx, y: cy };
        const spd = this.radius * 0.0028;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQ);
        this.pivot.sub(right.multiplyScalar(dx * spd)).add(up.multiplyScalar(dy * spd));
        this._commit();
      }
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) { mode = null; pinchStartDist = null; }
      else if (pointers.size === 1) {
        mode = "orbit";
        const [p] = pointers.values();
        last = { x: p.x, y: p.y };
      }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.radius = Math.max(1, Math.min(500, this.radius * (1 + e.deltaY * 0.001)));
      this._commit();
    }, { passive: false });

    el.addEventListener("dblclick", () => this.resetView());
    el.addEventListener("pointerup", () => {
      const now = Date.now();
      if (now - lastTapTime < 300 && pointers.size === 0) this.resetView();
      lastTapTime = now;
    });
  }

  _animate() {
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(() => this._animate());
  }

  clearMaze() {
    while (this.mazeGroup.children.length) {
      const obj = this.mazeGroup.children.pop();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  }

  // Same cell-size / wall-thickness / offset math as buildGlassScene
  // in IDEMazeView.swift, so proportions match the iOS renderer.
  buildScene(r) {
    this.clearMaze();
    const s = 0.5;
    const t = 0.025;

    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x00f2d9, transparent: true, opacity: 0.35,
      metalness: 0.9, roughness: 0.05, side: THREE.DoubleSide,
      emissive: 0x006650, emissiveIntensity: 0.4, depthWrite: false
    });
    const perimMat = new THREE.MeshPhysicalMaterial({
      color: 0x00f2d9, transparent: true, opacity: 0.2,
      metalness: 0.9, roughness: 0.05, side: THREE.DoubleSide,
      emissive: 0x006650, emissiveIntensity: 0.3, depthWrite: false
    });

    if (r.mode === "planar" && r.planarGrid) {
      this._buildPlanar(r, s, t, wallMat, perimMat);
    } else if (r.mode === "cubic" && r.cubicGrid) {
      this._buildCubic(r, s, t, wallMat, perimMat);
    }
    this._addMarkers(r, s);
  }

  _box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  _buildPlanar(r, s, t, wallMat, perimMat) {
    const g = r.planarGrid, w = r.w, h = r.h;
    const ox = w * s * 0.5, oz = h * s * 0.5;

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cell = g[y][x];
      const cx = x * s - ox + s * 0.5;
      const cz = y * s - oz + s * 0.5;
      if (cell.E && x < w - 1) {
        const n = this._box(t, 0.4, s, wallMat);
        n.position.set(cx + s * 0.5, 0, cz);
        this.mazeGroup.add(n);
      }
      if (cell.S && y < h - 1) {
        const n = this._box(s, 0.4, t, wallMat);
        n.position.set(cx, 0, cz + s * 0.5);
        this.mazeGroup.add(n);
      }
    }

    const [ex, ey] = r.entry, [xx, xy] = r.exit;
    for (let x = 0; x < w; x++) {
      if (!(ex === x && ey === 0) && !(xx === x && xy === 0)) {
        const n = this._box(s, 0.4, t, perimMat);
        n.position.set(x * s - ox + s * 0.5, 0, -oz);
        this.mazeGroup.add(n);
      }
      if (!(ex === x && ey === h - 1) && !(xx === x && xy === h - 1)) {
        const n = this._box(s, 0.4, t, perimMat);
        n.position.set(x * s - ox + s * 0.5, 0, h * s - oz);
        this.mazeGroup.add(n);
      }
    }
    for (let y = 0; y < h; y++) {
      if (!(ex === 0 && ey === y) && !(xx === 0 && xy === y)) {
        const n = this._box(t, 0.4, s, perimMat);
        n.position.set(-ox, 0, y * s - oz + s * 0.5);
        this.mazeGroup.add(n);
      }
      if (!(ex === w - 1 && ey === y) && !(xx === w - 1 && xy === y)) {
        const n = this._box(t, 0.4, s, perimMat);
        n.position.set(w * s - ox, 0, y * s - oz + s * 0.5);
        this.mazeGroup.add(n);
      }
    }
  }

  _buildCubic(r, s, t, wallMat, perimMat) {
    const g = r.cubicGrid, w = r.w, h = r.h, d = r.d;
    const ox = w * s * 0.5, oy = h * s * 0.5, oz = d * s * 0.5;
    const tubeGeo = new THREE.CylinderGeometry(t, t, s * 0.48, 6);
    const sphereGeo = new THREE.SphereGeometry(t * 1.5, 6, 6);

    const addTube = (cx, cy, cz, dx, dy, dz, rotX, rotY, rotZ) => {
      const n = new THREE.Mesh(tubeGeo, wallMat);
      n.position.set(cx + dx * s * 0.25, cy + dy * s * 0.25, cz + dz * s * 0.25);
      n.rotation.set(rotX, rotY, rotZ);
      this.mazeGroup.add(n);
    };

    for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cell = g[z][y][x];
      const cx = x * s - ox + s * 0.5, cy = y * s - oy + s * 0.5, cz = z * s - oz + s * 0.5;

      if (!cell.right) addTube(cx, cy, cz, 1, 0, 0, 0, 0, Math.PI / 2);
      if (!cell.top) addTube(cx, cy, cz, 0, 1, 0, 0, 0, 0);
      if (!cell.front) addTube(cx, cy, cz, 0, 0, 1, Math.PI / 2, 0, 0);

      const isEntry = x === r.entry[0] && y === r.entry[1] && z === r.entry[2];
      const isExit = x === r.exit[0] && y === r.exit[1] && z === r.exit[2];
      const perimPanel = (nx, ny, nz, pw, ph, pd) => {
        if (isEntry || isExit) return;
        const n = this._box(pw, ph, pd, perimMat);
        n.position.set(cx + nx, cy + ny, cz + nz);
        this.mazeGroup.add(n);
      };

      if (x === 0 && cell.left) perimPanel(-s * 0.5, 0, 0, t, s, s);
      if (x === w - 1 && cell.right) perimPanel(s * 0.5, 0, 0, t, s, s);
      if (y === 0 && cell.top) perimPanel(0, -s * 0.5, 0, s, t, s);
      if (y === h - 1 && cell.bottom) perimPanel(0, s * 0.5, 0, s, t, s);
      if (z === 0 && cell.back) perimPanel(0, 0, -s * 0.5, s, s, t);
      if (z === d - 1 && cell.front) perimPanel(0, 0, s * 0.5, s, s, t);

      const sn = new THREE.Mesh(sphereGeo, wallMat);
      sn.position.set(cx, cy, cz);
      this.mazeGroup.add(sn);
    }
  }

  _addMarkers(r, s) {
    const marker = (pos, color) => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      sphere.position.copy(pos);
      this.mazeGroup.add(sphere);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.02, 8, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
      );
      ring.position.copy(pos);
      this.mazeGroup.add(ring);
      ring.userData.pulseStart = performance.now();
      const animatePulse = () => {
        const elapsed = (performance.now() - ring.userData.pulseStart) / 1200;
        const phase = elapsed % 2;
        const tt = phase < 1 ? phase : 2 - phase;
        ring.scale.setScalar(1 + tt * 0.5);
        if (this.mazeGroup.children.includes(ring)) requestAnimationFrame(animatePulse);
      };
      requestAnimationFrame(animatePulse);
    };

    if (r.mode === "planar") {
      const w = r.w, h = r.h;
      const ox = w * s * 0.5, oz = h * s * 0.5;
      const planarMarkerPos = (ex, ey) => {
        const cx = ex * s - ox + s * 0.5, cz = ey * s - oz + s * 0.5;
        if (ey === 0) return new THREE.Vector3(cx, 0.1, -oz - s * 0.35);
        if (ey === h - 1) return new THREE.Vector3(cx, 0.1, h * s - oz + s * 0.35);
        if (ex === 0) return new THREE.Vector3(-ox - s * 0.35, 0.1, cz);
        if (ex === w - 1) return new THREE.Vector3(w * s - ox + s * 0.35, 0.1, cz);
        return new THREE.Vector3(cx, 0.1, cz);
      };
      marker(planarMarkerPos(r.entry[0], r.entry[1]), 0x00ff44);
      marker(planarMarkerPos(r.exit[0], r.exit[1]), 0xff2244);
    } else {
      const es = s * 0.5;
      marker(new THREE.Vector3(
        r.entry[0] * s - r.w * s * 0.5 + es,
        r.entry[1] * s - r.h * s * 0.5 + es,
        r.entry[2] * s - r.d * s * 0.5 + es), 0x00ff44);
      marker(new THREE.Vector3(
        r.exit[0] * s - r.w * s * 0.5 + es,
        r.exit[1] * s - r.h * s * 0.5 + es,
        r.exit[2] * s - r.d * s * 0.5 + es), 0xff2244);
    }
  }

  showSolutionPath(r) {
    const s = 0.5;
    const pathMat = new THREE.MeshBasicMaterial({ color: 0xcc00ff, transparent: true, opacity: 0.9 });
    if (r.planarPath) {
      for (const [x, y] of r.planarPath) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.8, s * 0.8), pathMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(x * s - r.w * s * 0.5 + s * 0.5, 0.05, y * s - r.h * s * 0.5 + s * 0.5);
        this.mazeGroup.add(plane);
      }
    } else if (r.cubicPath) {
      for (const [x, y, z] of r.cubicPath) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(s * 0.4, s * 0.4, s * 0.4), pathMat);
        box.position.set(
          x * s - r.w * s * 0.5 + s * 0.5,
          y * s - r.h * s * 0.5 + s * 0.5,
          z * s - r.d * s * 0.5 + s * 0.5
        );
        this.mazeGroup.add(box);
      }
    }
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.clearMaze();
    this.renderer.dispose();
  }
}
