import type { TopographicFeatureNode } from "../domain/topographic-features.js";

const featureOrdinal = (id: string): number => {
	const [, suffix] = id.split("_");
	const value = Number.parseInt(suffix ?? "", 10);
	return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const sortedBasinFeatures = (
	basinFeatures: TopographicFeatureNode[],
): TopographicFeatureNode[] =>
	[...basinFeatures].sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === "leaf" ? -1 : 1;
		}
		const ao = featureOrdinal(a.id);
		const bo = featureOrdinal(b.id);
		if (ao !== bo) {
			return ao - bo;
		}
		return a.id.localeCompare(b.id);
	});

export const collectExpandedBasinTileSets = (
	basinFeatures: TopographicFeatureNode[],
): Map<string, Set<number>> => {
	const byId = new Map<string, TopographicFeatureNode>();
	for (const basin of basinFeatures) {
		byId.set(basin.id, basin);
	}
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
		const basin = byId.get(basinId);
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
		const childIds = Array.isArray(basin?.childIds)
			? basin.childIds.filter(
					(childId): childId is string => typeof childId === "string",
				)
			: [];
		for (const childId of childIds) {
			for (const tileId of resolve(childId, visiting)) {
				expanded.add(tileId);
			}
		}
		visiting.delete(basinId);
		cache.set(basinId, expanded);
		return expanded;
	};
	for (const basinId of byId.keys()) {
		resolve(basinId, new Set<string>());
	}
	return cache;
};

interface BasinTileMembership {
	expandedTileSets: Map<string, Set<number>>;
	directBasinIdByTile: string[];
	basinIdsByTile: string[][];
	tileFeatureIds: string[][];
}

export const buildBasinTileMembership = (
	size: number,
	basinFeatures: TopographicFeatureNode[],
): BasinTileMembership => {
	const expandedTileSets = collectExpandedBasinTileSets(basinFeatures);
	const byId = new Map<string, TopographicFeatureNode>();
	for (const basin of basinFeatures) {
		byId.set(basin.id, basin);
	}
	const directBasinIdByTile = new Array<string>(size).fill("");
	for (const basin of sortedBasinFeatures(basinFeatures)) {
		if (!Array.isArray(basin.tileIds)) {
			continue;
		}
		for (const tileId of basin.tileIds) {
			if (
				typeof tileId !== "number" ||
				!Number.isInteger(tileId) ||
				tileId < 0 ||
				tileId >= size
			) {
				continue;
			}
			if (directBasinIdByTile[tileId] === "") {
				directBasinIdByTile[tileId] = basin.id;
			}
		}
	}

	const basinIdsByTile = Array.from({ length: size }, () => [] as string[]);
	for (const [basinId, tileSet] of expandedTileSets) {
		for (const tileId of tileSet) {
			if (tileId >= 0 && tileId < size) {
				basinIdsByTile[tileId].push(basinId);
			}
		}
	}
	for (let tileId = 0; tileId < size; tileId += 1) {
		basinIdsByTile[tileId].sort((a, b) => {
			const ao = expandedTileSets.get(a)?.size ?? Number.MAX_SAFE_INTEGER;
			const bo = expandedTileSets.get(b)?.size ?? Number.MAX_SAFE_INTEGER;
			if (ao !== bo) {
				return ao - bo;
			}
			const ad = byId.get(a)?.kind === "leaf" ? 0 : 1;
			const bd = byId.get(b)?.kind === "leaf" ? 0 : 1;
			if (ad !== bd) {
				return ad - bd;
			}
			return featureOrdinal(a) - featureOrdinal(b);
		});
		if (directBasinIdByTile[tileId] === "" && basinIdsByTile[tileId].length > 0) {
			directBasinIdByTile[tileId] = basinIdsByTile[tileId][0] ?? "";
		}
	}

	const tileFeatureIds = directBasinIdByTile.map((id) => (id ? [id] : []));
	return {
		expandedTileSets,
		directBasinIdByTile,
		basinIdsByTile,
		tileFeatureIds,
	};
};

