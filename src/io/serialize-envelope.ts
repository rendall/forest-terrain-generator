import type { TerrainEnvelope } from "../domain/types.js";

const isNonEmptyObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.keys(value).length > 0;

export function serializeEnvelope(envelope: TerrainEnvelope): string {
	const serializable: Record<string, unknown> = {
		meta: envelope.meta,
		...(Array.isArray(envelope.regions) ? { regions: envelope.regions } : {}),
		...(envelope.features ? { features: envelope.features } : {}),
		tiles: envelope.tiles,
		...(isNonEmptyObject(envelope.paramOverrides)
			? { paramOverrides: envelope.paramOverrides }
			: {}),
	};
	return `${JSON.stringify(serializable, null, 2)}\n`;
}
