// ============================================================
//  gl-output.js — Compiler GL output panel (web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Port of IDEGLOutputPanel + the generic buildGLScene() fractal-
//  tree fallback from IDEEditorViews.swift. Detects whether a
//  compiled script wants graphical output at all, and whether it's
//  the specialized Arc Edge Vector driver (arc-edge-gl.js) or the
//  generic GLDrivers fallback built here.
// ============================================================

const GLOutput = {
  renderer: null,       // Maze3DRenderer-shaped wrapper around a THREE scene
  scene: null,
  camera: null,
  three: null,          // GenericGLScene instance, when active
  arcEdge: null,         // ArcEdgeGL instance, when active
  canvas: null,
  rafId: null,

  hasGLOutput(source) {
    return source.includes("import (GLDrivers)") || source.includes("gl.scene")
      || source.includes("ArcEdge") || source.includes("ArcVector");
  },

  isArcEdge(source) {
    const keywords = ["ArcEdgeScene", "ArcVectorNode", "ArcPhysicsNode", "ArcGridNode", "ArcHandleNode", "gl.arc", "arc_edge"];
    return keywords.some((k) => source.includes(k));
  },

  mount(canvas) {
    this.canvas = canvas;
  },

  // Clear whichever renderer is currently active before switching.
  teardown() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.arcEdge) { this.arcEdge.dispose(); this.arcEdge = null; }
    if (this.three) { this.three.dispose(); this.three = null; }
  },

  // Renders the appropriate scene for the given source into `canvas`.
  render(source, canvas) {
    this.teardown();
    if (this.isArcEdge(source)) {
      this.arcEdge = new ArcEdgeGL(canvas);
      return "arc-edge";
    }
    this.three = new GenericGLScene(canvas);
    return "generic";
  }
};

// ── Generic fallback: animated fractal "Ash Tree" + particle cloud,
// same recursive-branch math and camera rig as the iOS buildGLScene() ──
class GenericGLScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000814, 15, 50);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000814, 1);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 2000);
    this.camera.position.set(0, 3, 14);

    const ambient = new THREE.AmbientLight(0x00ffcc, 0.4);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0x00ffcc, 1.2);
    dir.position.set(5, 8, 5);
    this.scene.add(dir);

    this.treeGroup = new THREE.Group();
    this.scene.add(this.treeGroup);
    this._buildTree();
    this._buildParticles();

    this._bindOrbit();
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

  // Same recursive branch geometry as addBranch() in IDEEditorViews.swift:
  // cylinders with 3 sub-branches at ~45deg spread, 0.65x length falloff,
  // 4 levels deep starting straight up from y=-2.
  _buildTree() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x00ffcc, transparent: true, opacity: 0.7,
      metalness: 0.9, roughness: 0.1, side: THREE.DoubleSide,
      emissive: 0x006650, emissiveIntensity: 0.3
    });

    const addBranch = (from, dir, length, depth) => {
      if (depth <= 0 || length <= 0.05) return;
      const to = from.clone().add(dir.clone().multiplyScalar(length));
      const geo = new THREE.CylinderGeometry(length * 0.06, length * 0.06, length, 8);
      const mesh = new THREE.Mesh(geo, mat);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.lookAt(to);
      mesh.rotateX(Math.PI / 2);
      this.treeGroup.add(mesh);

      const spread = 0.7, branchAngle = 0.785; // pi/4
      const dirs = [
        new THREE.Vector3(
          dir.x * Math.cos(branchAngle) - dir.z * Math.sin(branchAngle),
          dir.y + spread * 0.4,
          dir.x * Math.sin(branchAngle) + dir.z * Math.cos(branchAngle)
        ),
        new THREE.Vector3(
          -dir.x * Math.cos(branchAngle) + dir.z * Math.sin(branchAngle),
          dir.y + spread * 0.4,
          -dir.x * Math.sin(branchAngle) - dir.z * Math.cos(branchAngle)
        ),
        new THREE.Vector3(dir.x, dir.y + spread * 0.5, dir.z)
      ];
      for (const d of dirs) {
        const norm = d.length();
        const nd = norm > 0 ? d.clone().divideScalar(norm) : d;
        addBranch(to, nd, length * 0.65, depth - 1);
      }
    };

    addBranch(new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, 1, 0), 2.0, 4);

    // Subtle continuous rotation, same 20s/rev as the SceneKit version.
    this._rotSpeed = (Math.PI * 2) / 20;
  }

  _buildParticles() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Emit within a sphere of radius 2.5, matching SCNSphere(radius: 2.5) emitterShape.
      const r = 2.5 * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00ffcc, size: 0.05, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  _bindOrbit() {
    const el = this.canvas;
    this.camQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.15));
    this.radius = 14;
    this.pivot = new THREE.Vector3(0, 1, 0);
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
        if (pinchStartDist) this.radius = Math.max(1, Math.min(200, pinchStartRadius / (d / pinchStartDist)));
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
      this.radius = Math.max(1, Math.min(200, this.radius * (1 + e.deltaY * 0.001)));
      this._commitCam();
    }, { passive: false });
    el.addEventListener("dblclick", () => {
      this.camQ = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.15));
      this.radius = 14; this.pivot.set(0, 1, 0); this._commitCam();
    });
  }

  _commitCam() {
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camQ);
    this.camera.position.copy(this.pivot.clone().add(dir.multiplyScalar(this.radius)));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pivot);
  }

  _animate() {
    this.treeGroup.rotation.y += this._rotSpeed / 60;
    if (this.particles) this.particles.rotation.y += 0.0006;
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(() => this._animate());
  }

  dispose() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
