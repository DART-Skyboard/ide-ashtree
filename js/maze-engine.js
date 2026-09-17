// ============================================================
//  maze-engine.js — Lead Edge Maze Engine (LEMAC, web port)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Port of MazeEngine.swift: recursive-backtracker generation
//  (planar and cubic), randomized perimeter/face entry+exit
//  placement, and BFS solving — same algorithm, same shape of
//  result, so a maze generated here matches what the iOS app
//  would produce from the same RNG behavior.
// ============================================================

function mazeCell() {
  return {
    // Planar (2D)
    N: true, E: true, S: true, W: true,
    // Cubic (3D)
    top: true, bottom: true, left: true, right: true, front: true, back: true,
    visited: false,
    isPath: false
  };
}

const LEMACEngine = {
  // ── Planar generation — recursive backtracker ──────────────
  generatePlanar(w, h) {
    const g = Array.from({ length: h }, () => Array.from({ length: w }, mazeCell));
    let stack = [[Math.floor(Math.random() * w), Math.floor(Math.random() * h)]];
    g[stack[0][1]][stack[0][0]].visited = true;
    let visitCount = 1;
    const total = w * h;

    const dirs = [
      { dx: 0, dy: -1, wall: "N", opp: "S" },
      { dx: 1, dy: 0, wall: "E", opp: "W" },
      { dx: 0, dy: 1, wall: "S", opp: "N" },
      { dx: -1, dy: 0, wall: "W", opp: "E" }
    ];

    while (visitCount < total && stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const shuffled = shuffle([...dirs]);
      let picked = null;
      for (const dir of shuffled) {
        const nx = cx + dir.dx, ny = cy + dir.dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !g[ny][nx].visited) {
          picked = { nx, ny, wall: dir.wall, opp: dir.opp };
          break;
        }
      }
      if (picked) {
        g[cy][cx][picked.wall] = false;
        g[picked.ny][picked.nx][picked.opp] = false;
        g[picked.ny][picked.nx].visited = true;
        stack.push([picked.nx, picked.ny]);
        visitCount++;
      } else {
        stack.pop();
      }
    }
    return g;
  },

  // ── Randomized entry/exit — any perimeter cell, not just corners ──
  placePlanarOpenings(w, h) {
    const perimeter = [];
    for (let x = 0; x < w; x++) {
      perimeter.push([x, 0]);
      perimeter.push([x, h - 1]);
    }
    for (let y = 1; y < h - 1; y++) {
      perimeter.push([0, y]);
      perimeter.push([w - 1, y]);
    }
    const shuffled = shuffle(perimeter);
    const entry = shuffled[0];
    const minDist = Math.floor(Math.max(w, h) / 2);
    const farCells = shuffled.filter(
      (c) => Math.abs(c[0] - entry[0]) + Math.abs(c[1] - entry[1]) >= minDist
    );
    const exit = farCells.length ? farCells[Math.floor(Math.random() * farCells.length)] : shuffled[shuffled.length - 1];
    return { entry, exit };
  },

  // ── Cubic generation — D3 volumetric recursive backtracker ──
  generateCubic(w, h, d) {
    const g = Array.from({ length: d }, () =>
      Array.from({ length: h }, () => Array.from({ length: w }, mazeCell))
    );
    let stack = [[0, 0, 0]];
    g[0][0][0].visited = true;
    let visitCount = 1;
    const total = w * h * d;

    const dirs = [
      { dx: 0, dy: -1, dz: 0, wall: "top", opp: "bottom" },
      { dx: 0, dy: 1, dz: 0, wall: "bottom", opp: "top" },
      { dx: -1, dy: 0, dz: 0, wall: "left", opp: "right" },
      { dx: 1, dy: 0, dz: 0, wall: "right", opp: "left" },
      { dx: 0, dy: 0, dz: 1, wall: "front", opp: "back" },
      { dx: 0, dy: 0, dz: -1, wall: "back", opp: "front" }
    ];

    while (visitCount < total && stack.length > 0) {
      const [cx, cy, cz] = stack[stack.length - 1];
      const shuffled = shuffle([...dirs]);
      let picked = null;
      for (const dir of shuffled) {
        const nx = cx + dir.dx, ny = cy + dir.dy, nz = cz + dir.dz;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && nz >= 0 && nz < d && !g[nz][ny][nx].visited) {
          picked = { nx, ny, nz, wall: dir.wall, opp: dir.opp };
          break;
        }
      }
      if (picked) {
        g[cz][cy][cx][picked.wall] = false;
        g[picked.nz][picked.ny][picked.nx][picked.opp] = false;
        g[picked.nz][picked.ny][picked.nx].visited = true;
        stack.push([picked.nx, picked.ny, picked.nz]);
        visitCount++;
      } else {
        stack.pop();
      }
    }
    return g;
  },

  // ── Randomized entry/exit for cubic — any outer face cell ──
  placeCubicOpenings(w, h, d) {
    const faces = [];
    const lx = w - 1, ly = h - 1, lz = d - 1;
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) {
      faces.push([0, y, z]); faces.push([lx, y, z]);
    }
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      faces.push([x, 0, z]); faces.push([x, ly, z]);
    }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      faces.push([x, y, 0]); faces.push([x, y, lz]);
    }
    const shuffled = shuffle(faces);
    const entry = shuffled[0];
    const minDist = Math.max(w, h, d);
    const far = shuffled.filter(
      (c) => Math.abs(c[0] - entry[0]) + Math.abs(c[1] - entry[1]) + Math.abs(c[2] - entry[2]) >= minDist
    );
    const exit = far.length ? far[Math.floor(Math.random() * far.length)] : shuffled[shuffled.length - 1];
    return { entry, exit };
  },

  // ── BFS solvers ──────────────────────────────────────────
  solvePlanar(g, start, end, w, h) {
    const visited = new Set([`${start[0]},${start[1]}`]);
    const queue = [{ path: [start], pos: start }];
    const dirs = [{ dx: 0, dy: -1, wall: "N" }, { dx: 1, dy: 0, wall: "E" },
                  { dx: 0, dy: 1, wall: "S" }, { dx: -1, dy: 0, wall: "W" }];
    while (queue.length) {
      const { path, pos } = queue.shift();
      const [cx, cy] = pos;
      if (cx === end[0] && cy === end[1]) return path;
      for (const dir of dirs) {
        if (g[cy][cx][dir.wall]) continue;
        const nx = cx + dir.dx, ny = cy + dir.dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push({ path: [...path, [nx, ny]], pos: [nx, ny] });
      }
    }
    return null;
  },

  solveCubic(g, start, end, w, h, d) {
    const visited = new Set([`${start[0]},${start[1]},${start[2]}`]);
    const queue = [{ path: [start], pos: start }];
    const dirs = [
      { dx: 0, dy: -1, dz: 0, wall: "top" }, { dx: 0, dy: 1, dz: 0, wall: "bottom" },
      { dx: -1, dy: 0, dz: 0, wall: "left" }, { dx: 1, dy: 0, dz: 0, wall: "right" },
      { dx: 0, dy: 0, dz: 1, wall: "front" }, { dx: 0, dy: 0, dz: -1, wall: "back" }
    ];
    while (queue.length) {
      const { path, pos } = queue.shift();
      const [cx, cy, cz] = pos;
      if (cx === end[0] && cy === end[1] && cz === end[2]) return path;
      for (const dir of dirs) {
        if (g[cz][cy][cx][dir.wall]) continue;
        const nx = cx + dir.dx, ny = cy + dir.dy, nz = cz + dir.dz;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || nz < 0 || nz >= d) continue;
        const k = `${nx},${ny},${nz}`;
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push({ path: [...path, [nx, ny, nz]], pos: [nx, ny, nz] });
      }
    }
    return null;
  },

  // ── Segment-count heuristic used by Cryptology key derivation ──
  segmentCount(w, h, d, mode) {
    if (mode === "cubic") return Math.floor((w * h * d * 3) / 4);
    return Math.floor((w * h * 2) / 3);
  }
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── High-level generate() matching MazeViewModel.generate() shape ──
function mazeGenerate(config) {
  const { width: w, height: h, depth: d, mode } = config;
  if (mode === "planar") {
    const g = LEMACEngine.generatePlanar(w, h);
    const { entry, exit } = LEMACEngine.placePlanarOpenings(w, h);
    const path = LEMACEngine.solvePlanar(g, entry, exit, w, h);
    return {
      planarGrid: g, cubicGrid: null,
      entry: [entry[0], entry[1], 0], exit: [exit[0], exit[1], 0],
      planarPath: path, cubicPath: null,
      mode: "planar", w, h, d: 1
    };
  }
  const g = LEMACEngine.generateCubic(w, h, d);
  const { entry, exit } = LEMACEngine.placeCubicOpenings(w, h, d);
  const path = LEMACEngine.solveCubic(g, entry, exit, w, h, d);
  return {
    planarGrid: null, cubicGrid: g,
    entry, exit,
    planarPath: null, cubicPath: path,
    mode: "cubic", w, h, d
  };
}
