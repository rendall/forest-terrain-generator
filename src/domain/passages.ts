import { DIR8_CODE } from "./hydrology.js";

export type Direction8 = "E" | "SE" | "S" | "SW" | "W" | "NW" | "N" | "NE";

export type PassageBlockReason =
	| "out_of_bounds"
	| "elevation_up_too_steep"
	| "elevation_down_too_far";

export type TilePassages = Partial<Record<Direction8, PassageBlockReason>>;
export interface Direction8Delta {
	dx: number;
	dy: number;
}

const UPPERCASE_DIRECTION_BY_CODE_KEY = {
	e: "E",
	se: "SE",
	s: "S",
	sw: "SW",
	w: "W",
	nw: "NW",
	n: "N",
	ne: "NE",
} as const;

const DIR8_WITH_CODE = Object.entries(DIR8_CODE) as [
	keyof typeof DIR8_CODE,
	number,
][];

export const DIRECTION8_ORDER: readonly Direction8[] = DIR8_WITH_CODE.sort(
	([, left], [, right]) => left - right,
).map(([direction]) => UPPERCASE_DIRECTION_BY_CODE_KEY[direction]);

export const DIRECTION8_DELTAS: Readonly<Record<Direction8, Direction8Delta>> =
	{
		N: { dx: 0, dy: -1 },
		NE: { dx: 1, dy: -1 },
		E: { dx: 1, dy: 0 },
		SE: { dx: 1, dy: 1 },
		S: { dx: 0, dy: 1 },
		SW: { dx: -1, dy: 1 },
		W: { dx: -1, dy: 0 },
		NW: { dx: -1, dy: -1 },
	};

export const DIRECTION8_INDEX = new Map(
	DIRECTION8_ORDER.map((direction, index) => [direction, index] as const),
);
