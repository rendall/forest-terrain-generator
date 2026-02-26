import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, RegionSummary } from "../domain/types.js";

interface TileCoordBiome {
	x: number;
	y: number;
	biome: string;
}

interface TileNode extends TileCoordBiome {
	tileIndex: number;
}

export interface BiomeRegionDerivation {
	tileRegionIds: number[];
	regionBiomes: string[];
}

const DIR8_DELTAS: readonly { dx: number; dy: number }[] = [
	{ dx: 1, dy: 0 }, // E
	{ dx: 1, dy: 1 }, // SE
	{ dx: 0, dy: 1 }, // S
	{ dx: -1, dy: 1 }, // SW
	{ dx: -1, dy: 0 }, // W
	{ dx: -1, dy: -1 }, // NW
	{ dx: 0, dy: -1 }, // N
	{ dx: 1, dy: -1 }, // NE
];

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coordKey(x: number, y: number): string {
	return `${x},${y}`;
}

function readTileCoordBiome(tile: JsonObject, tileIndex: number): TileCoordBiome {
	const x = tile.x;
	const y = tile.y;
	if (
		typeof x !== "number" ||
		!Number.isInteger(x) ||
		typeof y !== "number" ||
		!Number.isInteger(y)
	) {
		throw new InputValidationError(
			`Invalid tile at index ${tileIndex}. Expected integer "x" and "y" for region assignment.`,
		);
	}
	if (!isJsonObject(tile.ecology) || typeof tile.ecology.biome !== "string") {
		throw new InputValidationError(
			`Invalid tile at index ${tileIndex}. Expected string "ecology.biome" for region assignment.`,
		);
	}

	return {
		x,
		y,
		biome: tile.ecology.biome,
	};
}

function buildTileNodes(tiles: readonly JsonObject[]): {
	nodes: TileNode[];
	byCoord: Map<string, TileNode>;
} {
	const nodes: TileNode[] = [];
	const byCoord = new Map<string, TileNode>();

	for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
		const tile = tiles[tileIndex];
		const coordBiome = readTileCoordBiome(tile, tileIndex);
		const key = coordKey(coordBiome.x, coordBiome.y);
		if (byCoord.has(key)) {
			throw new InputValidationError(
				`Duplicate tile coordinate "${key}" is not allowed for region assignment.`,
			);
		}

		const node: TileNode = { ...coordBiome, tileIndex };
		nodes.push(node);
		byCoord.set(key, node);
	}

	return { nodes, byCoord };
}

export function deriveBiomeRegions(
	tiles: readonly JsonObject[],
): BiomeRegionDerivation {
	const { nodes, byCoord } = buildTileNodes(tiles);
	const tileRegionIds = new Array<number>(tiles.length).fill(-1);
	const regionBiomes: string[] = [];

	const sortedNodes = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
	const visited = new Set<string>();

	for (const seed of sortedNodes) {
		const seedKey = coordKey(seed.x, seed.y);
		if (visited.has(seedKey)) {
			continue;
		}

		const regionId = regionBiomes.length;
		regionBiomes.push(seed.biome);

		const queue: TileNode[] = [seed];
		visited.add(seedKey);

		for (let head = 0; head < queue.length; head += 1) {
			const current = queue[head];
			tileRegionIds[current.tileIndex] = regionId;

			for (const delta of DIR8_DELTAS) {
				const nx = current.x + delta.dx;
				const ny = current.y + delta.dy;
				const neighbor = byCoord.get(coordKey(nx, ny));
				if (!neighbor || neighbor.biome !== seed.biome) {
					continue;
				}

				const neighborKey = coordKey(neighbor.x, neighbor.y);
				if (visited.has(neighborKey)) {
					continue;
				}

				visited.add(neighborKey);
				queue.push(neighbor);
			}
		}
	}

	return { tileRegionIds, regionBiomes };
}

export function summarizeBiomeRegions(
	tiles: readonly JsonObject[],
	derived: BiomeRegionDerivation,
): RegionSummary[] {
	if (derived.tileRegionIds.length !== tiles.length) {
		throw new InputValidationError(
			"Region assignment produced invalid tile-region cardinality.",
		);
	}

	const summaries: RegionSummary[] = derived.regionBiomes.map((biome, id) => ({
		id,
		biome,
		tileCount: 0,
		bbox: {
			minX: Number.POSITIVE_INFINITY,
			minY: Number.POSITIVE_INFINITY,
			maxX: Number.NEGATIVE_INFINITY,
			maxY: Number.NEGATIVE_INFINITY,
		},
	}));

	for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
		const { x, y } = readTileCoordBiome(tiles[tileIndex], tileIndex);
		const regionId = derived.tileRegionIds[tileIndex];
		const summary = summaries[regionId];

		if (!summary) {
			throw new InputValidationError(
				`Region assignment produced unknown region id ${regionId} at tile index ${tileIndex}.`,
			);
		}

		summary.tileCount += 1;
		summary.bbox.minX = Math.min(summary.bbox.minX, x);
		summary.bbox.minY = Math.min(summary.bbox.minY, y);
		summary.bbox.maxX = Math.max(summary.bbox.maxX, x);
		summary.bbox.maxY = Math.max(summary.bbox.maxY, y);
	}

	for (const summary of summaries) {
		if (summary.tileCount === 0) {
			throw new InputValidationError(
				`Region summary ${summary.id} has zero tiles, which violates determinism invariants.`,
			);
		}
	}

	return summaries;
}
