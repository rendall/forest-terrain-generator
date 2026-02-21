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
  landform: Uint8Array;
}

export const LANDFORM_CODE = {
  flat: 0,
  slope: 1,
  ridge: 2,
  valley: 3,
  basin: 4
} as const;

export type LandformCode = (typeof LANDFORM_CODE)[keyof typeof LANDFORM_CODE];

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
    aspectDeg: new Float32Array(shape.size),
    landform: new Uint8Array(shape.size)
  };
}
