import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, TerrainEnvelope } from "../domain/types.js";
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
	type Passability,
	type PassabilityByDir,
	type Visibility,
	type WaterClass,
} from "../pipeline/description.js";

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
}

type TileSignalBuildResult =
	| { kind: "ok"; signals: TileSignals }
	| { kind: "description_input_invalid"; x: number | null; y: number | null }
	| { kind: "malformed_passability"; x: number | null; y: number | null };

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

const ASPECT_DIRECTION_ORDER: readonly Direction[] = [
	"E",
	"NE",
	"N",
	"NW",
	"W",
	"SW",
	"S",
	"SE",
];

const VALID_WATER_CLASSES = new Set<WaterClass>([
	"none",
	"marsh",
	"stream",
	"lake",
]);

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

function asFiniteNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asString(value: unknown, fallback: string): string {
	return typeof value === "string" && value.length > 0 ? value : fallback;
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

function normalizeWaterClass(value: unknown): WaterClass {
	return typeof value === "string" &&
		VALID_WATER_CLASSES.has(value as WaterClass)
		? (value as WaterClass)
		: "none";
}

function normalizeSlopeDirection(aspectDeg: number): Direction {
	const normalized = ((aspectDeg % 360) + 360) % 360;
	const sector = Math.round(normalized / 45) % 8;
	return ASPECT_DIRECTION_ORDER[sector] as Direction;
}

function deriveVisibility(
	treeDensity: number,
	canopyCover: number,
	obstruction: number,
): Visibility {
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
}

function collectObstacles(featureFlags: unknown): Obstacle[] {
	if (!Array.isArray(featureFlags)) {
		return [];
	}

	const out: Obstacle[] = [];
	for (const entry of featureFlags) {
		if (typeof entry === "string" && VALID_OBSTACLES.has(entry as Obstacle)) {
			out.push(entry as Obstacle);
		}
	}
	return out;
}

function hasStandingWater(surfaceFlags: unknown): boolean {
	return Array.isArray(surfaceFlags) && surfaceFlags.includes("standing_water");
}

function parsePassability(value: unknown): PassabilityByDir | null {
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
	tile: JsonObject,
	debug: DescriptionDebug,
	includeStructured: boolean,
): JsonObject {
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

	const out: JsonObject = {
		...tile,
		description: null,
		descriptionDebug: debugPayload,
	};

	if (includeStructured) {
		out.descriptionStructured = null;
	}

	return out;
}

function buildTileSignals(tile: JsonObject): TileSignalBuildResult {
	const x = asInteger(tile.x);
	const y = asInteger(tile.y);
	if (x === null || y === null) {
		return { kind: "description_input_invalid", x, y };
	}

	const topography = isJsonObject(tile.topography) ? tile.topography : {};
	const hydrology = isJsonObject(tile.hydrology) ? tile.hydrology : {};
	const ecology = isJsonObject(tile.ecology) ? tile.ecology : {};
	const navigation = isJsonObject(tile.navigation) ? tile.navigation : {};
	const roughness = isJsonObject(ecology.roughness) ? ecology.roughness : {};
	const ground = isJsonObject(ecology.ground) ? ecology.ground : {};
	const passability = parsePassability(navigation.passability);
	if (!passability) {
		return { kind: "malformed_passability", x, y };
	}

	const treeDensity = asFiniteNumber(ecology.treeDensity, 0.5);
	const canopyCover = asFiniteNumber(ecology.canopyCover, treeDensity);
	const obstruction = asFiniteNumber(roughness.obstruction, 0.35);

	return {
		kind: "ok",
		signals: {
			x,
			y,
			biome: asString(ecology.biome, "mixed_forest"),
			waterClass: normalizeWaterClass(hydrology.waterClass),
			elevation: asFiniteNumber(topography.h, 0),
			treeDensity,
			moisture: clamp01(asFiniteNumber(hydrology.moisture, 0.5)),
			standingWater: hasStandingWater(ground.surfaceFlags),
			landform: asString(topography.landform, "flat"),
			slopeStrength: Math.max(0, asFiniteNumber(topography.slopeMag, 0)),
			slopeDirection: normalizeSlopeDirection(
				asFiniteNumber(topography.aspectDeg, 0),
			),
			obstacles: collectObstacles(roughness.featureFlags),
			visibility: deriveVisibility(treeDensity, canopyCover, obstruction),
			passability,
		},
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
	const byCoord = new Map<string, TileSignals>();

	for (const tile of envelope.tiles) {
		const signalResult = buildTileSignals(tile);
		if (signalResult.kind === "ok") {
			byCoord.set(
				tileKey(signalResult.signals.x, signalResult.signals.y),
				signalResult.signals,
			);
		}
	}

	const tiles = envelope.tiles.map((tile) => {
		const signalResult = buildTileSignals(tile);
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
		const signals = signalResult.signals;

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
					slopeDirection: signals.slopeDirection,
					slopeStrength: signals.slopeStrength,
					obstacles: signals.obstacles,
					visibility: signals.visibility,
					neighbors: buildNeighborSignals(signals, byCoord),
				},
				describeSeedKey(signals),
				{ strict },
			);

				const outputTile: JsonObject = {
					...tile,
					description: description.text,
				};

				if (includeStructured) {
					outputTile.descriptionStructured = {
						text: description.text,
						sentences: description.sentences.map((sentence) => {
							const out: JsonObject = {
								slot: sentence.slot,
								contributors: [...sentence.contributors],
								contributorKeys: { ...sentence.contributorKeys },
							};
							if (typeof sentence.text === "string") {
								out.text = sentence.text;
							}
							if (sentence.movement) {
								out.movement = sentence.movement.map((run) => ({
									type: run.type,
									directions: [...run.directions],
								}));
							}
							return out;
						}),
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
