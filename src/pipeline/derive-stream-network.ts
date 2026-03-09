import { DIR8_CODE } from "../domain/hydrology.js";
import type {
	StreamDirection,
	StreamFeature,
	StreamTerminalKind,
	TileStreamGeometry,
} from "../domain/stream-network.js";
import type { GridShape } from "../domain/topography.js";

export interface StreamOriginCandidate {
	tileId: number;
	h: number;
	fa: number;
	x: number;
	y: number;
}

export interface StreamTileContext {
	tileId: number;
	x: number;
	y: number;
	h: number;
	fa: number;
}

export interface DeriveStreamNetworkParams {
	shape: GridShape;
	h: Float32Array;
	fa: Uint32Array;
	originPredicate?: (tile: StreamTileContext) => boolean;
}

export interface DeriveStreamNetworkResult {
	streams: StreamFeature[];
	tileGeometry: TileStreamGeometry[];
}

const DIR_WITH_CODE = Object.entries(DIR8_CODE) as [StreamDirection, number][];

export const STREAM_DIRECTIONS = DIR_WITH_CODE.sort(
	([, left], [, right]) => left - right,
).map(([direction]) => direction);

const STREAM_DIRECTION_INDEX = new Map(
	STREAM_DIRECTIONS.map((direction, index) => [direction, index] as const),
);

const STREAM_DIRECTION_DELTAS: Record<StreamDirection, [number, number]> = {
	e: [1, 0],
	se: [1, 1],
	s: [0, 1],
	sw: [-1, 1],
	w: [-1, 0],
	nw: [-1, -1],
	n: [0, -1],
	ne: [1, -1],
};

function selectOriginCandidates(
	params: DeriveStreamNetworkParams,
): StreamOriginCandidate[] {
	const predicate =
		params.originPredicate ??
		((tile: StreamTileContext) => tile.h > 0.5 && tile.fa > 5);

	return Array.from({ length: params.shape.size }, (_, tileId) => {
		const x = tileId % params.shape.width;
		const y = Math.floor(tileId / params.shape.width);
		return {
			tileId,
			h: params.h[tileId] ?? Number.NaN,
			fa: params.fa[tileId] ?? 0,
			x,
			y,
		};
	}).filter((tile) => predicate(tile));
}

function orderOrigins(
	candidates: StreamOriginCandidate[],
): StreamOriginCandidate[] {
	return [...candidates].sort((left, right) => {
		if (right.h !== left.h) {
			return right.h - left.h;
		}
		if (right.fa !== left.fa) {
			return right.fa - left.fa;
		}
		if (left.y !== right.y) {
			return left.y - right.y;
		}
		if (left.x !== right.x) {
			return left.x - right.x;
		}
		return left.tileId - right.tileId;
	});
}

function traceFromOrigin(origin: StreamOriginCandidate): StreamFeature | null {
	void origin;
	return null;
}

function classifyTerminal(): StreamTerminalKind {
	return "error";
}

function deriveTileGeometry(
	shape: GridShape,
	streams: StreamFeature[],
): TileStreamGeometry[] {
	void streams;
	return createEmptyTileStreamGeometry(shape.size);
}

export function createEmptyTileStreamGeometry(
	size: number,
): TileStreamGeometry[] {
	return Array.from({ length: size }, () => ({
		outgoingDirection: null,
		incomingDirections: [],
	}));
}

export function canonicalDirectionIndex(direction: StreamDirection): number {
	return STREAM_DIRECTION_INDEX.get(direction) ?? Number.POSITIVE_INFINITY;
}

export function directionBetween(
	shape: GridShape,
	fromTileId: number,
	toTileId: number,
): StreamDirection | null {
	const fromX = fromTileId % shape.width;
	const fromY = Math.floor(fromTileId / shape.width);
	const toX = toTileId % shape.width;
	const toY = Math.floor(toTileId / shape.width);
	const dx = toX - fromX;
	const dy = toY - fromY;

	return (
		STREAM_DIRECTIONS.find((direction) => {
			const [dirDx, dirDy] = STREAM_DIRECTION_DELTAS[direction];
			return dirDx === dx && dirDy === dy;
		}) ?? null
	);
}

export function deriveStreamNetwork(
	params: DeriveStreamNetworkParams,
): DeriveStreamNetworkResult {
	const origins = orderOrigins(selectOriginCandidates(params));
	const streams = origins
		.map((origin) => traceFromOrigin(origin))
		.filter((feature): feature is StreamFeature => feature !== null);

	void classifyTerminal;

	return {
		streams,
		tileGeometry: deriveTileGeometry(params.shape, streams),
	};
}
