import {
	createHydrologyMaps,
	DIR8_CODE,
	DIR8_NONE,
	type HydrologyMapsSoA,
} from "../domain/hydrology.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";
import type {
	GridShape,
	TopographicStructureMapsSoA,
} from "../domain/topography.js";
import type { JsonObject } from "../domain/types.js";
import {
	deriveLakeAccounting,
	type LakeAccountingResult,
} from "./derive-lake-accounting.js";

// Hydrology core protection note:
// Agent-driven changes in this file require explicit, strictly scoped approval.
// Downstream systems may consume hydrology outputs, but must not redefine their semantics indirectly.

export interface StreamCoherenceMetrics {
	enabled: boolean;
	streamTiles: number;
}

export interface LakeCoherenceMetrics {
	enabled: boolean;
	lakeTiles: number;
}

export interface HydrologyStructureDiagnostics {
	sinkCount: number;
	overflowFallbackCount: number;
	overflowAppliedCount: number;
}

export interface HydrologyDeriveResult {
	maps: HydrologyMapsSoA;
	diagnostics: HydrologyStructureDiagnostics;
	streamCoherence: StreamCoherenceMetrics;
	lakeCoherence: LakeCoherenceMetrics;
	lakeAccounting: LakeAccountingResult;
}

interface HydrologyParams {
	sinkMode: "strict_local" | "overflow_guided";
	faThreshold: number;
	quantileThreshold?: number;
	wetnessScale: number;
}

interface FlowAccumulationResult {
	fa: Uint32Array;
	inDeg: Uint8Array;
}

const DIR_BY_DELTA = new Map<string, number>([
	["1,0", DIR8_CODE.e],
	["1,1", DIR8_CODE.se],
	["0,1", DIR8_CODE.s],
	["-1,1", DIR8_CODE.sw],
	["-1,0", DIR8_CODE.w],
	["-1,-1", DIR8_CODE.nw],
	["0,-1", DIR8_CODE.n],
	["1,-1", DIR8_CODE.ne],
]);

const DIR_TO_DELTA = new Map<number, readonly [number, number]>([
	[DIR8_CODE.e, [1, 0]],
	[DIR8_CODE.se, [1, 1]],
	[DIR8_CODE.s, [0, 1]],
	[DIR8_CODE.sw, [-1, 1]],
	[DIR8_CODE.w, [-1, 0]],
	[DIR8_CODE.nw, [-1, -1]],
	[DIR8_CODE.n, [0, -1]],
	[DIR8_CODE.ne, [1, -1]],
]);

const NEIGHBORS = [
	{ dx: -1, dy: -1 },
	{ dx: 0, dy: -1 },
	{ dx: 1, dy: -1 },
	{ dx: -1, dy: 0 },
	{ dx: 1, dy: 0 },
	{ dx: -1, dy: 1 },
	{ dx: 0, dy: 1 },
	{ dx: 1, dy: 1 },
] as const;

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const readHydrologyParams = (params: JsonObject): HydrologyParams => {
	const hydrology = isObject(params.hydrology)
		? (params.hydrology as JsonObject)
		: {};
	const sinkModeRaw = hydrology.sinkMode;
	const sinkMode =
		sinkModeRaw === "overflow_guided" ? "overflow_guided" : "strict_local";
	const faThresholdRaw = hydrology.faThreshold;
	const faThreshold =
		typeof faThresholdRaw === "number" &&
			Number.isFinite(faThresholdRaw) &&
			faThresholdRaw >= 0
			? Math.floor(faThresholdRaw)
			: 16;
	const quantileRaw = hydrology.faQuantileThreshold;
	const quantileThreshold =
		typeof quantileRaw === "number" && Number.isFinite(quantileRaw)
			? Math.max(0, Math.min(1, quantileRaw))
			: undefined;
	const lakeFill = isObject(hydrology.lakeFill)
		? (hydrology.lakeFill as JsonObject)
		: {};
	const wetnessScaleRaw = lakeFill.wetnessScale;
	const wetnessScale =
		typeof wetnessScaleRaw === "number" &&
			Number.isFinite(wetnessScaleRaw) &&
			wetnessScaleRaw >= 0
			? wetnessScaleRaw
			: 1;
	return { sinkMode, faThreshold, quantileThreshold, wetnessScale };
};

const indexToXY = (shape: GridShape, index: number): [number, number] => [
	index % shape.width,
	Math.floor(index / shape.width),
];

const toIndex = (shape: GridShape, x: number, y: number): number =>
	y * shape.width + x;

const compareCandidates = (
	shape: GridShape,
	current: number,
	a: number,
	b: number,
): number => {
	const [cx, cy] = indexToXY(shape, current);
	const [ax, ay] = indexToXY(shape, a);
	const [bx, by] = indexToXY(shape, b);
	const aDistance = Math.abs(ax - cx) + Math.abs(ay - cy);
	const bDistance = Math.abs(bx - cx) + Math.abs(by - cy);
	if (aDistance !== bDistance) {
		return aDistance - bDistance;
	}
	return a - b;
};

const chooseDownhill = (
	shape: GridShape,
	h: Float32Array,
	current: number,
): number | null => {
	const [x, y] = indexToXY(shape, current);
	const currentH = h[current];
	const candidates: number[] = [];
	NEIGHBORS.forEach(({ dx, dy }) => {
		const nx = x + dx;
		const ny = y + dy;
		if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
			return;
		}
		const ni = toIndex(shape, nx, ny);
		if (h[ni] < currentH) {
			candidates.push(ni);
		}
	});
	if (candidates.length === 0) {
		return null;
	}
	let best = candidates[0];
	for (const candidate of candidates.slice(1)) {
		if (h[candidate] < h[best]) {
			best = candidate;
			continue;
		}
		if (
			h[candidate] === h[best] &&
			compareCandidates(shape, current, candidate, best) < 0
		) {
			best = candidate;
		}
	}
	return best;
};

const collectBasinTileSets = (
	basinsById: Map<string, TopographicFeatureNode>,
): Map<string, Set<number>> => {
	const cache = new Map<string, Set<number>>();
	const resolve = (basinId: string, visiting: Set<string>): Set<number> => {
		const cached = cache.get(basinId);
		if (cached) {
			return cached;
		}
		if (visiting.has(basinId)) {
			return new Set<number>();
		}
		visiting.add(basinId);
		const basin = basinsById.get(basinId);
		const tileSet = new Set<number>(
			Array.isArray(basin?.tileIds)
				? basin.tileIds.filter(
					(value): value is number =>
						typeof value === "number" &&
						Number.isInteger(value) &&
						value >= 0,
				)
				: [],
		);
		const childIds = Array.isArray(basin?.childIds)
			? basin.childIds.filter(
				(value): value is string => typeof value === "string",
			)
			: [];
		for (const childId of childIds) {
			for (const tileId of resolve(childId, visiting)) {
				tileSet.add(tileId);
			}
		}
		visiting.delete(basinId);
		cache.set(basinId, tileSet);
		return tileSet;
	};
	for (const basinId of basinsById.keys()) {
		resolve(basinId, new Set<string>());
	}
	return cache;
};

const isAdjacentDir8 = (shape: GridShape, a: number, b: number): boolean => {
	const [ax, ay] = indexToXY(shape, a);
	const [bx, by] = indexToXY(shape, b);
	const dx = Math.abs(ax - bx);
	const dy = Math.abs(ay - by);
	return (dx > 0 || dy > 0) && dx <= 1 && dy <= 1;
};

const buildTileBasinCandidates = (tileFeatureIds: string[][]): string[][] =>
	tileFeatureIds.map((featureIds) =>
		featureIds.filter((id): id is string => id.startsWith("b_")),
	);

const resolveOverflowTarget = (
	shape: GridShape,
	lakeAccountingById: Map<string, LakeAccountingResult["basins"][number]>,
	basinTileSets: Map<string, Set<number>>,
	basinCandidatesByTile: string[][],
	current: number,
	size: number,
): number | null => {
	const candidates = basinCandidatesByTile[current] ?? [];
	for (const basinId of candidates) {
		const accounting = lakeAccountingById.get(basinId);
		if (!accounting || accounting.role !== "overflow_carrier") {
			continue;
		}
		const spillFrom = accounting.childSpillFromTileId;
		const spillTo = accounting.parentContactTileId;
		if (spillFrom === null || spillTo === null) {
			continue;
		}
		if (
			spillFrom < 0 ||
			spillFrom >= size ||
			spillTo < 0 ||
			spillTo >= size ||
			spillTo === current
		) {
			continue;
		}
		const basinTiles = basinTileSets.get(basinId);
		if (!basinTiles || !basinTiles.has(spillFrom) || basinTiles.has(spillTo)) {
			continue;
		}
		if (!isAdjacentDir8(shape, spillFrom, spillTo)) {
			continue;
		}
		if (current !== spillFrom) {
			continue;
		}
		return spillTo;
	}
	return null;
};

const hasOverflowCarrierCandidate = (
	lakeAccountingById: Map<string, LakeAccountingResult["basins"][number]>,
	basinCandidatesByTile: string[][],
	current: number,
): boolean => {
	const candidates = basinCandidatesByTile[current] ?? [];
	return candidates.some((basinId) => {
		const accounting = lakeAccountingById.get(basinId);
		return accounting?.role === "overflow_carrier";
	});
};

const setFlowDirCode = (shape: GridShape, from: number, to: number): number => {
	const [fx, fy] = indexToXY(shape, from);
	const [tx, ty] = indexToXY(shape, to);
	const key = `${Math.sign(tx - fx)},${Math.sign(ty - fy)}`;
	return DIR_BY_DELTA.get(key) ?? DIR8_NONE;
};

const resolveFdTarget = (
	shape: GridShape,
	index: number,
	code: number,
): number | null => {
	if (code === DIR8_NONE) {
		return null;
	}
	const delta = DIR_TO_DELTA.get(code);
	if (!delta) {
		return null;
	}
	const x = index % shape.width;
	const y = Math.floor(index / shape.width);
	const nx = x + delta[0];
	const ny = y + delta[1];
	if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
		return null;
	}
	return toIndex(shape, nx, ny);
};

const insertSorted = (queue: number[], value: number, start: number): void => {
	let inserted = false;
	for (let i = start; i < queue.length; i += 1) {
		if (value < queue[i]) {
			queue.splice(i, 0, value);
			inserted = true;
			break;
		}
	}
	if (!inserted) {
		queue.push(value);
	}
};

const computeFlowAccumulation = (
	shape: GridShape,
	fd: Uint8Array,
): FlowAccumulationResult => {
	const inDeg = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		const target = resolveFdTarget(shape, i, fd[i] ?? DIR8_NONE);
		if (target !== null) {
			inDeg[target] += 1;
		}
	}
	const workInDeg = new Uint8Array(inDeg);
	const fa = new Uint32Array(shape.size).fill(1);
	const queue: number[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		if (workInDeg[i] === 0) {
			queue.push(i);
		}
	}
	queue.sort((a, b) => a - b);

	for (let q = 0; q < queue.length; q += 1) {
		const i = queue[q];
		const target = resolveFdTarget(shape, i, fd[i] ?? DIR8_NONE);
		if (target === null) {
			continue;
		}
		fa[target] += fa[i];
		workInDeg[target] -= 1;
		if (workInDeg[target] === 0) {
			insertSorted(queue, target, q + 1);
		}
	}
	return { fa, inDeg };
};

export const deriveHydrology = (
	shape: GridShape,
	topographyH: Float32Array,
	topographicStructure: Pick<
		TopographicStructureMapsSoA,
		"basinFeatures" | "tileFeatureIds"
	>,
	params: JsonObject,
): HydrologyDeriveResult => {
	const cfg = readHydrologyParams(params);
	const basinsById = new Map<string, TopographicFeatureNode>();
	for (const basin of topographicStructure.basinFeatures) {
		basinsById.set(basin.id, basin);
	}
	const basinTileSets = collectBasinTileSets(basinsById);
	const basinCandidatesByTile = buildTileBasinCandidates(
		topographicStructure.tileFeatureIds,
	);

	const baseFd = new Uint8Array(shape.size).fill(DIR8_NONE);
	for (let i = 0; i < shape.size; i += 1) {
		const downhill = chooseDownhill(shape, topographyH, i);
		if (downhill !== null) {
			baseFd[i] = setFlowDirCode(shape, i, downhill);
		}
	}
	const baseAccumulation = computeFlowAccumulation(shape, baseFd);

	const lakeAccounting = deriveLakeAccounting(
		shape,
		topographyH,
		baseFd,
		baseAccumulation.fa,
		topographicStructure.basinFeatures,
		{
			wetnessScale: cfg.wetnessScale,
			tileFeatureIds: topographicStructure.tileFeatureIds,
		},
	);
	const lakeAccountingById = lakeAccounting.byId;

	const finalFd = new Uint8Array(baseFd);
	let overflowFallbackCount = 0;
	let overflowAppliedCount = 0;
	if (cfg.sinkMode === "overflow_guided") {
		for (let i = 0; i < shape.size; i += 1) {
			if (finalFd[i] !== DIR8_NONE) {
				continue;
			}
			const target = resolveOverflowTarget(
				shape,
				lakeAccountingById,
				basinTileSets,
				basinCandidatesByTile,
				i,
				shape.size,
			);
			if (target !== null) {
				finalFd[i] = setFlowDirCode(shape, i, target);
				overflowAppliedCount += 1;
				continue;
			}
			if (
				hasOverflowCarrierCandidate(
					lakeAccountingById,
					basinCandidatesByTile,
					i,
				)
			) {
				overflowFallbackCount += 1;
			}
		}
	}

	const finalAccumulation = computeFlowAccumulation(shape, finalFd);
	const maps = createHydrologyMaps(shape);
	maps.fd.set(finalFd);
	maps.fa.set(finalAccumulation.fa);
	maps.inDeg.set(finalAccumulation.inDeg);

	for (let i = 0; i < shape.size; i += 1) {
		const depth = lakeAccounting.tileLakeDepth[i];
		const lakeBasinId = lakeAccounting.tileLakeBasinId[i] ?? "";
		if (lakeBasinId !== "" && typeof depth === "number") {
			maps.waterSurfaceH[i] = (topographyH[i] ?? 0) + depth;
		}
	}

	let maxFa = 0;
	for (let i = 0; i < shape.size; i += 1) {
		maxFa = Math.max(maxFa, maps.fa[i]);
	}
	const quantileThreshold = cfg.quantileThreshold;
	const faSorted =
		quantileThreshold !== undefined
			? Array.from(maps.fa).sort((a, b) => a - b)
			: [];
	const quantileCut =
		quantileThreshold !== undefined && faSorted.length > 0
			? faSorted[Math.floor((faSorted.length - 1) * quantileThreshold)]
			: 0;
	const threshold =
		quantileThreshold === undefined ? cfg.faThreshold : quantileCut;

	let streamTiles = 0;
	let sinkCount = 0;
	for (let i = 0; i < shape.size; i += 1) {
		maps.faN[i] = maxFa > 0 ? maps.fa[i] / maxFa : 0;
		if (maps.fa[i] >= threshold) {
			streamTiles += 1;
		}
		if (maps.fd[i] === DIR8_NONE) {
			sinkCount += 1;
		}
	}

	return {
		maps,
		diagnostics: {
			sinkCount,
			overflowFallbackCount,
			overflowAppliedCount,
		},
		streamCoherence: {
			enabled: true,
			streamTiles,
		},
		lakeCoherence: {
			enabled: true,
			lakeTiles: lakeAccounting.lakeTileCount,
		},
		lakeAccounting,
	};
};
