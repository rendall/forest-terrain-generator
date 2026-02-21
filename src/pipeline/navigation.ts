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

export interface TrailCostInputs {
  slopeMag: Float32Array;
  moisture: Float32Array;
  obstruction: Float32Array;
  landform: Uint8Array;
  waterClass: Uint8Array;
  isStream: Uint8Array;
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
