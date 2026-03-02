import { DIR8_CODE, DIR8_NONE } from "../../../src/domain/hydrology.js";

const DIR_TO_DELTA = new Map([
	[DIR8_CODE.e, [1, 0]],
	[DIR8_CODE.se, [1, 1]],
	[DIR8_CODE.s, [0, 1]],
	[DIR8_CODE.sw, [-1, 1]],
	[DIR8_CODE.w, [-1, 0]],
	[DIR8_CODE.nw, [-1, -1]],
	[DIR8_CODE.n, [0, -1]],
	[DIR8_CODE.ne, [1, -1]],
]);

const toIndex = (shape, x, y) => y * shape.width + x;

const flowTargetIndex = (shape, index, code) => {
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

export const makeBasinNode = ({
	id,
	kind = "leaf",
	parentId = null,
	childIds = [],
	birthH = 0,
	mergeH = null,
	persistence = null,
	spillOutTileId = null,
	childSpillFromTileId = null,
	parentContactTileId = null,
	minH = 0,
	maxH = 0,
	size = 1,
	bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 },
	tileIds = [],
}) => ({
	id,
	kind,
	parentId,
	childIds,
	birthH,
	mergeH,
	persistence,
	spillOutTileId,
	childSpillFromTileId,
	parentContactTileId,
	minH,
	maxH,
	size,
	bbox,
	tileIds,
});

export const expandBasinTileSets = (basins) => {
	const byId = new Map(basins.map((basin) => [basin.id, basin]));
	const cache = new Map();
	const resolve = (id, visiting) => {
		if (cache.has(id)) {
			return cache.get(id);
		}
		if (visiting.has(id)) {
			return new Set();
		}
		visiting.add(id);
		const basin = byId.get(id);
		const set = new Set(Array.isArray(basin?.tileIds) ? basin.tileIds : []);
		for (const childId of Array.isArray(basin?.childIds) ? basin.childIds : []) {
			for (const tileId of resolve(childId, visiting)) {
				set.add(tileId);
			}
		}
		visiting.delete(id);
		cache.set(id, set);
		return set;
	};

	for (const basin of basins) {
		resolve(basin.id, new Set());
	}
	return cache;
};

export const computeExternalInflowFromMaps = (shape, fd, fa, basinTileSets) => {
	const result = new Map();
	for (const basinId of basinTileSets.keys()) {
		result.set(basinId, 0);
	}

	for (let u = 0; u < shape.size; u += 1) {
		const v = flowTargetIndex(shape, u, fd[u]);
		if (v === null) {
			continue;
		}
		for (const [basinId, tileSet] of basinTileSets) {
			if (!tileSet.has(u) && tileSet.has(v)) {
				result.set(basinId, (result.get(basinId) ?? 0) + fa[u]);
			}
		}
	}
	return result;
};

export const computeSpillCapacity = (mergeH, h, tileIds) =>
	tileIds.reduce((sum, tileId) => sum + Math.max(0, mergeH - h[tileId]), 0);

export const computeBasinAccounting = (basins, k = 1, eps = 1e-12) => {
	const byId = new Map(basins.map((basin) => [basin.id, basin]));
	const childrenById = new Map(basins.map((basin) => [basin.id, []]));
	for (const basin of basins) {
		if (basin.parentId && childrenById.has(basin.parentId)) {
			childrenById.get(basin.parentId).push(basin.id);
		}
	}
	const memo = new Map();

	const visit = (id) => {
		if (memo.has(id)) {
			return memo.get(id);
		}
		const basin = byId.get(id);
		if (!basin) {
			throw new Error(`Unknown basin "${id}" in accounting input.`);
		}
		const childOverflow = (childrenById.get(id) ?? []).reduce(
			(sum, childId) => sum + visit(childId).overflowExcess,
			0,
		);
		const totalInflow = basin.externalInflow + childOverflow;
		const fillRatio =
			basin.spillCapacity > 0 ? (k * totalInflow) / Math.max(eps, basin.spillCapacity) : Infinity;
		const isFilled = k * totalInflow >= basin.spillCapacity;
		const overflowExcess = Math.max(0, k * totalInflow - basin.spillCapacity);
		const row = {
			id,
			parentId: basin.parentId ?? null,
			externalInflow: basin.externalInflow,
			totalInflow,
			spillCapacity: basin.spillCapacity,
			fillRatio,
			isFilled,
			overflowExcess,
		};
		memo.set(id, row);
		return row;
	};

	for (const basin of basins) {
		visit(basin.id);
	}
	return memo;
};
