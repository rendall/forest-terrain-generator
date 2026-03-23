import { type BaseMapsSoA, type GridShape } from "../domain/topography.js";
import type { JsonObject } from "../domain/types.js";
import { readAuthoredMapFile } from "../io/read-authored-map.js";
import { generateBaseMaps } from "./base-map-generation.js";

export interface ResolveBaseMapsRequest {
  shape: GridShape;
  seed: bigint;
  params: JsonObject;
  cwd: string;
  mapHPath?: string;
  mapRPath?: string;
  mapVPath?: string;
}

export async function resolveBaseMaps(request: ResolveBaseMapsRequest): Promise<BaseMapsSoA> {
  const base = generateBaseMaps(request.shape, request.seed, request.params);

  if (request.mapHPath) {
    const authored = await readAuthoredMapFile(
      request.mapHPath,
      "--map-h",
      request.cwd,
      request.shape
    );
    base.h = authored.data;
  }

  if (request.mapRPath) {
    const authored = await readAuthoredMapFile(
      request.mapRPath,
      "--map-r",
      request.cwd,
      request.shape
    );
    base.r = authored.data;
  }

  if (request.mapVPath) {
    const authored = await readAuthoredMapFile(
      request.mapVPath,
      "--map-v",
      request.cwd,
      request.shape
    );
    base.v = authored.data;
  }

  return base;
}
