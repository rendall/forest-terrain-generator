import { BIOME_CODE } from "../domain/ecology.js";
import { WATER_CLASS_CODE } from "../domain/hydrology.js";
import { LANDFORM_CODE, type GridShape } from "../domain/topography.js";

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
    throw new Error(
      `Navigation ${mapName} length mismatch: expected ${shape.size}, got ${map.length}.`
    );
  }
}

function isNonPlayable(shape: GridShape, x: number, y: number, playableInset: number): boolean {
  if (playableInset <= 0) {
    return false;
  }
  return (
    x < playableInset ||
    y < playableInset ||
    x >= shape.width - playableInset ||
    y >= shape.height - playableInset
  );
}

const DIR8_STEPS = [
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 }
] as const;

export interface TrailDistStreamParams {
  streamProxMaxDist: number;
}

export interface TrailDistWaterParams {
  waterSeedMaxDist: number;
}

export interface TrailCostInputs {
  slopeMag: Float32Array;
  moisture: Float32Array;
  obstruction: Float32Array;
  landform: Uint8Array;
  waterClass: Uint8Array;
  isStream: Uint8Array;
}

export interface TrailSeedInputs {
  firmness: Float32Array;
  moisture: Float32Array;
  slopeMag: Float32Array;
  waterClass: Uint8Array;
}

export interface TrailCostParams {
  playableInset: number;
  inf: number;
  wSlope: number;
  slopeScale: number;
  wMoist: number;
  moistStart: number;
  wObs: number;
  wRidge: number;
  wStreamProx: number;
  streamProxMaxDist: number;
  wCross: number;
  wMarsh: number;
}

export interface TrailSeedParams {
  playableInset: number;
  waterSeedMaxDist: number;
  seedTilesPerTrail: number;
}

export interface TrailEndpointInputs {
  waterClass: Uint8Array;
  faN: Float32Array;
  landform: Uint8Array;
  slopeMag: Float32Array;
}

export interface TrailEndpointParams {
  streamEndpointAccumThreshold: number;
  ridgeEndpointMaxSlope: number;
}

export interface TrailRouteRequest {
  kind: "seed_to_water" | "seed_to_ridge";
  seedIndex: number;
  endpointIndex: number;
}

export interface TrailPlanInputs {
  seed: TrailSeedInputs;
  endpoint: TrailEndpointInputs;
}

export interface TrailPlanParams {
  seed: TrailSeedParams;
  endpoint: TrailEndpointParams;
}

export interface TrailPlan {
  seedIndices: number[];
  routeRequests: TrailRouteRequest[];
}

export interface TrailRouteExecutionResult {
  requested: number;
  skippedUnreachable: number;
  successfulPaths: number[][];
}

export interface TrailMarkedMaps {
  gameTrail: Uint8Array;
  gameTrailId: Int32Array;
}

export interface MoveCostInputs {
  obstruction: Float32Array;
  moisture: Float32Array;
  waterClass: Uint8Array;
  biome: Uint8Array;
  gameTrail: Uint8Array;
}

export interface MoveCostParams {
  moveCostObstructionMax: number;
  moveCostMoistureMax: number;
  marshMoveCostMultiplier: number;
  openBogMoveCostMultiplier: number;
  gameTrailMoveCostMultiplier: number;
}

export interface TrailRoutingParams {
  inf: number;
  diagWeight: number;
  tieEps: number;
}

export interface DirectionalPassabilityInputs {
  h: Float32Array;
  moisture: Float32Array;
  slopeMag: Float32Array;
  waterClass: Uint8Array;
  playableInset: number;
}

export interface DirectionalPassabilityParams {
  steepBlockDelta: number;
  steepDifficultDelta: number;
  cliffSlopeMin: number;
}

export interface DirectionalPassabilityMaps {
  passabilityPacked: Uint16Array;
  cliffEdgePacked: Uint8Array;
}

export interface FollowableInputs {
  waterClass: Uint8Array;
  landform: Uint8Array;
  gameTrail: Uint8Array;
}

interface FrontierEntry {
  index: number;
  cost: number;
  stepDir: number;
}

const PASSABILITY_CODE = {
  passable: 0,
  difficult: 1,
  blocked: 2
} as const;

const PASS_DIR_ORDER = [
  { key: "N", dx: 0, dy: -1 },
  { key: "NE", dx: 1, dy: -1 },
  { key: "E", dx: 1, dy: 0 },
  { key: "SE", dx: 1, dy: 1 },
  { key: "S", dx: 0, dy: 1 },
  { key: "SW", dx: -1, dy: 1 },
  { key: "W", dx: -1, dy: 0 },
  { key: "NW", dx: -1, dy: -1 }
] as const;

const FOLLOWABLE_FLAG_BIT = {
  stream: 1 << 0,
  ridge: 1 << 1,
  game_trail: 1 << 2,
  shore: 1 << 3
} as const;

const FOLLOWABLE_ORDER = [
  { bit: FOLLOWABLE_FLAG_BIT.stream, name: "stream" },
  { bit: FOLLOWABLE_FLAG_BIT.ridge, name: "ridge" },
  { bit: FOLLOWABLE_FLAG_BIT.game_trail, name: "game_trail" },
  { bit: FOLLOWABLE_FLAG_BIT.shore, name: "shore" }
] as const;

export function deriveTrailDistStream(
  shape: GridShape,
  isStream: Uint8Array,
  params: TrailDistStreamParams
): Uint32Array {
  validateMapLength(shape, isStream, "isStream");

  const maxDist = Math.max(0, Math.floor(params.streamProxMaxDist));
  const dist = new Uint32Array(shape.size).fill(maxDist);
  const queue: number[] = [];

  for (let i = 0; i < shape.size; i += 1) {
    if (isStream[i] === 1) {
      dist[i] = 0;
      queue.push(i);
    }
  }

  if (queue.length === 0) {
    return dist;
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;

    const currentDist = dist[current];
    if (currentDist >= maxDist) {
      continue;
    }

    const x = current % shape.width;
    const y = Math.floor(current / shape.width);

    for (const step of DIR8_STEPS) {
      const nx = x + step.dx;
      const ny = y + step.dy;
      if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
        continue;
      }

      const nextIndex = ny * shape.width + nx;
      const nextDist = currentDist + 1;
      if (nextDist < dist[nextIndex] && nextDist <= maxDist) {
        dist[nextIndex] = nextDist;
        queue.push(nextIndex);
      }
    }
  }

  return dist;
}

export function deriveTrailDistWater(
  shape: GridShape,
  waterClass: Uint8Array,
  params: TrailDistWaterParams
): Uint32Array {
  validateMapLength(shape, waterClass, "WaterClass");

  const maxDist = Math.max(0, Math.floor(params.waterSeedMaxDist));
  const dist = new Uint32Array(shape.size).fill(maxDist);
  const queue: number[] = [];

  for (let i = 0; i < shape.size; i += 1) {
    if (waterClass[i] === WATER_CLASS_CODE.stream || waterClass[i] === WATER_CLASS_CODE.lake) {
      dist[i] = 0;
      queue.push(i);
    }
  }

  if (queue.length === 0) {
    return dist;
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;

    const currentDist = dist[current];
    if (currentDist >= maxDist) {
      continue;
    }

    const x = current % shape.width;
    const y = Math.floor(current / shape.width);
    for (const step of DIR8_STEPS) {
      const nx = x + step.dx;
      const ny = y + step.dy;
      if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
        continue;
      }

      const nextIndex = ny * shape.width + nx;
      const nextDist = currentDist + 1;
      if (nextDist < dist[nextIndex] && nextDist <= maxDist) {
        dist[nextIndex] = nextDist;
        queue.push(nextIndex);
      }
    }
  }

  return dist;
}

function computeStreamProximityBonus(
  dist: number,
  streamProxMaxDist: number,
  wStreamProx: number
): number {
  if (streamProxMaxDist <= 0) {
    return 0;
  }

  const ratio = clamp01(1 - dist / streamProxMaxDist);
  return -wStreamProx * ratio;
}

function computeMoistureTerm(moisture: number, moistStart: number, wMoist: number): number {
  const denom = 1 - moistStart;
  if (denom <= 0) {
    return moisture > moistStart ? wMoist : 0;
  }
  return wMoist * clamp01((moisture - moistStart) / denom);
}

function computeSeedCount(shape: GridShape, playableInset: number, seedTilesPerTrail: number): number {
  const inset = Math.max(0, Math.floor(playableInset));
  const playableWidth = shape.width - 2 * inset;
  const playableHeight = shape.height - 2 * inset;
  const playableArea = Math.max(0, playableWidth * playableHeight);
  const tilesPerTrail = Math.max(1, Math.floor(seedTilesPerTrail));

  const count = Math.floor(playableArea / tilesPerTrail);
  return count < 1 ? 1 : count;
}

function computeWaterSeedScore(
  firmness: number,
  moisture: number,
  slopeMag: number,
  distWater: number,
  waterSeedMaxDist: number
): number {
  const firmTerm = 0.35 * clamp01((firmness - 0.35) / 0.65);
  const moistureTerm = 0.25 * clamp01(1 - Math.abs(moisture - 0.55) / 0.55);
  const slopeTerm = 0.2 * clamp01(1 - slopeMag / 0.25);
  const proxTerm =
    waterSeedMaxDist > 0 ? 0.2 * clamp01(1 - distWater / waterSeedMaxDist) : 0;

  return firmTerm + moistureTerm + slopeTerm + proxTerm;
}

export function selectTrailSeeds(
  shape: GridShape,
  inputs: TrailSeedInputs,
  params: TrailSeedParams
): number[] {
  validateMapLength(shape, inputs.firmness, "Firmness");
  validateMapLength(shape, inputs.moisture, "Moisture");
  validateMapLength(shape, inputs.slopeMag, "SlopeMag");
  validateMapLength(shape, inputs.waterClass, "WaterClass");

  const distWater = deriveTrailDistWater(shape, inputs.waterClass, {
    waterSeedMaxDist: params.waterSeedMaxDist
  });
  const seedCount = computeSeedCount(shape, params.playableInset, params.seedTilesPerTrail);
  const candidates: Array<{ index: number; score: number }> = [];

  for (let i = 0; i < shape.size; i += 1) {
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);
    const playable = !isNonPlayable(shape, x, y, params.playableInset);
    if (!playable) {
      continue;
    }
    if (inputs.waterClass[i] === WATER_CLASS_CODE.lake) {
      continue;
    }
    if (inputs.moisture[i] >= 0.92) {
      continue;
    }
    if (inputs.slopeMag[i] >= 0.3) {
      continue;
    }

    candidates.push({
      index: i,
      score: computeWaterSeedScore(
        inputs.firmness[i],
        inputs.moisture[i],
        inputs.slopeMag[i],
        distWater[i],
        params.waterSeedMaxDist
      )
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }

    const ax = a.index % shape.width;
    const ay = Math.floor(a.index / shape.width);
    const bx = b.index % shape.width;
    const by = Math.floor(b.index / shape.width);

    if (ay !== by) {
      return ay - by;
    }
    return ax - bx;
  });

  const selectedCount = Math.min(seedCount, candidates.length);
  return candidates.slice(0, selectedCount).map((entry) => entry.index);
}

function chebyshevDistance(shape: GridShape, fromIndex: number, toIndex: number): number {
  const fx = fromIndex % shape.width;
  const fy = Math.floor(fromIndex / shape.width);
  const tx = toIndex % shape.width;
  const ty = Math.floor(toIndex / shape.width);
  return Math.max(Math.abs(fx - tx), Math.abs(fy - ty));
}

function selectNearestEndpoint(
  shape: GridShape,
  seedIndex: number,
  candidates: number[]
): number | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  let bestIndex = candidates[0];
  let bestDistance = chebyshevDistance(shape, seedIndex, bestIndex);

  for (let i = 1; i < candidates.length; i += 1) {
    const candidateIndex = candidates[i];
    const candidateDistance = chebyshevDistance(shape, seedIndex, candidateIndex);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestIndex = candidateIndex;
      continue;
    }

    if (candidateDistance === bestDistance && candidateIndex < bestIndex) {
      bestIndex = candidateIndex;
    }
  }

  return bestIndex;
}

export function buildTrailRouteRequests(
  shape: GridShape,
  seedIndices: number[],
  inputs: TrailEndpointInputs,
  params: TrailEndpointParams
): TrailRouteRequest[] {
  validateMapLength(shape, inputs.waterClass, "WaterClass");
  validateMapLength(shape, inputs.faN, "FA_N");
  validateMapLength(shape, inputs.landform, "Landform");
  validateMapLength(shape, inputs.slopeMag, "SlopeMag");

  const streamCandidates: number[] = [];
  const ridgeCandidates: number[] = [];
  for (let i = 0; i < shape.size; i += 1) {
    if (
      inputs.waterClass[i] === WATER_CLASS_CODE.stream &&
      inputs.faN[i] >= params.streamEndpointAccumThreshold
    ) {
      streamCandidates.push(i);
    }
    if (
      inputs.landform[i] === LANDFORM_CODE.ridge &&
      inputs.slopeMag[i] < params.ridgeEndpointMaxSlope
    ) {
      ridgeCandidates.push(i);
    }
  }

  const routeRequests: TrailRouteRequest[] = [];
  for (const seedIndex of seedIndices) {
    const waterEndpoint = selectNearestEndpoint(shape, seedIndex, streamCandidates);
    if (waterEndpoint !== undefined) {
      routeRequests.push({
        kind: "seed_to_water",
        seedIndex,
        endpointIndex: waterEndpoint
      });
    }

    const ridgeEndpoint = selectNearestEndpoint(shape, seedIndex, ridgeCandidates);
    if (ridgeEndpoint !== undefined) {
      routeRequests.push({
        kind: "seed_to_ridge",
        seedIndex,
        endpointIndex: ridgeEndpoint
      });
    }
  }

  return routeRequests;
}

function compareFrontier(a: FrontierEntry, b: FrontierEntry, tieEps: number): number {
  const costDelta = a.cost - b.cost;
  if (Math.abs(costDelta) > tieEps) {
    return costDelta;
  }

  // Row-major index is equivalent to (y, x) ascending for fixed width.
  if (a.index !== b.index) {
    return a.index - b.index;
  }

  return a.stepDir - b.stepDir;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function reconstructPath(prev: Int32Array, startIndex: number, endIndex: number): number[] {
  const path: number[] = [];
  let cursor = endIndex;

  while (cursor !== -1) {
    path.push(cursor);
    if (cursor === startIndex) {
      path.reverse();
      return path;
    }
    cursor = prev[cursor];
  }

  return [];
}

export function findLeastCostPath(
  shape: GridShape,
  costField: Float32Array,
  startIndex: number,
  endIndex: number,
  params: TrailRoutingParams
): number[] | null {
  validateMapLength(shape, costField, "C");
  if (startIndex < 0 || startIndex >= shape.size || endIndex < 0 || endIndex >= shape.size) {
    throw new Error(
      `Navigation route endpoint out of bounds: start=${startIndex}, end=${endIndex}, size=${shape.size}.`
    );
  }

  if (costField[startIndex] >= params.inf || costField[endIndex] >= params.inf) {
    return null;
  }

  const dist = new Float64Array(shape.size).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(shape.size).fill(-1);
  const frontier: FrontierEntry[] = [];

  dist[startIndex] = 0;
  frontier.push({ index: startIndex, cost: 0, stepDir: -1 });

  while (frontier.length > 0) {
    frontier.sort((a, b) => compareFrontier(a, b, params.tieEps));
    const current = frontier.shift() as FrontierEntry;

    if (current.cost > dist[current.index] + params.tieEps) {
      continue;
    }

    if (current.index === endIndex) {
      const path = reconstructPath(prev, startIndex, endIndex);
      return path.length > 0 ? path : null;
    }

    const x = current.index % shape.width;
    const y = Math.floor(current.index / shape.width);

    for (let dir = 0; dir < DIR8_STEPS.length; dir += 1) {
      const step = DIR8_STEPS[dir];
      const nx = x + step.dx;
      const ny = y + step.dy;
      if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
        continue;
      }

      const nextIndex = ny * shape.width + nx;
      const nextTileCost = Number(costField[nextIndex]);
      if (nextTileCost >= params.inf) {
        continue;
      }

      const dirWeight = step.dx === 0 || step.dy === 0 ? 1 : params.diagWeight;
      const newCost = dist[current.index] + nextTileCost * dirWeight;
      const oldCost = dist[nextIndex];
      if (newCost < oldCost - params.tieEps) {
        dist[nextIndex] = newCost;
        prev[nextIndex] = current.index;
        frontier.push({ index: nextIndex, cost: newCost, stepDir: dir });
      }
    }
  }

  return null;
}

export function buildTrailPlan(
  shape: GridShape,
  inputs: TrailPlanInputs,
  params: TrailPlanParams
): TrailPlan {
  const seedIndices = selectTrailSeeds(shape, inputs.seed, params.seed);
  const routeRequests = buildTrailRouteRequests(shape, seedIndices, inputs.endpoint, params.endpoint);
  return {
    seedIndices,
    routeRequests
  };
}

export function executeTrailRouteRequests(
  shape: GridShape,
  costField: Float32Array,
  routeRequests: TrailRouteRequest[],
  params: TrailRoutingParams
): TrailRouteExecutionResult {
  const successfulPaths: number[][] = [];
  let skippedUnreachable = 0;

  for (const request of routeRequests) {
    const path = findLeastCostPath(
      shape,
      costField,
      request.seedIndex,
      request.endpointIndex,
      params
    );
    if (path === null) {
      skippedUnreachable += 1;
      continue;
    }
    successfulPaths.push(path);
  }

  return {
    requested: routeRequests.length,
    skippedUnreachable,
    successfulPaths
  };
}

function setPackedPassabilityCode(currentPacked: number, dirIndex: number, code: number): number {
  const shift = dirIndex * 2;
  const cleared = currentPacked & ~(0b11 << shift);
  return cleared | ((code & 0b11) << shift);
}

function getPackedPassabilityCode(packed: number, dirIndex: number): number {
  return (packed >> (dirIndex * 2)) & 0b11;
}

export function passabilityPackedToObject(packed: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < PASS_DIR_ORDER.length; i += 1) {
    const dir = PASS_DIR_ORDER[i];
    const code = getPackedPassabilityCode(packed, i);
    out[dir.key] =
      code === PASSABILITY_CODE.passable
        ? "passable"
        : code === PASSABILITY_CODE.difficult
          ? "difficult"
          : "blocked";
  }
  return out;
}

export function cliffEdgePackedToObject(packed: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (let i = 0; i < PASS_DIR_ORDER.length; i += 1) {
    const dir = PASS_DIR_ORDER[i];
    out[dir.key] = ((packed >> i) & 1) === 1;
  }
  return out;
}

export function deriveDirectionalPassability(
  shape: GridShape,
  inputs: DirectionalPassabilityInputs,
  params: DirectionalPassabilityParams
): DirectionalPassabilityMaps {
  validateMapLength(shape, inputs.h, "H");
  validateMapLength(shape, inputs.moisture, "Moisture");
  validateMapLength(shape, inputs.slopeMag, "SlopeMag");
  validateMapLength(shape, inputs.waterClass, "WaterClass");

  const passabilityPacked = new Uint16Array(shape.size);
  const cliffEdgePacked = new Uint8Array(shape.size);

  for (let i = 0; i < shape.size; i += 1) {
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);

    let passPacked = 0;
    let cliffPacked = 0;

    for (let dirIndex = 0; dirIndex < PASS_DIR_ORDER.length; dirIndex += 1) {
      const dir = PASS_DIR_ORDER[dirIndex];
      const nx = x + dir.dx;
      const ny = y + dir.dy;

      if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.blocked);
        continue;
      }

      if (isNonPlayable(shape, nx, ny, inputs.playableInset)) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.blocked);
        continue;
      }

      const nIndex = ny * shape.width + nx;
      const dh = inputs.h[nIndex] - inputs.h[i];
      const cliff =
        dh >= params.steepBlockDelta && inputs.slopeMag[i] >= params.cliffSlopeMin;
      if (cliff) {
        cliffPacked |= 1 << dirIndex;
      }

      if (
        inputs.waterClass[i] === WATER_CLASS_CODE.lake ||
        inputs.waterClass[nIndex] === WATER_CLASS_CODE.lake
      ) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.blocked);
        continue;
      }

      if (inputs.moisture[i] >= 0.9 && inputs.slopeMag[i] < 0.03) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.difficult);
        continue;
      }

      if (dh >= params.steepBlockDelta) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.blocked);
      } else if (dh >= params.steepDifficultDelta) {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.difficult);
      } else {
        passPacked = setPackedPassabilityCode(passPacked, dirIndex, PASSABILITY_CODE.passable);
      }
    }

    passabilityPacked[i] = passPacked;
    cliffEdgePacked[i] = cliffPacked;
  }

  return {
    passabilityPacked,
    cliffEdgePacked
  };
}

export function followableFlagsToOrderedList(flags: number): string[] {
  const out: string[] = [];
  for (const item of FOLLOWABLE_ORDER) {
    if ((flags & item.bit) !== 0) {
      out.push(item.name);
    }
  }
  return out;
}

export function deriveFollowableFlags(shape: GridShape, inputs: FollowableInputs): Uint8Array {
  validateMapLength(shape, inputs.waterClass, "WaterClass");
  validateMapLength(shape, inputs.landform, "Landform");
  validateMapLength(shape, inputs.gameTrail, "GameTrail");

  const out = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);

    let flags = 0;
    if (inputs.waterClass[i] === WATER_CLASS_CODE.stream) {
      flags |= FOLLOWABLE_FLAG_BIT.stream;
    }
    if (inputs.landform[i] === LANDFORM_CODE.ridge) {
      flags |= FOLLOWABLE_FLAG_BIT.ridge;
    }
    if (inputs.gameTrail[i] === 1) {
      flags |= FOLLOWABLE_FLAG_BIT.game_trail;
    }

    if (inputs.waterClass[i] !== WATER_CLASS_CODE.lake) {
      let hasLakeNeighbor = false;
      for (const step of DIR8_STEPS) {
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }
        const nIndex = ny * shape.width + nx;
        if (inputs.waterClass[nIndex] === WATER_CLASS_CODE.lake) {
          hasLakeNeighbor = true;
          break;
        }
      }
      if (hasLakeNeighbor) {
        flags |= FOLLOWABLE_FLAG_BIT.shore;
      }
    }

    out[i] = flags;
  }

  return out;
}

export function markTrailPaths(shape: GridShape, paths: number[][]): TrailMarkedMaps {
  const gameTrail = new Uint8Array(shape.size);
  const gameTrailId = new Int32Array(shape.size).fill(-1);

  for (let routeId = 0; routeId < paths.length; routeId += 1) {
    const path = paths[routeId];
    for (const index of path) {
      if (index < 0 || index >= shape.size) {
        throw new Error(`Navigation trail path index out of bounds: ${index} for size ${shape.size}.`);
      }

      gameTrail[index] = 1;
      if (gameTrailId[index] === -1) {
        gameTrailId[index] = routeId;
      }
    }
  }

  return { gameTrail, gameTrailId };
}

export function deriveMoveCost(
  shape: GridShape,
  inputs: MoveCostInputs,
  params: MoveCostParams
): Float32Array {
  validateMapLength(shape, inputs.obstruction, "Obstruction");
  validateMapLength(shape, inputs.moisture, "Moisture");
  validateMapLength(shape, inputs.waterClass, "WaterClass");
  validateMapLength(shape, inputs.biome, "Biome");
  validateMapLength(shape, inputs.gameTrail, "GameTrail");

  const out = new Float32Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    let cost = 1.0;
    cost *= lerp(1.0, params.moveCostObstructionMax, inputs.obstruction[i]);
    cost *= lerp(1.0, params.moveCostMoistureMax, inputs.moisture[i]);

    if (inputs.waterClass[i] === WATER_CLASS_CODE.marsh) {
      cost *= params.marshMoveCostMultiplier;
    }
    if (inputs.biome[i] === BIOME_CODE.open_bog) {
      cost *= params.openBogMoveCostMultiplier;
    }
    if (inputs.gameTrail[i] === 1) {
      cost *= params.gameTrailMoveCostMultiplier;
    }

    out[i] = cost;
  }

  return out;
}

export function deriveTrailPreferenceCost(
  shape: GridShape,
  inputs: TrailCostInputs,
  params: TrailCostParams
): Float32Array {
  validateMapLength(shape, inputs.slopeMag, "SlopeMag");
  validateMapLength(shape, inputs.moisture, "Moisture");
  validateMapLength(shape, inputs.obstruction, "Obstruction");
  validateMapLength(shape, inputs.landform, "Landform");
  validateMapLength(shape, inputs.waterClass, "WaterClass");
  validateMapLength(shape, inputs.isStream, "isStream");

  const distStream = deriveTrailDistStream(shape, inputs.isStream, {
    streamProxMaxDist: params.streamProxMaxDist
  });

  const out = new Float32Array(shape.size);

  for (let i = 0; i < shape.size; i += 1) {
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);

    const slopeTerm =
      params.wSlope * clamp01(inputs.slopeMag[i] / Math.max(params.slopeScale, Number.EPSILON));
    const moistureTerm = computeMoistureTerm(inputs.moisture[i], params.moistStart, params.wMoist);
    const obstructionTerm = params.wObs * inputs.obstruction[i];
    const ridgeBonus = inputs.landform[i] === LANDFORM_CODE.ridge ? -params.wRidge : 0;
    const streamProxBonus = computeStreamProximityBonus(
      distStream[i],
      params.streamProxMaxDist,
      params.wStreamProx
    );
    const waterCrossingTerm = inputs.waterClass[i] === WATER_CLASS_CODE.stream ? params.wCross : 0;
    const marshTerm = inputs.waterClass[i] === WATER_CLASS_CODE.marsh ? params.wMarsh : 0;
    const lakeTerm = inputs.waterClass[i] === WATER_CLASS_CODE.lake ? params.inf : 0;
    const nonPlayableTerm = isNonPlayable(shape, x, y, params.playableInset) ? params.inf : 0;

    out[i] =
      1 +
      slopeTerm +
      moistureTerm +
      obstructionTerm +
      waterCrossingTerm +
      marshTerm +
      lakeTerm +
      nonPlayableTerm +
      ridgeBonus +
      streamProxBonus;
  }

  return out;
}
