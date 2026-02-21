import {
  BIOME_CODE,
  SOIL_TYPE_CODE,
  SPECIES_CODE,
  SPECIES_NONE,
  SURFACE_FLAG_BIT
} from "../domain/ecology.js";
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
      `Ecology ${mapName} length mismatch: expected ${shape.size}, got ${map.length}.`
    );
  }
}

export interface BiomeParams {
  vegVarianceNoise?: {
    strength?: number;
  };
  vegVarianceStrength?: number;
}

interface VegetationBase {
  baseDensity: number;
  baseCanopy: number;
}

const VEGETATION_BASE_BY_BIOME: Record<number, VegetationBase> = {
  [BIOME_CODE.pine_heath]: { baseDensity: 0.35, baseCanopy: 0.4 },
  [BIOME_CODE.esker_pine]: { baseDensity: 0.3, baseCanopy: 0.35 },
  [BIOME_CODE.mixed_forest]: { baseDensity: 0.55, baseCanopy: 0.6 },
  [BIOME_CODE.spruce_swamp]: { baseDensity: 0.8, baseCanopy: 0.78 },
  [BIOME_CODE.open_bog]: { baseDensity: 0.1, baseCanopy: 0.15 },
  [BIOME_CODE.stream_bank]: { baseDensity: 0.6, baseCanopy: 0.55 },
  [BIOME_CODE.lake]: { baseDensity: 0, baseCanopy: 0 }
};

export function resolveVegVarianceStrength(params: BiomeParams): number {
  const nested = params.vegVarianceNoise?.strength;
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  const fallback = params.vegVarianceStrength;
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }

  throw new Error(
    "Ecology params missing biome perturbation strength. Provide vegVarianceNoise.strength."
  );
}

export function deriveBiome(
  shape: GridShape,
  waterClass: Uint8Array,
  h: Float32Array,
  moisture: Float32Array,
  slopeMag: Float32Array,
  v: Float32Array,
  params: BiomeParams
): Uint8Array {
  validateMapLength(shape, waterClass, "WaterClass");
  validateMapLength(shape, h, "H");
  validateMapLength(shape, moisture, "Moisture");
  validateMapLength(shape, slopeMag, "SlopeMag");
  validateMapLength(shape, v, "V");

  const strength = Math.fround(resolveVegVarianceStrength(params));
  const bogMoisture = Math.fround(0.85);
  const spruceMoisture = Math.fround(0.65);
  const mixedMoisture = Math.fround(0.4);
  const eskerHeight = Math.fround(0.7);
  const openBogSlope = Math.fround(0.03);
  const eskerSlope = Math.fround(0.05);

  const out = new Uint8Array(shape.size);
  for (let i = 0; i < shape.size; i += 1) {
    if (waterClass[i] === WATER_CLASS_CODE.lake) {
      out[i] = BIOME_CODE.lake;
      continue;
    }
    if (waterClass[i] === WATER_CLASS_CODE.stream) {
      out[i] = BIOME_CODE.stream_bank;
      continue;
    }

    const m2 = Math.fround(clamp01(moisture[i] + (v[i] - 0.5) * strength));

    if (m2 >= bogMoisture && slopeMag[i] < openBogSlope) {
      out[i] = BIOME_CODE.open_bog;
    } else if (m2 >= bogMoisture) {
      out[i] = BIOME_CODE.spruce_swamp;
    } else if (m2 >= spruceMoisture) {
      out[i] = BIOME_CODE.spruce_swamp;
    } else if (m2 >= mixedMoisture) {
      out[i] = BIOME_CODE.mixed_forest;
    } else if (h[i] >= eskerHeight && slopeMag[i] < eskerSlope) {
      out[i] = BIOME_CODE.esker_pine;
    } else {
      out[i] = BIOME_CODE.pine_heath;
    }
  }

  return out;
}

export interface VegetationAttributes {
  treeDensity: Float32Array;
  canopyCover: Float32Array;
}

export interface DominantSpeciesSlots {
  dominantPrimary: Uint8Array;
  dominantSecondary: Uint8Array;
}

export interface GroundParams {
  peatMoistureThreshold: number;
  standingWaterMoistureThreshold: number;
  standingWaterSlopeMax: number;
  lichenMoistureMax: number;
  exposedSandMoistureMax: number;
  bedrockHeightMin: number;
  bedrockRoughnessMin: number;
}

export interface GroundMaps {
  soilType: Uint8Array;
  firmness: Float32Array;
  surfaceFlags: Uint16Array;
}

const SPECIES_NAME_BY_CODE: Record<number, string> = {
  [SPECIES_CODE.scots_pine]: "scots_pine",
  [SPECIES_CODE.norway_spruce]: "norway_spruce",
  [SPECIES_CODE.birch]: "birch"
};

export function deriveVegetationAttributes(
  shape: GridShape,
  biome: Uint8Array,
  moisture: Float32Array,
  v: Float32Array
): VegetationAttributes {
  validateMapLength(shape, biome, "Biome");
  validateMapLength(shape, moisture, "Moisture");
  validateMapLength(shape, v, "V");

  const treeDensity = new Float32Array(shape.size);
  const canopyCover = new Float32Array(shape.size);

  for (let i = 0; i < shape.size; i += 1) {
    const base = VEGETATION_BASE_BY_BIOME[biome[i]];
    if (!base) {
      throw new Error(`Unknown Biome code ${biome[i]} at index ${i}.`);
    }

    const density = clamp01(
      base.baseDensity + (v[i] - 0.5) * 0.1 + (moisture[i] - 0.5) * 0.08
    );
    treeDensity[i] = density;
    canopyCover[i] = clamp01(base.baseCanopy + (density - base.baseDensity) * 0.6);
  }

  return { treeDensity, canopyCover };
}

export function deriveDominantSpecies(
  shape: GridShape,
  biome: Uint8Array,
  moisture: Float32Array
): DominantSpeciesSlots {
  validateMapLength(shape, biome, "Biome");
  validateMapLength(shape, moisture, "Moisture");

  const moistSplit = Math.fround(0.52);
  const bogTreeCutoff = Math.fround(0.75);
  const dominantPrimary = new Uint8Array(shape.size).fill(SPECIES_NONE);
  const dominantSecondary = new Uint8Array(shape.size).fill(SPECIES_NONE);

  for (let i = 0; i < shape.size; i += 1) {
    switch (biome[i]) {
      case BIOME_CODE.pine_heath:
      case BIOME_CODE.esker_pine:
        dominantPrimary[i] = SPECIES_CODE.scots_pine;
        break;
      case BIOME_CODE.spruce_swamp:
        dominantPrimary[i] = SPECIES_CODE.norway_spruce;
        break;
      case BIOME_CODE.mixed_forest:
        if (moisture[i] >= moistSplit) {
          dominantPrimary[i] = SPECIES_CODE.norway_spruce;
          dominantSecondary[i] = SPECIES_CODE.birch;
        } else {
          dominantPrimary[i] = SPECIES_CODE.birch;
          dominantSecondary[i] = SPECIES_CODE.norway_spruce;
        }
        break;
      case BIOME_CODE.stream_bank:
        dominantPrimary[i] = SPECIES_CODE.birch;
        break;
      case BIOME_CODE.open_bog:
        if (moisture[i] < bogTreeCutoff) {
          dominantPrimary[i] = SPECIES_CODE.birch;
        }
        break;
      case BIOME_CODE.lake:
        break;
      default:
        throw new Error(`Unknown Biome code ${biome[i]} at index ${i}.`);
    }
  }

  return { dominantPrimary, dominantSecondary };
}

export function dominantSlotsToOrderedList(primary: number, secondary: number): string[] {
  const out: string[] = [];
  if (primary !== SPECIES_NONE) {
    const name = SPECIES_NAME_BY_CODE[primary];
    if (!name) {
      throw new Error(`Unknown dominant primary species code ${primary}.`);
    }
    out.push(name);
  }
  if (secondary !== SPECIES_NONE) {
    const name = SPECIES_NAME_BY_CODE[secondary];
    if (!name) {
      throw new Error(`Unknown dominant secondary species code ${secondary}.`);
    }
    out.push(name);
  }
  return out;
}

export function deriveGround(
  shape: GridShape,
  moisture: Float32Array,
  slopeMag: Float32Array,
  h: Float32Array,
  r: Float32Array,
  landform: Uint8Array,
  params: GroundParams
): GroundMaps {
  validateMapLength(shape, moisture, "Moisture");
  validateMapLength(shape, slopeMag, "SlopeMag");
  validateMapLength(shape, h, "H");
  validateMapLength(shape, r, "R");
  validateMapLength(shape, landform, "Landform");

  const peatMoistureThreshold = Math.fround(params.peatMoistureThreshold);
  const standingWaterMoistureThreshold = Math.fround(params.standingWaterMoistureThreshold);
  const standingWaterSlopeMax = Math.fround(params.standingWaterSlopeMax);
  const lichenMoistureMax = Math.fround(params.lichenMoistureMax);
  const exposedSandMoistureMax = Math.fround(params.exposedSandMoistureMax);
  const bedrockHeightMin = Math.fround(params.bedrockHeightMin);
  const bedrockRoughnessMin = Math.fround(params.bedrockRoughnessMin);

  const soilType = new Uint8Array(shape.size);
  const firmness = new Float32Array(shape.size);
  const surfaceFlags = new Uint16Array(shape.size);

  for (let i = 0; i < shape.size; i += 1) {
    if (moisture[i] >= peatMoistureThreshold) {
      soilType[i] = SOIL_TYPE_CODE.peat;
    } else if (
      moisture[i] <= exposedSandMoistureMax &&
      (landform[i] === LANDFORM_CODE.ridge || h[i] >= bedrockHeightMin)
    ) {
      soilType[i] = SOIL_TYPE_CODE.sandy_till;
    } else {
      soilType[i] = SOIL_TYPE_CODE.rocky_till;
    }

    firmness[i] = clamp01(
      1 - 0.85 * moisture[i] + 0.15 * clamp01(slopeMag[i] / Math.fround(0.2))
    );

    let flags = 0;
    if (moisture[i] >= standingWaterMoistureThreshold && slopeMag[i] < standingWaterSlopeMax) {
      flags |= SURFACE_FLAG_BIT.standing_water;
    }
    if (soilType[i] === SOIL_TYPE_CODE.peat) {
      flags |= SURFACE_FLAG_BIT.sphagnum;
    }
    if (moisture[i] <= lichenMoistureMax) {
      flags |= SURFACE_FLAG_BIT.lichen;
    }
    if (soilType[i] === SOIL_TYPE_CODE.sandy_till && moisture[i] <= exposedSandMoistureMax) {
      flags |= SURFACE_FLAG_BIT.exposed_sand;
    }
    if (h[i] >= bedrockHeightMin && r[i] >= bedrockRoughnessMin) {
      flags |= SURFACE_FLAG_BIT.bedrock;
    }
    surfaceFlags[i] = flags;
  }

  return { soilType, firmness, surfaceFlags };
}
