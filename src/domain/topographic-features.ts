import type { StreamFeature } from "./stream-network.js";

export interface TopographicFeatureBbox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export type TopographicFeatureKind = "leaf" | "composite";

export interface TopographicFeatureNode {
	id: string;
	kind: TopographicFeatureKind;
	parentId: string | null;
	childIds: string[];
	waterSurfaceH?: number | null;
	birthH: number;
	mergeH: number | null;
	persistence: number | null;
	spillOutTileId: number | null;
	childSpillFromTileId?: number | null;
	parentContactTileId?: number | null;
	minH: number;
	maxH: number;
	size: number;
	bbox: TopographicFeatureBbox;
	tileIds?: number[];
}

export interface TerrainFeatureCollection {
	basins: TopographicFeatureNode[];
	peaks: TopographicFeatureNode[];
	streams?: StreamFeature[];
}

export function createEmptyFeatureCollection(): TerrainFeatureCollection {
	return {
		basins: [],
		peaks: [],
	};
}
