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

export const STREAM_DIR = {
	E: "E",
	SE: "SE",
	S: "S",
	SW: "SW",
	W: "W",
	NW: "NW",
	N: "N",
	NE: "NE",
} as const;

export type StreamDir = (typeof STREAM_DIR)[keyof typeof STREAM_DIR];

const FLOW_CODE_TO_STREAM_DIR: Record<Dir8Code, StreamDir> = {
	[DIR8_CODE.e]: STREAM_DIR.E,
	[DIR8_CODE.se]: STREAM_DIR.SE,
	[DIR8_CODE.s]: STREAM_DIR.S,
	[DIR8_CODE.sw]: STREAM_DIR.SW,
	[DIR8_CODE.w]: STREAM_DIR.W,
	[DIR8_CODE.nw]: STREAM_DIR.NW,
	[DIR8_CODE.n]: STREAM_DIR.N,
	[DIR8_CODE.ne]: STREAM_DIR.NE,
};

const STREAM_DIR_TO_FLOW_CODE: Record<StreamDir, Dir8Code> = {
	[STREAM_DIR.E]: DIR8_CODE.e,
	[STREAM_DIR.SE]: DIR8_CODE.se,
	[STREAM_DIR.S]: DIR8_CODE.s,
	[STREAM_DIR.SW]: DIR8_CODE.sw,
	[STREAM_DIR.W]: DIR8_CODE.w,
	[STREAM_DIR.NW]: DIR8_CODE.nw,
	[STREAM_DIR.N]: DIR8_CODE.n,
	[STREAM_DIR.NE]: DIR8_CODE.ne,
};

const STREAM_DIR_OPPOSITE: Record<StreamDir, StreamDir> = {
	[STREAM_DIR.E]: STREAM_DIR.W,
	[STREAM_DIR.SE]: STREAM_DIR.NW,
	[STREAM_DIR.S]: STREAM_DIR.N,
	[STREAM_DIR.SW]: STREAM_DIR.NE,
	[STREAM_DIR.W]: STREAM_DIR.E,
	[STREAM_DIR.NW]: STREAM_DIR.SE,
	[STREAM_DIR.N]: STREAM_DIR.S,
	[STREAM_DIR.NE]: STREAM_DIR.SW,
};

export const STREAM_DIR_VALUES: StreamDir[] = [
	STREAM_DIR.N,
	STREAM_DIR.NE,
	STREAM_DIR.E,
	STREAM_DIR.SE,
	STREAM_DIR.S,
	STREAM_DIR.SW,
	STREAM_DIR.W,
	STREAM_DIR.NW,
];

const DELTA_TO_STREAM_DIR = new Map<string, StreamDir>([
	["1,0", STREAM_DIR.E],
	["1,1", STREAM_DIR.SE],
	["0,1", STREAM_DIR.S],
	["-1,1", STREAM_DIR.SW],
	["-1,0", STREAM_DIR.W],
	["-1,-1", STREAM_DIR.NW],
	["0,-1", STREAM_DIR.N],
	["1,-1", STREAM_DIR.NE],
]);

export function flowCodeToStreamDir(code: number): StreamDir | null {
	if (code === DIR8_NONE) {
		return null;
	}
	return FLOW_CODE_TO_STREAM_DIR[code as Dir8Code] ?? null;
}

export function streamDirToFlowCode(dir: StreamDir): Dir8Code {
	return STREAM_DIR_TO_FLOW_CODE[dir];
}

export function oppositeStreamDir(dir: StreamDir): StreamDir {
	return STREAM_DIR_OPPOSITE[dir];
}

export function streamDirFromDelta(dx: number, dy: number): StreamDir | null {
	return DELTA_TO_STREAM_DIR.get(`${Math.sign(dx)},${Math.sign(dy)}`) ?? null;
}

export const WATER_CLASS_CODE = {
  none: 0,
  lake: 1,
  stream: 2,
  marsh: 3,
  pool: 4
} as const;

export type WaterClassCode = (typeof WATER_CLASS_CODE)[keyof typeof WATER_CLASS_CODE];

export interface HydrologyMapsSoA {
  shape: GridShape;
  fd: Uint8Array;
  fa: Uint32Array;
  faN: Float32Array;
  lakeMask: Uint8Array;
  isStream: Uint8Array;
  poolMask: Uint8Array;
  lakeSurfaceH: Float32Array;
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
    poolMask: new Uint8Array(shape.size),
    lakeSurfaceH: new Float32Array(shape.size),
    distWater: new Uint32Array(shape.size),
    moisture: new Float32Array(shape.size),
    waterClass: new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none),
    inDeg: new Uint8Array(shape.size)
  };
}
