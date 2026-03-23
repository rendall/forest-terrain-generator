import { createGridShape } from "../../../src/domain/topography.js";

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

const B_A1 = "b_A1";
const B_A2 = "b_A2";
const B_A = "b_A";
const B_B = "b_B";
const B_ROOT = "b_root";

const tileIndex = (x, y, width = 5) => y * width + x;

const TILE_IDS = {
	a1: [tileIndex(1, 3), tileIndex(1, 4), tileIndex(2, 4)],
	a2: [tileIndex(1, 1), tileIndex(1, 2), tileIndex(2, 1)],
	a: [tileIndex(2, 2), tileIndex(2, 3)],
	b: [tileIndex(3, 1), tileIndex(3, 2), tileIndex(3, 3)],
	root: [
		tileIndex(0, 0),
		tileIndex(1, 0),
		tileIndex(2, 0),
		tileIndex(3, 0),
		tileIndex(4, 0),
		tileIndex(0, 1),
		tileIndex(4, 1),
		tileIndex(0, 2),
		tileIndex(4, 2),
		tileIndex(0, 3),
		tileIndex(4, 3),
		tileIndex(0, 4),
		tileIndex(3, 4),
		tileIndex(4, 4),
	],
};

const makeMembership = (size, basinFeatures) => {
	const byId = new Map(basinFeatures.map((b) => [b.id, b]));
	const out = Array.from({ length: size }, () => []);
	const addWithAncestors = (basinId, tileId) => {
		let current = basinId;
		while (current) {
			out[tileId].push(current);
			const parent = byId.get(current)?.parentId ?? null;
			current = parent;
		}
	};
	basinFeatures.forEach((basin) => {
		basin.tileIds.forEach((tileId) => addWithAncestors(basin.id, tileId));
	});
	return out.map((ids) => Array.from(new Set(ids)).sort());
};

export const buildNestedSiblingBasinFixture = () => {
	const shape = createGridShape(5, 5);
	const h = new Float32Array([
		0.95, 0.9, 0.88, 0.92, 0.95, 0.85, 0.2, 0.25, 0.45, 0.85, 0.83, 0.22, 0.35,
		0.42, 0.84, 0.82, 0.18, 0.33, 0.38, 0.83, 0.81, 0.16, 0.19, 0.8, 0.81,
	]);

	const basinFeatures = [
		makeBasinNode({
			id: B_A1,
			kind: "leaf",
			parentId: B_A,
			childIds: [],
			birthH: 0.16,
			mergeH: 0.34,
			persistence: 0.18,
			spillOutTileId: tileIndex(2, 3),
			childSpillFromTileId: tileIndex(2, 4),
			parentContactTileId: tileIndex(2, 3),
			minH: 0.16,
			maxH: 0.19,
			size: TILE_IDS.a1.length,
			bbox: { minX: 1, minY: 3, maxX: 2, maxY: 4 },
			tileIds: TILE_IDS.a1,
		}),
		makeBasinNode({
			id: B_A2,
			kind: "leaf",
			parentId: B_A,
			childIds: [],
			birthH: 0.2,
			mergeH: 0.34,
			persistence: 0.14,
			spillOutTileId: tileIndex(2, 2),
			childSpillFromTileId: tileIndex(1, 2),
			parentContactTileId: tileIndex(2, 2),
			minH: 0.2,
			maxH: 0.25,
			size: TILE_IDS.a2.length,
			bbox: { minX: 1, minY: 1, maxX: 2, maxY: 2 },
			tileIds: TILE_IDS.a2,
		}),
		makeBasinNode({
			id: B_A,
			kind: "composite",
			parentId: B_ROOT,
			childIds: [B_A1, B_A2],
			birthH: 0.34,
			mergeH: 0.55,
			persistence: 0.16,
			spillOutTileId: tileIndex(3, 2),
			childSpillFromTileId: tileIndex(2, 2),
			parentContactTileId: tileIndex(3, 2),
			minH: 0.33,
			maxH: 0.35,
			size: TILE_IDS.a.length,
			bbox: { minX: 2, minY: 2, maxX: 2, maxY: 3 },
			tileIds: TILE_IDS.a,
		}),
		makeBasinNode({
			id: B_B,
			kind: "leaf",
			parentId: B_ROOT,
			childIds: [],
			birthH: 0.38,
			mergeH: 0.55,
			persistence: 0.17,
			spillOutTileId: tileIndex(4, 2),
			childSpillFromTileId: tileIndex(3, 2),
			parentContactTileId: tileIndex(4, 2),
			minH: 0.38,
			maxH: 0.45,
			size: TILE_IDS.b.length,
			bbox: { minX: 3, minY: 1, maxX: 3, maxY: 3 },
			tileIds: TILE_IDS.b,
		}),
		makeBasinNode({
			id: B_ROOT,
			kind: "composite",
			parentId: null,
			childIds: [B_A, B_B],
			birthH: 0.55,
			mergeH: null,
			persistence: null,
			spillOutTileId: null,
			minH: 0.8,
			maxH: 0.95,
			size: TILE_IDS.root.length,
			bbox: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
			tileIds: TILE_IDS.root,
		}),
	];

	const tileFeatureIds = makeMembership(shape.size, basinFeatures);
	return { shape, h, basinFeatures, tileFeatureIds };
};

export const assertFixtureTopologyInvariants = (basinFeatures) => {
	const byId = new Map(basinFeatures.map((b) => [b.id, b]));
	const roots = basinFeatures.filter((b) => b.parentId === null);
	if (roots.length !== 1) {
		throw new Error(`expected exactly one root basin, got ${roots.length}`);
	}
	const children = basinFeatures.reduce((map, basin) => {
		const parentId = basin.parentId;
		if (typeof parentId === "string") {
			map.set(parentId, [...(map.get(parentId) ?? []), basin.id]);
		}
		return map;
	}, new Map());
	const hasSiblingParent = Array.from(children.values()).some(
		(ids) => ids.length >= 2,
	);
	if (!hasSiblingParent) {
		throw new Error("expected at least one parent with >=2 children");
	}
	const depthOf = (id) => {
		let depth = 0;
		let cursor = byId.get(id)?.parentId ?? null;
		while (cursor) {
			depth += 1;
			cursor = byId.get(cursor)?.parentId ?? null;
		}
		return depth;
	};
	const maxDepth = Math.max(...basinFeatures.map((b) => depthOf(b.id)));
	if (maxDepth < 2) {
		throw new Error(`expected depth>=2, got ${maxDepth}`);
	}
};

export const assertFixtureMembershipInvariants = (
	shape,
	basinFeatures,
	tileFeatureIds,
) => {
	const ids = new Set(basinFeatures.map((b) => b.id));
	tileFeatureIds.forEach((members, tileId) => {
		members.forEach((id) => {
			if (!ids.has(id)) {
				throw new Error(`unknown basin id ${id} at tile ${tileId}`);
			}
		});
	});
	const byId = new Map(basinFeatures.map((b) => [b.id, b]));
	const children = basinFeatures.reduce((map, basin) => {
		const parentId = basin.parentId;
		if (typeof parentId === "string") {
			map.set(parentId, [...(map.get(parentId) ?? []), basin.id]);
		}
		return map;
	}, new Map());
	const root = basinFeatures.find((b) => b.parentId === null);
	if (!root) {
		throw new Error("no root basin found");
	}
	const expand = (id) => {
		const basin = byId.get(id);
		const own = new Set(basin?.tileIds ?? []);
		(children.get(id) ?? []).forEach((childId) => {
			expand(childId).forEach((tileId) => own.add(tileId));
		});
		return own;
	};
	const expandedRoot = expand(root.id);
	const allTiles = new Set();
	for (let tileId = 0; tileId < shape.size; tileId += 1) {
		if (tileFeatureIds[tileId].length > 0) {
			allTiles.add(tileId);
		}
	}
	const sameSize = expandedRoot.size === allTiles.size;
	const sameMembers = Array.from(expandedRoot).every((tileId) =>
		allTiles.has(tileId),
	);
	if (!sameSize || !sameMembers) {
		throw new Error(
			"root expanded coverage does not match fixture membership scope",
		);
	}
};
