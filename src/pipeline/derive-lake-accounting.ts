import { DIR8_CODE, DIR8_NONE } from "../domain/hydrology.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";
import type { GridShape } from "../domain/topography.js";

export interface LakeAccountingParams {
	wetnessScale: number;
	tileFeatureIds?: string[][];
}

export interface BasinLakeAccounting {
	id: string;
	parentId: string | null;
	childIds: string[];
	waterSurfaceH?: number;
	externalInflow: number;
	totalInflow: number;
	allocatedVolume: number;
	spillCapacity: number;
	fillRatio: number;
	isFilled: boolean;
	overflowExcess: number;
	role: "sink" | "overflow_carrier" | "terminal_lake";
	mergeH: number | null;
	childSpillFromTileId: number | null;
	parentContactTileId: number | null;
	spillOutTileId: number | null;
}

export interface LakeAccountingResult {
	basins: BasinLakeAccounting[];
	byId: Map<string, BasinLakeAccounting>;
	tileLakeDepth: Float32Array;
	tileLakeBasinId: string[];
	lakeTileCount: number;
}

const CHILD_CONNECT_EPS = 1e-9;
const WATER_SURFACE_EPS = 1e-9;
const WATER_SURFACE_SOLVE_STEPS = 60;

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

const toIndex = (shape: GridShape, x: number, y: number): number =>
	y * shape.width + x;

const targetFromFd = (
	shape: GridShape,
	index: number,
	fdCode: number,
): number | null => {
	if (fdCode === DIR8_NONE) {
		return null;
	}
	const delta = DIR_TO_DELTA.get(fdCode);
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

const collectExpandedTileSets = (
	shape: GridShape,
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
		const expanded = new Set<number>(
			Array.isArray(basin?.tileIds)
				? basin.tileIds.filter(
						(tileId): tileId is number =>
							typeof tileId === "number" &&
							Number.isInteger(tileId) &&
							tileId >= 0 &&
							tileId < shape.size,
					)
				: [],
		);
		for (const childId of Array.isArray(basin?.childIds)
			? basin.childIds
			: []) {
			if (typeof childId !== "string") {
				continue;
			}
			for (const tileId of resolve(childId, visiting)) {
				expanded.add(tileId);
			}
		}
		visiting.delete(basinId);
		cache.set(basinId, expanded);
		return expanded;
	};

	for (const basinId of basinsById.keys()) {
		resolve(basinId, new Set<string>());
	}
	return cache;
};

const buildTileMembership = (
	size: number,
	expandedTileSets: Map<string, Set<number>>,
): { membershipList: string[][]; membershipSet: Array<Set<string>> } => {
	const membershipList = Array.from({ length: size }, () => [] as string[]);
	for (const [basinId, tiles] of expandedTileSets) {
		for (const tileId of tiles) {
			if (tileId >= 0 && tileId < size) {
				membershipList[tileId].push(basinId);
			}
		}
	}
	for (const ids of membershipList) {
		ids.sort();
	}
	return {
		membershipList,
		membershipSet: membershipList.map((ids) => new Set(ids)),
	};
};

const computeExternalInflow = (
	shape: GridShape,
	fdBase: Uint8Array,
	faBase: Uint32Array,
	basinIds: Iterable<string>,
	tileMembershipList: string[][],
	tileMembershipSet: Array<Set<string>>,
): Map<string, number> => {
	const externalInflowById = new Map<string, number>();
	for (const basinId of basinIds) {
		externalInflowById.set(basinId, 0);
	}

	for (let u = 0; u < shape.size; u += 1) {
		const v = targetFromFd(shape, u, fdBase[u] ?? DIR8_NONE);
		if (v === null) {
			continue;
		}
		const sourceMembership = tileMembershipSet[u];
		for (const basinId of tileMembershipList[v]) {
			if (sourceMembership.has(basinId)) {
				continue;
			}
			externalInflowById.set(
				basinId,
				(externalInflowById.get(basinId) ?? 0) + (faBase[u] ?? 0),
			);
		}
	}
	return externalInflowById;
};

const computeSubmergedStorageAtLevel = (
	h: Float32Array,
	tiles: Set<number>,
	level: number,
): number => {
	let sum = 0;
	for (const tileId of tiles) {
		sum += Math.max(0, level - (h[tileId] ?? 0));
	}
	return sum;
};

const computeIncrementalStorageAboveLevel = (
	h: Float32Array,
	tiles: Set<number>,
	baseLevel: number,
	level: number,
): number => {
	let sum = 0;
	for (const tileId of tiles) {
		const floor = Math.max(baseLevel, h[tileId] ?? 0);
		sum += Math.max(0, level - floor);
	}
	return sum;
};

const computeSpillCapacity = (
	h: Float32Array,
	tiles: Set<number>,
	spillSurfaceH: number,
	baseLevel?: number,
): number =>
	typeof baseLevel === "number" && Number.isFinite(baseLevel)
		? computeIncrementalStorageAboveLevel(h, tiles, baseLevel, spillSurfaceH)
		: computeSubmergedStorageAtLevel(h, tiles, spillSurfaceH);

const solvePartialWaterSurface = (
	h: Float32Array,
	tiles: Set<number>,
	targetVolume: number,
	spillSurfaceH: number,
	baseLevel?: number,
): number => {
	let minTileH = Number.POSITIVE_INFINITY;
	for (const tileId of tiles) {
		minTileH = Math.min(minTileH, h[tileId] ?? 0);
	}
	if (!Number.isFinite(minTileH)) {
		return spillSurfaceH;
	}
	const lowerBound =
		typeof baseLevel === "number" && Number.isFinite(baseLevel)
			? Math.max(baseLevel, minTileH)
			: minTileH;
	let lo = lowerBound;
	let hi = spillSurfaceH;
	for (let i = 0; i < WATER_SURFACE_SOLVE_STEPS; i += 1) {
		const mid = (lo + hi) / 2;
		const storageAtMid =
			typeof baseLevel === "number" && Number.isFinite(baseLevel)
				? computeIncrementalStorageAboveLevel(h, tiles, lowerBound, mid)
				: computeSubmergedStorageAtLevel(h, tiles, mid);
		if (storageAtMid >= targetVolume) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hi;
};

const sortBasinIdsPostorder = (
	basinsById: Map<string, TopographicFeatureNode>,
): string[] => {
	const visited = new Set<string>();
	const inPath = new Set<string>();
	const order: string[] = [];

	const visit = (basinId: string) => {
		if (visited.has(basinId)) {
			return;
		}
		if (inPath.has(basinId)) {
			return;
		}
		inPath.add(basinId);
		const basin = basinsById.get(basinId);
		for (const childId of Array.isArray(basin?.childIds)
			? basin.childIds
			: []) {
			if (typeof childId === "string" && basinsById.has(childId)) {
				visit(childId);
			}
		}
		inPath.delete(basinId);
		visited.add(basinId);
		order.push(basinId);
	};

	const basinIds = Array.from(basinsById.keys()).sort();
	for (const basinId of basinIds) {
		visit(basinId);
	}
	return order;
};

const computeBasinSpecificityDepths = (
	basinsById: Map<string, TopographicFeatureNode>,
): Map<string, number> => {
	const depthById = new Map<string, number>();
	const inPath = new Set<string>();
	const resolveDepth = (basinId: string): number => {
		const cached = depthById.get(basinId);
		if (cached !== undefined) {
			return cached;
		}
		if (inPath.has(basinId)) {
			return 0;
		}
		inPath.add(basinId);
		const basin = basinsById.get(basinId);
		const parentId =
			typeof basin?.parentId === "string" ? basin.parentId : null;
		const depth =
			parentId !== null && basinsById.has(parentId)
				? resolveDepth(parentId) + 1
				: 0;
		inPath.delete(basinId);
		depthById.set(basinId, depth);
		return depth;
	};
	for (const basinId of basinsById.keys()) {
		resolveDepth(basinId);
	}
	return depthById;
};

const chooseMostSpecificBasinId = (
	candidateIds: readonly string[],
	specificityDepthById: Map<string, number>,
): string => {
	let selected = "";
	let selectedDepth = Number.NEGATIVE_INFINITY;
	for (const basinId of candidateIds) {
		const specificity = specificityDepthById.get(basinId) ?? 0;
		if (
			selected === "" ||
			specificity > selectedDepth ||
			(specificity === selectedDepth && basinId < selected)
		) {
			selected = basinId;
			selectedDepth = specificity;
		}
	}
	return selected;
};

const buildTileSelfBasinIds = (
	size: number,
	tileFeatureIds: string[][] | undefined,
	membershipList: string[][],
	specificityDepthById: Map<string, number>,
): string[] => {
	const selfBasinIds = new Array<string>(size).fill("");
	for (let tileId = 0; tileId < size; tileId += 1) {
		const featureIds = tileFeatureIds?.[tileId] ?? [];
		const basinIdsFromFeatures = featureIds.filter((id) => id.startsWith("b_"));
		if (basinIdsFromFeatures.length > 0) {
			selfBasinIds[tileId] = chooseMostSpecificBasinId(
				basinIdsFromFeatures,
				specificityDepthById,
			);
			continue;
		}
		const candidateIds = membershipList[tileId] ?? [];
		if (candidateIds.length > 0) {
			selfBasinIds[tileId] = chooseMostSpecificBasinId(
				candidateIds,
				specificityDepthById,
			);
		}
	}
	return selfBasinIds;
};

export const deriveLakeAccounting = (
	shape: GridShape,
	h: Float32Array,
	fdBase: Uint8Array,
	faBase: Uint32Array,
	basinFeatures: TopographicFeatureNode[],
	params: LakeAccountingParams,
): LakeAccountingResult => {
	const wetnessScale =
		Number.isFinite(params.wetnessScale) && params.wetnessScale >= 0
			? params.wetnessScale
			: 1;
	const basinsById = new Map<string, TopographicFeatureNode>();
	for (const basin of basinFeatures) {
		basinsById.set(basin.id, basin);
	}
	for (const basin of basinFeatures) {
		const childIds = Array.isArray(basin.childIds)
			? basin.childIds.filter(
					(childId): childId is string => typeof childId === "string",
				)
			: [];
		for (const childId of childIds) {
			if (!basinsById.has(childId)) {
				throw new Error(
					`Lake accounting topology error: basin "${basin.id}" references missing child basin "${childId}".`,
				);
			}
		}
	}
	const expandedTileSets = collectExpandedTileSets(shape, basinsById);
	const { membershipList, membershipSet } = buildTileMembership(
		shape.size,
		expandedTileSets,
	);
	const externalInflowById = computeExternalInflow(
		shape,
		fdBase,
		faBase,
		basinsById.keys(),
		membershipList,
		membershipSet,
	);
	const postorder = sortBasinIdsPostorder(basinsById);
	const specificityDepthById = computeBasinSpecificityDepths(basinsById);
	const tileSelfBasinIds = buildTileSelfBasinIds(
		shape.size,
		params.tileFeatureIds,
		membershipList,
		specificityDepthById,
	);
	const byId = new Map<string, BasinLakeAccounting>();
	const spillWetnessById = new Map<string, number>();
	const upwardRateById = new Map<string, number>();

	for (const basinId of postorder) {
		const basin = basinsById.get(basinId);
		if (!basin) {
			continue;
		}
		const childIds = Array.isArray(basin.childIds)
			? basin.childIds.filter(
					(childId): childId is string => typeof childId === "string",
				)
			: [];
		const externalInflow = externalInflowById.get(basinId) ?? 0;
		const childOverflow = childIds.reduce((sum, childId) => {
			const child = byId.get(childId);
			return sum + (child?.overflowExcess ?? 0);
		}, 0);
		const totalInflow = externalInflow + childOverflow;
		// V(B) is the basin-allocated water volume after child-first allocation.
		// Parent onset is strict excess over child-connect threshold.
		const gateOpenWetness =
			childIds.length === 0
				? 0
				: childIds.reduce((maxScale, childId) => {
						const childSpillWetness =
							spillWetnessById.get(childId) ?? Number.POSITIVE_INFINITY;
						return Math.max(maxScale, childSpillWetness);
					}, 0);
		const childUpwardRate = childIds.reduce(
			(sum, childId) => sum + (upwardRateById.get(childId) ?? 0),
			0,
		);
		const upwardRate = externalInflow + childUpwardRate;
		const excessWetnessScale = Math.max(0, wetnessScale - gateOpenWetness);
		// presentedVolume is the incoming/pre-spill volume that reaches this basin
		// once strict child-connect gating is applied.
		const presentedVolume =
			excessWetnessScale > CHILD_CONNECT_EPS ? excessWetnessScale * upwardRate : 0;
		const mergeH =
			typeof basin.mergeH === "number" && Number.isFinite(basin.mergeH)
				? basin.mergeH
				: 1;
		const childMergeFloorH =
			childIds.length === 0
				? undefined
				: childIds.reduce<number | undefined>((floor, childId) => {
						const childMergeH = basinsById.get(childId)?.mergeH;
						if (
							typeof childMergeH !== "number" ||
							!Number.isFinite(childMergeH)
						) {
							return floor;
						}
						if (typeof floor !== "number") {
							return childMergeH;
						}
						return Math.max(floor, childMergeH);
					}, undefined);
		const basinTiles = expandedTileSets.get(basinId) ?? new Set<number>();
		const spillCapacity = computeSpillCapacity(
			h,
			basinTiles,
			mergeH,
			childMergeFloorH,
		);
		// allocatedVolume is retained/capped basin volume only.
		const allocatedVolume = Math.min(
			presentedVolume,
			Math.max(0, spillCapacity),
		);
		const fillRatio = spillCapacity > 0 ? allocatedVolume / spillCapacity : 0;
		const isFilled = allocatedVolume >= spillCapacity;
		let waterSurfaceH: number | undefined;
		if (allocatedVolume > WATER_SURFACE_EPS) {
			if (
				spillCapacity <= WATER_SURFACE_EPS ||
				allocatedVolume >= spillCapacity - WATER_SURFACE_EPS
			) {
				waterSurfaceH = mergeH;
			} else {
				waterSurfaceH = solvePartialWaterSurface(
					h,
					basinTiles,
					allocatedVolume,
					mergeH,
					childMergeFloorH,
				);
			}
		}
		// overflowExcess carries all water that does not remain retained in this basin.
		const overflowExcess = Math.max(0, presentedVolume - spillCapacity);
		const spillWetness =
			spillCapacity <= WATER_SURFACE_EPS
				? gateOpenWetness
				: upwardRate > WATER_SURFACE_EPS
					? gateOpenWetness + spillCapacity / upwardRate
					: Number.POSITIVE_INFINITY;
		spillWetnessById.set(basinId, spillWetness);
		upwardRateById.set(basinId, upwardRate);
		const isOrdinaryRoot = basin.parentId === null && basin.mergeH === null;
		if (
			isOrdinaryRoot &&
			spillCapacity <= CHILD_CONNECT_EPS &&
			presentedVolume > CHILD_CONNECT_EPS
		) {
			throw new Error(
				`Lake accounting invariant error: root basin "${basinId}" reaches impossible full-map fill state.`,
			);
		}
		const childSpillFromTileId =
			typeof basin.childSpillFromTileId === "number" &&
			Number.isInteger(basin.childSpillFromTileId)
				? basin.childSpillFromTileId
				: null;
		const parentContactTileId =
			typeof basin.parentContactTileId === "number" &&
			Number.isInteger(basin.parentContactTileId)
				? basin.parentContactTileId
				: null;
		const canOverflow =
			isFilled &&
			basin.parentId !== null &&
			childSpillFromTileId !== null &&
			parentContactTileId !== null;

		byId.set(basinId, {
			id: basinId,
			parentId: basin.parentId ?? null,
			childIds,
			...(typeof waterSurfaceH === "number" ? { waterSurfaceH } : {}),
			externalInflow,
			// totalInflow remains raw (external + child overflow); child gating applies
			// only through presentedVolume for fill/overflow computations.
			totalInflow,
			// allocatedVolume is retained basin volume after spill capping.
			allocatedVolume,
			spillCapacity,
			fillRatio,
			isFilled,
			overflowExcess,
			role: canOverflow
				? "overflow_carrier"
				: isFilled
					? "terminal_lake"
					: "sink",
			mergeH: typeof basin.mergeH === "number" ? basin.mergeH : null,
			childSpillFromTileId,
			parentContactTileId,
			spillOutTileId:
				typeof basin.spillOutTileId === "number" &&
				Number.isInteger(basin.spillOutTileId)
					? basin.spillOutTileId
					: null,
		});
	}

	const tileLakeDepth = new Float32Array(shape.size);
	const tileLakeBasinId = new Array<string>(shape.size).fill("");
	const hasTileWaterSurface = new Uint8Array(shape.size);
	for (let tileId = 0; tileId < shape.size; tileId += 1) {
		let governingBasinId = "";
		let candidateBasinId = tileSelfBasinIds[tileId] ?? "";
		let highestWetBasinId = "";
		while (candidateBasinId !== "") {
			const accounting = byId.get(candidateBasinId);
			if (!accounting) {
				break;
			}
			if (
				typeof accounting.waterSurfaceH === "number" &&
				Number.isFinite(accounting.waterSurfaceH)
			) {
				highestWetBasinId = candidateBasinId;
			}
			if (!accounting.isFilled) {
				governingBasinId = candidateBasinId;
				break;
			}
			candidateBasinId = accounting.parentId ?? "";
		}
		if (governingBasinId === "" && highestWetBasinId !== "") {
			governingBasinId = highestWetBasinId;
		}
		if (governingBasinId === "") {
			continue;
		}
		const governingLevel = byId.get(governingBasinId)?.waterSurfaceH;
		if (typeof governingLevel !== "number" || !Number.isFinite(governingLevel)) {
			continue;
		}
		tileLakeDepth[tileId] = governingLevel - (h[tileId] ?? 0);
		tileLakeBasinId[tileId] = governingBasinId;
		hasTileWaterSurface[tileId] = 1;
	}
	let lakeTileCount = 0;
	for (let tileId = 0; tileId < shape.size; tileId += 1) {
		if (hasTileWaterSurface[tileId] === 1 && tileLakeDepth[tileId] > 0) {
			lakeTileCount += 1;
		}
	}

	return {
		basins: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)),
		byId,
		tileLakeDepth,
		tileLakeBasinId,
		lakeTileCount,
	};
};
