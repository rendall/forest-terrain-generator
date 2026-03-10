import {
	DIRECTION8_DELTAS,
	DIRECTION8_ORDER,
	type Direction8,
	type PassageBlockReason,
	type TilePassages,
} from "../domain/passages.js";
import type { GridShape } from "../domain/topography.js";

export const PASSAGE_MAX_STEP_UP = 0.05;
export const PASSAGE_MAX_DROP_DOWN = 0.05;

interface Tile {
	index: number;
	x: number;
	y: number;
	topography: {
		h: number;
	};
	passages?: TilePassages;
}

export interface PassageContext {
	shape: GridShape;
	h: Float32Array;
	tileIndex: number;
	direction: (typeof DIRECTION8_ORDER)[number];
}

type PassagePredicate = (
	tile: Tile,
	neighbor: Tile | null,
	tiles: readonly Tile[],
) => PassageBlockReason | null;

const buildTiles = (shape: GridShape, h: Float32Array): Tile[] =>
	Array.from({ length: shape.size }, (_, index) => ({
		index,
		x: index % shape.width,
		y: Math.floor(index / shape.width),
		topography: {
			h: h[index] ?? Number.NaN,
		},
	}));

const getNeighborTile = (
	tile: Tile,
	direction: Direction8,
	tiles: readonly Tile[],
): Tile | null => {
	const delta = DIRECTION8_DELTAS[direction];
	const neighborX = tile.x + delta.dx;
	const neighborY = tile.y + delta.dy;
	return (
		tiles.find(
			(candidate) => candidate.x === neighborX && candidate.y === neighborY,
		) ?? null
	);
};

const PASSAGE_PREDICATES: readonly PassagePredicate[] = [
	(_tile, neighbor) => (neighbor === null ? "out_of_bounds" : null),
	(tile, neighbor) => {
		if (neighbor === null) {
			return null;
		}
		const delta = neighbor.topography.h - tile.topography.h;
		return delta > PASSAGE_MAX_STEP_UP ? "elevation_up_too_steep" : null;
	},
	(tile, neighbor) => {
		if (neighbor === null) {
			return null;
		}
		const delta = neighbor.topography.h - tile.topography.h;
		return delta < -PASSAGE_MAX_DROP_DOWN ? "elevation_down_too_far" : null;
	},
];

const evaluateDirectionBlockReason = (
	tile: Tile,
	direction: Direction8,
	tiles: readonly Tile[],
): PassageBlockReason | null => {
	const neighbor = getNeighborTile(tile, direction, tiles);
	return PASSAGE_PREDICATES.reduce<PassageBlockReason | null>((reason, predicate) => {
		if (reason !== null) {
			return reason;
		}
		return predicate(tile, neighbor, tiles);
	}, null);
};

export const evaluatePassageBlockReason = (
	context: PassageContext,
): PassageBlockReason | null => {
	const tiles = buildTiles(context.shape, context.h);
	const tile = tiles[context.tileIndex];
	if (!tile) {
		return null;
	}
	return evaluateDirectionBlockReason(tile, context.direction, tiles);
};

export const derivePassages = (shape: GridShape, h: Float32Array): TilePassages[] =>
	buildTiles(shape, h).map((tile, _tileIndex, tiles) =>
		DIRECTION8_ORDER.reduce<TilePassages>((passages, direction) => {
			const reason = evaluateDirectionBlockReason(tile, direction, tiles);
			if (reason !== null) {
				return {
					...passages,
					[direction]: reason,
				};
			}
			return passages;
		}, {}),
	);
