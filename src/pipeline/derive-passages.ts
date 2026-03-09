import type { GridShape } from "../domain/topography.js";
import { DIRECTION8_ORDER, type PassageBlockReason, type TilePassages } from "../domain/passages.js";

export const PASSAGE_MAX_STEP_UP = 0.001;
export const PASSAGE_MAX_DROP_DOWN = 0.0015;

export interface PassageContext {
	shape: GridShape;
	h: Float32Array;
	tileIndex: number;
	direction: (typeof DIRECTION8_ORDER)[number];
}

export const derivePassages = (shape: GridShape, h: Float32Array): TilePassages[] => {
	void h;
	return Array.from({ length: shape.size }, () => ({}));
};

export const evaluatePassageBlockReason = (
	_context: PassageContext,
): PassageBlockReason | null => {
	return null;
};
