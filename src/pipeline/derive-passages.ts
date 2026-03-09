import {
	DIRECTION8_DELTAS,
	DIRECTION8_ORDER,
	type PassageBlockReason,
	type TilePassages,
} from "../domain/passages.js";
import type { GridShape } from "../domain/topography.js";

export const PASSAGE_MAX_STEP_UP = 0.001;
export const PASSAGE_MAX_DROP_DOWN = 0.0015;

export interface PassageContext {
	shape: GridShape;
	h: Float32Array;
	tileIndex: number;
	direction: (typeof DIRECTION8_ORDER)[number];
}

const resolveNeighborIndex = (context: PassageContext): number | null => {
	const tileX = context.tileIndex % context.shape.width;
	const tileY = Math.floor(context.tileIndex / context.shape.width);
	const delta = DIRECTION8_DELTAS[context.direction];
	const neighborX = tileX + delta.dx;
	const neighborY = tileY + delta.dy;
	if (
		neighborX < 0 ||
		neighborY < 0 ||
		neighborX >= context.shape.width ||
		neighborY >= context.shape.height
	) {
		return null;
	}
	return neighborY * context.shape.width + neighborX;
};

export const evaluatePassageBlockReason = (
	context: PassageContext,
): PassageBlockReason | null => {
	const neighborIndex = resolveNeighborIndex(context);
	if (neighborIndex === null) {
		return "out_of_bounds";
	}

	const currentHeight = context.h[context.tileIndex] ?? Number.NaN;
	const neighborHeight = context.h[neighborIndex] ?? Number.NaN;
	const delta = neighborHeight - currentHeight;

	if (delta > PASSAGE_MAX_STEP_UP) {
		return "elevation_up_too_steep";
	}
	if (delta < -PASSAGE_MAX_DROP_DOWN) {
		return "elevation_down_too_far";
	}
	return null;
};

export const derivePassages = (shape: GridShape, h: Float32Array): TilePassages[] =>
	Array.from({ length: shape.size }, (_, tileIndex) =>
		DIRECTION8_ORDER.reduce<TilePassages>((passages, direction) => {
			const reason = evaluatePassageBlockReason({
				shape,
				h,
				tileIndex,
				direction,
			});
			if (reason !== null && reason !== "out_of_bounds") {
				passages[direction] = reason;
			}
			return passages;
		}, {}),
	);
