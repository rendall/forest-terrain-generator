import {
  createTopographicStructureMaps,
  type GridShape,
  indexOf
} from "../domain/topography.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";

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
  unresolvedPolicy: "nan" | "max_h";
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

interface BasinMergeEvent {
  winnerMinimum: number;
  loserMinimum: number;
  level: number;
}

interface PeakMergeEvent {
  winnerMaximum: number;
  loserMaximum: number;
  level: number;
}

interface FeatureBuildResult {
  nodes: TopographicFeatureNode[];
  tileLeafFeatureIds: string[];
}

const FEATURE_ID_WIDTH = 5;

export function makeFeatureId(prefix: "b" | "p", ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new Error(`Topographic structure: invalid feature ordinal "${String(ordinal)}".`);
  }
  return `${prefix}_${String(ordinal).padStart(FEATURE_ID_WIDTH, "0")}`;
}

export function featureIdToOrdinal(featureId: string): number {
  const [, suffix] = featureId.split("_");
  const parsed = Number.parseInt(suffix ?? "", 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function sortFeatureIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ao = featureIdToOrdinal(a);
    const bo = featureIdToOrdinal(b);
    if (ao !== bo) {
      return ao - bo;
    }
    return a.localeCompare(b);
  });
}

export function sortFeatureNodes(nodes: readonly TopographicFeatureNode[]): TopographicFeatureNode[] {
  return [...nodes].sort((a, b) => {
    const ao = featureIdToOrdinal(a.id);
    const bo = featureIdToOrdinal(b.id);
    if (ao !== bo) {
      return ao - bo;
    }
    return a.id.localeCompare(b.id);
  });
}

function createEmptyBbox() {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };
}

function cloneNode(node: TopographicFeatureNode): TopographicFeatureNode {
  return {
    ...node,
    childIds: [...node.childIds],
    ...(node.tileIds ? { tileIds: [...node.tileIds] } : {})
  };
}

function updateNodeTileStats(
  node: TopographicFeatureNode,
  shape: GridShape,
  tileIndex: number,
  tileH: number
): void {
  const x = tileIndex % shape.width;
  const y = Math.floor(tileIndex / shape.width);
  node.size += 1;
  node.minH = Math.min(node.minH, tileH);
  node.maxH = Math.max(node.maxH, tileH);
  node.bbox.minX = Math.min(node.bbox.minX, x);
  node.bbox.minY = Math.min(node.bbox.minY, y);
  node.bbox.maxX = Math.max(node.bbox.maxX, x);
  node.bbox.maxY = Math.max(node.bbox.maxY, y);
  if (node.tileIds) {
    node.tileIds.push(tileIndex);
  }
}

function finalizeNode(node: TopographicFeatureNode): TopographicFeatureNode {
  if (!Number.isFinite(node.minH)) {
    node.minH = Number.NaN;
  }
  if (!Number.isFinite(node.maxH)) {
    node.maxH = Number.NaN;
  }
  if (node.size === 0) {
    node.bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return node;
}

function assignMergeToChild(node: TopographicFeatureNode, mergeH: number): void {
  if (node.mergeH === null) {
    node.mergeH = mergeH;
    node.persistence = Math.max(0, mergeH - node.birthH);
  }
}

function buildBasinFeatureTree(
  shape: GridShape,
  h: Float32Array,
  tileBasinMin: Int32Array,
  minHByMinimum: Float32Array,
  mergeEvents: BasinMergeEvent[],
  config: TopographicStructureConfig
): FeatureBuildResult {
  const leafLabels = Array.from(
    new Set(Array.from(tileBasinMin).filter((label) => label >= 0))
  ).sort((a, b) => {
    const ah = minHByMinimum[a];
    const bh = minHByMinimum[b];
    if (ah < bh) {
      return -1;
    }
    if (ah > bh) {
      return 1;
    }
    return a - b;
  });

  const nodeById = new Map<string, TopographicFeatureNode>();
  const leafIdByLabel = new Map<number, string>();
  const currentNodeIdByLabel = new Map<number, string>();
  const tileLeafFeatureIds = new Array<string>(shape.size).fill("");
  let nextOrdinal = 0;

  for (const label of leafLabels) {
    const id = makeFeatureId("b", nextOrdinal);
    nextOrdinal += 1;
    const node: TopographicFeatureNode = {
      id,
      kind: "leaf",
      parentId: null,
      childIds: [],
      birthH: minHByMinimum[label],
      mergeH: null,
      persistence: null,
      minH: Number.POSITIVE_INFINITY,
      maxH: Number.NEGATIVE_INFINITY,
      size: 0,
      bbox: createEmptyBbox(),
      tileIds: []
    };
    nodeById.set(id, node);
    leafIdByLabel.set(label, id);
    currentNodeIdByLabel.set(label, id);
  }

  for (let tile = 0; tile < shape.size; tile += 1) {
    const label = tileBasinMin[tile];
    const leafId = leafIdByLabel.get(label);
    if (!leafId) {
      continue;
    }
    tileLeafFeatureIds[tile] = leafId;
    const node = nodeById.get(leafId);
    if (!node) {
      continue;
    }
    updateNodeTileStats(node, shape, tile, h[tile]);
  }

  for (const event of mergeEvents) {
    const winnerNodeId = currentNodeIdByLabel.get(event.winnerMinimum);
    const loserNodeId = currentNodeIdByLabel.get(event.loserMinimum);
    if (!winnerNodeId || !loserNodeId || winnerNodeId === loserNodeId) {
      continue;
    }
    const winnerNode = nodeById.get(winnerNodeId);
    const loserNode = nodeById.get(loserNodeId);
    if (!winnerNode || !loserNode) {
      continue;
    }

    assignMergeToChild(winnerNode, event.level);
    assignMergeToChild(loserNode, event.level);

    const id = makeFeatureId("b", nextOrdinal);
    nextOrdinal += 1;
    const composite: TopographicFeatureNode = {
      id,
      kind: "composite",
      parentId: null,
      childIds: sortFeatureIds([winnerNodeId, loserNodeId]),
      birthH: event.level,
      mergeH: null,
      persistence: null,
      minH: Math.min(winnerNode.minH, loserNode.minH),
      maxH: Math.max(winnerNode.maxH, loserNode.maxH),
      size: winnerNode.size + loserNode.size,
      bbox: {
        minX: Math.min(winnerNode.bbox.minX, loserNode.bbox.minX),
        minY: Math.min(winnerNode.bbox.minY, loserNode.bbox.minY),
        maxX: Math.max(winnerNode.bbox.maxX, loserNode.bbox.maxX),
        maxY: Math.max(winnerNode.bbox.maxY, loserNode.bbox.maxY)
      }
    };

    winnerNode.parentId = id;
    loserNode.parentId = id;
    nodeById.set(id, composite);
    currentNodeIdByLabel.set(event.winnerMinimum, id);
  }

  if (config.unresolvedPolicy === "max_h") {
    let maxH = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < h.length; i += 1) {
      if (h[i] > maxH) {
        maxH = h[i];
      }
    }
    for (const node of nodeById.values()) {
      if (node.parentId === null && node.mergeH === null) {
        node.mergeH = maxH;
        node.persistence = Math.max(0, maxH - node.birthH);
      }
    }
  }

  const nodes = sortFeatureNodes(
    Array.from(nodeById.values()).map((node) => finalizeNode(cloneNode(node)))
  );
  return removeMapWideFeatures(shape, nodes, tileLeafFeatureIds);
}

function buildPeakFeatureTree(
  shape: GridShape,
  h: Float32Array,
  tilePeakMax: Int32Array,
  maxHByMaximum: Float32Array,
  mergeEvents: PeakMergeEvent[]
): FeatureBuildResult {
  const leafLabels = Array.from(
    new Set(Array.from(tilePeakMax).filter((label) => label >= 0))
  ).sort((a, b) => {
    const ah = maxHByMaximum[a];
    const bh = maxHByMaximum[b];
    if (ah > bh) {
      return -1;
    }
    if (ah < bh) {
      return 1;
    }
    return a - b;
  });

  const nodeById = new Map<string, TopographicFeatureNode>();
  const leafIdByLabel = new Map<number, string>();
  const currentNodeIdByLabel = new Map<number, string>();
  const tileLeafFeatureIds = new Array<string>(shape.size).fill("");
  let nextOrdinal = 0;

  for (const label of leafLabels) {
    const id = makeFeatureId("p", nextOrdinal);
    nextOrdinal += 1;
    const node: TopographicFeatureNode = {
      id,
      kind: "leaf",
      parentId: null,
      childIds: [],
      birthH: maxHByMaximum[label],
      mergeH: null,
      persistence: null,
      minH: Number.POSITIVE_INFINITY,
      maxH: Number.NEGATIVE_INFINITY,
      size: 0,
      bbox: createEmptyBbox(),
      tileIds: []
    };
    nodeById.set(id, node);
    leafIdByLabel.set(label, id);
    currentNodeIdByLabel.set(label, id);
  }

  for (let tile = 0; tile < shape.size; tile += 1) {
    const label = tilePeakMax[tile];
    const leafId = leafIdByLabel.get(label);
    if (!leafId) {
      continue;
    }
    tileLeafFeatureIds[tile] = leafId;
    const node = nodeById.get(leafId);
    if (!node) {
      continue;
    }
    updateNodeTileStats(node, shape, tile, h[tile]);
  }

  for (const event of mergeEvents) {
    const winnerNodeId = currentNodeIdByLabel.get(event.winnerMaximum);
    const loserNodeId = currentNodeIdByLabel.get(event.loserMaximum);
    if (!winnerNodeId || !loserNodeId || winnerNodeId === loserNodeId) {
      continue;
    }
    const winnerNode = nodeById.get(winnerNodeId);
    const loserNode = nodeById.get(loserNodeId);
    if (!winnerNode || !loserNode) {
      continue;
    }

    assignMergeToChild(winnerNode, event.level);
    assignMergeToChild(loserNode, event.level);

    const id = makeFeatureId("p", nextOrdinal);
    nextOrdinal += 1;
    const composite: TopographicFeatureNode = {
      id,
      kind: "composite",
      parentId: null,
      childIds: sortFeatureIds([winnerNodeId, loserNodeId]),
      birthH: event.level,
      mergeH: null,
      persistence: null,
      minH: Math.min(winnerNode.minH, loserNode.minH),
      maxH: Math.max(winnerNode.maxH, loserNode.maxH),
      size: winnerNode.size + loserNode.size,
      bbox: {
        minX: Math.min(winnerNode.bbox.minX, loserNode.bbox.minX),
        minY: Math.min(winnerNode.bbox.minY, loserNode.bbox.minY),
        maxX: Math.max(winnerNode.bbox.maxX, loserNode.bbox.maxX),
        maxY: Math.max(winnerNode.bbox.maxY, loserNode.bbox.maxY)
      }
    };

    winnerNode.parentId = id;
    loserNode.parentId = id;
    nodeById.set(id, composite);
    currentNodeIdByLabel.set(event.winnerMaximum, id);
  }

  const nodes = sortFeatureNodes(
    Array.from(nodeById.values()).map((node) => finalizeNode(cloneNode(node)))
  );
  return removeMapWideFeatures(shape, nodes, tileLeafFeatureIds);
}

function collectActiveCompositeIdsByTile(
  tileLeafIds: readonly string[],
  nodes: readonly TopographicFeatureNode[],
  persistenceMin: number
): string[][] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  return tileLeafIds.map((leafId) => {
    if (!leafId) {
      return [];
    }
    const active: string[] = [];
    let cursor = nodeById.get(leafId);
    while (cursor?.parentId) {
      const parent = nodeById.get(cursor.parentId);
      if (!parent) {
        break;
      }
      if (
        parent.kind === "composite" &&
        parent.persistence !== null &&
        parent.persistence >= persistenceMin
      ) {
        active.push(parent.id);
      }
      cursor = parent;
    }
    return sortFeatureIds(active);
  });
}

function removeMapWideFeatures(
  shape: GridShape,
  nodes: readonly TopographicFeatureNode[],
  tileLeafFeatureIds: readonly string[]
): FeatureBuildResult {
  const removedIds = new Set(
    nodes.filter((node) => node.size === shape.size).map((node) => node.id)
  );
  if (removedIds.size === 0) {
    return {
      nodes: sortFeatureNodes(nodes),
      tileLeafFeatureIds: [...tileLeafFeatureIds]
    };
  }

  const filteredNodes = sortFeatureNodes(
    nodes
      .filter((node) => !removedIds.has(node.id))
      .map((node) => ({
        ...node,
        parentId:
          node.parentId && !removedIds.has(node.parentId)
            ? node.parentId
            : null,
        childIds: sortFeatureIds(
          node.childIds.filter((id) => !removedIds.has(id))
        ),
        ...(node.tileIds ? { tileIds: [...node.tileIds] } : {})
      }))
  );

  const filteredTileLeafIds = tileLeafFeatureIds.map((id) =>
    removedIds.has(id) ? "" : id
  );

  return {
    nodes: filteredNodes,
    tileLeafFeatureIds: filteredTileLeafIds
  };
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
  if (
    config.unresolvedPolicy !== "nan" &&
    config.unresolvedPolicy !== "max_h"
  ) {
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
  mergeEvents: BasinMergeEvent[],
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
  mergeEvents.push({
    winnerMinimum: meta.minIdx[winner],
    loserMinimum,
    level
  });

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
  const mergeEvents: BasinMergeEvent[] = [];
  let maxH = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < h.length; i += 1) {
    if (h[i] > maxH) {
      maxH = h[i];
    }
  }

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
          mergeEvents,
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
    const unresolved = Number.isNaN(spillByMinimum[minimum]);
    const spillH =
      unresolved && config.unresolvedPolicy === "max_h"
        ? maxH
        : spillByMinimum[minimum];
    out.basinMinH[i] = minH;
    out.basinSpillH[i] = spillH;
    if (Number.isNaN(spillH)) {
      continue;
    }

    const persistence = Math.max(0, spillH - minH);
    out.basinPersistence[i] = persistence;
    out.basinDepthLike[i] = Math.max(0, spillH - h[i]);
  }

  for (let i = 0; i < shape.size; i += 1) {
    const persistence = out.basinPersistence[i];
    if (
      Number.isFinite(persistence) &&
      persistence >= config.persistenceMin
    ) {
      out.basinLike[i] = 1;
    }
  }

  const basinFeatures = buildBasinFeatureTree(
    shape,
    h,
    tileBasinMin,
    minHByMinimum,
    mergeEvents,
    config
  );
  out.basinFeatures = basinFeatures.nodes;
  out.tileFeatureIds = basinFeatures.tileLeafFeatureIds.map((id) =>
    id ? [id] : []
  );
  out.tileActiveFeatureIds = collectActiveCompositeIdsByTile(
    basinFeatures.tileLeafFeatureIds,
    basinFeatures.nodes,
    config.persistenceMin
  );

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
  mergeEvents: PeakMergeEvent[],
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
  mergeEvents.push({
    winnerMaximum: meta.maxIdx[winner],
    loserMaximum,
    level
  });

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
  const mergeEvents: PeakMergeEvent[] = [];

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
          mergeEvents,
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
  }

  for (let i = 0; i < shape.size; i += 1) {
    const persistence = out.peakPersistence[i];
    if (
      Number.isFinite(persistence) &&
      persistence >= config.persistenceMin
    ) {
      out.ridgeLike[i] = 1;
    }
  }

  const peakFeatures = buildPeakFeatureTree(
    shape,
    h,
    tilePeakMax,
    maxHByMaximum,
    mergeEvents
  );
  out.peakFeatures = peakFeatures.nodes;
  out.tileFeatureIds = peakFeatures.tileLeafFeatureIds.map((id) =>
    id ? [id] : []
  );
  out.tileActiveFeatureIds = collectActiveCompositeIdsByTile(
    peakFeatures.tileLeafFeatureIds,
    peakFeatures.nodes,
    config.persistenceMin
  );

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
  out.peakFeatures = peak.peakFeatures;
  out.tileFeatureIds = out.tileFeatureIds.map((basinIds, index) =>
    sortFeatureIds([...basinIds, ...peak.tileFeatureIds[index]])
  );
  out.tileActiveFeatureIds = out.tileActiveFeatureIds.map((basinIds, index) =>
    sortFeatureIds([...basinIds, ...peak.tileActiveFeatureIds[index]])
  );

  return out;
}
