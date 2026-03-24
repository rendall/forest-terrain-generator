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

interface RankedNeighbor {
	tileId: number;
	direction: StreamDirection;
	h: number;
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

function inBounds(shape: GridShape, x: number, y: number): boolean {
	return x >= 0 && x < shape.width && y >= 0 && y < shape.height;
}

function angularTurnCost(
	previousDirection: StreamDirection,
	nextDirection: StreamDirection,
): number {
	const previousIndex = canonicalDirectionIndex(previousDirection);
	const nextIndex = canonicalDirectionIndex(nextDirection);
	const delta = Math.abs(previousIndex - nextIndex);
	return Math.min(delta, STREAM_DIRECTIONS.length - delta);
}

function gatherDownhillNeighbors(
	params: DeriveStreamNetworkParams,
	tileId: number,
	previousDirection: StreamDirection | null,
): RankedNeighbor[] {
	const x = tileId % params.shape.width;
	const y = Math.floor(tileId / params.shape.width);
	const currentH = params.h[tileId] ?? Number.POSITIVE_INFINITY;
	return STREAM_DIRECTIONS.map((direction) => {
		const [dx, dy] = STREAM_DIRECTION_DELTAS[direction];
		const nx = x + dx;
		const ny = y + dy;
		if (!inBounds(params.shape, nx, ny)) {
			return null;
		}
		const nextTileId = ny * params.shape.width + nx;
		const nextH = params.h[nextTileId] ?? Number.POSITIVE_INFINITY;
		if (!(nextH < currentH)) {
			return null;
		}
		return { tileId: nextTileId, direction, h: nextH };
	})
		.filter((candidate): candidate is RankedNeighbor => candidate !== null)
		.sort((left, right) => {
			if (left.h !== right.h) {
				return left.h - right.h;
			}
			if (previousDirection) {
				const leftTurn = angularTurnCost(previousDirection, left.direction);
				const rightTurn = angularTurnCost(previousDirection, right.direction);
				if (leftTurn !== rightTurn) {
					return leftTurn - rightTurn;
				}
			}
			const leftIdx = canonicalDirectionIndex(left.direction);
			const rightIdx = canonicalDirectionIndex(right.direction);
			if (leftIdx !== rightIdx) {
				return leftIdx - rightIdx;
			}
			return left.tileId - right.tileId;
		});
}

function traceFromOrigin(
	params: DeriveStreamNetworkParams,
	origin: StreamOriginCandidate,
	streamIndex: number,
	existingStreamTiles: Set<number>,
): StreamFeature {
	const pathTileIds = [origin.tileId];
	const visited = new Set(pathTileIds);
	const candidateState = new Map<
		number,
		{ candidates: RankedNeighbor[]; index: number }
	>();
	let terminalKind: StreamTerminalKind = "error";
	let terminalTileId = origin.tileId;
	let resolved = false;
	let guard = 0;

	while (
		!resolved &&
		pathTileIds.length > 0 &&
		guard < params.shape.size * params.shape.size
	) {
		guard += 1;
		const currentTileId = pathTileIds[pathTileIds.length - 1];
		const previousTileId = pathTileIds[pathTileIds.length - 2] ?? null;
		const previousDirection =
			previousTileId === null
				? null
				: directionBetween(params.shape, previousTileId, currentTileId);
		const state = candidateState.get(currentTileId) ?? {
			candidates: gatherDownhillNeighbors(
				params,
				currentTileId,
				previousDirection,
			),
			index: 0,
		};
		candidateState.set(currentTileId, state);

		if (state.candidates.length === 0) {
			terminalKind = pathTileIds.length === 1 ? "error" : "sink";
			terminalTileId = currentTileId;
			resolved = true;
			break;
		}

		let progressed = false;
		while (state.index < state.candidates.length) {
			const next = state.candidates[state.index];
			state.index += 1;
			if (visited.has(next.tileId)) {
				continue;
			}
			if (existingStreamTiles.has(next.tileId)) {
				pathTileIds.push(next.tileId);
				terminalKind = "confluence";
				terminalTileId = next.tileId;
				resolved = true;
				progressed = true;
				break;
			}
			pathTileIds.push(next.tileId);
			visited.add(next.tileId);
			progressed = true;
			break;
		}

		if (resolved) {
			break;
		}
		if (progressed) {
			continue;
		}

		candidateState.delete(currentTileId);
		if (pathTileIds.length === 1) {
			terminalKind = "error";
			terminalTileId = currentTileId;
			resolved = true;
			break;
		}
		const removed = pathTileIds.pop();
		if (removed !== undefined) {
			visited.delete(removed);
		}
	}

	if (!resolved) {
		terminalKind = "error";
		terminalTileId = pathTileIds[pathTileIds.length - 1] ?? origin.tileId;
	}

	return {
		id: `stream_${String(streamIndex).padStart(5, "0")}`,
		originTileId: origin.tileId,
		pathTileIds,
		terminalTileId,
		terminalKind,
	};
}

function classifyTerminal(): StreamTerminalKind {
	return "error";
}

function deriveTileGeometry(
	shape: GridShape,
	streams: StreamFeature[],
): TileStreamGeometry[] {
	const geometry = createEmptyTileStreamGeometry(shape.size);
	for (const stream of streams) {
		for (let index = 0; index < stream.pathTileIds.length - 1; index += 1) {
			const fromTileId = stream.pathTileIds[index];
			const toTileId = stream.pathTileIds[index + 1];
			const outgoing = directionBetween(shape, fromTileId, toTileId);
			const incoming = directionBetween(shape, toTileId, fromTileId);
			if (outgoing && geometry[fromTileId].outgoingDirection === null) {
				geometry[fromTileId].outgoingDirection = outgoing;
			}
			if (incoming) {
				geometry[toTileId].incomingDirections.push(incoming);
			}
		}
	}
	for (const tile of geometry) {
		tile.incomingDirections = [...new Set(tile.incomingDirections)].sort(
			(left, right) =>
				canonicalDirectionIndex(left) - canonicalDirectionIndex(right),
		);
	}
	return geometry;
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
	const coveredTileIds = new Set<number>();
	const streams: StreamFeature[] = [];
	for (const origin of origins) {
		if (coveredTileIds.has(origin.tileId)) {
			continue;
		}
		const stream = traceFromOrigin(
			params,
			origin,
			streams.length,
			coveredTileIds,
		);
		streams.push(stream);
		stream.pathTileIds.forEach((tileId) => {
			coveredTileIds.add(tileId);
		});
	}

	void classifyTerminal;

	return {
		streams,
		tileGeometry: deriveTileGeometry(params.shape, streams),
	};
}
