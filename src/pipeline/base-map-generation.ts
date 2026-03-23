import type { JsonObject, JsonValue } from "../domain/types.js";
import { createBaseMaps, indexOf, type BaseMapsSoA, type GridShape } from "../domain/topography.js";
import { createPermutationTable, perlinNoise2d } from "../lib/perlin2d.js";
import { subSeed, type BaseMapId } from "../lib/sub-seed.js";

interface NoiseParams {
  octaves: number;
  baseFrequency: number;
  lacunarity: number;
  persistence: number;
}

interface NormalizeParams {
  enabled: boolean;
  mode: "minmax" | "quantile";
  lowerQ: number;
  upperQ: number;
}

const NOISE_PARAM_KEYS = {
  H: "heightNoise",
  R: "roughnessNoise",
  V: "vegVarianceNoise"
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expectObject(value: JsonValue | undefined, name: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Missing or invalid params object "${name}".`);
  }
  return value as JsonObject;
}

function expectNumber(value: JsonValue | undefined, name: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Missing or invalid numeric params value "${name}".`);
  }
  return value;
}

function expectInt(value: JsonValue | undefined, name: string): number {
  const parsed = expectNumber(value, name);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer params value "${name}".`);
  }
  return parsed;
}

function readNoiseParams(params: JsonObject, mapId: BaseMapId): NoiseParams {
  const key = NOISE_PARAM_KEYS[mapId];
  const node = expectObject(params[key], key);

  return {
    octaves: expectInt(node.octaves, `${key}.octaves`),
    baseFrequency: expectNumber(node.baseFrequency, `${key}.baseFrequency`),
    lacunarity: expectNumber(node.lacunarity, `${key}.lacunarity`),
    persistence: expectNumber(node.persistence, `${key}.persistence`)
  };
}

function readNormalizeParams(params: JsonObject, mapId: BaseMapId): NormalizeParams {
  const key = NOISE_PARAM_KEYS[mapId];
  const noiseParams = expectObject(params[key], key);
  const normalizeNode = noiseParams.normalize;
  if (normalizeNode === undefined) {
    return {
      enabled: false,
      mode: "quantile",
      lowerQ: 0.02,
      upperQ: 0.98
    };
  }

  const normalize = expectObject(normalizeNode, `${key}.normalize`);
  const enabledRaw = normalize.enabled;
  const modeRaw = normalize.mode;
  const lowerQRaw = normalize.lowerQ;
  const upperQRaw = normalize.upperQ;

  if (typeof enabledRaw !== "boolean") {
    throw new Error(`Missing or invalid boolean params value "${key}.normalize.enabled".`);
  }
  if (modeRaw !== "minmax" && modeRaw !== "quantile") {
    throw new Error(
      `Missing or invalid params value "${key}.normalize.mode". Expected "minmax" or "quantile".`
    );
  }

  const lowerQ = lowerQRaw === undefined ? 0.02 : expectNumber(lowerQRaw, `${key}.normalize.lowerQ`);
  const upperQ = upperQRaw === undefined ? 0.98 : expectNumber(upperQRaw, `${key}.normalize.upperQ`);
  if (lowerQ < 0 || lowerQ > 1 || upperQ < 0 || upperQ > 1 || lowerQ >= upperQ) {
    throw new Error(
      `Invalid quantile bounds for "${key}.normalize.lowerQ/upperQ". Require 0 <= lowerQ < upperQ <= 1.`
    );
  }

  return {
    enabled: enabledRaw,
    mode: modeRaw,
    lowerQ,
    upperQ
  };
}

function quantile(sortedValues: readonly number[], q: number): number {
  const size = sortedValues.length;
  const index = Math.floor((size - 1) * q);
  return sortedValues[index];
}

function normalizeMapInPlace(map: Float32Array, normalizeParams: NormalizeParams): void {
  if (!normalizeParams.enabled || map.length === 0) {
    return;
  }

  const sorted = Array.from(map).sort((a, b) => a - b);
  const lo =
    normalizeParams.mode === "minmax"
      ? sorted[0]
      : quantile(sorted, normalizeParams.lowerQ);
  const hi =
    normalizeParams.mode === "minmax"
      ? sorted[sorted.length - 1]
      : quantile(sorted, normalizeParams.upperQ);

  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) {
    return;
  }

  for (let i = 0; i < map.length; i += 1) {
    map[i] = clamp((map[i] - lo) / span, 0, 1);
  }
}

function generateSingleBaseMap(
  mapId: BaseMapId,
  seed: bigint,
  shape: GridShape,
  params: NoiseParams
): Float32Array {
  const map = new Float32Array(shape.size);
  const perms = Array.from({ length: params.octaves }, (_, octave) =>
    createPermutationTable(subSeed(seed, mapId, octave))
  );

  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      let freq = params.baseFrequency;
      let amp = 1;
      let sum = 0;
      let norm = 0;

      for (let octave = 0; octave < params.octaves; octave += 1) {
        const noise = perlinNoise2d(x * freq, y * freq, perms[octave]);
        sum += amp * noise;
        norm += amp;
        freq *= params.lacunarity;
        amp *= params.persistence;
      }

      const value = norm === 0 ? 0.5 : (sum / norm + 1) / 2;
      map[indexOf(shape, x, y)] = clamp(value, 0, 1);
    }
  }

  return map;
}

export function generateBaseMaps(shape: GridShape, seed: bigint, params: JsonObject): BaseMapsSoA {
  const out = createBaseMaps(shape);
  out.h = generateSingleBaseMap("H", seed, shape, readNoiseParams(params, "H"));
  normalizeMapInPlace(out.h, readNormalizeParams(params, "H"));
  out.r = generateSingleBaseMap("R", seed, shape, readNoiseParams(params, "R"));
  normalizeMapInPlace(out.r, readNormalizeParams(params, "R"));
  out.v = generateSingleBaseMap("V", seed, shape, readNoiseParams(params, "V"));
  normalizeMapInPlace(out.v, readNormalizeParams(params, "V"));
  return out;
}
