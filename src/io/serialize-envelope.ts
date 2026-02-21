import type { TerrainEnvelope } from "../domain/types.js";

export function serializeEnvelope(envelope: TerrainEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
