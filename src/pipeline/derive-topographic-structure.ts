import {
  createTopographicStructureMaps,
  type GridShape,
  indexOf
} from "../domain/topography.js";

export const STRUCTURE_DIR8_NEIGHBORS = [
  { dir: 0, dx: 1, dy: 0 }, // E
  { dir: 1, dx: 1, dy: 1 }, // SE
  { dir: 2, dx: 0, dy: 1 }, // S
  { dir: 3, dx: -1, dy: 1 }, // SW
  { dir: 4, dx: -1, dy: 0 }, // W
  { dir: 5, dx: -1, dy: -1 }, // NW
  { dir: 6, dx: 0, dy: -1 }, // N
  { dir: 7, dx: 1, dy: -1 } // NE
] as const;

export interface TopographicStructureConfig {
  connectivity: "dir8";
  hEps: number;
  persistenceMin: number;
  unresolvedPolicy: "nan";
}

export interface TopographicStructureParams extends TopographicStructureConfig {
  enabled: boolean;
}

type HeightOrderMode = "asc" | "desc";

interface HeightGroup {
  level: number;
  indices: number[];
}

interface BasinRootMeta {
  minH: Float32Array;
  minIdx: Int32Array;
}

interface PeakRootMeta {
  maxH: Float32Array;
  maxIdx: Int32Array;
}

function assertStructureConfig(config: TopographicStructureConfig): void {
  if (config.connectivity !== "dir8") {
    throw new Error(
      `Topographic structure: unsupported connectivity "${String(config.connectivity)}".`
    );
  }
  if (!Number.isFinite(config.hEps) || config.hEps < 0) {
    throw new Error(
      `Topographic structure: invalid hEps "${String(config.hEps)}".`
    );
  }
  if (!Number.isFinite(config.persistenceMin) || config.persistenceMin < 0) {
    throw new Error(
      `Topographic structure: invalid persistenceMin "${String(config.persistenceMin)}".`
    );
  }
  if (config.unresolvedPolicy !== "nan") {
    throw new Error(
      `Topographic structure: unsupported unresolvedPolicy "${String(config.unresolvedPolicy)}".`
    );
  }
}

export function buildHeightGroups(
  h: Float32Array,
  hEps: number,
  mode: HeightOrderMode
): HeightGroup[] {
  const order = Array.from({ length: h.length }, (_, index) => index);
  order.sort((a, b) => {
    const aH = h[a];
    const bH = h[b];
    if (mode === "asc") {
      if (aH < bH) {
        return -1;
      }
      if (aH > bH) {
        return 1;
      }
      return a - b;
    }
    if (aH > bH) {
      return -1;
    }
    if (aH < bH) {
      return 1;
    }
    return a - b;
  });

  const groups: HeightGroup[] = [];
  for (const index of order) {
    const level = h[index];
    const current = groups[groups.length - 1];
    if (!current || Math.abs(level - current.level) > hEps) {
      groups.push({ level, indices: [index] });
      continue;
    }
    current.indices.push(index);
  }
  return groups;
}

function dsuFind(parent: Int32Array, index: number): number {
  let root = index;
  while (parent[root] !== root) {
    root = parent[root];
  }
  let cursor = index;
  while (parent[cursor] !== root) {
    const next = parent[cursor];
    parent[cursor] = root;
    cursor = next;
  }
  return root;
}

function lowerMinimumWins(
  aRoot: number,
  bRoot: number,
  meta: BasinRootMeta,
  hEps: number
): boolean {
  const aMinH = meta.minH[aRoot];
  const bMinH = meta.minH[bRoot];
  if (aMinH + hEps < bMinH) {
    return true;
  }
  if (bMinH + hEps < aMinH) {
    return false;
  }
  return meta.minIdx[aRoot] <= meta.minIdx[bRoot];
}

function unionBasinRoots(
  parent: Int32Array,
  meta: BasinRootMeta,
  spillByMinimum: Float32Array,
  a: number,
  b: number,
  level: number,
  hEps: number
): number {
  const aRoot = dsuFind(parent, a);
  const bRoot = dsuFind(parent, b);
  if (aRoot === bRoot) {
    return aRoot;
  }

  const aWins = lowerMinimumWins(aRoot, bRoot, meta, hEps);
  const winner = aWins ? aRoot : bRoot;
  const loser = aWins ? bRoot : aRoot;
  const loserMinimum = meta.minIdx[loser];

  if (Number.isNaN(spillByMinimum[loserMinimum])) {
    spillByMinimum[loserMinimum] = level;
  }

  parent[loser] = winner;
  return winner;
}

export function deriveBasinStructure(
  shape: GridShape,
  h: Float32Array,
  config: TopographicStructureConfig
) {
  if (h.length !== shape.size) {
    throw new Error(
      `Topographic structure: map length mismatch for H. expected=${shape.size} actual=${h.length}.`
    );
  }
  assertStructureConfig(config);

  const groups = buildHeightGroups(h, config.hEps, "asc");
  const out = createTopographicStructureMaps(shape);

  const active = new Uint8Array(shape.size);
  const parent = new Int32Array(shape.size).fill(-1);
  const rootMeta: BasinRootMeta = {
    minH: new Float32Array(shape.size).fill(Number.NaN),
    minIdx: new Int32Array(shape.size).fill(-1)
  };
  const tileBasinMin = new Int32Array(shape.size).fill(-1);
  const minHByMinimum = new Float32Array(shape.size).fill(Number.NaN);
  const spillByMinimum = new Float32Array(shape.size).fill(Number.NaN);

  for (const group of groups) {
    for (const tile of group.indices) {
      active[tile] = 1;
      parent[tile] = tile;
      rootMeta.minH[tile] = h[tile];
      rootMeta.minIdx[tile] = tile;
      minHByMinimum[tile] = h[tile];
    }

    for (const tile of group.indices) {
      const x = tile % shape.width;
      const y = Math.floor(tile / shape.width);
      for (const neighbor of STRUCTURE_DIR8_NEIGHBORS) {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }
        const n = indexOf(shape, nx, ny);
        if (active[n] !== 1) {
          continue;
        }
        unionBasinRoots(
          parent,
          rootMeta,
          spillByMinimum,
          tile,
          n,
          group.level,
          config.hEps
        );
      }
    }

    for (const tile of group.indices) {
      const root = dsuFind(parent, tile);
      tileBasinMin[tile] = rootMeta.minIdx[root];
    }
  }

  for (let i = 0; i < shape.size; i += 1) {
    const minimum = tileBasinMin[i];
    if (minimum < 0) {
      continue;
    }
    out.basinMinIdx[i] = minimum;

    const minH = minHByMinimum[minimum];
    const spillH = spillByMinimum[minimum];
    out.basinMinH[i] = minH;
    out.basinSpillH[i] = spillH;
    if (Number.isNaN(spillH)) {
      continue;
    }

    const persistence = Math.max(0, spillH - minH);
    out.basinPersistence[i] = persistence;
    out.basinDepthLike[i] = Math.max(0, spillH - h[i]);
    out.basinLike[i] = persistence >= config.persistenceMin ? 1 : 0;
  }

  return out;
}

function higherMaximumWins(
  aRoot: number,
  bRoot: number,
  meta: PeakRootMeta,
  hEps: number
): boolean {
  const aMaxH = meta.maxH[aRoot];
  const bMaxH = meta.maxH[bRoot];
  if (aMaxH > bMaxH + hEps) {
    return true;
  }
  if (bMaxH > aMaxH + hEps) {
    return false;
  }
  return meta.maxIdx[aRoot] <= meta.maxIdx[bRoot];
}

function unionPeakRoots(
  parent: Int32Array,
  meta: PeakRootMeta,
  saddleByMaximum: Float32Array,
  a: number,
  b: number,
  level: number,
  hEps: number
): number {
  const aRoot = dsuFind(parent, a);
  const bRoot = dsuFind(parent, b);
  if (aRoot === bRoot) {
    return aRoot;
  }

  const aWins = higherMaximumWins(aRoot, bRoot, meta, hEps);
  const winner = aWins ? aRoot : bRoot;
  const loser = aWins ? bRoot : aRoot;
  const loserMaximum = meta.maxIdx[loser];

  if (Number.isNaN(saddleByMaximum[loserMaximum])) {
    saddleByMaximum[loserMaximum] = level;
  }

  parent[loser] = winner;
  return winner;
}

export function derivePeakStructure(
  shape: GridShape,
  h: Float32Array,
  config: TopographicStructureConfig
) {
  if (h.length !== shape.size) {
    throw new Error(
      `Topographic structure: map length mismatch for H. expected=${shape.size} actual=${h.length}.`
    );
  }
  assertStructureConfig(config);

  const groups = buildHeightGroups(h, config.hEps, "desc");
  const out = createTopographicStructureMaps(shape);

  const active = new Uint8Array(shape.size);
  const parent = new Int32Array(shape.size).fill(-1);
  const rootMeta: PeakRootMeta = {
    maxH: new Float32Array(shape.size).fill(Number.NaN),
    maxIdx: new Int32Array(shape.size).fill(-1)
  };
  const tilePeakMax = new Int32Array(shape.size).fill(-1);
  const maxHByMaximum = new Float32Array(shape.size).fill(Number.NaN);
  const saddleByMaximum = new Float32Array(shape.size).fill(Number.NaN);

  for (const group of groups) {
    for (const tile of group.indices) {
      active[tile] = 1;
      parent[tile] = tile;
      rootMeta.maxH[tile] = h[tile];
      rootMeta.maxIdx[tile] = tile;
      maxHByMaximum[tile] = h[tile];
    }

    for (const tile of group.indices) {
      const x = tile % shape.width;
      const y = Math.floor(tile / shape.width);
      for (const neighbor of STRUCTURE_DIR8_NEIGHBORS) {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }
        const n = indexOf(shape, nx, ny);
        if (active[n] !== 1) {
          continue;
        }
        unionPeakRoots(
          parent,
          rootMeta,
          saddleByMaximum,
          tile,
          n,
          group.level,
          config.hEps
        );
      }
    }

    for (const tile of group.indices) {
      const root = dsuFind(parent, tile);
      tilePeakMax[tile] = rootMeta.maxIdx[root];
    }
  }

  for (let i = 0; i < shape.size; i += 1) {
    const maximum = tilePeakMax[i];
    if (maximum < 0) {
      continue;
    }
    out.peakMaxIdx[i] = maximum;

    const maxH = maxHByMaximum[maximum];
    const saddleH = saddleByMaximum[maximum];
    out.peakMaxH[i] = maxH;
    out.peakSaddleH[i] = saddleH;
    if (Number.isNaN(saddleH)) {
      continue;
    }

    const persistence = Math.max(0, maxH - saddleH);
    out.peakPersistence[i] = persistence;
    out.peakRiseLike[i] = Math.max(0, h[i] - saddleH);
    out.ridgeLike[i] = persistence >= config.persistenceMin ? 1 : 0;
  }

  return out;
}

export function deriveTopographicStructure(
  shape: GridShape,
  h: Float32Array,
  params: TopographicStructureParams
) {
  if (!params.enabled) {
    return createTopographicStructureMaps(shape);
  }

  const config: TopographicStructureConfig = {
    connectivity: params.connectivity,
    hEps: params.hEps,
    persistenceMin: params.persistenceMin,
    unresolvedPolicy: params.unresolvedPolicy
  };
  const out = deriveBasinStructure(shape, h, config);
  const peak = derivePeakStructure(shape, h, config);

  out.peakMaxIdx = peak.peakMaxIdx;
  out.peakMaxH = peak.peakMaxH;
  out.peakSaddleH = peak.peakSaddleH;
  out.peakPersistence = peak.peakPersistence;
  out.peakRiseLike = peak.peakRiseLike;
  out.ridgeLike = peak.ridgeLike;

  return out;
}
