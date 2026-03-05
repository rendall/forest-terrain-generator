import { DIR8_CODE, DIR8_NONE } from "../domain/hydrology.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";
import type { GridShape } from "../domain/topography.js";

export interface LakeAccountingParams {
	wetnessScale: number;
}

export interface BasinLakeAccounting {
	id: string;
	parentId: string | null;
	childIds: string[];
	externalInflow: number;
	totalInflow: number;
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
							tileId >= 0,
					)
				: [],
		);
		for (const childId of Array.isArray(basin?.childIds) ? basin.childIds : []) {
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

const computeSpillCapacity = (
	h: Float32Array,
	tiles: Set<number>,
	mergeH: number,
): number => {
	let sum = 0;
	for (const tileId of tiles) {
		sum += Math.max(0, mergeH - (h[tileId] ?? 0));
	}
	return sum;
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
		for (const childId of Array.isArray(basin?.childIds) ? basin.childIds : []) {
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
	const expandedTileSets = collectExpandedTileSets(basinsById);
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
	const byId = new Map<string, BasinLakeAccounting>();

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
		const allChildrenFilled = childIds.every(
			(childId) => byId.get(childId)?.isFilled === true,
		);
		const effectiveInflow = allChildrenFilled ? totalInflow : 0;
		const mergeH =
			typeof basin.mergeH === "number" && Number.isFinite(basin.mergeH)
				? basin.mergeH
				: 1;
		const spillCapacity = computeSpillCapacity(
			h,
			expandedTileSets.get(basinId) ?? new Set<number>(),
			mergeH,
		);
		const fillRatio =
			spillCapacity > 0
				? (wetnessScale * effectiveInflow) / spillCapacity
				: Number.POSITIVE_INFINITY;
		const isFilled = wetnessScale * effectiveInflow >= spillCapacity;
		const overflowExcess = Math.max(
			0,
			wetnessScale * effectiveInflow - spillCapacity,
		);
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
			externalInflow,
			// totalInflow remains raw (external + child overflow); child gating applies
			// through effectiveInflow for fill and overflow computations.
			totalInflow,
			spillCapacity,
			fillRatio,
			isFilled,
			overflowExcess,
			role: canOverflow ? "overflow_carrier" : isFilled ? "terminal_lake" : "sink",
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
	let lakeTileCount = 0;
	for (const [basinId, accounting] of byId) {
		if (!accounting.isFilled) {
			continue;
		}
		const level =
			typeof accounting.mergeH === "number" && Number.isFinite(accounting.mergeH)
				? accounting.mergeH
				: 1;
		const tiles = expandedTileSets.get(basinId);
		if (!tiles) {
			continue;
		}
		for (const tileId of tiles) {
			const depth = Math.max(0, level - (h[tileId] ?? 0));
			if (depth <= 0) {
				continue;
			}
			if (
				depth > tileLakeDepth[tileId] ||
				(depth === tileLakeDepth[tileId] &&
					(tileLakeBasinId[tileId] === "" || basinId < tileLakeBasinId[tileId]))
			) {
				if (tileLakeDepth[tileId] <= 0) {
					lakeTileCount += 1;
				}
				tileLakeDepth[tileId] = depth;
				tileLakeBasinId[tileId] = basinId;
			}
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
