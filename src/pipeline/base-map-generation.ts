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
  out.r = generateSingleBaseMap("R", seed, shape, readNoiseParams(params, "R"));
  out.v = generateSingleBaseMap("V", seed, shape, readNoiseParams(params, "V"));
  return out;
}
