import type { GridShape } from "./topography.js";

export const DIR8_CODE = {
  e: 0,
  se: 1,
  s: 2,
  sw: 3,
  w: 4,
  nw: 5,
  n: 6,
  ne: 7
} as const;

export const DIR8_NONE = 255;

export type Dir8Code = (typeof DIR8_CODE)[keyof typeof DIR8_CODE];
export type FlowDirectionCode = Dir8Code | typeof DIR8_NONE;

export const WATER_CLASS_CODE = {
  none: 0,
  lake: 1,
  stream: 2,
  marsh: 3
} as const;

export type WaterClassCode = (typeof WATER_CLASS_CODE)[keyof typeof WATER_CLASS_CODE];

export interface HydrologyMapsSoA {
  shape: GridShape;
  fd: Uint8Array;
  fa: Uint32Array;
  faN: Float32Array;
  lakeMask: Uint8Array;
  isStream: Uint8Array;
  distWater: Uint32Array;
  moisture: Float32Array;
  waterClass: Uint8Array;
  inDeg: Uint8Array;
}

export function createHydrologyMaps(shape: GridShape): HydrologyMapsSoA {
  return {
    shape,
    fd: new Uint8Array(shape.size).fill(DIR8_NONE),
    fa: new Uint32Array(shape.size),
    faN: new Float32Array(shape.size),
    lakeMask: new Uint8Array(shape.size),
    isStream: new Uint8Array(shape.size),
    distWater: new Uint32Array(shape.size),
    moisture: new Float32Array(shape.size),
    waterClass: new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none),
    inDeg: new Uint8Array(shape.size)
  };
}
