import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type {
	JsonObject,
	TerrainEnvelope,
	TerrainTile,
} from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { writeStandardOutput } from "../io/write-outputs.js";
import {
	DescriptionPhraseError,
	type Direction,
	generateRawDescription,
	isKnownDescriptionBiome,
	isKnownDescriptionLandform,
	type NeighborSignal,
	type Obstacle,
	type PassabilityByDir,
	type Visibility,
	type WaterClass,
} from "../pipeline/description.js";
import {
	buildDescriptionFacts,
	type DescriptionFactsTile,
} from "../pipeline/description-facts.js";

export interface DescribeCliArgs {
	inputFilePath?: string;
	outputFile?: string;
	includeStructured: boolean;
	strict: boolean;
	force: boolean;
}

export interface DescribeRequest {
	args: DescribeCliArgs;
	cwd: string;
}

interface DescriptionDebug {
	code:
		| "description_input_invalid"
		| "malformed_passability"
		| "description_generation_failed"
		| "phrase_library_missing"
		| "unknown_taxonomy";
	message: string;
	x: number | null;
	y: number | null;
	unknownBiome?: string;
	unknownLandform?: string;
	missingSlots?: string[];
}

interface TileSignals {
	x: number;
	y: number;
	biome: string;
	waterClass: WaterClass;
	flowDirection: Direction | "NONE" | null;
	elevation: number;
	treeDensity: number;
	moisture: number;
	standingWater: boolean;
	landform: string;
	slopeStrength: number;
	slopeDirection: Direction;
	obstacles: Obstacle[];
	visibility: Visibility;
	passability: PassabilityByDir;
	followable: string[];
}

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

function resolveFromCwd(
	cwd: string,
	maybeRelativePath: string | undefined,
): string | undefined {
	if (!maybeRelativePath) {
		return undefined;
	}

	return isAbsolute(maybeRelativePath)
		? maybeRelativePath
		: resolve(cwd, maybeRelativePath);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp01(value: number): number {
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function tileKey(x: number, y: number): string {
	return `${x},${y}`;
}

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown description error.";
}

function buildFailureTile(
	tile: TerrainTile,
	debug: DescriptionDebug,
	includeStructured: boolean,
): TerrainTile {
	const debugPayload: JsonObject = {
		code: debug.code,
		message: debug.message,
		x: debug.x,
		y: debug.y,
	};
	if (debug.unknownBiome) {
		debugPayload.unknownBiome = debug.unknownBiome;
	}
	if (debug.unknownLandform) {
		debugPayload.unknownLandform = debug.unknownLandform;
	}
	if (debug.missingSlots) {
		debugPayload.missingSlots = debug.missingSlots;
	}

	const out: TerrainTile = {
		...tile,
		description: null,
		descriptionDebug: debugPayload,
	};

	if (includeStructured) {
		out.descriptionStructured = null;
	}

	return out;
}

function deriveStandingWater(facts: DescriptionFactsTile): boolean {
	const waterDepth = facts.hydrology.waterDepth;
	if (typeof waterDepth === "number") {
		return waterDepth > 0;
	}
	const waterSurfaceH = facts.hydrology.waterSurfaceH;
	if (typeof waterSurfaceH === "number") {
		return waterSurfaceH > facts.local.elevation;
	}
	return false;
}

function deriveLandform(
	facts: DescriptionFactsTile,
	standingWater: boolean,
): string {
	if (facts.topology.peakLeafId !== null) {
		return "ridge";
	}
	if (standingWater) {
		return "basin";
	}
	if (
		facts.topology.basinLeafId !== null &&
		facts.local.slopeMagnitude < 0.03
	) {
		return "valley";
	}
	if (facts.local.slopeMagnitude < 0.015) {
		return "flat";
	}
	if (facts.local.slopeMagnitude < 0.05) {
		return "low_rise";
	}
	return "slope";
}

function deriveFollowable(facts: DescriptionFactsTile): string[] {
	const tokens: string[] = [];
	if (facts.topology.peakLeafId !== null) {
		tokens.push("ridge");
	}
	return tokens;
}

function deriveMoisture(
	_facts: DescriptionFactsTile,
	standingWater: boolean,
): number {
	if (standingWater) {
		return 1;
	}
	return clamp01(0.5);
}

function deriveWaterClassFromHydrology(
	facts: DescriptionFactsTile,
	standingWater: boolean,
): WaterClass {
	if (standingWater) {
		return "lake";
	}
	if (facts.hydrology.lakeBasinId !== null) {
		return "lake";
	}
	return "none";
}

function toTileSignals(facts: DescriptionFactsTile): TileSignals {
	const standingWater = deriveStandingWater(facts);
	return {
		x: facts.coord.x,
		y: facts.coord.y,
		biome: facts.ecology.biome,
		waterClass: deriveWaterClassFromHydrology(facts, standingWater),
		flowDirection: facts.hydrology.flowDirection,
		elevation: facts.local.elevation,
		treeDensity: facts.ecology.treeDensity,
		moisture: deriveMoisture(facts, standingWater),
		standingWater,
		landform: deriveLandform(facts, standingWater),
		slopeStrength: facts.local.slopeMagnitude,
		slopeDirection: facts.local.slopeDirection,
		obstacles: [...facts.ecology.obstacles],
		visibility: facts.ecology.visibility,
		passability: facts.movement.passability,
		followable: deriveFollowable(facts),
	};
}

function buildNeighborSignals(
	self: TileSignals,
	byCoord: ReadonlyMap<string, TileSignals>,
): Record<Direction, NeighborSignal> {
	const neighbors: Partial<Record<Direction, NeighborSignal>> = {};

	for (const dir of DIRECTION_ORDER) {
		const delta = DIRECTION_DELTAS[dir];
		const candidate =
			byCoord.get(tileKey(self.x + delta.dx, self.y + delta.dy)) ?? self;
		neighbors[dir] = {
			biome: candidate.biome,
			water: candidate.waterClass,
			elevDelta: candidate.elevation - self.elevation,
			densityDelta: candidate.treeDensity - self.treeDensity,
			followable: [...candidate.followable],
		};
	}

	return neighbors as Record<Direction, NeighborSignal>;
}

function describeSeedKey(signal: TileSignals): string {
	return `${signal.x},${signal.y}`;
}

export function attachTileDescriptions(
	envelope: TerrainEnvelope,
	includeStructured: boolean,
	strict = false,
): TerrainEnvelope {
	const factResults = buildDescriptionFacts(envelope);
	const byCoord = new Map<string, TileSignals>();

	for (const signalResult of factResults) {
		if (signalResult.kind === "ok") {
			const signals = toTileSignals(signalResult.facts);
			byCoord.set(tileKey(signals.x, signals.y), signals);
		}
	}

	const tiles = envelope.tiles.map((tile, tileIndex) => {
		const signalResult = factResults[tileIndex];
		if (!signalResult) {
			return buildFailureTile(
				tile,
				{
					code: "description_input_invalid",
					message:
						"Tile is missing normalized description facts for description generation.",
					x: null,
					y: null,
				},
				includeStructured,
			);
		}
		if (signalResult.kind === "description_input_invalid") {
			return buildFailureTile(
				tile,
				{
					code: "description_input_invalid",
					message:
						"Tile is missing required integer x/y for description generation.",
					x: signalResult.x,
					y: signalResult.y,
				},
				includeStructured,
			);
		}

		if (signalResult.kind === "malformed_passability") {
			return buildFailureTile(
				tile,
				{
					code: "malformed_passability",
					message:
						"Tile navigation.passability is missing or malformed for description generation.",
					x: signalResult.x,
					y: signalResult.y,
				},
				includeStructured,
			);
		}
		const signals = toTileSignals(signalResult.facts);

		const unknownBiome = isKnownDescriptionBiome(signals.biome)
			? undefined
			: signals.biome;
		const unknownLandform = isKnownDescriptionLandform(signals.landform)
			? undefined
			: signals.landform;

		if (strict && (unknownBiome || unknownLandform)) {
			return buildFailureTile(
				tile,
				{
					code: "unknown_taxonomy",
					message:
						"Unknown biome/landform encountered in strict mode for description generation.",
					x: signals.x,
					y: signals.y,
					unknownBiome,
					unknownLandform,
				},
				includeStructured,
			);
		}

		try {
			const description = generateRawDescription(
				{
					biome: signals.biome,
					landform: signals.landform,
					moisture: signals.moisture,
					standingWater: signals.standingWater,
					passability: signals.passability,
					flowDirection: signals.flowDirection,
					slopeDirection: signals.slopeDirection,
					slopeStrength: signals.slopeStrength,
					obstacles: signals.obstacles,
					followable: signals.followable,
					visibility: signals.visibility,
					neighbors: buildNeighborSignals(signals, byCoord),
				},
				describeSeedKey(signals),
				{ strict },
			);

			const outputTile: TerrainTile = {
				...tile,
				description: description.text,
			};

			if (includeStructured) {
				const adjacencyByToken: Record<string, Direction[]> = {};
				for (const token of signals.followable) {
					const directionsForToken = DIRECTION_ORDER.filter((direction) => {
						const delta = DIRECTION_DELTAS[direction];
						const nx = signals.x + delta.dx;
						const ny = signals.y + delta.dy;
						const neighbor = byCoord.get(tileKey(nx, ny));
						if (!neighbor) {
							return false;
						}
						return neighbor.followable.includes(token);
					});
					adjacencyByToken[token] = directionsForToken;
				}
				const adjacency: JsonObject = {};
				for (const [token, directions] of Object.entries(adjacencyByToken)) {
					adjacency[token] = directions;
				}
				if (
					Object.hasOwn(adjacencyByToken, "stream") &&
					signals.flowDirection !== null
				) {
					adjacency.streamFlow = signals.flowDirection;
				}

				outputTile.descriptionStructured = {
					sentences: description.sentences.map((sentence) => {
						const out: JsonObject = {
							slot: sentence.slot,
							contributorKeys: { ...sentence.contributorKeys },
						};
						if (typeof sentence.basicText === "string") {
							out.basicText = sentence.basicText;
						}
						if (sentence.contributors && isJsonObject(sentence.contributors)) {
							out.contributors = sentence.contributors;
						}
						const structuredText =
							typeof sentence.text === "string"
								? sentence.text
								: typeof sentence.basicText === "string"
									? sentence.basicText
									: null;
						if (structuredText !== null) {
							out.text = structuredText;
						}
						if (sentence.movement) {
							out.movement = sentence.movement.map((run) => ({
								type: run.type,
								directions: [...run.directions],
								...(run.type === "blockage" && typeof run.blockedBy === "string"
									? { blockedBy: run.blockedBy }
									: {}),
							}));
						}
						return out;
					}),
					adjacency,
				};
			}

			return outputTile;
		} catch (error) {
			if (error instanceof DescriptionPhraseError) {
				return buildFailureTile(
					tile,
					{
						code: "phrase_library_missing",
						message: error.message,
						x: signals.x,
						y: signals.y,
						missingSlots: error.details.map(
							(detail) => `${detail.slot}:${detail.key}`,
						),
					},
					includeStructured,
				);
			}
			return buildFailureTile(
				tile,
				{
					code: "description_generation_failed",
					message: messageFromUnknown(error),
					x: signals.x,
					y: signals.y,
				},
				includeStructured,
			);
		}
	});

	return {
		meta: {
			specVersion: envelope.meta.specVersion,
		},
		...(envelope.regions
			? {
					regions: envelope.regions.map((region) => ({
						id: region.id,
						biome: region.biome,
						tileCount: region.tileCount,
						bbox: {
							minX: region.bbox.minX,
							minY: region.bbox.minY,
							maxX: region.bbox.maxX,
							maxY: region.bbox.maxY,
						},
					})),
				}
			: {}),
		tiles,
	};
}

export async function runDescribe(request: DescribeRequest): Promise<void> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputFilePath);
	const outputFile = resolveFromCwd(request.cwd, request.args.outputFile);

	if (!inputFilePath) {
		throw new InputValidationError(
			"Missing required input argument: --input-file.",
		);
	}
	if (!outputFile) {
		throw new InputValidationError(
			"Missing required output argument: --output-file.",
		);
	}

	const envelope = await readTerrainEnvelopeFile(inputFilePath);
	const described = attachTileDescriptions(
		envelope,
		request.args.includeStructured,
		request.args.strict,
	);
	await writeStandardOutput(outputFile, described, request.args.force);
}
