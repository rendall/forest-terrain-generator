import { createTopographyMaps, type BaseMapsSoA, type GridShape, type TopographyMapsSoA } from "../domain/topography.js";
import type { JsonObject } from "../domain/types.js";
import { classifyLandform } from "./classify-landform.js";
import { deriveSlopeAspect } from "./derive-slope-aspect.js";

export function deriveTopographyFromBaseMaps(
  shape: GridShape,
  baseMaps: BaseMapsSoA,
  params: JsonObject
): TopographyMapsSoA {
  const out = createTopographyMaps(shape);
  out.h = baseMaps.h;
  out.r = baseMaps.r;
  out.v = baseMaps.v;

  const { slopeMag, aspectDeg } = deriveSlopeAspect(shape, baseMaps.h);
  out.slopeMag = slopeMag;
  out.aspectDeg = aspectDeg;
  out.landform = classifyLandform(shape, baseMaps.h, slopeMag, params);
  return out;
}
