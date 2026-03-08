import { DIR8_CODE, DIR8_NONE } from "../domain/hydrology.js";
import type { TopographicFeatureNode } from "../domain/topographic-features.js";
import type { JsonObject, TerrainEnvelope } from "../domain/types.js";
import type {
	Direction,
	Obstacle,
	Passability,
	PassabilityByDir,
	Visibility,
} from "./description.js";

export interface DescriptionFactsTile {
	coord: {
		x: number;
		y: number;
		index: number;
	};
	local: {
		elevation: number;
		slopeMagnitude: number;
		slopeDirection: Direction;
	};
	ecology: {
		biome: string;
		treeDensity: number;
		visibility: Visibility;
		obstacles: Obstacle[];
	};
	hydrology: {
		flowDirection: Direction | "NONE" | null;
		lakeBasinId: string | null;
		waterDepth: number | null;
		waterSurfaceH: number | null;
	};
	topology: {
		peakLeafId: string | null;
		basinLeafId: string | null;
	};
	movement: {
		passability: PassabilityByDir;
	};
}

export type DescriptionFactsBuildResult =
	| {
			kind: "ok";
			facts: DescriptionFactsTile;
	  }
	| {
			kind: "description_input_invalid";
			x: number | null;
			y: number | null;
	  }
	| {
			kind: "malformed_passability";
			x: number | null;
			y: number | null;
	  };

const DIRECTION_ORDER: readonly Direction[] = [
	"N",
	"NE",
	"E",
	"SE",
	"S",
	"SW",
	"W",
	"NW",
];

const DIRECTION_DELTAS: Record<Direction, { dx: number; dy: number }> = {
	N: { dx: 0, dy: -1 },
	NE: { dx: 1, dy: -1 },
	E: { dx: 1, dy: 0 },
	SE: { dx: 1, dy: 1 },
	S: { dx: 0, dy: 1 },
	SW: { dx: -1, dy: 1 },
	W: { dx: -1, dy: 0 },
	NW: { dx: -1, dy: -1 },
};

const VALID_OBSTACLES = new Set<Obstacle>([
	"windthrow",
	"deadfall",
	"boulder",
	"fallen_log",
	"root_tangle",
	"brush_blockage",
]);

const VALID_PASSABILITY = new Set<Passability>([
	"passable",
	"difficult",
	"blocked",
]);

const FLOW_DIRECTION_BY_FD: Partial<Record<number, Direction | "NONE">> = {
	[DIR8_CODE.e]: "E",
	[DIR8_CODE.se]: "SE",
	[DIR8_CODE.s]: "S",
	[DIR8_CODE.sw]: "SW",
	[DIR8_CODE.w]: "W",
	[DIR8_CODE.nw]: "NW",
	[DIR8_CODE.n]: "N",
	[DIR8_CODE.ne]: "NE",
	[DIR8_NONE]: "NONE",
};

const isJsonObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asInteger = (value: unknown): number | null =>
	typeof value === "number" && Number.isInteger(value) ? value : null;

const asString = (value: unknown, fallback: string): string =>
	typeof value === "string" && value.length > 0 ? value : fallback;

const clamp01 = (value: number): number => {
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
};

const tileKey = (x: number, y: number): string => `${x},${y}`;

const parsePassability = (value: unknown): PassabilityByDir | null => {
	if (!isJsonObject(value)) {
		return null;
	}

	const out: Partial<PassabilityByDir> = {};
	for (const direction of DIRECTION_ORDER) {
		const state = value[direction];
		if (
			typeof state !== "string" ||
			!VALID_PASSABILITY.has(state as Passability)
		) {
			return null;
		}
		out[direction] = state as Passability;
	}
	return out as PassabilityByDir;
};

const parseFlowDirection = (
	value: unknown,
): Direction | "NONE" | null => {
	const code = asInteger(value);
	if (code === null) {
		return null;
	}
	return FLOW_DIRECTION_BY_FD[code] ?? null;
};

const collectObstacles = (featureFlags: unknown): Obstacle[] => {
	if (!Array.isArray(featureFlags)) {
		return [];
	}

	const out: Obstacle[] = [];
	for (const entry of featureFlags) {
		if (
			typeof entry === "string" &&
			VALID_OBSTACLES.has(entry as Obstacle)
		) {
			out.push(entry as Obstacle);
		}
	}
	return out;
};

const deriveVisibility = (
	treeDensity: number,
	canopyCover: number,
	obstruction: number,
): Visibility => {
	const densityScore =
		clamp01(treeDensity) * 0.5 +
		clamp01(canopyCover) * 0.3 +
		clamp01(obstruction) * 0.2;

	if (densityScore >= 0.62) {
		return "short";
	}
	if (densityScore <= 0.32) {
		return "long";
	}
	return "medium";
};

const resolveTileIndex = (tile: JsonObject, fallbackIndex: number): number => {
	const index = asInteger(tile.index);
	return index !== null && index >= 0 ? index : fallbackIndex;
};

const collectMaxLeafTileId = (
	nodes: readonly TopographicFeatureNode[] | undefined,
	prefix: "b_" | "p_",
): number => {
	if (!Array.isArray(nodes)) {
		return -1;
	}
	let maxTileId = -1;
	for (const node of nodes) {
		if (
			typeof node.id !== "string" ||
			!node.id.startsWith(prefix) ||
			!Array.isArray(node.childIds) ||
			node.childIds.length > 0 ||
			!Array.isArray(node.tileIds)
		) {
			continue;
		}
		for (const tileId of node.tileIds) {
			if (typeof tileId === "number" && Number.isInteger(tileId) && tileId >= 0) {
				maxTileId = Math.max(maxTileId, tileId);
			}
		}
	}
	return maxTileId;
};

const collectLeafMembershipByTile = (
	nodes: readonly TopographicFeatureNode[] | undefined,
	size: number,
	prefix: "b_" | "p_",
): string[] => {
	const out = new Array<string>(size).fill("");
	if (!Array.isArray(nodes)) {
		return out;
	}

	for (const node of nodes) {
		if (
			typeof node.id !== "string" ||
			!node.id.startsWith(prefix) ||
			!Array.isArray(node.childIds) ||
			node.childIds.length > 0 ||
			!Array.isArray(node.tileIds)
		) {
			continue;
		}
		for (const tileId of node.tileIds) {
			if (
				typeof tileId !== "number" ||
				!Number.isInteger(tileId) ||
				tileId < 0 ||
				tileId >= size
			) {
				continue;
			}
			const previous = out[tileId];
			if (previous.length === 0 || node.id < previous) {
				out[tileId] = node.id;
			}
		}
	}

	return out;
};

export const buildDescriptionFacts = (
	envelope: TerrainEnvelope,
): DescriptionFactsBuildResult[] => {
	const resolvedIndices = envelope.tiles.map((tile, fallbackIndex) =>
		resolveTileIndex(tile, fallbackIndex),
	);
	const maxResolvedIndex = resolvedIndices.reduce(
		(max, index) => Math.max(max, index),
		-1,
	);
	const maxFeatureTileId = Math.max(
		collectMaxLeafTileId(envelope.features?.basins, "b_"),
		collectMaxLeafTileId(envelope.features?.peaks, "p_"),
	);
	const membershipSize = Math.max(maxResolvedIndex, maxFeatureTileId) + 1;

	const peakLeafByIndex = collectLeafMembershipByTile(
		envelope.features?.peaks,
		membershipSize,
		"p_",
	);
	const basinLeafByIndex = collectLeafMembershipByTile(
		envelope.features?.basins,
		membershipSize,
		"b_",
	);

	for (let i = 0; i < envelope.tiles.length; i += 1) {
		const tile = envelope.tiles[i] as JsonObject;
		const tileIndex = resolvedIndices[i] ?? i;
		const featureIds = Array.isArray(tile.featureIds)
			? tile.featureIds.filter((id): id is string => typeof id === "string")
			: [];
		if (peakLeafByIndex[tileIndex] === "") {
			const peakId = featureIds
				.filter((id) => id.startsWith("p_"))
				.sort()[0];
			if (peakId) {
				peakLeafByIndex[tileIndex] = peakId;
			}
		}
		if (basinLeafByIndex[tileIndex] === "") {
			const basinId = featureIds
				.filter((id) => id.startsWith("b_"))
				.sort()[0];
			if (basinId) {
				basinLeafByIndex[tileIndex] = basinId;
			}
		}
	}

	const elevationByCoord = new Map<string, number>();
	for (const tile of envelope.tiles) {
		const x = asInteger(tile.x);
		const y = asInteger(tile.y);
		if (x === null || y === null) {
			continue;
		}
		const topography = isJsonObject(tile.topography) ? tile.topography : {};
		elevationByCoord.set(
			tileKey(x, y),
			asFiniteNumber(topography.h, 0),
		);
	}

	return envelope.tiles.map((tile, fallbackIndex) => {
		const x = asInteger(tile.x);
		const y = asInteger(tile.y);
		if (x === null || y === null) {
			return { kind: "description_input_invalid", x, y };
		}

		const navigation = isJsonObject(tile.navigation) ? tile.navigation : {};
		const passability = parsePassability(navigation.passability);
		if (!passability) {
			return { kind: "malformed_passability", x, y };
		}

		const index = resolvedIndices[fallbackIndex] ?? fallbackIndex;
		const topography = isJsonObject(tile.topography) ? tile.topography : {};
		const hydrology = isJsonObject(tile.hydrology) ? tile.hydrology : {};
		const ecology = isJsonObject(tile.ecology) ? tile.ecology : {};
		const roughness = isJsonObject(ecology.roughness) ? ecology.roughness : {};

		const elevation = asFiniteNumber(topography.h, 0);
		let slopeDirection: Direction = "N";
		let minimumDelta = 0;
		for (const direction of DIRECTION_ORDER) {
			const delta = DIRECTION_DELTAS[direction];
			const neighborElevation =
				elevationByCoord.get(tileKey(x + delta.dx, y + delta.dy)) ?? elevation;
			const elevDelta = neighborElevation - elevation;
			if (elevDelta < minimumDelta) {
				minimumDelta = elevDelta;
				slopeDirection = direction;
			}
		}
		const slopeMagnitude = Math.max(0, -minimumDelta);

		const peakLeafIdRaw = peakLeafByIndex[index] ?? "";
		const basinLeafIdRaw = basinLeafByIndex[index] ?? "";
		const peakLeafId = peakLeafIdRaw.length > 0 ? peakLeafIdRaw : null;
		const basinLeafId = basinLeafIdRaw.length > 0 ? basinLeafIdRaw : null;

		const lakeBasinIdRaw =
			typeof hydrology.lakeBasinId === "string" && hydrology.lakeBasinId.length > 0
				? hydrology.lakeBasinId
				: "";
		const lakeBasinId = lakeBasinIdRaw.length > 0 ? lakeBasinIdRaw : null;
		const waterDepth =
			typeof hydrology.waterDepth === "number" &&
			Number.isFinite(hydrology.waterDepth)
				? hydrology.waterDepth
				: null;
		const waterSurfaceH =
			typeof hydrology.waterSurfaceH === "number" &&
			Number.isFinite(hydrology.waterSurfaceH)
				? hydrology.waterSurfaceH
				: null;
		const flowDirection = parseFlowDirection(hydrology.fd);

		const treeDensity = asFiniteNumber(ecology.treeDensity, 0.5);
		const canopyCover = asFiniteNumber(ecology.canopyCover, treeDensity);
		const obstruction = asFiniteNumber(roughness.obstruction, 0.35);

		const facts: DescriptionFactsTile = {
			coord: { x, y, index },
			local: {
				elevation,
				slopeMagnitude,
				slopeDirection,
			},
			ecology: {
				biome: asString(ecology.biome, "mixed_forest"),
				treeDensity,
				visibility: deriveVisibility(treeDensity, canopyCover, obstruction),
				obstacles: collectObstacles(roughness.featureFlags),
			},
			hydrology: {
				flowDirection,
				lakeBasinId,
				waterDepth,
				waterSurfaceH,
			},
			topology: {
				peakLeafId,
				basinLeafId,
			},
			movement: {
				passability,
			},
		};

		return { kind: "ok", facts };
	});
};
