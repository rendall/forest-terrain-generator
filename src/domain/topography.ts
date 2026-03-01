export interface GridShape {
  width: number;
  height: number;
  size: number;
}

export interface BaseMapsSoA {
  shape: GridShape;
  h: Float32Array;
  r: Float32Array;
  v: Float32Array;
}

export interface TopographyMapsSoA extends BaseMapsSoA {
  slopeMag: Float32Array;
  aspectDeg: Float32Array;
}

export interface TopographicStructureMapsSoA {
  shape: GridShape;
  basinMinIdx: Int32Array;
  basinMinH: Float32Array;
  basinSpillH: Float32Array;
  basinPersistence: Float32Array;
  basinDepthLike: Float32Array;
  peakMaxIdx: Int32Array;
  peakMaxH: Float32Array;
  peakSaddleH: Float32Array;
  peakPersistence: Float32Array;
  peakRiseLike: Float32Array;
  basinLike: Uint8Array;
  ridgeLike: Uint8Array;
}

export function createGridShape(width: number, height: number): GridShape {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid grid shape (${width}x${height}). Width/height must be positive integers.`);
  }

  return {
    width,
    height,
    size: width * height
  };
}

export function indexOf(shape: GridShape, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= shape.width || y >= shape.height) {
    throw new Error(
      `Grid index out of bounds: (${x},${y}) for shape ${shape.width}x${shape.height}.`
    );
  }
  return y * shape.width + x;
}

export function createBaseMaps(shape: GridShape): BaseMapsSoA {
  return {
    shape,
    h: new Float32Array(shape.size),
    r: new Float32Array(shape.size),
    v: new Float32Array(shape.size)
  };
}

export function createTopographyMaps(shape: GridShape): TopographyMapsSoA {
  return {
    ...createBaseMaps(shape),
    slopeMag: new Float32Array(shape.size),
    aspectDeg: new Float32Array(shape.size)
  };
}

export function createTopographicStructureMaps(shape: GridShape): TopographicStructureMapsSoA {
  return {
    shape,
    basinMinIdx: new Int32Array(shape.size).fill(-1),
    basinMinH: new Float32Array(shape.size).fill(Number.NaN),
    basinSpillH: new Float32Array(shape.size).fill(Number.NaN),
    basinPersistence: new Float32Array(shape.size).fill(Number.NaN),
    basinDepthLike: new Float32Array(shape.size).fill(Number.NaN),
    peakMaxIdx: new Int32Array(shape.size).fill(-1),
    peakMaxH: new Float32Array(shape.size).fill(Number.NaN),
    peakSaddleH: new Float32Array(shape.size).fill(Number.NaN),
    peakPersistence: new Float32Array(shape.size).fill(Number.NaN),
    peakRiseLike: new Float32Array(shape.size).fill(Number.NaN),
    basinLike: new Uint8Array(shape.size),
    ridgeLike: new Uint8Array(shape.size)
  };
}
