import { InputValidationError } from "../domain/errors.js";
import { createGridShape, type GridShape } from "../domain/topography.js";
import type { JsonObject } from "../domain/types.js";

interface ReplayTileCoordinate {
	x: number;
	y: number;
}

export interface ValidatedReplayTopographyGrid {
	shape: GridShape;
	h: Float32Array;
	tilesByIndex: JsonObject[];
}

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_REPLAY_GRID_TILES = 16_777_216;
const MAX_SAFE_TILE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

const toCoord = (
	tile: JsonObject,
	sourceTileIndex: number,
	inputFilePath: string,
): ReplayTileCoordinate => {
	const x = tile.x;
	const y = tile.y;
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		!Number.isSafeInteger(x) ||
		!Number.isSafeInteger(y) ||
		x < 0 ||
		y < 0
	) {
		throw new InputValidationError(
			`Invalid replay tile coordinates at tile index ${sourceTileIndex} in "${inputFilePath}". Expected non-negative safe integer "x" and "y".`,
		);
	}
	return { x, y };
};

export const validateReplayTopographyGrid = (
	tiles: JsonObject[],
	inputFilePath: string,
): ValidatedReplayTopographyGrid => {
	if (tiles.length === 0) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" has no tiles for replay recompute.`,
		);
	}

	let maxX = -1;
	let maxY = -1;
	const coordsBySourceIndex = tiles.map((tile, sourceTileIndex) => {
		const coord = toCoord(tile, sourceTileIndex, inputFilePath);
		maxX = Math.max(maxX, coord.x);
		maxY = Math.max(maxY, coord.y);
		return coord;
	});
	const width = maxX + 1;
	const height = maxY + 1;
	const expectedSizeBigInt = BigInt(width) * BigInt(height);
	if (expectedSizeBigInt > MAX_SAFE_TILE_COUNT) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" replay grid dimensions ${width}x${height} exceed safe tile-count arithmetic (expectedTiles=${expectedSizeBigInt.toString()}).`,
		);
	}
	const expectedSize = Number(expectedSizeBigInt);
	if (expectedSize > MAX_REPLAY_GRID_TILES) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" replay grid dimensions ${width}x${height} exceed replay allocation cap (expectedTiles=${expectedSize}, maxAllowedTiles=${MAX_REPLAY_GRID_TILES}).`,
		);
	}
	const shape = createGridShape(width, height);

	const h = new Float32Array(expectedSize);
	const tilesByIndex = new Array<JsonObject>(expectedSize);
	const seenSourceIndexByGridIndex = new Int32Array(expectedSize).fill(-1);
	let observedUniqueCoordinates = 0;
	tiles.forEach((tile, sourceTileIndex) => {
		const coord = coordsBySourceIndex[sourceTileIndex];
		const gridIndex = coord.y * shape.width + coord.x;
		const firstSeenIndex = seenSourceIndexByGridIndex[gridIndex];
		if (firstSeenIndex >= 0) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" has duplicate tile coordinates at (${coord.x},${coord.y}) (first tile index=${firstSeenIndex}, duplicate tile index=${sourceTileIndex}) while validating dense ${shape.width}x${shape.height} replay coverage.`,
			);
		}

		seenSourceIndexByGridIndex[gridIndex] = sourceTileIndex;
		tilesByIndex[gridIndex] = tile;
		observedUniqueCoordinates += 1;

		const topography = isObject(tile.topography) ? tile.topography : undefined;
		if (!topography) {
			throw new InputValidationError(
				`Replay recompute requires object "topography": tile index ${sourceTileIndex} at (${coord.x},${coord.y}) in "${inputFilePath}".`,
			);
		}

		if (!Object.hasOwn(topography, "h")) {
			throw new InputValidationError(
				`Replay recompute requires finite topography.h: tile index ${sourceTileIndex} at (${coord.x},${coord.y}) in "${inputFilePath}" is missing "topography.h".`,
			);
		}

		const tileH = topography.h;
		if (typeof tileH !== "number" || !Number.isFinite(tileH)) {
			throw new InputValidationError(
				`Replay recompute requires finite topography.h: tile index ${sourceTileIndex} at (${coord.x},${coord.y}) in "${inputFilePath}" has non-finite value "${String(tileH)}".`,
			);
		}

		h[gridIndex] = tileH;
	});

	if (observedUniqueCoordinates !== expectedSize) {
		const missingGridIndex = seenSourceIndexByGridIndex.indexOf(-1);
		const missingX =
			missingGridIndex >= 0 ? missingGridIndex % shape.width : -1;
		const missingY =
			missingGridIndex >= 0 ? Math.floor(missingGridIndex / shape.width) : -1;
		const missingHint =
			missingGridIndex >= 0
				? `, missingCoordinate=(${missingX},${missingY})`
				: "";
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" is not a dense ${shape.width}x${shape.height} replay grid (expected=${expectedSize}, observedTileCount=${tiles.length}, observedUniqueCoordinates=${observedUniqueCoordinates}${missingHint}).`,
		);
	}

	return {
		shape,
		h,
		tilesByIndex,
	};
};
