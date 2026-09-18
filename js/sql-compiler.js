// ============================================================
//  sql-compiler.js — Real SQL execution via sql.js (WASM SQLite)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  A real in-memory SQLite database per run. Executes the full
//  script (multiple statements allowed), returns real result sets
//  for SELECTs — not a simulation of SQL semantics.
// ============================================================

const SqlCompiler = {
  SQL: null,
  loading: null,

  async _ensure() {
    if (this.SQL) return this.SQL;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (!window.initSqlJs) {
        await this._loadScript("https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js");
      }
      this.SQL = await window.initSqlJs({
        locateFile: () => "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm"
      });
      return this.SQL;
    })();
    return this.loading;
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  },

  async run(source, opts) {
    opts = opts || {};
    const onOutput = opts.onOutput, onDone = opts.onDone, onError = opts.onError, onLoading = opts.onLoading;
    try {
      if (!this.SQL && onLoading) onLoading();
      const SQL = await this._ensure();
      const db = new SQL.Database();

      const results = db.exec(source);
      if (results.length === 0) {
        onOutput && onOutput("Query OK, no result set.\n");
      } else {
        for (const res of results) {
          onOutput && onOutput(formatTable(res.columns, res.values));
        }
      }
      db.close();
      onDone && onDone(0);
    } catch (err) {
      onError && onError(err && err.message ? err.message : String(err));
    }
  }
};

function formatTable(columns, rows) {
  const widths = columns.map((c, i) =>
    Math.max(String(c).length, ...rows.map((r) => String(r[i]).length), 3));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(" | ");
  let out = line(columns) + "\n";
  out += widths.map((w) => "-".repeat(w)).join("-+-") + "\n";
  for (const r of rows) out += line(r) + "\n";
  out += `(${rows.length} row${rows.length === 1 ? "" : "s"})\n`;
  return out;
}
