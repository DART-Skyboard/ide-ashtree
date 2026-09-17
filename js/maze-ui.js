// ============================================================
//  maze-ui.js — Maze tab + Cryptology panel controller
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const MazeUI = {
  config: { width: 10, height: 10, depth: 10, mode: "cubic" },
  result: null,
  renderer3d: null,
  crypto: new CryptologyEngine(),
  getEditorSource: () => "",

  init(getEditorSource) {
    this.getEditorSource = getEditorSource;
    // Mode segmented control
    document.querySelectorAll("#mazeModeSeg .seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mazeModeSeg .seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.config.mode = btn.dataset.value;
        document.getElementById("mazeDepthRow").style.display = this.config.mode === "cubic" ? "flex" : "none";
      });
    });
    document.getElementById("mazeDepthRow").style.display = "flex";

    // Sliders
    this._bindSlider("mazeWidth", "mazeWidthVal", "width");
    this._bindSlider("mazeHeight", "mazeHeightVal", "height");
    this._bindSlider("mazeDepth", "mazeDepthVal", "depth");

    // Actions
    document.getElementById("mazeGenerateBtn").addEventListener("click", () => this.generate());
    document.getElementById("mazeSolveBtn").addEventListener("click", () => this.showSolution());
    document.getElementById("mazeResetBtn").addEventListener("click", () => {
      if (this.renderer3d) this.renderer3d.resetView();
    });

    // Collapse / expand panel
    document.getElementById("mazeCollapseBtn").addEventListener("click", () => this._setCollapsed(true));
    document.getElementById("mazeExpandBtn").addEventListener("click", () => this._setCollapsed(false));

    // Cryptology collapsible
    document.getElementById("mazeCryptoToggle").addEventListener("click", () => this._toggleCrypto());

    // Solve-mode toggle (Instant / Animated) — defaults to Animated
    document.querySelectorAll("#mazeSolveModeSeg .seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mazeSolveModeSeg .seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.solveMode = btn.dataset.value;
      });
    });

    this._renderCryptoPanel();
  },

  solveMode: "animated",

  /// Create the WebGL renderer immediately (not lazily on first
  /// Generate) so the canvas is correctly sized the moment the Maze
  /// tab is shown — this is what was causing "have to switch tabs
  /// away and back" on first load, and stale framebuffer pixels
  /// bleeding through the empty-state text.
  _initRendererIfNeeded() {
    if (this.renderer3d) return;
    const canvas = document.getElementById("mazeCanvas");
    this.renderer3d = new Maze3DRenderer(canvas);
  },

  _bindSlider(inputId, valId, key) {
    const input = document.getElementById(inputId);
    const val = document.getElementById(valId);
    input.addEventListener("input", () => {
      this.config[key] = parseInt(input.value, 10);
      val.textContent = input.value;
    });
  },

  _setCollapsed(collapsed) {
    document.getElementById("mazePanel").style.display = collapsed ? "none" : "flex";
    document.getElementById("mazeExpandBtn").hidden = !collapsed;
  },

  _ensureRenderer() {
    this._initRendererIfNeeded();
    return this.renderer3d;
  },

  /// True background = the renderer exists but nothing has been
  /// generated into it yet (fresh scene, no maze group children).
  _sceneIsEmpty() {
    return !this.result;
  },

  generate() {
    const btn = document.getElementById("mazeGenerateBtn");
    btn.textContent = "Generating…";
    btn.disabled = true;
    document.getElementById("mazeStatus").textContent = "Generating…";

    // Yield a frame so the "Generating…" label paints before the
    // (synchronous, potentially heavy at 50³) maze build runs.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const r = mazeGenerate(this.config);
        this.result = r;

        document.getElementById("mazeSceneEmpty").hidden = true;
        const renderer = this._ensureRenderer();
        renderer.buildScene(r);

        const pathLen = (r.cubicPath || r.planarPath || []).length;
        const sizeStr = r.mode === "cubic" ? `${r.w}×${r.h}×${r.d}` : `${r.w}×${r.h}`;
        document.getElementById("mazeStatus").textContent =
          `Generated ${sizeStr} maze · ${pathLen} path steps`;

        const info = document.getElementById("mazeInfo");
        info.hidden = false;
        const fmt = (p) => r.mode === "cubic" ? `(${p[0]},${p[1]},${p[2]})` : `(${p[0]},${p[1]})`;
        info.innerHTML = `
          <div class="maze-info-row"><span class="k">Mode:</span><span class="v">${r.mode === "cubic" ? "Cubic (3D)" : "Planar (2D)"}</span></div>
          <div class="maze-info-row"><span class="k">Size:</span><span class="v">${sizeStr}</span></div>
          <div class="maze-info-row"><span class="k">Entry:</span><span class="v">${fmt(r.entry)}</span></div>
          <div class="maze-info-row"><span class="k">Exit:</span><span class="v">${fmt(r.exit)}</span></div>
          <div class="maze-info-row"><span class="k">Path:</span><span class="v">${pathLen > 0 ? pathLen + " steps" : "No path"}</span></div>
        `;

        document.getElementById("mazeSolveBtn").disabled = false;
        btn.textContent = "▸ Generate";
        btn.disabled = false;
      }, 10);
    });
  },

  showSolution() {
    if (!this.result || !this.renderer3d) return;
    this.renderer3d.showSolutionPath(this.result, this.solveMode === "animated");
  },

  // ── Cryptology panel ──────────────────────────────────────
  _toggleCrypto() {
    const panel = document.getElementById("mazeCryptoPanel");
    const toggle = document.getElementById("mazeCryptoToggle");
    const nowHidden = !panel.hidden;
    panel.hidden = nowHidden;
    toggle.classList.toggle("open", !nowHidden);
  },

  _renderCryptoPanel() {
    const panel = document.getElementById("mazeCryptoPanel");
    const c = this.crypto;
    panel.innerHTML = `
      <div class="crypto-desc">Integrate cryptology logic into Ash programs using AshTreeCrypto. Maze geometry provides entropy for SHA-256 key hashing.</div>

      <div class="crypto-label">MESSAGE TO ENCRYPT</div>
      <textarea class="crypto-textarea" id="cryptoMessage" placeholder="Type a message to encrypt (optional)…">${escHtmlMz(c.messageText)}</textarea>

      <div class="crypto-label">ATTACH FILES</div>
      <label class="crypto-file-btn" for="cryptoFileInput">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Select Files to Encrypt
      </label>
      <input type="file" id="cryptoFileInput" multiple hidden>
      <div id="cryptoFileList"></div>

      <div class="crypto-label">ROOT MAZE LAYERS</div>
      <div id="cryptoLayers"></div>
      <button class="crypto-add-link" id="cryptoAddLayer">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Root Maze Layer
      </button>

      <div class="crypto-label">INTERCHANGE DIMENSIONS</div>
      <div id="cryptoDims"></div>
      <button class="crypto-add-link" id="cryptoAddDim">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Add Interchange Dimension
      </button>

      <div class="crypto-label">MAZE KEYS</div>
      <div class="crypto-btn-row">
        <button class="crypto-btn" id="cryptoGenKeys" style="color:#00ffcc;border-color:rgba(0,255,204,.25);background:rgba(0,255,204,.1)">◈ Generate Keys</button>
        <button class="crypto-btn" id="cryptoClear" style="color:#ff4466;border-color:rgba(255,68,102,.25);background:rgba(255,68,102,.1)">✕ Clear All</button>
      </div>

      <div id="cryptoKeyBox"></div>

      <div class="crypto-label">ENCRYPT &amp; EXPORT</div>
      <button class="crypto-btn" id="cryptoEncrypt" style="color:#00ffcc;border-color:rgba(0,255,204,.25);background:rgba(0,255,204,.1)">▲ Encrypt → ZIP</button>
      <div id="cryptoDownloadRow"></div>

      <div class="maze-divider" style="margin:4px 0"></div>
      <button class="maze-crypto-toggle" id="cryptoDecryptToggle" style="padding:4px 0">
        <span style="color:#0088ff">▼ DECRYPT FROM ZIP</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="cryptoDecryptChevron"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div id="cryptoDecryptPanel" hidden style="display:flex;flex-direction:column;gap:8px"></div>

      <div id="cryptoOutputWrap"></div>
    `;

    this._wireCryptoStatic();
    this._renderCryptoFiles();
    this._renderCryptoLayers();
    this._renderCryptoDims();
    this._renderCryptoKeys();
    this._renderCryptoDownload();
    this._renderCryptoOutput();
  },

  _wireCryptoStatic() {
    const c = this.crypto;
    document.getElementById("cryptoMessage").addEventListener("input", (e) => {
      c.messageText = e.target.value;
    });

    document.getElementById("cryptoFileInput").addEventListener("change", async (e) => {
      for (const file of e.target.files) {
        const buf = await file.arrayBuffer();
        c.attachedFiles.push({ name: file.name, data: new Uint8Array(buf) });
      }
      e.target.value = "";
      this._renderCryptoFiles();
    });

    document.getElementById("cryptoAddLayer").addEventListener("click", () => {
      c.rootMazeLayers.push({ w: 6, h: 6, d: 4, mode: "cubic" });
      this._renderCryptoLayers();
    });
    document.getElementById("cryptoAddDim").addEventListener("click", () => {
      c.interchangeDims.push({ id: c.nextDimId++, w: 5, h: 5, d: 3, mode: "planar" });
      this._renderCryptoDims();
    });

    document.getElementById("cryptoGenKeys").addEventListener("click", async () => {
      await c.generateMazeKeys(this.getEditorSource());
      this._renderCryptoKeys();
      this._renderCryptoOutput();
    });
    document.getElementById("cryptoClear").addEventListener("click", () => {
      c.clearAll();
      this._renderCryptoPanel();
    });

    document.getElementById("cryptoEncrypt").addEventListener("click", async () => {
      await c.encryptAndPackageZip(this.getEditorSource());
      this._renderCryptoDownload();
      this._renderCryptoOutput();
    });

    const decToggle = document.getElementById("cryptoDecryptToggle");
    decToggle.addEventListener("click", () => {
      const panel = document.getElementById("cryptoDecryptPanel");
      const nowHidden = !panel.hidden;
      panel.hidden = nowHidden;
      this._renderCryptoDecrypt();
    });
  },

  _renderCryptoFiles() {
    const wrap = document.getElementById("cryptoFileList");
    const c = this.crypto;
    wrap.innerHTML = c.attachedFiles.map((f, i) => `
      <div class="crypto-file-row">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0088ff" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
        <span class="name">${escHtmlMz(f.name)}</span>
        <span class="size">${Math.round(f.data.length / 1024)} KB</span>
        <button data-rmfile="${i}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join("");
    wrap.querySelectorAll("[data-rmfile]").forEach((btn) => {
      btn.addEventListener("click", () => {
        c.attachedFiles.splice(+btn.dataset.rmfile, 1);
        this._renderCryptoFiles();
      });
    });
  },

  _renderCryptoLayers() {
    const wrap = document.getElementById("cryptoLayers");
    const c = this.crypto;
    wrap.innerHTML = c.rootMazeLayers.map((layer, i) => `
      <div class="crypto-layer-row">
        <div class="crypto-layer-head">
          <span class="label">ROOT MAZE LAYER</span>
          <button data-rmlayer="${i}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
        </div>
        <div class="crypto-dims">
          <label>W <input type="number" min="3" max="50" value="${layer.w}" data-layer="${i}" data-field="w"></label>
          <label>H <input type="number" min="3" max="50" value="${layer.h}" data-layer="${i}" data-field="h"></label>
          <label>D <input type="number" min="1" max="20" value="${layer.d}" data-layer="${i}" data-field="d"></label>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-rmlayer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        c.rootMazeLayers.splice(+btn.dataset.rmlayer, 1);
        this._renderCryptoLayers();
      });
    });
    wrap.querySelectorAll("input[data-layer]").forEach((input) => {
      input.addEventListener("input", () => {
        c.rootMazeLayers[+input.dataset.layer][input.dataset.field] = parseInt(input.value, 10) || 1;
      });
    });
  },

  _renderCryptoDims() {
    const wrap = document.getElementById("cryptoDims");
    const c = this.crypto;
    wrap.innerHTML = c.interchangeDims.map((dim, i) => `
      <div class="crypto-layer-row">
        <div class="crypto-layer-head">
          <span class="label">DIM ${dim.id}</span>
          <select data-dim="${i}" data-field="mode">
            <option value="cubic" ${dim.mode === "cubic" ? "selected" : ""}>Cubic</option>
            <option value="planar" ${dim.mode === "planar" ? "selected" : ""}>Planar</option>
          </select>
          <button data-rmdim="${i}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
        </div>
        <div class="crypto-dims">
          <label>W <input type="number" min="3" max="30" value="${dim.w}" data-dim="${i}" data-field="w"></label>
          <label>H <input type="number" min="3" max="30" value="${dim.h}" data-dim="${i}" data-field="h"></label>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-rmdim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        c.interchangeDims.splice(+btn.dataset.rmdim, 1);
        this._renderCryptoDims();
      });
    });
    wrap.querySelectorAll("input[data-dim], select[data-dim]").forEach((el) => {
      el.addEventListener("input", () => {
        const i = +el.dataset.dim, field = el.dataset.field;
        c.interchangeDims[i][field] = field === "mode" ? el.value : (parseInt(el.value, 10) || 1);
      });
    });
  },

  _renderCryptoKeys() {
    const box = document.getElementById("cryptoKeyBox");
    const c = this.crypto;
    if (!c.privateKey) { box.innerHTML = ""; return; }
    const row = (label, value) => `
      <div class="crypto-key-row">
        <div class="k">${label}</div>
        <div class="v-row">
          <div class="v">${escHtmlMz(value.slice(0, 36))}…</div>
          <button data-copy="${escHtmlMz(value)}" title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </div>`;
    box.innerHTML = `<div class="crypto-keybox">${row("PRIVATE KEY", c.privateKey)}${row("PUBLIC KEY", c.publicKey)}</div>`;
    box.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigator.clipboard?.writeText(btn.dataset.copy);
        toast("Copied to clipboard");
      });
    });
  },

  _renderCryptoDownload() {
    const wrap = document.getElementById("cryptoDownloadRow");
    const c = this.crypto;
    if (!c.encryptedZip) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = `
      <button class="crypto-download" id="cryptoDownloadZip">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download Encrypted ZIP
      </button>`;
    document.getElementById("cryptoDownloadZip").addEventListener("click", () => {
      downloadBytes(c.encryptedZip, "encrypted_ash_tree.zip");
    });
  },

  _renderCryptoDecrypt() {
    const wrap = document.getElementById("cryptoDecryptPanel");
    const c = this.crypto;
    wrap.innerHTML = `
      <label class="crypto-file-btn" for="cryptoZipInput">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
        ${c.decryptionZipName ? escHtmlMz(c.decryptionZipName) : "Select Encrypted ZIP"}
      </label>
      <input type="file" id="cryptoZipInput" accept=".zip" hidden>
      <textarea class="crypto-textarea" id="cryptoPastedKey" placeholder="Paste private key here…" style="min-height:44px">${escHtmlMz(c.pastedPrivateKey)}</textarea>
      <button class="crypto-btn" id="cryptoDecryptBtn" style="color:#bf5fff;border-color:rgba(191,95,255,.25);background:rgba(191,95,255,.1)">▼ Decrypt</button>
      <div id="cryptoDecryptDownloadRow"></div>
    `;
    document.getElementById("cryptoZipInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      c.decryptionZip = new Uint8Array(buf);
      c.decryptionZipName = file.name;
      this._renderCryptoDecrypt();
    });
    document.getElementById("cryptoPastedKey").addEventListener("input", (e) => {
      c.pastedPrivateKey = e.target.value;
    });
    document.getElementById("cryptoDecryptBtn").addEventListener("click", async () => {
      await c.decryptFromZip();
      this._renderCryptoOutput();
      const dlWrap = document.getElementById("cryptoDecryptDownloadRow");
      if (c.decryptedZip) {
        dlWrap.innerHTML = `
          <button class="crypto-download" id="cryptoDownloadDecrypted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Decrypted ZIP
          </button>`;
        document.getElementById("cryptoDownloadDecrypted").addEventListener("click", () => {
          downloadBytes(c.decryptedZip, "decrypted_output.zip");
        });
      }
    });
  },

  _renderCryptoOutput() {
    const wrap = document.getElementById("cryptoOutputWrap");
    const c = this.crypto;
    if (!c.outputLog) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = `
      <div class="maze-divider" style="margin:4px 0"></div>
      <div class="crypto-label">OUTPUT</div>
      <div class="crypto-output">${escHtmlMz(c.outputLog)}</div>
    `;
  }
};

function escHtmlMz(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
