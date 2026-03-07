import { createTopographyMaps, type BaseMapsSoA, type GridShape, type TopographyMapsSoA } from "../domain/topography.js";

export function deriveTopographyFromBaseMaps(
  shape: GridShape,
  baseMaps: BaseMapsSoA
): TopographyMapsSoA {
  const out = createTopographyMaps(shape);
  out.h = baseMaps.h;
  out.r = baseMaps.r;
  out.v = baseMaps.v;
  return out;
}
