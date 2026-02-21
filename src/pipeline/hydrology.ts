import {
  DIR8_NONE,
  WATER_CLASS_CODE,
  createHydrologyMaps,
  type HydrologyMapsSoA
} from "../domain/hydrology.js";
import { LANDFORM_CODE, type GridShape } from "../domain/topography.js";
import { mix64 } from "../lib/sub-seed.js";

const U64_MASK = 0xffffffffffffffffn;
const X_MIX = 0x9e3779b97f4a7c15n;
const Y_MIX = 0xc2b2ae3d27d4eb4fn;

export const DIR8_NEIGHBORS = [
  { dir: 0, dx: 1, dy: 0 }, // E
  { dir: 1, dx: 1, dy: 1 }, // SE
  { dir: 2, dx: 0, dy: 1 }, // S
  { dir: 3, dx: -1, dy: 1 }, // SW
  { dir: 4, dx: -1, dy: 0 }, // W
  { dir: 5, dx: -1, dy: -1 }, // NW
  { dir: 6, dx: 0, dy: -1 }, // N
  { dir: 7, dx: 1, dy: -1 } // NE
] as const;

export const CANONICAL_DIR8_ORDER = DIR8_NEIGHBORS.map((entry) => entry.dir);

export interface FlowDirectionParams {
  minDropThreshold: number;
  tieEps: number;
}

export interface LakeMaskParams {
  lakeFlatSlopeThreshold: number;
  lakeAccumThreshold: number;
}

export interface StreamMaskParams {
  streamAccumThreshold: number;
  streamMinSlopeThreshold: number;
}

export interface MoistureParams {
  moistureAccumStart: number;
  flatnessThreshold: number;
  waterProxMaxDist: number;
  weights: {
    accum: number;
    flat: number;
    prox: number;
  };
}

export interface WaterClassParams {
  marshMoistureThreshold: number;
  marshSlopeThreshold: number;
}

export interface DistWaterParams {
  waterProxMaxDist: number;
}

export interface DistStreamParams {
  streamProxMaxDist: number;
}

export interface HydrologyParams
  extends FlowDirectionParams,
    LakeMaskParams,
    StreamMaskParams,
    DistWaterParams,
    DistStreamParams,
    MoistureParams,
    WaterClassParams {}

const U32_MAX = 0xffffffff;

function u64(value: bigint): bigint {
  return value & U64_MASK;
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function validateMapLength(shape: GridShape, map: ArrayLike<unknown>, mapName: string): void {
  if (map.length !== shape.size) {
    hydrologyFail("input_contract", "map_length_matches_shape", "map_length_mismatch", {
      map: mapName,
      expected: shape.size,
      actual: map.length
    });
  }
}

function hydrologyFail(
  stage: string,
  invariant: string,
  reason: string,
  context: Record<string, number | string> = {}
): never {
  const contextFields = Object.entries(context).map(([key, value]) => `${key}=${value}`);
  const suffix = contextFields.length > 0 ? ` ${contextFields.join(" ")}` : "";
  throw new Error(
    `Hydrology fail-fast: stage=${stage} invariant=${invariant} reason=${reason}${suffix}`
  );
}

export function tieBreakHash64(seed: bigint, x: number, y: number): bigint {
  let z = u64(seed);
  z = u64(z ^ u64(BigInt(x) * X_MIX));
  z = u64(z ^ u64(BigInt(y) * Y_MIX));
  return mix64(z);
}

export function enumerateRowMajorIndices(shape: GridShape): number[] {
  const out: number[] = [];
  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      out.push(y * shape.width + x);
    }
  }
  return out;
}

export function enumerateNeighborIndices(shape: GridShape, index: number): number[] {
  const x = index % shape.width;
  const y = Math.floor(index / shape.width);
  const out: number[] = [];

  for (const neighbor of DIR8_NEIGHBORS) {
    const nx = x + neighbor.dx;
    const ny = y + neighbor.dy;
    if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
      continue;
    }
    out.push(ny * shape.width + nx);
  }

  return out;
}

export function deriveFlowDirection(
  shape: GridShape,
  h: Float32Array,
  seed: bigint,
  params: FlowDirectionParams
): Uint8Array {
  validateMapLength(shape, h, "H");

  const fd = new Uint8Array(shape.size).fill(DIR8_NONE);
  const { minDropThreshold, tieEps } = params;

  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      const centerIndex = y * shape.width + x;
      const centerHeight = h[centerIndex];

      let maxDrop = Number.NEGATIVE_INFINITY;
      const tiedCandidates: number[] = [];

      for (const neighbor of DIR8_NEIGHBORS) {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }

        const neighborHeight = h[ny * shape.width + nx];
        const drop = centerHeight - neighborHeight;
        if (drop < minDropThreshold) {
          continue;
        }

        if (drop > maxDrop + tieEps) {
          maxDrop = drop;
          tiedCandidates.length = 0;
          tiedCandidates.push(neighbor.dir);
        } else if (Math.abs(drop - maxDrop) <= tieEps) {
          tiedCandidates.push(neighbor.dir);
        }
      }

      if (tiedCandidates.length === 1) {
        fd[centerIndex] = tiedCandidates[0];
      } else if (tiedCandidates.length > 1) {
        const pick = Number(tieBreakHash64(seed, x, y) % BigInt(tiedCandidates.length));
        fd[centerIndex] = tiedCandidates[pick];
      }
    }
  }

  return fd;
}

function downstreamIndex(shape: GridShape, index: number, dir: number, stage: string): number {
  if (dir < 0 || dir > 7) {
    hydrologyFail(stage, "fd_domain", "invalid_fd_code", { index, dir });
  }

  const x = index % shape.width;
  const y = Math.floor(index / shape.width);
  const step = DIR8_NEIGHBORS[dir];
  const nx = x + step.dx;
  const ny = y + step.dy;
  if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
    hydrologyFail(stage, "downstream_in_bounds", "fd_points_outside_grid", {
      index,
      dir,
      width: shape.width,
      height: shape.height
    });
  }
  return ny * shape.width + nx;
}

export function deriveFlowAccumulation(shape: GridShape, fd: Uint8Array): Uint32Array {
  validateMapLength(shape, fd, "FD");

  const fa = new Uint32Array(shape.size).fill(1);
  const inDeg = new Uint8Array(shape.size);

  for (let i = 0; i < shape.size; i += 1) {
    const dir = fd[i];
    if (dir === DIR8_NONE) {
      continue;
    }
    const downstream = downstreamIndex(shape, i, dir, "flow_accumulation");
    inDeg[downstream] += 1;
  }

  const queue: number[] = [];
  for (let i = 0; i < shape.size; i += 1) {
    if (inDeg[i] === 0) {
      queue.push(i);
    }
  }

  let head = 0;
  let processed = 0;
  while (head < queue.length) {
    const tile = queue[head];
    head += 1;
    processed += 1;

    const dir = fd[tile];
    if (dir === DIR8_NONE) {
      continue;
    }

    const downstream = downstreamIndex(shape, tile, dir, "flow_accumulation");
    const sum = fa[downstream] + fa[tile];
    if (sum > U32_MAX) {
      hydrologyFail("flow_accumulation", "uint32_no_overflow", "fa_overflow", {
        tile: downstream,
        current: fa[downstream],
        incoming: fa[tile]
      });
    }
    fa[downstream] = sum;

    inDeg[downstream] -= 1;
    if (inDeg[downstream] === 0) {
      queue.push(downstream);
    }
  }

  if (processed !== shape.size) {
    hydrologyFail("flow_accumulation", "acyclic_fd", "cycle_detected", {
      processed,
      size: shape.size
    });
  }

  return fa;
}

export function deriveInDegree(shape: GridShape, fd: Uint8Array): Uint8Array {
  validateMapLength(shape, fd, "FD");
  const inDeg = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    const dir = fd[i];
    if (dir === DIR8_NONE) {
      continue;
    }
    const downstream = downstreamIndex(shape, i, dir, "flow_accumulation");
    inDeg[downstream] += 1;
  }
  return inDeg;
}

export function normalizeFlowAccumulation(fa: Uint32Array): Float32Array {
  let faMin = Number.POSITIVE_INFINITY;
  let faMax = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < fa.length; i += 1) {
    const value = fa[i];
    if (value < faMin) {
      faMin = value;
    }
    if (value > faMax) {
      faMax = value;
    }
  }

  const out = new Float32Array(fa.length);
  if (faMax === faMin) {
    return out;
  }

  const logMin = Math.log(faMin);
  const logMax = Math.log(faMax);
  const denom = logMax - logMin;
  for (let i = 0; i < fa.length; i += 1) {
    const normalized = (Math.log(fa[i]) - logMin) / denom;
    out[i] = clamp01(normalized);
  }
  return out;
}

function floodFillMask(shape: GridShape, candidate: Uint8Array): Uint8Array {
  const mask = new Uint8Array(shape.size);

  for (let start = 0; start < shape.size; start += 1) {
    if (candidate[start] === 0 || mask[start] === 1) {
      continue;
    }

    const queue: number[] = [start];
    mask[start] = 1;
    let head = 0;
    while (head < queue.length) {
      const tile = queue[head];
      head += 1;
      const x = tile % shape.width;
      const y = Math.floor(tile / shape.width);

      for (const neighbor of DIR8_NEIGHBORS) {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }
        const next = ny * shape.width + nx;
        if (candidate[next] === 1 && mask[next] === 0) {
          mask[next] = 1;
          queue.push(next);
        }
      }
    }
  }

  return mask;
}

export function deriveLakeMask(
  shape: GridShape,
  landform: Uint8Array,
  slopeMag: Float32Array,
  faN: Float32Array,
  params: LakeMaskParams
): Uint8Array {
  validateMapLength(shape, landform, "Landform");
  validateMapLength(shape, slopeMag, "SlopeMag");
  validateMapLength(shape, faN, "FA_N");
  const flatSlopeThreshold = Math.fround(params.lakeFlatSlopeThreshold);
  const accumThreshold = Math.fround(params.lakeAccumThreshold);

  const candidate = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    if (
      landform[i] === LANDFORM_CODE.basin &&
      slopeMag[i] < flatSlopeThreshold &&
      faN[i] >= accumThreshold
    ) {
      candidate[i] = 1;
    }
  }

  return floodFillMask(shape, candidate);
}

export function deriveStreamMask(
  shape: GridShape,
  lakeMask: Uint8Array,
  faN: Float32Array,
  slopeMag: Float32Array,
  params: StreamMaskParams
): Uint8Array {
  validateMapLength(shape, lakeMask, "LakeMask");
  validateMapLength(shape, faN, "FA_N");
  validateMapLength(shape, slopeMag, "SlopeMag");
  const accumThreshold = Math.fround(params.streamAccumThreshold);
  const minSlopeThreshold = Math.fround(params.streamMinSlopeThreshold);

  const stream = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    if (
      lakeMask[i] === 0 &&
      faN[i] >= accumThreshold &&
      slopeMag[i] >= minSlopeThreshold
    ) {
      stream[i] = 1;
    }
  }
  return stream;
}

export function deriveMoisture(
  shape: GridShape,
  faN: Float32Array,
  slopeMag: Float32Array,
  distWater: Uint32Array,
  params: MoistureParams
): Float32Array {
  validateMapLength(shape, faN, "FA_N");
  validateMapLength(shape, slopeMag, "SlopeMag");
  validateMapLength(shape, distWater, "distWater");

  const out = new Float32Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    const wetAccum = clamp01(
      (faN[i] - params.moistureAccumStart) / (1 - params.moistureAccumStart)
    );
    const wetFlat = clamp01((params.flatnessThreshold - slopeMag[i]) / params.flatnessThreshold);
    const wetProx = clamp01(1 - distWater[i] / params.waterProxMaxDist);
    out[i] = clamp01(
      params.weights.accum * wetAccum +
        params.weights.flat * wetFlat +
        params.weights.prox * wetProx
    );
  }
  return out;
}

export function classifyWaterClass(
  shape: GridShape,
  lakeMask: Uint8Array,
  isStream: Uint8Array,
  moisture: Float32Array,
  slopeMag: Float32Array,
  params: WaterClassParams
): Uint8Array {
  validateMapLength(shape, lakeMask, "LakeMask");
  validateMapLength(shape, isStream, "isStream");
  validateMapLength(shape, moisture, "Moisture");
  validateMapLength(shape, slopeMag, "SlopeMag");
  const marshMoistureThreshold = Math.fround(params.marshMoistureThreshold);
  const marshSlopeThreshold = Math.fround(params.marshSlopeThreshold);

  const waterClass = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    if (lakeMask[i] === 1) {
      waterClass[i] = WATER_CLASS_CODE.lake;
      continue;
    }
    if (isStream[i] === 1) {
      waterClass[i] = WATER_CLASS_CODE.stream;
      continue;
    }
    if (moisture[i] >= marshMoistureThreshold && slopeMag[i] < marshSlopeThreshold) {
      waterClass[i] = WATER_CLASS_CODE.marsh;
      continue;
    }
    waterClass[i] = WATER_CLASS_CODE.none;
  }
  return waterClass;
}

function deriveDistanceFromSources(
  shape: GridShape,
  sources: Uint8Array,
  maxDist: number
): Uint32Array {
  const out = new Uint32Array(shape.size).fill(maxDist);
  const queue: number[] = [];

  for (let i = 0; i < shape.size; i += 1) {
    if (sources[i] === 1) {
      out[i] = 0;
      queue.push(i);
    }
  }

  if (queue.length === 0) {
    return out;
  }

  let head = 0;
  while (head < queue.length) {
    const tile = queue[head];
    head += 1;
    const baseDist = out[tile];
    if (baseDist >= maxDist) {
      continue;
    }

    const x = tile % shape.width;
    const y = Math.floor(tile / shape.width);
    for (const neighbor of DIR8_NEIGHBORS) {
      const nx = x + neighbor.dx;
      const ny = y + neighbor.dy;
      if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
        continue;
      }
      const next = ny * shape.width + nx;
      if (out[next] !== maxDist) {
        continue;
      }
      out[next] = Math.min(maxDist, baseDist + 1);
      queue.push(next);
    }
  }

  return out;
}

export function deriveDistWater(
  shape: GridShape,
  lakeMask: Uint8Array,
  isStream: Uint8Array,
  params: DistWaterParams
): Uint32Array {
  validateMapLength(shape, lakeMask, "LakeMask");
  validateMapLength(shape, isStream, "isStream");
  const source = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    source[i] = lakeMask[i] === 1 || isStream[i] === 1 ? 1 : 0;
  }
  return deriveDistanceFromSources(shape, source, params.waterProxMaxDist);
}

export function deriveDistStream(
  shape: GridShape,
  isStream: Uint8Array,
  params: DistStreamParams
): Uint32Array {
  validateMapLength(shape, isStream, "isStream");
  return deriveDistanceFromSources(shape, isStream, params.streamProxMaxDist);
}

export function deriveHydrology(
  shape: GridShape,
  h: Float32Array,
  slopeMag: Float32Array,
  landform: Uint8Array,
  seed: bigint,
  params: HydrologyParams
): HydrologyMapsSoA {
  const maps = createHydrologyMaps(shape);
  maps.fd = deriveFlowDirection(shape, h, seed, params);
  maps.inDeg = deriveInDegree(shape, maps.fd);
  maps.fa = deriveFlowAccumulation(shape, maps.fd);
  maps.faN = normalizeFlowAccumulation(maps.fa);
  maps.lakeMask = deriveLakeMask(shape, landform, slopeMag, maps.faN, params);
  maps.isStream = deriveStreamMask(shape, maps.lakeMask, maps.faN, slopeMag, params);
  maps.distWater = deriveDistWater(shape, maps.lakeMask, maps.isStream, params);
  maps.moisture = deriveMoisture(shape, maps.faN, slopeMag, maps.distWater, params);
  maps.waterClass = classifyWaterClass(
    shape,
    maps.lakeMask,
    maps.isStream,
    maps.moisture,
    slopeMag,
    params
  );
  return maps;
}

export { DIR8_NONE, WATER_CLASS_CODE, createHydrologyMaps };
