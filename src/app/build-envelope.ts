import type { TerrainEnvelope } from "../domain/types.js";

const SPEC_VERSION = "forest-terrain-v1";

export function buildEnvelopeSkeleton(): TerrainEnvelope {
  return {
    meta: {
      specVersion: SPEC_VERSION
    },
    tiles: []
  };
}
