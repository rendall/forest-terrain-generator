import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import type { HydrologyMapsSoA } from "../domain/hydrology.js";
import type { TerrainFeatureCollection } from "../domain/topographic-features.js";
import type { Mode, TerrainEnvelope } from "../domain/types.js";
import type {
	HydrologyStructureDiagnostics,
	LakeCoherenceMetrics,
	StreamCoherenceMetrics,
} from "../pipeline/derive-hydrology.js";
import type { LakeAccountingResult } from "../pipeline/derive-lake-accounting.js";
import { serializeEnvelope } from "./serialize-envelope.js";

const DEBUG_ARTIFACT_FILES = [
	"topography.json",
	"hydrology.json",
	"fd.json",
	"fa.json",
	"fa-normalized.json",
	"stream-mask.json",
	"ecology.json",
	"navigation.json",
] as const;

export interface TopographyStructureDebugPayload {
	basinMinIdx: Int32Array;
	basinMinH: Float32Array;
	basinSpillH: Float32Array;
	basinPersistence: Float32Array;
	basinDepthLike: Float32Array;
	peakMaxIdx: Int32Array;
	peakMaxH: Float32Array;
	peakSaddleH: Float32Array;
	peakPersistence: Float32Array;
	peakRiseLike: Float32Array;
	basinLike: Uint8Array;
	ridgeLike: Uint8Array;
	basinFeatures: TerrainFeatureCollection["basins"];
	peakFeatures: TerrainFeatureCollection["peaks"];
	tileFeatureIds: string[][];
	tileActiveFeatureIds: string[][];
}

function serializeJson(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function deriveGridDimensions(envelope: TerrainEnvelope): {
	width: number;
	height: number;
} {
	let maxX = -1;
	let maxY = -1;

	for (const tile of envelope.tiles) {
		if (typeof tile.x === "number" && Number.isInteger(tile.x) && tile.x >= 0) {
			maxX = Math.max(maxX, tile.x);
		}
		if (typeof tile.y === "number" && Number.isInteger(tile.y) && tile.y >= 0) {
			maxY = Math.max(maxY, tile.y);
		}
	}

	return {
		width: maxX + 1,
		height: maxY + 1,
	};
}

function buildPhaseTiles(
	envelope: TerrainEnvelope,
	phaseKey: "topography" | "hydrology" | "ecology" | "navigation",
) {
	return envelope.tiles.map((tile, fallbackIndex) => ({
		index:
			typeof tile.index === "number" &&
			Number.isInteger(tile.index) &&
			tile.index >= 0
				? tile.index
				: fallbackIndex,
		x: tile.x,
		y: tile.y,
		[phaseKey]: tile[phaseKey],
	}));
}

function buildHydrologyDebugTiles(
	envelope: TerrainEnvelope,
	hydrologyMaps: HydrologyMapsSoA | undefined,
	lakeAccounting: LakeAccountingResult | undefined,
) {
	if (!hydrologyMaps) {
		return buildPhaseTiles(envelope, "hydrology");
	}
	const shape = hydrologyMaps.shape;
	return envelope.tiles.map((tile, fallbackIndex) => {
		const index =
			typeof tile.index === "number" &&
			Number.isInteger(tile.index) &&
			tile.index >= 0
				? tile.index
				: fallbackIndex;
		const inRange = index >= 0 && index < shape.size;
		return {
			index,
			x: tile.x,
			y: tile.y,
				hydrology: {
					fd: inRange ? hydrologyMaps.fd[index] : null,
					fa: inRange ? hydrologyMaps.fa[index] : null,
					faN: inRange ? hydrologyMaps.faN[index] : null,
					isStream: inRange ? hydrologyMaps.isStream[index] === 1 : false,
					lakeMask: inRange ? hydrologyMaps.lakeMask[index] === 1 : false,
					lakeSurfaceH: inRange ? hydrologyMaps.lakeSurfaceH[index] : null,
					waterClass: inRange ? hydrologyMaps.waterClass[index] : null,
					lakeDepth:
						inRange && lakeAccounting
							? lakeAccounting.tileLakeDepth[index] ?? 0
							: null,
					lakeBasinId:
						inRange && lakeAccounting
							? (lakeAccounting.tileLakeBasinId[index] || null)
							: null,
				},
			};
		});
}

type HydrologyDebugField = "fd" | "fa" | "faN" | "streamMask";

function buildHydrologyFieldTiles(
	envelope: TerrainEnvelope,
	hydrologyMaps: HydrologyMapsSoA | undefined,
	field: HydrologyDebugField,
) {
	if (!hydrologyMaps) {
		return envelope.tiles.map((tile, fallbackIndex) => {
			const index =
				typeof tile.index === "number" &&
				Number.isInteger(tile.index) &&
				tile.index >= 0
					? tile.index
					: fallbackIndex;
			const hydrology = asObject(tile.hydrology) ?? {};
			if (field === "fd") {
				return { index, x: tile.x, y: tile.y, fd: hydrology.fd ?? null };
			}
			if (field === "fa") {
				return { index, x: tile.x, y: tile.y, fa: hydrology.fa ?? null };
			}
			if (field === "faN") {
				return { index, x: tile.x, y: tile.y, faN: hydrology.faN ?? null };
			}
			return {
				index,
				x: tile.x,
				y: tile.y,
				isStream:
					typeof hydrology.isStream === "boolean" ? hydrology.isStream : null,
			};
		});
	}

	const shape = hydrologyMaps.shape;
	return envelope.tiles.map((tile, fallbackIndex) => {
		const index =
			typeof tile.index === "number" &&
			Number.isInteger(tile.index) &&
			tile.index >= 0
				? tile.index
				: fallbackIndex;
		const inRange = index >= 0 && index < shape.size;
		if (field === "fd") {
			return {
				index,
				x: tile.x,
				y: tile.y,
				fd: inRange ? hydrologyMaps.fd[index] : null,
			};
		}
		if (field === "fa") {
			return {
				index,
				x: tile.x,
				y: tile.y,
				fa: inRange ? hydrologyMaps.fa[index] : null,
			};
		}
		if (field === "faN") {
			return {
				index,
				x: tile.x,
				y: tile.y,
				faN: inRange ? hydrologyMaps.faN[index] : null,
			};
		}
		return {
			index,
			x: tile.x,
			y: tile.y,
			isStream: inRange ? hydrologyMaps.isStream[index] === 1 : null,
		};
	});
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function buildTopographyDebugTiles(
	envelope: TerrainEnvelope,
	topographyStructureDebug: TopographyStructureDebugPayload | undefined,
) {
	return envelope.tiles.map((tile, index) => {
		const topography = asObject(tile.topography) ?? {};
		const tileIndex =
			typeof tile.index === "number" &&
			Number.isInteger(tile.index) &&
			tile.index >= 0
				? tile.index
				: index;
		const featureIds = Array.isArray(tile.featureIds)
			? tile.featureIds
			: (topographyStructureDebug?.tileFeatureIds[index] ?? []);
		const activeFeatureIds = Array.isArray(tile.activeFeatureIds)
			? tile.activeFeatureIds
			: (topographyStructureDebug?.tileActiveFeatureIds[index] ?? []);
		if (!topographyStructureDebug) {
			return {
				index: tileIndex,
				x: tile.x,
				y: tile.y,
				featureIds,
				activeFeatureIds,
				topography,
			};
		}

		const structure = {
			...(asObject(topography.structure) ?? {}),
			basinMinIdx: topographyStructureDebug.basinMinIdx[index],
			basinMinH: topographyStructureDebug.basinMinH[index],
			basinSpillH: topographyStructureDebug.basinSpillH[index],
			basinPersistence: topographyStructureDebug.basinPersistence[index],
			basinDepthLike: topographyStructureDebug.basinDepthLike[index],
			peakMaxIdx: topographyStructureDebug.peakMaxIdx[index],
			peakMaxH: topographyStructureDebug.peakMaxH[index],
			peakSaddleH: topographyStructureDebug.peakSaddleH[index],
			peakPersistence: topographyStructureDebug.peakPersistence[index],
			peakRiseLike: topographyStructureDebug.peakRiseLike[index],
			basinLike: topographyStructureDebug.basinLike[index] === 1,
			ridgeLike: topographyStructureDebug.ridgeLike[index] === 1,
		};

		return {
			index: tileIndex,
			x: tile.x,
			y: tile.y,
			featureIds,
			activeFeatureIds,
			topography: {
				...topography,
				structure,
			},
		};
	});
}

function resolveTopographyFeatures(
	envelope: TerrainEnvelope,
	topographyStructureDebug: TopographyStructureDebugPayload | undefined,
): TerrainFeatureCollection {
	if (
		envelope.features &&
		Array.isArray(envelope.features.basins) &&
		Array.isArray(envelope.features.peaks)
	) {
		return envelope.features;
	}

	if (topographyStructureDebug) {
		return {
			basins: topographyStructureDebug.basinFeatures,
			peaks: topographyStructureDebug.peakFeatures,
		};
	}

	return {
		basins: [],
		peaks: [],
	};
}

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown filesystem error.";
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function writeJsonFile(
	path: string,
	payload: unknown,
	context: string,
): Promise<void> {
	try {
		await writeFile(path, serializeJson(payload), "utf8");
	} catch (error) {
		throw new FileIoError(
			`I/O error during ${context} at "${path}": ${messageFromUnknown(error)}`,
		);
	}
}

async function prepareFileTarget(path: string, force: boolean): Promise<void> {
	if (await pathExists(path)) {
		if (!force) {
			throw new InputValidationError(
				`Output file already exists: "${path}". Re-run with --force to overwrite.`,
			);
		}
		await rm(path, { force: true });
	}

	await mkdir(dirname(path), { recursive: true });
}

export async function writeStandardOutput(
	outputFile: string,
	envelope: TerrainEnvelope,
	force: boolean,
): Promise<void> {
	await prepareFileTarget(outputFile, force);
	try {
		await writeFile(outputFile, serializeEnvelope(envelope), "utf8");
	} catch (error) {
		throw new FileIoError(
			`I/O error during terrain output write at "${outputFile}": ${messageFromUnknown(error)}`,
		);
	}
}

async function writeDebugArtifacts(
	targetDir: string,
	envelope: TerrainEnvelope,
	streamCoherence: StreamCoherenceMetrics | undefined,
	lakeCoherence: LakeCoherenceMetrics | undefined,
	topographyStructureDebug: TopographyStructureDebugPayload | undefined,
	hydrologyStructureDiagnostics: HydrologyStructureDiagnostics | undefined,
	hydrologyMaps?: HydrologyMapsSoA,
	lakeAccounting?: LakeAccountingResult,
): Promise<void> {
	const { width, height } = deriveGridDimensions(envelope);
	const debugManifest = {
		mode: "debug",
		specVersion: envelope.meta.specVersion,
		width,
		height,
		tileCount: envelope.tiles.length,
		artifacts: [...DEBUG_ARTIFACT_FILES],
		...(streamCoherence ? { streamCoherence } : {}),
		...(lakeCoherence ? { lakeCoherence } : {}),
		...(hydrologyStructureDiagnostics ? { hydrologyStructureDiagnostics } : {}),
	};
	await writeJsonFile(
		join(targetDir, "debug-manifest.json"),
		debugManifest,
		"debug manifest write",
	);
	await writeJsonFile(
		join(targetDir, "topography.json"),
		{
			features: resolveTopographyFeatures(envelope, topographyStructureDebug),
			tiles: buildTopographyDebugTiles(envelope, topographyStructureDebug),
		},
		"topography debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "hydrology.json"),
		{
			...(lakeAccounting
				? {
						lakeAccounting: {
							basins: lakeAccounting.basins,
						},
					}
				: {}),
			tiles: buildHydrologyDebugTiles(envelope, hydrologyMaps, lakeAccounting),
		},
		"hydrology debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "fd.json"),
		{ tiles: buildHydrologyFieldTiles(envelope, hydrologyMaps, "fd") },
		"fd debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "fa.json"),
		{ tiles: buildHydrologyFieldTiles(envelope, hydrologyMaps, "fa") },
		"fa debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "fa-normalized.json"),
		{ tiles: buildHydrologyFieldTiles(envelope, hydrologyMaps, "faN") },
		"fa-normalized debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "stream-mask.json"),
		{ tiles: buildHydrologyFieldTiles(envelope, hydrologyMaps, "streamMask") },
		"stream-mask debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "ecology.json"),
		{ tiles: buildPhaseTiles(envelope, "ecology") },
		"ecology debug artifact write",
	);
	await writeJsonFile(
		join(targetDir, "navigation.json"),
		{ tiles: buildPhaseTiles(envelope, "navigation") },
		"navigation debug artifact write",
	);
}

async function publishDebugDirectory(
	stagingDir: string,
	outputDir: string,
	force: boolean,
): Promise<void> {
	if (await pathExists(outputDir)) {
		if (!force) {
			throw new InputValidationError(
				`Output directory already exists: "${outputDir}". Re-run with --force to replace.`,
			);
		}
		try {
			await rm(outputDir, { recursive: true, force: true });
		} catch (error) {
			throw new FileIoError(
				`I/O error during debug output replace at "${outputDir}": ${messageFromUnknown(error)}`,
			);
		}
	}

	await mkdir(dirname(outputDir), { recursive: true });
	try {
		await rename(stagingDir, outputDir);
	} catch (error) {
		throw new FileIoError(
			`I/O error during debug output publish to "${outputDir}": ${messageFromUnknown(error)}`,
		);
	}
}

export async function writeDebugOutputs(
	outputDir: string,
	envelope: TerrainEnvelope,
	debugOutputFile: string | undefined,
	force: boolean,
	streamCoherence: StreamCoherenceMetrics | undefined,
	lakeCoherence: LakeCoherenceMetrics | undefined,
	topographyStructureDebug?: TopographyStructureDebugPayload,
	hydrologyStructureDiagnostics?: HydrologyStructureDiagnostics,
	hydrologyMaps?: HydrologyMapsSoA,
	lakeAccounting?: LakeAccountingResult,
): Promise<void> {
	if ((await pathExists(outputDir)) && !force) {
		throw new InputValidationError(
			`Output directory already exists: "${outputDir}". Re-run with --force to replace.`,
		);
	}

	await mkdir(dirname(outputDir), { recursive: true });
	const stagingDir = join(
		dirname(outputDir),
		`.ftg-debug-staging-${randomUUID()}`,
	);
	await mkdir(stagingDir, { recursive: false });
	let published = false;

	try {
		await writeDebugArtifacts(
			stagingDir,
			envelope,
			streamCoherence,
			lakeCoherence,
			topographyStructureDebug,
			hydrologyStructureDiagnostics,
			hydrologyMaps,
			lakeAccounting,
		);

		if (debugOutputFile) {
			await writeStandardOutput(debugOutputFile, envelope, force);
		}

		await publishDebugDirectory(stagingDir, outputDir, force);
		published = true;
	} finally {
		if (!published) {
			await rm(stagingDir, { recursive: true, force: true });
		}
	}
}

export async function writeModeOutputs(
	mode: Mode,
	outputFile: string | undefined,
	outputDir: string | undefined,
	debugOutputFile: string | undefined,
	envelope: TerrainEnvelope,
	force: boolean,
	streamCoherence?: StreamCoherenceMetrics,
	lakeCoherence?: LakeCoherenceMetrics,
	topographyStructureDebug?: TopographyStructureDebugPayload,
	hydrologyStructureDiagnostics?: HydrologyStructureDiagnostics,
	hydrologyMaps?: HydrologyMapsSoA,
	lakeAccounting?: LakeAccountingResult,
): Promise<void> {
	if (mode === "debug") {
		if (!outputDir) {
			throw new InputValidationError(
				"Missing required output argument for debug mode: --output-dir.",
			);
		}
		await writeDebugOutputs(
			outputDir,
			envelope,
			debugOutputFile,
			force,
			streamCoherence,
			lakeCoherence,
				topographyStructureDebug,
				hydrologyStructureDiagnostics,
				hydrologyMaps,
				lakeAccounting,
			);
		return;
	}

	if (!outputFile) {
		throw new InputValidationError(
			`Missing required output argument for ${mode} mode: --output-file.`,
		);
	}
	await writeStandardOutput(outputFile, envelope, force);
}
