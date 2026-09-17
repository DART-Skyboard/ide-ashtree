// ============================================================
//  cryptology.js — Lead Edge Cryptology (web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Port of IDECryptologyView.swift's CryptologyVM: maze-seeded
//  SHA-256 key derivation, a Fisher–Yates interchange cipher
//  with a recorded/replayable swap sequence, and a dependency-
//  free raw ZIP reader/writer (stored, uncompressed) identical
//  in file layout to the Swift version's buildZip/extractZip.
// ============================================================

class CryptologyEngine {
  constructor() {
    this.messageText = "";
    this.attachedFiles = [];        // { name, data: Uint8Array }
    this.privateKey = "";
    this.publicKey = "";
    this.outputLog = "";
    this.encryptedZip = null;       // Uint8Array
    this.decryptedOutput = "";
    this.decryptedZip = null;       // Uint8Array
    this.decryptionZip = null;      // Uint8Array
    this.decryptionZipName = "";
    this.pastedPrivateKey = "";

    this.rootMazeLayers = [{ w: 8, h: 8, d: 4, mode: "cubic" }];
    this.interchangeDims = [];
    this.nextDimId = 0;
  }

  log(line) { this.outputLog += line + "\n"; }

  // ── Key generation — maze topology seeds a SHA-256 keypair ──
  async generateMazeKeys(editorContent) {
    this.outputLog = "◈ Generating maze-based keys…\n";
    const allSegments = [];
    for (const layer of this.rootMazeLayers) {
      const segs = LEMACEngine.segmentCount(layer.w, layer.h, layer.d, layer.mode);
      allSegments.push({ type: layer.mode, segments: segs, config: { w: layer.w, h: layer.h, d: layer.d } });
    }
    for (const dim of this.interchangeDims) {
      const segs = LEMACEngine.segmentCount(dim.w, dim.h, dim.d, dim.mode);
      allSegments.push({ type: `interchange_${dim.id}`, segments: segs });
    }

    const combinedSeed = this.messageText + editorContent + JSON.stringify(allSegments);
    const { priv, pub } = await this._deriveKeyPair(combinedSeed);
    this.privateKey = priv;
    this.publicKey = pub;
    this.log("◈ SHA-256 keys generated from maze structure.");
    this.log(`Private: ${priv.slice(0, 32)}…`);
    this.log(`Public:  ${pub.slice(0, 32)}…`);
  }

  async _deriveKeyPair(seed) {
    const entropy = seed + Date.now();
    const privSeed = await sha256Hex(entropy + "priv" + randomHex(8));
    const pubSeed = await sha256Hex(entropy + "pub" + randomHex(8));
    return {
      priv: "DART_PRIV_" + privSeed + randomHex(4) + "END",
      pub: "DART_PUB_" + pubSeed + randomHex(4) + "END"
    };
  }

  // ── Encrypt + package ────────────────────────────────────
  async encryptAndPackageZip(editorContent) {
    if (!this.privateKey) { this.log("⚠ Generate maze keys first."); return; }
    this.outputLog = "Encrypting…\n";

    let combined = this.messageText + editorContent;
    const fileMetadata = this.attachedFiles.map((f) => {
      combined += bytesToBinaryString(f.data);
      return { name: f.name, size: String(f.data.length) };
    });

    const { shuffled, sequence } = randomInterchange(combined);
    this.log(`Encrypted ${utf8ByteLength(combined)} bytes via interchange.`);
    this.log(`Preview: ${shuffled.slice(0, 80)}…`);

    const entries = [
      { name: "encrypted_data.txt", data: stringToBytes(shuffled) },
      { name: "public_key.txt", data: stringToBytes(this.publicKey) },
      { name: "private_key.txt", data: stringToBytes(this.privateKey) },
      { name: "shuffle_sequence.json", data: stringToBytes(JSON.stringify(sequence)) },
      { name: "files_manifest.json", data: stringToBytes(JSON.stringify(fileMetadata)) }
    ];
    for (const f of this.attachedFiles) entries.push({ name: `attached_${f.name}`, data: f.data });

    const zipData = buildZip(entries);
    this.encryptedZip = zipData;
    this.log(`✓ Encrypted ZIP ready — ${Math.round(zipData.length / 1024)} KB`);
  }

  // ── Decrypt from ZIP ──────────────────────────────────────
  async decryptFromZip() {
    if (!this.decryptionZip) { this.log("⚠ No ZIP file loaded for decryption."); return; }
    if (!this.pastedPrivateKey) { this.log("⚠ Paste your private key to decrypt."); return; }
    this.outputLog = "Decrypting…\n";

    const entries = extractZip(this.decryptionZip);
    if (!entries) { this.log("⚠ Failed to read ZIP file."); return; }

    const encBytes = entries["encrypted_data.txt"];
    if (!encBytes) { this.log("⚠ encrypted_data.txt not found in ZIP."); return; }
    const encData = bytesToString(encBytes);

    const seqBytes = entries["shuffle_sequence.json"];
    if (!seqBytes) { this.log("⚠ shuffle_sequence.json not found in ZIP."); return; }
    let seq;
    try { seq = JSON.parse(bytesToString(seqBytes)); } catch { seq = null; }
    if (!seq) { this.log("⚠ Could not parse shuffle sequence."); return; }

    const decrypted = reverseInterchange(encData, seq);
    this.decryptedOutput = decrypted;
    this.log(`✓ Decryption complete. ${utf8ByteLength(decrypted)} bytes recovered.`);
    this.log(`Preview: ${decrypted.slice(0, 200)}`);

    const outZip = buildZip([{ name: "decrypted_content.txt", data: stringToBytes(decrypted) }]);
    this.decryptedZip = outZip;
    this.log("✓ Decrypted ZIP ready.");
  }

  clearAll() {
    this.messageText = ""; this.attachedFiles = [];
    this.privateKey = ""; this.publicKey = "";
    this.outputLog = ""; this.encryptedZip = null; this.decryptedOutput = "";
    this.decryptionZip = null; this.decryptedZip = null; this.pastedPrivateKey = "";
  }
}

// ── Interchange cipher (Fisher–Yates with a recorded, replayable
//    swap sequence — reversing the sequence in reverse order undoes it) ──
function randomInterchange(input) {
  const chars = Array.from(input);
  const seq = [];
  for (let i = 0; i < chars.length; i++) {
    const j = Math.floor(Math.random() * chars.length);
    seq.push([i, j]);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return { shuffled: chars.join(""), sequence: seq };
}
function reverseInterchange(input, sequence) {
  const chars = Array.from(input);
  for (let k = sequence.length - 1; k >= 0; k--) {
    const [i, j] = sequence[k];
    if (i >= chars.length || j >= chars.length) continue;
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ── SHA-256 via Web Crypto ────────────────────────────────
async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", stringToBytes(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(len) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return out;
}

// ── UTF-8 <-> bytes helpers ────────────────────────────────
function stringToBytes(s) { return new TextEncoder().encode(s); }
function bytesToString(b) { return new TextDecoder("utf-8", { fatal: false }).decode(b); }
function bytesToBinaryString(b) { let s = ""; for (const byte of b) s += String.fromCharCode(byte); return s; }
function utf8ByteLength(s) { return stringToBytes(s).length; }

// ── Raw ZIP (stored, uncompressed) — byte-identical layout to
//    the Swift buildZip/extractZip so files round-trip either way ──
function crc32(bytes) {
  let table = crc32._table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let v = i;
      for (let k = 0; k < 8; k++) v = v & 1 ? (v >>> 1) ^ 0xedb88320 : v >>> 1;
      table[i] = v >>> 0;
    }
    crc32._table = table;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(v) { return new Uint8Array([v & 0xff, (v >> 8) & 0xff]); }
function u32(v) { return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]); }
function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = stringToBytes(entry.name);
    const fileData = entry.data;
    const crc = crc32(fileData);
    const thisOffset = offset;

    const local = concatBytes([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(fileData.length), u32(fileData.length),
      u16(nameBytes.length), u16(0),
      nameBytes, fileData
    ]);
    localParts.push(local);
    offset += local.length;

    const cd = concatBytes([
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20), u16(20), u16(0), u16(0),
      u16(0), u16(0),
      u32(crc), u32(fileData.length), u32(fileData.length),
      u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0),
      u32(0), u32(thisOffset),
      nameBytes
    ]);
    centralParts.push(cd);
  }

  const localBlob = concatBytes(localParts);
  const centralBlob = concatBytes(centralParts);
  const cdOffset = localBlob.length;
  const cdSize = centralBlob.length;

  const eocd = concatBytes([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(cdSize), u32(cdOffset),
    u16(0)
  ]);

  return concatBytes([localBlob, centralBlob, eocd]);
}

function extractZip(data) {
  const result = {};
  let i = 0;
  let found = false;
  while (i + 30 < data.length) {
    if (!(data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x03 && data[i + 3] === 0x04)) {
      i += 1;
      continue;
    }
    const nameLen = data[i + 26] | (data[i + 27] << 8);
    const extraLen = data[i + 28] | (data[i + 29] << 8);
    const compSize = data[i + 18] | (data[i + 19] << 8) | (data[i + 20] << 16) | (data[i + 21] << 24);
    const nameStart = i + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (nameStart + nameLen > data.length || dataStart + compSize > data.length) break;
    const name = bytesToString(data.slice(nameStart, nameStart + nameLen));
    const content = data.slice(dataStart, dataStart + compSize);
    result[name] = content;
    found = true;
    i = dataStart + compSize;
  }
  return found ? result : null;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
