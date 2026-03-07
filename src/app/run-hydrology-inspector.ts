import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import {
	createHydrologyMaps,
	DIR8_NONE,
	type HydrologyMapsSoA,
	WATER_CLASS_CODE,
} from "../domain/hydrology.js";
import type { JsonObject } from "../domain/types.js";
import { createGridShape, type GridShape } from "../domain/topography.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { normalizeAndValidateParamsObject } from "../io/read-params.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deepMerge } from "../lib/deep-merge.js";
import { validateReplayTopographyGrid } from "../lib/validate-replay-tiles.js";
import { deriveHydrology } from "../pipeline/derive-hydrology.js";
import type { BasinLakeAccounting } from "../pipeline/derive-lake-accounting.js";

export type HydrologyVizMode =
	| "fa"
	| "fd"
	| "fa-normalized"
	| "carry-over"
	| "hydrology"
	| "all";

export interface HydrologyInspectorCliArgs {
	inputJsonPath?: string;
	sinkMode?: "strict_local" | "overflow_guided";
	viz?: HydrologyVizMode;
	debugDirPath?: string;
	stats?: boolean;
	statsFilePath?: string;
	force?: boolean;
}

export interface HydrologyInspectorRequest {
	args: HydrologyInspectorCliArgs;
	cwd: string;
}

interface HydrologyContext {
	source: "debug_artifacts" | "envelope" | "recomputed";
	shape: GridShape;
	h: Float32Array;
	maps: HydrologyMapsSoA;
	lakeAccountingBasins: BasinLakeAccounting[];
	tileLakeBasinId: string[];
}

interface VisualizationNeeds {
	needFa: boolean;
	needFd: boolean;
	needFaN: boolean;
	needHydrology: boolean;
	needStats: boolean;
}

export interface HydrologyInspectorStats {
	hydrologyMapsSource: HydrologyContext["source"];
	tileCount: number;
	sinkCount: number;
	streamTileCount: number;
	lakeTileCount: number;
	lakeDepth: {
		max: number;
		mean: number;
	};
	basins: {
		total: number;
		sink: number;
		overflowCarrier: number;
		terminalLake: number;
	};
	fa: {
		min: number;
		max: number;
		mean: number;
		p50: number;
		p90: number;
		p95: number;
		p99: number;
	};
	faN: {
		min: number;
		max: number;
		mean: number;
		p50: number;
		p90: number;
		p95: number;
		p99: number;
	};
	fdHistogram: Record<string, number>;
	topAccumulationTiles: Array<{
		tileId: number;
		x: number;
		y: number;
		fa: number;
		faN: number;
	}>;
}

export interface HydrologyInspectorVisualizationResult {
	hydrologyMapsSource: HydrologyContext["source"];
	writtenFiles: string[];
	stats: HydrologyInspectorStats | null;
	statsFilePath: string | null;
}

const DIRECTION_COLORS: Record<number, [number, number, number]> = {
	0: [255, 96, 96],
	1: [255, 160, 96],
	2: [255, 224, 96],
	3: [176, 255, 96],
	4: [96, 255, 96],
	5: [96, 255, 224],
	6: [96, 160, 255],
	7: [192, 96, 255],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const clamp01 = (value: number): number => {
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
};

const readFiniteNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown): boolean | null =>
	typeof value === "boolean" ? value : null;

const resolvePathFromCwd = (
	cwd: string,
	maybeRelative: string | undefined,
): string | undefined => {
	if (!maybeRelative) {
		return undefined;
	}
	return isAbsolute(maybeRelative)
		? maybeRelative
		: resolve(cwd, maybeRelative);
};

const resolveRequiredInputPath = (
	cwd: string,
	inputJsonPath: string | undefined,
): string => {
	if (!inputJsonPath) {
		return "";
	}
	return isAbsolute(inputJsonPath)
		? inputJsonPath
		: resolve(cwd, inputJsonPath);
};

const fileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const messageFromUnknown = (error: unknown): string => {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown filesystem error.";
};

const buildInspectorRecomputeParams = (
	envelopeParamOverrides: JsonObject | undefined,
	sinkModeOverride: "strict_local" | "overflow_guided" | undefined,
): JsonObject => {
	const mergedWithDefaults = envelopeParamOverrides
		? deepMerge(APPENDIX_A_DEFAULTS, deepMerge({}, envelopeParamOverrides))
		: deepMerge({}, APPENDIX_A_DEFAULTS);
	if (!sinkModeOverride) {
		return mergedWithDefaults;
	}
	return deepMerge(mergedWithDefaults, {
		hydrology: {
			sinkMode: sinkModeOverride,
		},
	});
};

const readJsonFile = async (path: string): Promise<unknown> => {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw) as unknown;
};

const prepareOutputFile = async (
	path: string,
	force: boolean,
): Promise<void> => {
	if (await fileExists(path)) {
		if (!force) {
			throw new InputValidationError(
				`Output file already exists: "${path}". Re-run with --force to overwrite.`,
			);
		}
	}
	await mkdir(dirname(path), { recursive: true });
};

const deriveShapeFromTiles = (tiles: unknown[]): GridShape | null => {
	let maxX = -1;
	let maxY = -1;
	for (const tile of tiles) {
		if (!isObject(tile)) {
			continue;
		}
		const x = readFiniteNumber(tile.x);
		const y = readFiniteNumber(tile.y);
		if (
			x === null ||
			y === null ||
			!Number.isInteger(x) ||
			!Number.isInteger(y)
		) {
			continue;
		}
		if (x < 0 || y < 0) {
			continue;
		}
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	if (maxX < 0 || maxY < 0) {
		return null;
	}
	return createGridShape(maxX + 1, maxY + 1);
};

const resolveTileIndex = (
	shape: GridShape,
	tile: Record<string, unknown>,
): number | null => {
	const index = readFiniteNumber(tile.index);
	if (
		index !== null &&
		Number.isInteger(index) &&
		index >= 0 &&
		index < shape.size
	) {
		return index;
	}
	const x = readFiniteNumber(tile.x);
	const y = readFiniteNumber(tile.y);
	if (
		x === null ||
		y === null ||
		!Number.isInteger(x) ||
		!Number.isInteger(y) ||
		x < 0 ||
		y < 0 ||
		x >= shape.width ||
		y >= shape.height
	) {
		return null;
	}
	return y * shape.width + x;
};

const buildNeeds = (
	vizMode: HydrologyVizMode | undefined,
	statsEnabled: boolean,
): VisualizationNeeds => {
	if (vizMode === "all") {
		return {
			needFa: true,
			needFd: true,
			needFaN: true,
			needHydrology: true,
			needStats: statsEnabled,
		};
	}
	return {
		needFa: vizMode === "fa" || statsEnabled,
		needFd: vizMode === "fd" || statsEnabled,
		needFaN: vizMode === "fa-normalized" || statsEnabled,
		needHydrology:
			vizMode === "hydrology" || vizMode === "carry-over" || statsEnabled,
		needStats: statsEnabled,
	};
};

const loadContextFromDebugArtifacts = async (
	debugDirPath: string,
	needs: VisualizationNeeds,
): Promise<HydrologyContext | null> => {
	const topographyPath = join(debugDirPath, "topography.json");
	if (!(await fileExists(topographyPath))) {
		return null;
	}

	let topographyDoc: unknown;
	try {
		topographyDoc = await readJsonFile(topographyPath);
	} catch {
		return null;
	}
	if (!isObject(topographyDoc) || !Array.isArray(topographyDoc.tiles)) {
		return null;
	}

	const shape = deriveShapeFromTiles(topographyDoc.tiles);
	if (!shape) {
		return null;
	}
	const h = new Float32Array(shape.size);
	for (const rawTile of topographyDoc.tiles) {
		if (!isObject(rawTile)) {
			continue;
		}
		const index = resolveTileIndex(shape, rawTile);
		if (index === null) {
			continue;
		}
		const topography = isObject(rawTile.topography)
			? rawTile.topography
			: undefined;
		const value = readFiniteNumber(topography?.h);
		h[index] = value !== null ? value : 0;
	}

	const maps = createHydrologyMaps(shape);
	const tileLakeBasinId = new Array<string>(shape.size).fill("");
	const requiredFiles = new Set<string>();
	if (needs.needFd) {
		requiredFiles.add("fd.json");
	}
	if (needs.needFa) {
		requiredFiles.add("fa.json");
	}
	if (needs.needFaN) {
		requiredFiles.add("fa-normalized.json");
	}
	if (needs.needHydrology) {
		requiredFiles.add("hydrology.json");
	}
	for (const filename of requiredFiles) {
		if (!(await fileExists(join(debugDirPath, filename)))) {
			return null;
		}
	}

	const applyTiles = (
		tiles: unknown[],
		apply: (index: number, tile: Record<string, unknown>) => void,
	): void => {
		for (const rawTile of tiles) {
			if (!isObject(rawTile)) {
				continue;
			}
			const index = resolveTileIndex(shape, rawTile);
			if (index === null) {
				continue;
			}
			apply(index, rawTile);
		}
	};

	if (needs.needFd) {
		const fdDoc = await readJsonFile(join(debugDirPath, "fd.json"));
		if (!isObject(fdDoc) || !Array.isArray(fdDoc.tiles)) {
			return null;
		}
		applyTiles(fdDoc.tiles, (index, tile) => {
			const fd = readFiniteNumber(tile.fd);
			if (fd !== null && Number.isInteger(fd) && fd >= 0 && fd <= 255) {
				maps.fd[index] = fd;
			}
		});
	}

	if (needs.needFa) {
		const faDoc = await readJsonFile(join(debugDirPath, "fa.json"));
		if (!isObject(faDoc) || !Array.isArray(faDoc.tiles)) {
			return null;
		}
		applyTiles(faDoc.tiles, (index, tile) => {
			const fa = readFiniteNumber(tile.fa);
			if (fa !== null && fa >= 0) {
				maps.fa[index] = Math.floor(fa);
			}
		});
	}

	if (needs.needFaN) {
		const faNDoc = await readJsonFile(join(debugDirPath, "fa-normalized.json"));
		if (!isObject(faNDoc) || !Array.isArray(faNDoc.tiles)) {
			return null;
		}
		applyTiles(faNDoc.tiles, (index, tile) => {
			const faN = readFiniteNumber(tile.faN);
			if (faN !== null) {
				maps.faN[index] = faN;
			}
		});
	}

	if (needs.needHydrology) {
		const hydrologyDoc = await readJsonFile(
			join(debugDirPath, "hydrology.json"),
		);
		if (!isObject(hydrologyDoc) || !Array.isArray(hydrologyDoc.tiles)) {
			return null;
		}
		applyTiles(hydrologyDoc.tiles, (index, tile) => {
			const hydrology = isObject(tile.hydrology) ? tile.hydrology : undefined;
			const streamFromRoot = readBoolean(tile.isStream);
			const streamFromHydrology = readBoolean(hydrology?.isStream);
			maps.isStream[index] =
				streamFromRoot === true || streamFromHydrology === true ? 1 : 0;
			const lakeMask = readBoolean(hydrology?.lakeMask);
			if (lakeMask !== null) {
				maps.lakeMask[index] = lakeMask ? 1 : 0;
			}
			const waterSurfaceH = readFiniteNumber(hydrology?.waterSurfaceH);
			if (waterSurfaceH !== null) {
				maps.waterSurfaceH[index] = waterSurfaceH;
			}
			const waterClass = readFiniteNumber(hydrology?.waterClass);
			if (
				waterClass !== null &&
				Number.isInteger(waterClass) &&
				waterClass >= 0
			) {
				maps.waterClass[index] = waterClass;
			}
			const fd = readFiniteNumber(hydrology?.fd);
			if (
				!needs.needFd &&
				fd !== null &&
				Number.isInteger(fd) &&
				fd >= 0 &&
				fd <= 255
			) {
				maps.fd[index] = fd;
			}
			const fa = readFiniteNumber(hydrology?.fa);
			if (!needs.needFa && fa !== null && fa >= 0) {
				maps.fa[index] = Math.floor(fa);
			}
			const faN = readFiniteNumber(hydrology?.faN);
			if (!needs.needFaN && faN !== null) {
				maps.faN[index] = faN;
			}
			const lakeBasinId =
				typeof hydrology?.lakeBasinId === "string"
					? hydrology.lakeBasinId
					: "";
			tileLakeBasinId[index] = lakeBasinId;
		});

		const lakeAccountingRaw = isObject(hydrologyDoc.lakeAccounting)
			? hydrologyDoc.lakeAccounting
			: null;
		const lakeAccountingBasins = Array.isArray(lakeAccountingRaw?.basins)
			? (lakeAccountingRaw.basins as BasinLakeAccounting[])
			: [];

		return {
			source: "debug_artifacts",
			shape,
			h,
			maps,
			lakeAccountingBasins,
			tileLakeBasinId,
		};
	}

	return {
		source: "debug_artifacts",
		shape,
		h,
		maps,
		lakeAccountingBasins: [],
		tileLakeBasinId,
	};
};

const buildContextFromEnvelope = async (
	request: HydrologyInspectorRequest,
): Promise<HydrologyContext> => {
	const inputPath = resolveRequiredInputPath(
		request.cwd,
		request.args.inputJsonPath,
	);
	if (!inputPath) {
		throw new InputValidationError("Missing required input: --input-json.");
	}
	const envelope = await readTerrainEnvelopeFile(inputPath);
	const envelopeParamOverrides = isObject(envelope.paramOverrides)
		? normalizeAndValidateParamsObject(
			deepMerge({}, envelope.paramOverrides as JsonObject),
			"envelope.paramOverrides",
		)
		: undefined;
	const hasEnvelopeHydrologyFields =
		envelope.tiles.length > 0 &&
		envelope.tiles.every((tile) => {
			const hydrology = isObject(tile.hydrology) ? tile.hydrology : undefined;
			return (
				readFiniteNumber(hydrology?.fd) !== null &&
				readFiniteNumber(hydrology?.fa) !== null &&
				readFiniteNumber(hydrology?.faN) !== null &&
				readBoolean(hydrology?.isStream) !== null
			);
		});

	if (!hasEnvelopeHydrologyFields) {
		const effectiveParams = buildInspectorRecomputeParams(
			envelopeParamOverrides,
			request.args.sinkMode,
		);
		const replayGrid = validateReplayTopographyGrid(
			envelope.tiles as JsonObject[],
			inputPath,
		);
		const replayTileFeatureIds = replayGrid.tilesByIndex.map((tile) =>
			Array.isArray(tile.featureIds)
				? tile.featureIds.filter((id): id is string => typeof id === "string")
				: [],
		);

		const derived = deriveHydrology(
			replayGrid.shape,
			replayGrid.h,
			{
				basinFeatures: envelope.features?.basins ?? [],
				tileFeatureIds: replayTileFeatureIds,
			},
			effectiveParams,
		);
		return {
			source: "recomputed",
			shape: replayGrid.shape,
			h: replayGrid.h,
			maps: derived.maps,
			lakeAccountingBasins: derived.lakeAccounting.basins,
			tileLakeBasinId: derived.lakeAccounting.tileLakeBasinId,
		};
	}

	const maxX = envelope.tiles.reduce(
		(max, tile) =>
			typeof tile.x === "number" && Number.isInteger(tile.x) && tile.x >= 0
				? Math.max(max, tile.x)
				: max,
		-1,
	);
	const maxY = envelope.tiles.reduce(
		(max, tile) =>
			typeof tile.y === "number" && Number.isInteger(tile.y) && tile.y >= 0
				? Math.max(max, tile.y)
				: max,
		-1,
	);
	const shape = createGridShape(maxX + 1, maxY + 1);
	const h = new Float32Array(shape.size);
	const tileFeatureIds = Array.from(
		{ length: shape.size },
		() => [] as string[],
	);
	for (const tile of envelope.tiles) {
		if (
			typeof tile.x !== "number" ||
			typeof tile.y !== "number" ||
			!Number.isInteger(tile.x) ||
			!Number.isInteger(tile.y) ||
			tile.x < 0 ||
			tile.y < 0 ||
			tile.x >= shape.width ||
			tile.y >= shape.height
		) {
			continue;
		}
		const index = tile.y * shape.width + tile.x;
		const topography = isObject(tile.topography) ? tile.topography : undefined;
		const tileH = readFiniteNumber(topography?.h);
		h[index] = typeof tileH === "number" ? tileH : 0;
		const featureIds = Array.isArray(tile.featureIds)
			? tile.featureIds.filter((id): id is string => typeof id === "string")
			: [];
		tileFeatureIds[index] = featureIds;
	}

	const maps = createHydrologyMaps(shape);
	const tileLakeBasinId = new Array<string>(shape.size).fill("");
	for (const tile of envelope.tiles) {
		if (
			typeof tile.x !== "number" ||
			typeof tile.y !== "number" ||
			!Number.isInteger(tile.x) ||
			!Number.isInteger(tile.y) ||
			tile.x < 0 ||
			tile.y < 0 ||
			tile.x >= shape.width ||
			tile.y >= shape.height
		) {
			continue;
		}
		const index = tile.y * shape.width + tile.x;
		const hydrology = isObject(tile.hydrology) ? tile.hydrology : undefined;
		const fd = readFiniteNumber(hydrology?.fd);
		const fa = readFiniteNumber(hydrology?.fa);
		const faN = readFiniteNumber(hydrology?.faN);
		const isStream = readBoolean(hydrology?.isStream);
		const lakeMask = readBoolean(hydrology?.lakeMask);
		const waterSurfaceH = readFiniteNumber(hydrology?.waterSurfaceH);
		const waterClass = readFiniteNumber(hydrology?.waterClass);
		if (fd !== null && Number.isInteger(fd) && fd >= 0 && fd <= 255) {
			maps.fd[index] = fd;
		}
		if (fa !== null && fa >= 0) {
			maps.fa[index] = Math.floor(fa);
		}
		if (faN !== null) {
			maps.faN[index] = faN;
		}
		maps.isStream[index] = isStream === true ? 1 : 0;
		if (lakeMask !== null) {
			maps.lakeMask[index] = lakeMask ? 1 : 0;
		}
		if (waterSurfaceH !== null) {
			maps.waterSurfaceH[index] = waterSurfaceH;
		}
		if (
			waterClass !== null &&
			Number.isInteger(waterClass) &&
			waterClass >= 0
		) {
			maps.waterClass[index] = waterClass;
		}
		tileLakeBasinId[index] =
			typeof hydrology?.lakeBasinId === "string" ? hydrology.lakeBasinId : "";
	}
	return {
		source: "envelope",
		shape,
		h,
		maps,
		lakeAccountingBasins: [],
		tileLakeBasinId,
	};
};

const resolveHydrologyContext = async (
	request: HydrologyInspectorRequest,
	needs: VisualizationNeeds,
): Promise<HydrologyContext> => {
	const debugDirPath = resolvePathFromCwd(
		request.cwd,
		request.args.debugDirPath,
	);
	if (debugDirPath) {
		const fromDebug = await loadContextFromDebugArtifacts(debugDirPath, needs);
		if (fromDebug) {
			return fromDebug;
		}
	}
	return buildContextFromEnvelope(request);
};

const blendChannel = (base: number, tint: number, alpha: number): number =>
	Math.max(0, Math.min(255, Math.round(base * (1 - alpha) + tint * alpha)));

const applyBlueTint = (
	pixels: Uint8Array,
	index: number,
	intensity01: number,
): void => {
	const alpha = clamp01(intensity01) * 0.72;
	if (alpha <= 0) {
		return;
	}
	const base = index * 3;
	const r = pixels[base] ?? 0;
	const g = pixels[base + 1] ?? 0;
	const b = pixels[base + 2] ?? 0;
	pixels[base] = blendChannel(r, 0, alpha);
	pixels[base + 1] = blendChannel(g, 48, alpha);
	pixels[base + 2] = blendChannel(b, 255, alpha);
};

const applyColorTint = (
	pixels: Uint8Array,
	index: number,
	tint: [number, number, number],
	alpha: number,
): void => {
	const a = clamp01(alpha);
	if (a <= 0) {
		return;
	}
	const base = index * 3;
	pixels[base] = blendChannel(pixels[base] ?? 0, tint[0], a);
	pixels[base + 1] = blendChannel(pixels[base + 1] ?? 0, tint[1], a);
	pixels[base + 2] = blendChannel(pixels[base + 2] ?? 0, tint[2], a);
};

const buildBasePixels = (h: Float32Array): Uint8Array => {
	const pixels = new Uint8Array(h.length * 3);
	for (let i = 0; i < h.length; i += 1) {
		const v = Math.round(clamp01(h[i] ?? 0) * 255);
		const base = i * 3;
		pixels[base] = v;
		pixels[base + 1] = v;
		pixels[base + 2] = v;
	}
	return pixels;
};

const writePpm = async (
	outputPath: string,
	shape: GridShape,
	pixels: Uint8Array,
	force: boolean,
): Promise<void> => {
	await prepareOutputFile(outputPath, force);
	const header = Buffer.from(
		`P6\n${shape.width} ${shape.height}\n255\n`,
		"ascii",
	);
	const payload = Buffer.concat([header, Buffer.from(pixels)]);
	try {
		await writeFile(outputPath, payload);
	} catch (error) {
		throw new FileIoError(
			`I/O error during image output write at "${outputPath}": ${messageFromUnknown(error)}`,
		);
	}
};

const createVisualizationPixels = (
	context: HydrologyContext,
	mode: Exclude<HydrologyVizMode, "all">,
): Uint8Array => {
	const pixels = buildBasePixels(context.h);
	if (mode === "fa") {
		for (let i = 0; i < context.shape.size; i += 1) {
			const fa = context.maps.fa[i] ?? 0;
			const intensity = Math.min(Math.max(fa, 0), 255) / 255;
			applyBlueTint(pixels, i, intensity);
		}
		return pixels;
	}
	if (mode === "fa-normalized") {
		for (let i = 0; i < context.shape.size; i += 1) {
			const faN = context.maps.faN[i] ?? 0;
			applyBlueTint(pixels, i, clamp01(faN));
		}
		return pixels;
	}
	if (mode === "fd") {
		for (let i = 0; i < context.shape.size; i += 1) {
			const fd = context.maps.fd[i] ?? DIR8_NONE;
			if (fd === DIR8_NONE) {
				continue;
			}
			const tint = DIRECTION_COLORS[fd];
			if (!tint) {
				continue;
			}
			applyColorTint(pixels, i, tint, 0.42);
		}
		return pixels;
	}
	if (mode === "carry-over") {
		const carryOverIds = new Set(
			context.lakeAccountingBasins
				.filter((basin) => basin.role === "overflow_carrier")
				.map((basin) => basin.id),
		);
		for (let i = 0; i < context.shape.size; i += 1) {
			const basinId = context.tileLakeBasinId[i] ?? "";
			if (!carryOverIds.has(basinId)) {
				continue;
			}
			applyColorTint(pixels, i, [0, 96, 255], 0.72);
		}
		return pixels;
	}
	for (let i = 0; i < context.shape.size; i += 1) {
		if ((context.maps.isStream[i] ?? 0) === 1) {
			applyColorTint(pixels, i, [0, 96, 255], 0.82);
			continue;
		}
		const waterClass = context.maps.waterClass[i] ?? WATER_CLASS_CODE.none;
		if (waterClass === WATER_CLASS_CODE.lake) {
			applyColorTint(pixels, i, [0, 168, 255], 0.55);
		} else if (waterClass === WATER_CLASS_CODE.pool) {
			applyColorTint(pixels, i, [0, 140, 220], 0.45);
		} else if (waterClass === WATER_CLASS_CODE.marsh) {
			applyColorTint(pixels, i, [80, 170, 120], 0.45);
		}
	}
	return pixels;
};

const quantileFromSorted = (sortedValues: number[], q: number): number => {
	if (sortedValues.length === 0) {
		return 0;
	}
	const qi = Math.max(0, Math.min(1, q));
	const index = Math.floor((sortedValues.length - 1) * qi);
	return sortedValues[index] ?? 0;
};

const computeStats = (
	context: HydrologyContext,
	topN: number,
): HydrologyInspectorStats => {
	const faValues = Array.from(context.maps.fa, (value) => Number(value));
	const faNValues = Array.from(context.maps.faN, (value) => Number(value));
	const faSorted = [...faValues].sort((a, b) => a - b);
	const faNSorted = [...faNValues].sort((a, b) => a - b);
	const faSum = faValues.reduce((sum, value) => sum + value, 0);
	const faNSum = faNValues.reduce((sum, value) => sum + value, 0);
	let sinkCount = 0;
	let streamTileCount = 0;
	let lakeTileCount = 0;
	let lakeDepthSum = 0;
	let lakeDepthMax = 0;
	const fdHistogram: Record<string, number> = {};
	for (let i = 0; i < context.shape.size; i += 1) {
		const fd = context.maps.fd[i] ?? DIR8_NONE;
		const key = String(fd);
		fdHistogram[key] = (fdHistogram[key] ?? 0) + 1;
		if (fd === DIR8_NONE) {
			sinkCount += 1;
		}
		if ((context.maps.isStream[i] ?? 0) === 1) {
			streamTileCount += 1;
		}
		if ((context.maps.lakeMask[i] ?? 0) === 1) {
			lakeTileCount += 1;
			const depth = Math.max(
				0,
				(context.maps.waterSurfaceH[i] ?? 0) - (context.h[i] ?? 0),
			);
			lakeDepthSum += depth;
			lakeDepthMax = Math.max(lakeDepthMax, depth);
		}
	}

	let sinkBasinCount = 0;
	let overflowCarrierBasinCount = 0;
	let terminalLakeBasinCount = 0;
	for (const basin of context.lakeAccountingBasins) {
		switch (basin.role) {
			case "sink":
				sinkBasinCount += 1;
				break;
			case "overflow_carrier":
				overflowCarrierBasinCount += 1;
				break;
			case "terminal_lake":
				terminalLakeBasinCount += 1;
				break;
			default:
				break;
		}
	}

	const rankedTileIds = Array.from(
		{ length: context.shape.size },
		(_, index) => index,
	)
		.sort((a, b) => {
			const byFa = (context.maps.fa[b] ?? 0) - (context.maps.fa[a] ?? 0);
			if (byFa !== 0) {
				return byFa;
			}
			return a - b;
		})
		.slice(0, topN);

	return {
		hydrologyMapsSource: context.source,
		tileCount: context.shape.size,
		sinkCount,
		streamTileCount,
		lakeTileCount,
		lakeDepth: {
			max: lakeDepthMax,
			mean: lakeTileCount > 0 ? lakeDepthSum / lakeTileCount : 0,
		},
		basins: {
			total: context.lakeAccountingBasins.length,
			sink: sinkBasinCount,
			overflowCarrier: overflowCarrierBasinCount,
			terminalLake: terminalLakeBasinCount,
		},
		fa: {
			min: faSorted[0] ?? 0,
			max: faSorted[faSorted.length - 1] ?? 0,
			mean: faValues.length > 0 ? faSum / faValues.length : 0,
			p50: quantileFromSorted(faSorted, 0.5),
			p90: quantileFromSorted(faSorted, 0.9),
			p95: quantileFromSorted(faSorted, 0.95),
			p99: quantileFromSorted(faSorted, 0.99),
		},
		faN: {
			min: faNSorted[0] ?? 0,
			max: faNSorted[faNSorted.length - 1] ?? 0,
			mean: faNValues.length > 0 ? faNSum / faNValues.length : 0,
			p50: quantileFromSorted(faNSorted, 0.5),
			p90: quantileFromSorted(faNSorted, 0.9),
			p95: quantileFromSorted(faNSorted, 0.95),
			p99: quantileFromSorted(faNSorted, 0.99),
		},
		fdHistogram,
		topAccumulationTiles: rankedTileIds.map((tileId) => ({
			tileId,
			x: tileId % context.shape.width,
			y: Math.floor(tileId / context.shape.width),
			fa: context.maps.fa[tileId] ?? 0,
			faN: context.maps.faN[tileId] ?? 0,
		})),
	};
};

export const runHydrologyInspectorVisualization = async (
	request: HydrologyInspectorRequest,
): Promise<HydrologyInspectorVisualizationResult | null> => {
	const vizMode = request.args.viz;
	const statsEnabled = request.args.stats === true;
	if (!statsEnabled && request.args.statsFilePath) {
		throw new InputValidationError("--stats-file requires --stats.");
	}
	if (!vizMode && !statsEnabled) {
		return null;
	}

	const debugDirPath = resolvePathFromCwd(
		request.cwd,
		request.args.debugDirPath,
	);
	if (vizMode && !debugDirPath) {
		throw new InputValidationError(
			"Missing required input: --debug-dir (required when --viz is set).",
		);
	}

	const needs = buildNeeds(vizMode, statsEnabled);
	const context = await resolveHydrologyContext(request, needs);
	const force = request.args.force ?? false;
	const writtenFiles: string[] = [];

	if (vizMode) {
		const outputDir = debugDirPath ?? request.cwd;
		const modes =
			vizMode === "all"
				? (["fa", "fd", "fa-normalized", "carry-over", "hydrology"] as const)
				: ([vizMode] as const);
		for (const mode of modes) {
			const filename = `${mode}.ppm`;
			const outputPath = join(outputDir, filename);
			const pixels = createVisualizationPixels(context, mode);
			await writePpm(outputPath, context.shape, pixels, force);
			writtenFiles.push(outputPath);
		}
	}

	let stats: HydrologyInspectorStats | null = null;
	let statsFilePath: string | null = null;
	if (statsEnabled) {
		stats = computeStats(context, 20);
		const resolvedStatsFile = resolvePathFromCwd(
			request.cwd,
			request.args.statsFilePath,
		);
		if (resolvedStatsFile) {
			statsFilePath = resolvedStatsFile;
		} else {
			if (!debugDirPath) {
				throw new InputValidationError(
					"Missing --debug-dir or --stats-file for stats output.",
				);
			}
			statsFilePath = join(debugDirPath, "hydrology-inspector-stats.json");
		}
		await prepareOutputFile(statsFilePath, force);
		await writeFile(
			statsFilePath,
			`${JSON.stringify(stats, null, 2)}\n`,
			"utf8",
		);
	}

	return {
		hydrologyMapsSource: context.source,
		writtenFiles,
		stats,
		statsFilePath,
	};
};
