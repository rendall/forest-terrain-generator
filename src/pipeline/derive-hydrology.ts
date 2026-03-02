import {
	DIR8_CODE,
	DIR8_NONE,
	WATER_CLASS_CODE,
	createHydrologyMaps,
	type HydrologyMapsSoA,
} from "../domain/hydrology.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";
import type { JsonObject } from "../domain/types.js";
import type { GridShape, TopographicStructureMapsSoA } from "../domain/topography.js";

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
}

interface HydrologyParams {
	sinkMode: "strict_local" | "overflow_guided";
	faThreshold: number;
	quantileThreshold?: number;
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
	const hydrology = isObject(params.hydrology) ? (params.hydrology as JsonObject) : {};
	const sinkModeRaw = hydrology.sinkMode;
	const sinkMode =
		sinkModeRaw === "overflow_guided" ? "overflow_guided" : "strict_local";
	const faThresholdRaw = hydrology.faThreshold;
	const faThreshold =
		typeof faThresholdRaw === "number" && Number.isFinite(faThresholdRaw) && faThresholdRaw >= 0
			? Math.floor(faThresholdRaw)
			: 16;
	const quantileRaw = hydrology.faQuantileThreshold;
	const quantileThreshold =
		typeof quantileRaw === "number" && Number.isFinite(quantileRaw)
			? Math.max(0, Math.min(1, quantileRaw))
			: undefined;
	return { sinkMode, faThreshold, quantileThreshold };
};

const indexToXY = (shape: GridShape, index: number): [number, number] => [
	index % shape.width,
	Math.floor(index / shape.width),
];

const toIndex = (shape: GridShape, x: number, y: number): number => y * shape.width + x;

const compareCandidates = (
	shape: GridShape,
	current: number,
	a: number,
	b: number,
): number => {
	const [cx, cy] = indexToXY(shape, current);
	const [ax, ay] = indexToXY(shape, a);
	const [bx, by] = indexToXY(shape, b);
	const centerX = (shape.width - 1) / 2;
	const centerY = (shape.height - 1) / 2;
	const dirX = centerX - cx;
	const dirY = centerY - cy;
	const aFlow = (ax - cx) * dirX + (ay - cy) * dirY;
	const bFlow = (bx - cx) * dirX + (by - cy) * dirY;
	if (aFlow !== bFlow) {
		return bFlow - aFlow;
	}
	const aCenterDist = (centerX - ax) ** 2 + (centerY - ay) ** 2;
	const bCenterDist = (centerX - bx) ** 2 + (centerY - by) ** 2;
	if (aCenterDist !== bCenterDist) {
		return aCenterDist - bCenterDist;
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
		if (h[candidate] === h[best] && compareCandidates(shape, current, candidate, best) < 0) {
			best = candidate;
		}
	}
	return best;
};

const resolveOverflowTarget = (
	basinsById: Map<string, TopographicFeatureNode>,
	basinIdByTile: string[],
	current: number,
	size: number,
): number | null => {
	const basinId = basinIdByTile[current];
	if (!basinId) {
		return null;
	}
	const basin = basinsById.get(basinId);
	if (!basin) {
		return null;
	}
	const candidate =
		typeof basin.parentContactTileId === "number"
			? basin.parentContactTileId
			: typeof basin.spillOutTileId === "number"
				? basin.spillOutTileId
				: null;
	if (candidate === null || candidate < 0 || candidate >= size || candidate === current) {
		return null;
	}
	return candidate;
};

const setFlowDirCode = (shape: GridShape, from: number, to: number): number => {
	const [fx, fy] = indexToXY(shape, from);
	const [tx, ty] = indexToXY(shape, to);
	const key = `${Math.sign(tx - fx)},${Math.sign(ty - fy)}`;
	return DIR_BY_DELTA.get(key) ?? DIR8_NONE;
};

export const deriveHydrology = (
	shape: GridShape,
	topographyH: Float32Array,
	topographicStructure: Pick<TopographicStructureMapsSoA, "basinFeatures" | "tileFeatureIds">,
	params: JsonObject,
): HydrologyDeriveResult => {
	const cfg = readHydrologyParams(params);
	const maps = createHydrologyMaps(shape);
	const basinsById = new Map<string, TopographicFeatureNode>();
	topographicStructure.basinFeatures.forEach((b) => basinsById.set(b.id, b));
	const basinIdByTile = Array.from({ length: shape.size }, (_, i) =>
		topographicStructure.tileFeatureIds[i]?.find((id) => id.startsWith("b_")) ?? "",
	);
	let overflowFallbackCount = 0;
	let overflowAppliedCount = 0;

	for (let i = 0; i < shape.size; i += 1) {
		const downhill = chooseDownhill(shape, topographyH, i);
		if (downhill !== null) {
			maps.fd[i] = setFlowDirCode(shape, i, downhill);
			maps.inDeg[downhill] += 1;
			continue;
		}
		if (cfg.sinkMode === "overflow_guided") {
			const target = resolveOverflowTarget(basinsById, basinIdByTile, i, shape.size);
			if (target !== null) {
				maps.fd[i] = setFlowDirCode(shape, i, target);
				maps.inDeg[target] += 1;
				overflowAppliedCount += 1;
				continue;
			}
			overflowFallbackCount += 1;
		}
		maps.fd[i] = DIR8_NONE;
	}

	for (let i = 0; i < shape.size; i += 1) {
		maps.fa[i] = 1;
	}
	const queue: number[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		if (maps.inDeg[i] === 0) {
			queue.push(i);
		}
	}
	queue.sort((a, b) => a - b);
	for (let q = 0; q < queue.length; q += 1) {
		const i = queue[q];
		const code = maps.fd[i];
		if (code === DIR8_NONE) {
			continue;
		}
		const [x, y] = indexToXY(shape, i);
		const neighbor = NEIGHBORS.find(({ dx, dy }) => (DIR_BY_DELTA.get(`${dx},${dy}`) ?? -1) === code);
		if (!neighbor) {
			continue;
		}
		const nx = x + neighbor.dx;
		const ny = y + neighbor.dy;
		if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
			continue;
		}
		const to = toIndex(shape, nx, ny);
		maps.fa[to] += maps.fa[i];
		maps.inDeg[to] -= 1;
		if (maps.inDeg[to] === 0) {
			// stable ordering for equal-priority nodes
			let inserted = false;
			for (let k = q + 1; k < queue.length; k += 1) {
				if (to < queue[k]) {
					queue.splice(k, 0, to);
					inserted = true;
					break;
				}
			}
			if (!inserted) {
				queue.push(to);
			}
		}
	}

	let maxFa = 0;
	for (let i = 0; i < shape.size; i += 1) {
		maxFa = Math.max(maxFa, maps.fa[i]);
	}
	const quantileThreshold = cfg.quantileThreshold;
	const faSorted = quantileThreshold !== undefined ? Array.from(maps.fa).sort((a, b) => a - b) : [];
	const quantileCut =
		quantileThreshold !== undefined && faSorted.length > 0
			? faSorted[Math.floor((faSorted.length - 1) * quantileThreshold)]
			: 0;
	const threshold = quantileThreshold === undefined ? cfg.faThreshold : quantileCut;

	let streamTiles = 0;
	let sinkCount = 0;
	for (let i = 0; i < shape.size; i += 1) {
		maps.faN[i] = maxFa > 0 ? maps.fa[i] / maxFa : 0;
		const isStream = maps.fa[i] >= threshold;
		maps.isStream[i] = isStream ? 1 : 0;
		if (isStream) {
			streamTiles += 1;
			maps.waterClass[i] = WATER_CLASS_CODE.stream;
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
			enabled: false,
			lakeTiles: 0,
		},
	};
};
