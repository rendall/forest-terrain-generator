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
}

export function createEmptyFeatureCollection(): TerrainFeatureCollection {
  return {
    basins: [],
    peaks: []
  };
}
