import { LANDFORM_CODE, indexOf, type GridShape } from "../domain/topography.js";
import type { JsonObject, JsonValue } from "../domain/types.js";

interface LandformParams {
  eps: number;
  flatSlopeThreshold: number;
}

function expectObject(value: JsonValue | undefined, name: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Missing or invalid params object "${name}".`);
  }
  return value as JsonObject;
}

function expectNumber(value: JsonValue | undefined, name: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Missing or invalid numeric params value "${name}".`);
  }
  return value;
}

function readLandformParams(params: JsonObject): LandformParams {
  const node = expectObject(params.landform, "landform");
  return {
    eps: expectNumber(node.eps, "landform.eps"),
    flatSlopeThreshold: expectNumber(node.flatSlopeThreshold, "landform.flatSlopeThreshold")
  };
}

export function classifyLandform(
  shape: GridShape,
  h: Float32Array,
  slopeMag: Float32Array,
  params: JsonObject
): Uint8Array {
  const out = new Uint8Array(shape.size);
  const cfg = readLandformParams(params);

  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      const centerIndex = indexOf(shape, x, y);
      const center = h[centerIndex];
      let higherCount = 0;
      let lowerCount = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
            continue;
          }

          const neighbor = h[indexOf(shape, nx, ny)];
          if (neighbor > center + cfg.eps) {
            higherCount += 1;
          } else if (neighbor < center - cfg.eps) {
            lowerCount += 1;
          }
        }
      }

      if (slopeMag[centerIndex] < cfg.flatSlopeThreshold) {
        if (lowerCount === 0 && higherCount > 0) {
          out[centerIndex] = LANDFORM_CODE.basin;
        } else if (higherCount === 0 && lowerCount > 0) {
          out[centerIndex] = LANDFORM_CODE.ridge;
        } else {
          out[centerIndex] = LANDFORM_CODE.flat;
        }
      } else if (higherCount >= 6) {
        out[centerIndex] = LANDFORM_CODE.basin;
      } else if (lowerCount >= 6) {
        out[centerIndex] = LANDFORM_CODE.ridge;
      } else if (higherCount >= 5 && lowerCount <= 2) {
        out[centerIndex] = LANDFORM_CODE.valley;
      } else if (lowerCount >= 5 && higherCount <= 2) {
        out[centerIndex] = LANDFORM_CODE.ridge;
      } else {
        out[centerIndex] = LANDFORM_CODE.slope;
      }
    }
  }

  return out;
}
