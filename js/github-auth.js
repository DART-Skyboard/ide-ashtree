// ============================================================
//  github-auth.js — GitHub sign-in + repo helpers for Grove
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Sign-in paths (the UI says honestly which one is active):
//   1. OAuth device flow, ONLY if a CORS-capable relay ("proxy") is
//      configured. Browsers block github.com/login/device/* (no CORS
//      headers), so the flow cannot run directly from a web page.
//   2. Personal Access Token (PAT) paste. Always available.
//  The token lives in localStorage only. It is never put in a URL,
//  never committed, and never hard-coded in this file.
// ============================================================
(function (root) {
  "use strict";

  var CLIENT_ID = "Ov23li2K0njEqO1WTSdD";        // public OAuth app id (same as the iOS app)
  var REPO_NAME = "Ash-Tree-IDE-Projects";
  var API = "https://api.github.com";
  var DEFAULT_GAS = "https://script.google.com/macros/s/AKfycbyzkQxLR5miUXP6oDw-1AR1GIjgpzlw9iLw0gO_ZTeLfL849LWbNX7WVz_kf7yLWBKA_w/exec"; // public exec URL, not a secret
  var K_TOKEN = "grove_gh_token", K_USER = "grove_gh_user",
      K_PROXY = "grove_gh_proxy", K_METHOD = "grove_gh_method";

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }

  var listeners = [];
  var state = { token: ls(K_TOKEN), user: null, method: ls(K_METHOD) || null, probe: null };
  try { state.user = JSON.parse(ls(K_USER) || "null"); } catch (e) {}
  if (!state.token) state.user = null;

  function emit() { listeners.forEach(function (f) { try { f(GitHubAuth); } catch (e) {} }); }

  function utf8ToB64(s) {
    var bytes = new TextEncoder().encode(s), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function api(method, path, body, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (state.token && !opts.anon) headers["Authorization"] = "Bearer " + state.token;   // header only, never URL
    if (body !== undefined) headers["Content-Type"] = "application/json";
    var res = await fetch(path.indexOf("http") === 0 ? path : API + path, {
      method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error((data && data.message) || ("GitHub API " + res.status));
      err.status = res.status; err.data = data;
      if (res.status === 401) err.message = "GitHub rejected the token (401). Sign in again.";
      throw err;
    }
    return data;
  }

  var GitHubAuth = {
    CLIENT_ID: CLIENT_ID,
    REPO_NAME: REPO_NAME,
    state: state,
    onChange: function (fn) { listeners.push(fn); },
    isSignedIn: function () { return !!(state.token && state.user); },
    user: function () { return state.user; },
    method: function () { return state.method; },

    // ── Proxy / reachability ────────────────────────────────
    getProxy: function () { var v = root.GROVE_GH_PROXY || ls(K_PROXY); return v === null || v === undefined ? DEFAULT_GAS : v; },
    setProxy: function (url) { ls(K_PROXY, String(url || "").trim()); state.probe = null; emit(); },

    // Existing mechanism (same as the iOS app and leatr.xyz): the Apps Script
    // web app exposes GET ?action=devicecode and GET ?action=devicepoll&device_code=...
    // which call github.com server-side (no CORS problem). The GAS exec URL is
    // a public endpoint, not a secret; the client secret stays inside the script.
    // Scopes are fixed server-side (repo, read:user): no "gist" scope.
    // A different relay may be set via the sign-in dialog (generic JSON POST relay).
    async _gas(params) {
      var u = this.getProxy() + (this.getProxy().indexOf("?") < 0 ? "?" : "&") + new URLSearchParams(params).toString();
      var r = await fetch(u, { method: "GET", redirect: "follow" });
      if (!r.ok) throw new Error("Auth service returned HTTP " + r.status);
      return r.json();
    },
    _isGas: function () { return /^https:\/\/script\.google(usercontent)?\.com\//.test(this.getProxy()); },
    async _relay(endpoint, params) {
      var proxy = this.getProxy();
      if (proxy && this._isGas()) {
        if (endpoint === "device/code") {
          var d = await this._gas({ action: "devicecode" });
          if (d.error) throw new Error(d.error);
          return d;
        }
        return await this._gas({ action: "devicepoll", device_code: params.device_code });
      }
      if (proxy) {
        var r = await fetch(proxy, { method: "POST", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ endpoint: endpoint, params: params }) });
        if (!r.ok) throw new Error("Relay returned HTTP " + r.status);
        return r.json();
      }
      var form = new URLSearchParams(params);
      var d2 = await fetch("https://github.com/login/" + endpoint, { method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      return d2.json();
    },

    // Honest probe. Returns {deviceFlow:bool, via:"gas"|"relay"|"direct"|"none", note}
    async probe(force) {
      if (state.probe && !force) return state.probe;
      var out, proxy = this.getProxy(), via = !proxy ? "none" : (this._isGas() ? "gas" : "relay");
      try {
        if (proxy) {
          var j = this._isGas() ? await this._gas({ action: "health" }) : await this._relay("device/code", { client_id: CLIENT_ID });
          var ok = this._isGas() ? !!(j && j.ok) : !!(j && j.device_code);
          out = ok ? { deviceFlow: true, via: via, note: via === "gas" ? "Device flow via the DART Apps Script auth service (same as the iOS app). Scopes: repo, read:user." : "Device flow via your relay." }
                   : { deviceFlow: false, via: via, note: "Auth service answered unexpectedly. Use a token." };
        } else {
          await fetch("https://github.com/login/device/code", { method: "POST", mode: "cors",
            headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: "client_id=" + encodeURIComponent(CLIENT_ID) });
          out = { deviceFlow: true, via: "direct", note: "github.com device endpoints answered directly." };
        }
      } catch (e) {
        out = { deviceFlow: false, via: via,
          note: proxy ? "Auth service unreachable from this browser (" + e.message + "). Using token paste."
                      : "Browser CORS blocks github.com device endpoints and no relay is configured; using a Personal Access Token." };
      }
      state.probe = out; emit();
      return out;
    },

    // ── Device flow (only when probe says deviceFlow) ───────
    async startDeviceFlow() {
      var j = await this._relay("device/code", { client_id: CLIENT_ID, scope: "repo,read:user" });
      if (!j || !j.device_code) throw new Error((j && (j.error_description || j.error)) || "No device code returned");
      return j; // {device_code,user_code,verification_uri,expires_in,interval}
    },
    async pollDeviceFlow(dev, shouldStop) {
      var interval = (dev.interval || 5) * 1000, deadline = Date.now() + (dev.expires_in || 900) * 1000;
      while (Date.now() < deadline) {
        await new Promise(function (r) { setTimeout(r, interval); });
        if (shouldStop && shouldStop()) throw new Error("Cancelled");
        var j = await this._relay("oauth/access_token", { client_id: CLIENT_ID, device_code: dev.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
        if (j.access_token) { await this.signInWithToken(j.access_token, "device"); return; }
        if (j.error === "slow_down") interval += 5000;
        else if (j.error && j.error !== "authorization_pending") throw new Error(j.error_description || j.error);
      }
      throw new Error("Device code expired");
    },

    // ── PAT / token ─────────────────────────────────────────
    async signInWithToken(token, method) {
      token = String(token || "").trim();
      if (!token) throw new Error("Paste a token first");
      var res = await fetch(API + "/user", { headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token } });
      if (!res.ok) throw new Error(res.status === 401 ? "GitHub rejected that token." : "GitHub error " + res.status);
      var u = await res.json();
      state.token = token;
      state.user = { login: u.login, avatar: u.avatar_url, name: u.name || u.login };
      state.method = method || "token";
      state.scopes = res.headers.get("x-oauth-scopes");
      ls(K_TOKEN, token); ls(K_USER, JSON.stringify(state.user)); ls(K_METHOD, state.method);
      emit();
      return state.user;
    },
    signOut: function () {
      state.token = null; state.user = null; state.method = null;
      ls(K_TOKEN, null); ls(K_USER, null); ls(K_METHOD, null);
      emit();
    },

    // ── Repo helpers ────────────────────────────────────────
    async ensureRepo() {
      var login = state.user.login;
      try { return await api("GET", "/repos/" + login + "/" + REPO_NAME); }
      catch (e) { if (e.status !== 404) throw e; }
      return api("POST", "/user/repos", { name: REPO_NAME, private: true, auto_init: true,
        description: "Ash Tree IDE projects (Grove / Samara OS)" });
    },

    // Single-commit batch write via the Git Data API.
    // files: {"repo/path": "text"}. Returns commit sha.
    async putFiles(files, message) {
      var repo = await this.ensureRepo(), base = "/repos/" + repo.full_name, branch = repo.default_branch || "main";
      var ref = await api("GET", base + "/git/ref/heads/" + branch);
      var head = await api("GET", base + "/git/commits/" + ref.object.sha);
      var entries = [], paths = Object.keys(files);
      for (var i = 0; i < paths.length; i++) {
        var blob = await api("POST", base + "/git/blobs", { content: utf8ToB64(files[paths[i]]), encoding: "base64" });
        entries.push({ path: paths[i], mode: "100644", type: "blob", sha: blob.sha });
      }
      var tree = await api("POST", base + "/git/trees", { base_tree: head.tree.sha, tree: entries });
      var commit = await api("POST", base + "/git/commits", { message: message || "Grove save", tree: tree.sha, parents: [head.sha] });
      await api("PATCH", base + "/git/refs/heads/" + branch, { sha: commit.sha });
      return { sha: commit.sha, repo: repo };
    },

    // Lists projects: {name: [repo paths]} under phone/<project>/ (sources and builds).
    async listProjects() {
      var repo = await this.ensureRepo(), branch = repo.default_branch || "main";
      var t = await api("GET", "/repos/" + repo.full_name + "/git/trees/" + branch + "?recursive=1");
      var out = {};
      (t.tree || []).forEach(function (n) {
        var m = n.type === "blob" && /^phone\/([^\/]+)\/(.+)$/.exec(n.path);
        if (m) (out[m[1]] = out[m[1]] || []).push({ path: n.path, sha: n.sha });
      });
      return out;
    },
    async readBlob(sha) {
      var repo = this.state.user.login + "/" + REPO_NAME;
      var b = await api("GET", "/repos/" + repo + "/git/blobs/" + sha);
      return b.encoding === "base64" ? b64ToUtf8(b.content) : b.content;
    },

    // Public gist (secret = unlisted, NOT private). Needs the "gist" scope.
    async createGist(filename, content, isPublic, description) {
      var f = {}; f[filename] = { content: content };
      var g = await api("POST", "/gists", { description: description || "Samara seed", public: !!isPublic, files: f });
      return { id: g.id, html_url: g.html_url, raw: "https://gist.githubusercontent.com/" + state.user.login + "/" + g.id + "/raw/" + encodeURIComponent(filename) };
    },
    utf8ToB64: utf8ToB64
  };

  root.GitHubAuth = GitHubAuth;
  if (typeof module !== "undefined" && module.exports) module.exports = GitHubAuth;
})(typeof window !== "undefined" ? window : globalThis);
