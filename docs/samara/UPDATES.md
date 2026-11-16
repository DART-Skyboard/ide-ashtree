# Samara OS: versioning, information and over-the-air updates

This is both the design of the maintenance framework that ships in the demo OS and a guide for people who build **their own OS in Ash** (a modified Samara, or a totally different `.ashos` OS that speaks the same OS language) and want phones that already run an earlier build to receive updates.

Everything below is implemented and tested: `js/phone/samara-update.js` (pure, node-testable), `js/phone/seedpress.js` (release metadata), `js/phone/samara-os.js` (`kernel.system`, `sys.about/update/dev`, migrations), `js/phone/canopy.js` (the host: storage, fetch, reboot), `phone/os/samara.ashos` (the three Rings pages), `tools/samara-build.js` and Grove > **Publish update**. Tests: `tests/update.test.js`.

## 1. What is versioned

| Thing | Where it lives | Meaning |
|---|---|---|
| **OS version** | `sys.meta version=1.1.0` -> `seed.meta.version` (also `seed.os.version`) | Semantic version of your OS image: `MAJOR.MINOR.PATCH[-prerelease]`. `1.2.0-beta.1 < 1.2.0`. |
| **Build number** | `sys.meta build=110` | Monotonic integer; breaks ties between equal versions. Shown in About as `1.1.0+110`. |
| **Channel** | `sys.meta channel=stable` | `stable`, `beta` or `dev`. Which feed list the release is published in. |
| **Schema** (Ash OS ABI) | `sys.meta schema=1`; kernel exports `SamaraOS.schema` | Version of the OS *language*: the statement table and IR op shapes. Bump it when a seed compiled today could not run on an older kernel. |
| **Kernel version** | `SamaraOS.version` (`kernel.system.kernel.version`) | The runtime that interprets seeds: the "hardware abstraction + firmware" of the simulator. Not the same as the OS version. |
| **Kernel compat range** | `sys.meta minKernel=1.0.0 minSchema=1` | A seed declares the oldest kernel / schema it can run on. The kernel refuses seeds that need a newer schema than it speaks. |
| **OS id (lineage)** | `sys.meta id="samara"` | Identity of an OS family. Updates are only accepted from the same `id`, and persisted state is shared by every version of one lineage. |
| **Seed hash** | `seed.sha256` | SHA-256 of the canonical JSON of the seed body (everything except `built` and `sha256`; `meta` is included when present). Seeds built before `meta` existed keep their old hash. |

Think of it like Android: the **kernel** is the platform / bootloader the device ships with (changes rarely, needs a new app install), the **seed** is the system image that OTA updates replace.

### Release metadata in source

```
sys.meta id="samara" name="Samara OS" version=1.0.0 build=100 channel=stable schema=1 minKernel=1.0.0 feed="phone/build/feed.json" notes="..."
sys.migrate (1.0.0) op=default key=kv.rings:updated-from value="1.0.0"
```

* Always quote URLs (`//` would start a comment).
* `Seedpress.compile({files, entry, meta:{version, build, channel, notes}})` overrides `sys.meta`, which is how Grove and `tools/samara-build.js` stamp a release without editing the source. No `sys.meta` and no `meta` option -> no `meta` key at all (old behaviour, old hashes).
* Seedpress errors (not warnings) on: version that is not `1.2.3`, unknown channel, non-integer build, `schema` newer than Seedpress, malformed `minKernel`, bad `sys.migrate`.

## 2. The release manifest and the feed

Each release is described by one JSON object (built by `SamaraUpdate.makeRelease`):

```json
{
  "version": "1.1.0", "build": 110, "id": "samara", "name": "Samara OS",
  "url": "samara-demo-1.1.0.seed",            // relative to feed.json, or absolute https://
  "sha256": "94be75...",                        // == seed.sha256 inside the file
  "size": 223972,                               // bytes of the .seed file as published
  "minKernel": "1.0.0", "minSchema": 1, "schema": 1,
  "notes": "What changed...",
  "createdAt": "2026-11-16T01:42:53.920Z",
  "delta": [ { "path": "phone/os/samara.ashos", "change": "modified" } ],
  "signature": null                              // reserved
}
```

* `delta` lists which source files changed relative to the previous release. It is **informational**: updates always download the whole seed (about 100-250 KB). Real binary patches are future work.
* `signature` is **reserved**. The framework has a hook (`verifySignature(release, seed, text)` and `requireSignature`) but ships no signing scheme and the demo feed is unsigned. Integrity comes from the hash; authenticity today comes only from trusting the feed's host. Do not describe this as "signed".

### feed.json

```json
{
  "format": 1, "product": "samara-os", "id": "samara", "generated": "ISO",
  "channels": {
    "stable": [ { release }, ... newest first ],
    "beta":   [ { release } ],
    "dev":    [ ]
  }
}
```

* A phone on `beta` considers `beta` + `stable` releases; `dev` considers all three. It picks the highest **newer** version (equal version, higher build also counts) that is compatible.
* Invalid releases (bad version, missing url, `sha256` not 64 hex) are skipped with warnings; a feed that is not JSON, has the wrong `format`, or lists nothing is rejected with a plain-language error. A bad feed never changes the phone.
* Releases of another `id` are ignored. Versions the user rolled back from are **blocked** until a manual re-check (`ignoreBlocked`).
* There is no downgrade through the feed.

## 3. The update flow

```
        check ──► compare ──► download ──► verify ──► stage ──► apply ──► boot ──► confirm
          │          │           │           │          │         │         │          │
       feed.json   newer &     seed text   size,      write to   flip      migrate    trial
       parseFeed   compatible  (stream +   magic,     inactive   active    state,     cleared;
                   pickRelease progress)   integrity, slot A/B   pointer,  new kernel  else after 2
                                           sha vs     (atomic:   keep      instance   failed boots:
                                           feed,      slot first previous                auto rollback
                                           lineage,   then state)
                                           version,
                                           compat)
```

1. **Check** fetches `host.updateFeedUrl` (the `feed=` from `sys.meta`, overridable by the host or embed `?feed=`), parses and compares. Result: `uptodate`, `available` or `incompatible` (with the reason, e.g. "needs Samara kernel 2.0.0 or newer").
2. **Download** streams the seed (progress when the platform exposes a stream).
3. **Verify** (`SamaraUpdate.verifyPayload`), in this order: size equals the feed's size, `SAMARA-SEED` magic and format, `Seedpress.verify` (internal hash), seed hash equals the feed's `sha256`, version equals the feed's, same `id`, not older than the running version, compatible with this kernel (both `seed.meta` and the feed entry), optional signature. Any failure discards the download and leaves the phone untouched.
4. **Stage** writes the verified seed into the **inactive slot** (`A` or `B`), then records it in the state. The running system is not changed. If storage is full the stage fails cleanly.
5. **Apply** (user taps *Install & restart*, or automatically at the next boot when auto-update is on) flips the `active` pointer to the staged slot and keeps the previous one as the **rollback slot**, then the host reboots into the new seed (`host.reboot({seed})`; the simulator re-creates the kernel).
6. **Boot / migrate / confirm**: see sections 4 and 5.

### A/B slots and the factory image

```
 storage (namespace samara:upd:<id>:)
   state      JSON: active, previous, staged, trial, channel, auto, blocked, history, ...
   slot:A     compact seed JSON            slot:B   compact seed JSON
 base         the seed the host was started with = factory image. Never written, so it is always available as the last-resort rollback.
```

`active` is `base`, `A` or `B`. After `base -> 1.1.0` the state is `active=A, previous=base`. The next update is staged into `B` (never over the slot you are running); after applying, `active=B, previous=A`. Staging into the rollback slot is allowed (it overwrites it, `previous` falls back to `base`).

### Failure handling

| Failure | Behaviour |
|---|---|
| Offline / CORS / timeout (20 s) | "Couldn't reach the update server... Your phone was not changed." |
| HTTP 404/500, HTML captive portal, damaged feed | Rejected with a message; nothing staged. |
| Truncated or altered download, wrong hash, wrong version, wrong lineage | Download discarded, `verify-failed` in history, nothing staged. |
| Storage quota | Stage fails cleanly ("Not enough storage"), state not changed. |
| Staged slot later missing/corrupt | Discarded at apply time; ask the user to download again. |
| Active slot corrupt at boot | Falls back to the factory image, with a notice. |
| New version crashes at boot | `trial` counts boots; if `markBootGood` is not reached within 2 boots, `selectBootSeed` rolls back automatically and blocks that version. |
| Migration throws | All-or-nothing: the old state is kept (see below). |

## 4. State migration

User data (settings, per-app storage) lives in the lineage namespace `samara:<id>:*`, so it **survives** updates (without `sys.meta id` the namespace is the seed hash and every build starts empty, the pre-update behaviour).

Migrations upgrade that state when the OS version changes. The state object handed to a migration is `{ settings: {...}, kv: {...} }` (`kv` = per-app `store.set` data, keys like `leaf:note`).

**Rule:** a migration registered for `fromVer` upgrades state *written by versions <= fromVer*. When going from stored version `S` to the new version `T` the runner applies every migration with `S <= from < T` in ascending order, so skipping versions (1.0.0 -> 1.3.0) runs every step.

* **Declarative, shipped inside the seed (works for any OS in pure Ash):**
  ```
  sys.migrate (1.0.0) op=rename  key=settings.oldName to=settings.newName
  sys.migrate (1.0.0) op=default key=kv.rings:updated-from value="1.0.0"
  sys.migrate (1.1.0) op=set     key=settings.something value=3
  sys.migrate (1.1.0) op=delete  key=kv.obsolete
  ```
  Keys are `settings.<name>` or `kv.<name>` (bare = settings).
* **JavaScript, for hosts embedding the kernel:**
  `SamaraUpdate.registerMigration('1.0.0', function (state, ctx) { state.settings.x = 1; })` (returns an unregister function). The kernel runs registered JS migrations and the seed's declarative ones together.
* Before any upgrade the kernel stores a **snapshot** of the whole pre-migration state (`snap:<oldVersion>`). **Rollback restores it**, so a rolled-back phone gets the exact data it had before the update, including anything the migration added or removed. Data you create while on the newer version is lost on rollback (documented trade-off).
* Downgrading without a snapshot keeps the current state and logs it.

## 5. Automatic updates

Settings (System update page): on/off and a schedule, both stored in the updater state.

* **Whenever online ("Wi-Fi only")**: checks at boot and then at most every 6 hours while the phone is on. "Wi-Fi only" is honest only in the simulator sense: it follows `navigator.onLine`.
* **Nightly (simulated clock)**: runs once per day while the phone's clock is between 02:00 and 04:00. The phone clock can be skewed from Developer options (*Jump simulated clock to 03:00*) to test it.
* Auto-update **downloads, verifies and stages** in the background and shows a notification. It **applies at the next boot** (never restarts the phone by itself). With auto-update off a staged update is applied only when the user taps *Install & restart*.

The kernel drives it from `K.tick` (every 60 s of device time) and at boot; the pure updater has `autoDue(now)` / `autoTick(now)`.

## 6. How the pieces talk (for OS builders)

Ash statements (documented in `SYNTAX.md`; implemented by the kernel):

| statement | purpose |
|---|---|
| `sys.meta key=value...` | release metadata (manifest) |
| `sys.migrate (fromVer) op= key= to= value=` | declarative state migration (manifest) |
| `sys.about (refresh\|tapbuild\|copy)` | fill `about_*` variables / count build taps / copy build info |
| `sys.update (check\|download\|apply\|primary\|rollback\|channel X\|auto on/off/toggle\|schedule wifi/nightly/toggle\|simulate\|clearlocal\|fault\|status)` | OTA state machine (`primary` = whatever the big button should do now) |
| `sys.dev (enable\|disable\|toggle [touches\|bounds]\|log\|clearlog\|skipclock\|factoryreset\|status)` | developer options |

The pages in `phone/os/samara.ashos` (`RingsAbout`, `RingsSysUpdate`, `RingsDevOpts`, in `// ==== updates:... ====` blocks) are ordinary Ash: they bind `text=(about_os)`, `label=(upd_btn)` etc. The kernel refreshes those `about_*`, `upd_*`, `dev_*` variables on every change, so an OS author can restyle the pages or write their own against the same variables.

Kernel (read-only) `kernel.system`: `{ os:{name,version,build,channel,schema,id,feed}, kernel:{version,schema}, seed:{sha256,bytes,files,nodes,apps}, uptimeMs, device:{id,model,simulated:true,hardware,screen}, flags, feed }`. The device id is generated once and kept in browser storage (`samara:device-id`); hardware fields are labelled *simulated* because nothing here is real hardware.

Host contract (what Canopy provides; implement the same in your own host):

```
host.update         an updater: getState/check/download/apply/rollback/primary/primaryLabel/setChannel/setAuto/
                    autoTick/markBootGood/takeJust/on(listener)   (SamaraUpdate.create(...) or your own)
host.updateFeedUrl  string | () => string  (falls back to seed.meta.feed)
host.reboot({seed}) restart into a seed (null = same seed)
host.copy(text)     clipboard
host.factoryReset() optional; default wipes the namespace and reboots
host.storage / host.fetch / host.now   as before
```

Boot sequence in the host: create the updater with the base seed -> `selectBootSeed()` -> create the kernel with that seed -> `kernel.boot()` (migrates, then calls `markBootGood()`, then notifies "updated to X" / "went back to X").

### Rings pages

* **About phone**: model (Samara One, simulated), hardware statement, device id, battery, screen, OS version, **Build number (tap 7 times -> Developer options; counts within 3 s, toast "N more taps")**, channel, schema, kernel, seed hash/size/files, build time, uptime, feed URL, browser, *Copy build info*.
* **System update**: installed version, status, progress bar, one primary button (*Check* -> *Download* -> *Install & restart*), release notes + changed files, last checked, channel selector, auto-update toggle + schedule, rollback to previous (names the version, "factory image" for the base), history, trial-boot note.
* **Developer options**: master switch, show touches, show layout bounds, *Simulate update available* (fabricates version+1 of the running image and runs the real flow offline), *Corrupt next download*, clock jump, local test feed, log viewer, ROM inspector (seed hash, per-file size/hash), factory data reset (two taps). The menu entry only appears once enabled.

## 7. Shipping updates from Grove (or the command line)

**Grove > Publish update**: builds the current project with a new `version/build/channel/notes`, stamps `seed.meta`, creates the release record (hash, size, delta against the build you had) and merges it into this project's `feed.json` (kept in the browser). Then:

* **Test on simulator** loads the new feed into the running simulated phone as a local test feed; open Rings > System update > Check for updates. This is the quickest edit-publish-install loop.
* **Download .seed / feed.json** for hosting.
* **Save to private repo** writes `phone/<project>/build/<project>-<ver>.seed` and `feed.json` with the normal Grove save flow (needs sign-in; no token is ever printed or stored in the files).

**Command line**: `node tools/samara-build.js` rebuilds the demo images and feed (the demo updates are the same sources with small scripted edits, see `tools/samara-build.js`).

### Where to host a feed

A phone must be able to `fetch` the feed and the seed **anonymously, with CORS allowed**.

| Host | Works for phones? | Notes |
|---|---|---|
| **GitHub Pages** (public repo) | Yes (best) | `https://you.github.io/os/feed.json`; relative `url`s work. Redeploy to publish. |
| **Public repo raw / release asset** | Yes | `raw.githubusercontent.com` sends CORS headers. Release assets often do not: prefer raw or Pages. |
| **Gist (secret or public)** | Yes, but one URL per file | Anyone with the link can read; use absolute `url`s in the feed (one gist file for the feed, one per seed). |
| **Private repo** | **No** | Anonymous fetch fails and tokens are never put in URLs. Use it as a backup of your sources and builds, not a delivery channel. |

Set `sys.meta feed="https://.../feed.json"` in the OS you ship so phones know where to look. A user can also be pointed at a feed by the embedding page (`embed.html?...&feed=https://...`).

### embed.html: pinned vs auto-update

An embedded phone is **pinned by default**: `embed.html?src=<seed>` runs exactly that seed, no updater, nothing written. Add `&update=auto` to let the embedded phone use the updater (feed from `&feed=` if given, else the seed's `sys.meta feed`); its slots then live in that origin's `localStorage`. Only `https:` (or same-origin) feed URLs are accepted. Use `auto` only for feeds you control: a feed decides what OS the phone runs (the kernel never executes JavaScript from a seed, but a feed can still replace the whole system).

## 8. Building your own OS that is update-compatible

1. Keep your `.ashos` sources; add one `sys.meta` line with a unique `id`, a `version`, and a `feed`.
2. Include the three pages (copy `RingsAbout`, `RingsSysUpdate`, `RingsDevOpts`) or write your own that call `sys.update`. Your OS must define a `Rings`-style place to open them; the kernel opens them by `@rings:about|sysupdate|devopts`.
3. Bump `version`/`build` for every release; bump `schema` only when the language itself changed and set `minKernel` accordingly.
4. When you change what you persist, add `sys.migrate` lines.
5. Publish (Grove or `tools/samara-build.js`), host `feed.json` and the seeds on Pages, and tell phones where it is.
6. Phones already running an older build of **your** `id` check the feed, verify the hash, stage into the inactive slot and install on tap or next boot, with rollback.

## 9. Honest limits

* Updates are full images, not binary deltas (`delta` is informational).
* No cryptographic signatures yet (`signature` is reserved, a verifier hook exists). Trust = HTTPS host + the hash in the feed.
* "Wi-Fi only" and the nightly schedule are simulated against `navigator.onLine` and the (skewable) device clock; a browser tab cannot run in the background, so auto-update only happens while the simulator page is open.
* Only the immediately previous image can be rolled back to (plus the factory image, which is whatever seed the page started from). Data created after an update is lost on rollback.
* The kernel (runtime) cannot be updated by the feed: that is the web app itself, updated by deploying a new site version. That is why seeds carry `minKernel` and `minSchema`.
* The demo update seeds are built from the same sources with scripted edits and are tiny on purpose.
