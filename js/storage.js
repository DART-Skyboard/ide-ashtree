// ============================================================
//  storage.js — localStorage-backed persistence
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
// ============================================================

const IDEStorage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("IDEStorage.set failed", key, e);
      return false;
    }
  },
  remove(key) {
    localStorage.removeItem(key);
  },

  // ── Local .ash files ──────────────────────────────────────
  listFiles() {
    return this.get("ide_local_file_list", []);
  },
  saveFile(name, content) {
    let files = this.listFiles();
    if (!files.includes(name)) {
      files.push(name);
      this.set("ide_local_file_list", files);
    }
    localStorage.setItem(`ide_local_${name}`, content);
  },
  loadFile(name) {
    return localStorage.getItem(`ide_local_${name}`);
  },
  deleteFile(name) {
    let files = this.listFiles().filter((f) => f !== name);
    this.set("ide_local_file_list", files);
    localStorage.removeItem(`ide_local_${name}`);
  },
  uniqueFileName(base = "untitled") {
    const files = this.listFiles();
    let name = `${base}.ash`;
    let n = 1;
    while (files.includes(name)) {
      name = `${base}_${n}.ash`;
      n += 1;
    }
    return name;
  }
};
