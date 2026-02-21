import { indexOf, type GridShape } from "../domain/topography.js";

export interface SlopeAspectMaps {
  slopeMag: Float32Array;
  aspectDeg: Float32Array;
}

function normalizeDegrees(value: number): number {
  let out = value % 360;
  if (out < 0) {
    out += 360;
  }
  return out;
}

export function deriveSlopeAspect(shape: GridShape, h: Float32Array): SlopeAspectMaps {
  const slopeMag = new Float32Array(shape.size);
  const aspectDeg = new Float32Array(shape.size);

  for (let y = 0; y < shape.height; y += 1) {
    const yU = Math.max(0, y - 1);
    const yD = Math.min(shape.height - 1, y + 1);

    for (let x = 0; x < shape.width; x += 1) {
      const xL = Math.max(0, x - 1);
      const xR = Math.min(shape.width - 1, x + 1);

      const centerIndex = indexOf(shape, x, y);
      const hx = h[indexOf(shape, xR, y)] - h[indexOf(shape, xL, y)];
      const hy = h[indexOf(shape, x, yD)] - h[indexOf(shape, x, yU)];

      slopeMag[centerIndex] = Math.sqrt(hx * hx + hy * hy) / 2;
      if (hx === 0 && hy === 0) {
        aspectDeg[centerIndex] = 0;
      } else {
        const aspect = (Math.atan2(-hy, -hx) * 180) / Math.PI;
        aspectDeg[centerIndex] = normalizeDegrees(aspect);
      }
    }
  }

  return { slopeMag, aspectDeg };
}
