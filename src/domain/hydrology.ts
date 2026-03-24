import type { GridShape } from "./topography.js";

export const DIR8_CODE = {
	e: 0,
	se: 1,
	s: 2,
	sw: 3,
	w: 4,
	nw: 5,
	n: 6,
	ne: 7,
} as const;

export const DIR8_NONE = 255;

export type Dir8Code = (typeof DIR8_CODE)[keyof typeof DIR8_CODE];
export type FlowDirectionCode = Dir8Code | typeof DIR8_NONE;

export interface HydrologyMapsSoA {
	shape: GridShape;
	fd: Uint8Array;
	fa: Uint32Array;
	faN: Float32Array;
	lakeMask: Uint8Array;
	poolMask: Uint8Array;
	waterSurfaceH: Float32Array;
	distWater: Uint32Array;
	moisture: Float32Array;
	inDeg: Uint8Array;
}

export function createHydrologyMaps(shape: GridShape): HydrologyMapsSoA {
	return {
		shape,
		fd: new Uint8Array(shape.size).fill(DIR8_NONE),
		fa: new Uint32Array(shape.size),
		faN: new Float32Array(shape.size),
		lakeMask: new Uint8Array(shape.size),
		poolMask: new Uint8Array(shape.size),
		waterSurfaceH: new Float32Array(shape.size),
		distWater: new Uint32Array(shape.size),
		moisture: new Float32Array(shape.size),
		inDeg: new Uint8Array(shape.size),
	};
}
