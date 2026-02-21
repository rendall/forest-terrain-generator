import type { GridShape } from "./topography.js";

export const BIOME_CODE = {
  open_bog: 0,
  spruce_swamp: 1,
  mixed_forest: 2,
  pine_heath: 3,
  esker_pine: 4,
  lake: 5,
  stream_bank: 6
} as const;

export const SOIL_TYPE_CODE = {
  peat: 0,
  sandy_till: 1,
  rocky_till: 2
} as const;

export const SURFACE_FLAG_BIT = {
  standing_water: 1 << 0,
  sphagnum: 1 << 1,
  lichen: 1 << 2,
  exposed_sand: 1 << 3,
  bedrock: 1 << 4
} as const;

export const FEATURE_FLAG_BIT = {
  fallen_log: 1 << 0,
  root_tangle: 1 << 1,
  boulder: 1 << 2,
  windthrow: 1 << 3
} as const;

export const SPECIES_CODE = {
  scots_pine: 0,
  norway_spruce: 1,
  birch: 2
} as const;

export const SPECIES_NONE = 255;

export type BiomeCode = (typeof BIOME_CODE)[keyof typeof BIOME_CODE];
export type SoilTypeCode = (typeof SOIL_TYPE_CODE)[keyof typeof SOIL_TYPE_CODE];
export type SpeciesCode = (typeof SPECIES_CODE)[keyof typeof SPECIES_CODE];
export type SpeciesSlotCode = SpeciesCode | typeof SPECIES_NONE;

export interface EcologyMapsSoA {
  shape: GridShape;
  biome: Uint8Array;
  soilType: Uint8Array;
  firmness: Float32Array;
  treeDensity: Float32Array;
  canopyCover: Float32Array;
  obstruction: Float32Array;
  surfaceFlags: Uint16Array;
  featureFlags: Uint16Array;
  dominantPrimary: Uint8Array;
  dominantSecondary: Uint8Array;
}

export function createEcologyMaps(shape: GridShape): EcologyMapsSoA {
  return {
    shape,
    biome: new Uint8Array(shape.size),
    soilType: new Uint8Array(shape.size),
    firmness: new Float32Array(shape.size),
    treeDensity: new Float32Array(shape.size),
    canopyCover: new Float32Array(shape.size),
    obstruction: new Float32Array(shape.size),
    surfaceFlags: new Uint16Array(shape.size),
    featureFlags: new Uint16Array(shape.size),
    dominantPrimary: new Uint8Array(shape.size).fill(SPECIES_NONE),
    dominantSecondary: new Uint8Array(shape.size).fill(SPECIES_NONE)
  };
}
