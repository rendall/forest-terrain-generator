import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import { createGridShape } from "../domain/topography.js";
import type {
	CliArgs,
	JsonObject,
	ResolvedInputs,
	RunRequest,
	TerrainEnvelope,
} from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { readParamsFile } from "../io/read-params.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { deepMerge } from "../lib/deep-merge.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deriveTopographicStructure } from "../pipeline/derive-topographic-structure.js";
import { deriveTopographyFromBaseMaps } from "../pipeline/derive-topography.js";
import { resolveBaseMaps } from "../pipeline/resolve-base-maps.js";
import { buildEnvelopeSkeleton } from "./build-envelope.js";
import {
	validateDebugInputFileInputs,
	validateResolvedInputs,
} from "./validate-input.js";

type TopographicStructureParams = Parameters<
	typeof deriveTopographicStructure
>[2];
const DEBUG_INPUT_FILE_EXCLUSIVE_FLAGS = [
	{ valueKey: "seed", flag: "--seed" },
	{ valueKey: "width", flag: "--width" },
	{ valueKey: "height", flag: "--height" },
	{ valueKey: "paramsPath", flag: "--params" },
	{ valueKey: "mapHPath", flag: "--map-h" },
	{ valueKey: "mapRPath", flag: "--map-r" },
	{ valueKey: "mapVPath", flag: "--map-v" },
] as const;

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

function hasExplicitNestedVegVarianceStrength(params: JsonObject): boolean {
	const nested = params.vegVarianceNoise;
	if (!isJsonObject(nested)) {
		return false;
	}
	const strength = nested.strength;
	return typeof strength === "number" && Number.isFinite(strength);
}

function applyLegacyVegVarianceStrengthOverride(
	mergedParams: JsonObject,
	fileParams: JsonObject,
): void {
	const legacyStrength = fileParams.vegVarianceStrength;
	if (typeof legacyStrength !== "number" || !Number.isFinite(legacyStrength)) {
		return;
	}

	// Canonical precedence remains nested > legacy when both are explicitly provided.
	if (hasExplicitNestedVegVarianceStrength(fileParams)) {
		return;
	}

	const nested = isJsonObject(mergedParams.vegVarianceNoise)
		? mergedParams.vegVarianceNoise
		: {};
	mergedParams.vegVarianceNoise = {
		...nested,
		strength: legacyStrength,
	};
}

function buildTopographyStructureParams(
	params: JsonObject,
): TopographicStructureParams {
	const topography = isJsonObject(params.topography)
		? (params.topography as Record<string, unknown>)
		: {};
	const structure = isJsonObject(topography.structure)
		? (topography.structure as Record<string, unknown>)
		: {};
	return structure as unknown as TopographicStructureParams;
}

export async function resolveInputs(
	request: RunRequest,
): Promise<ResolvedInputs> {
	const fromFile = await readParamsFile(request.args.paramsPath, request.cwd);
	const cliMapHPath = resolveFromCwd(request.cwd, request.args.mapHPath);
	const cliMapRPath = resolveFromCwd(request.cwd, request.args.mapRPath);
	const cliMapVPath = resolveFromCwd(request.cwd, request.args.mapVPath);
	const cliInputFilePath = resolveFromCwd(
		request.cwd,
		request.args.inputFilePath,
	);
	const cliOutputFile = resolveFromCwd(request.cwd, request.args.outputFile);
	const cliOutputDir = resolveFromCwd(request.cwd, request.args.outputDir);
	const cliDebugOutputFile = resolveFromCwd(
		request.cwd,
		request.args.debugOutputFile,
	);
	const cliParamsPath = resolveFromCwd(request.cwd, request.args.paramsPath);

	const baseParams = APPENDIX_A_DEFAULTS;
	const fileParams = (fromFile.params ?? {}) as JsonObject;
	const mergedParams = deepMerge(baseParams, fileParams);
	applyLegacyVegVarianceStrengthOverride(mergedParams, fileParams);

	return {
		seed: request.args.seed ?? fromFile.seed,
		width: request.args.width ?? fromFile.width,
		height: request.args.height ?? fromFile.height,
		params: mergedParams,
		paramsPath: cliParamsPath,
		inputFilePath: cliInputFilePath,
		mapHPath: cliMapHPath ?? fromFile.mapHPath,
		mapRPath: cliMapRPath ?? fromFile.mapRPath,
		mapVPath: cliMapVPath ?? fromFile.mapVPath,
		outputFile: cliOutputFile ?? fromFile.outputFile,
		outputDir: cliOutputDir ?? fromFile.outputDir,
		debugOutputFile: cliDebugOutputFile ?? fromFile.debugOutputFile,
		force: request.args.force || fromFile.force || false,
	};
}

function assertDebugInputFileArgs(args: CliArgs): void {
	if (!args.inputFilePath) {
		return;
	}

	const conflictingFlags: string[] = [];
	for (const { valueKey, flag } of DEBUG_INPUT_FILE_EXCLUSIVE_FLAGS) {
		if (args[valueKey] !== undefined) {
			conflictingFlags.push(flag);
		}
	}

	if (conflictingFlags.length > 0) {
		throw new InputValidationError(
			`--input-file cannot be combined with ${conflictingFlags.join(", ")} in debug mode.`,
		);
	}
}

export async function runGenerator(request: RunRequest): Promise<void> {
	const resolved = await resolveInputs(request);
	if (request.mode === "debug" && resolved.inputFilePath) {
		assertDebugInputFileArgs(request.args);
		const validated = validateDebugInputFileInputs(resolved);
		const envelope = await readTerrainEnvelopeFile(validated.inputFilePath);
		await writeModeOutputs(
			request.mode,
			validated.outputFile,
			validated.outputDir,
			validated.debugOutputFile,
			envelope,
			validated.force,
			undefined,
			undefined,
			undefined,
			undefined,
		);
		return;
	}

	const validated = validateResolvedInputs(resolved, request.mode);
	const shape = createGridShape(validated.width, validated.height);
	const baseMaps = await resolveBaseMaps({
		shape,
		seed: validated.seed,
		params: validated.params,
		cwd: request.cwd,
		mapHPath: validated.mapHPath,
		mapRPath: validated.mapRPath,
		mapVPath: validated.mapVPath,
	});
	const topography = deriveTopographyFromBaseMaps(
		shape,
		baseMaps,
	);
	const topographyStructure = deriveTopographicStructure(
		shape,
		topography.h,
		buildTopographyStructureParams(validated.params),
	);

	const envelope: TerrainEnvelope = buildEnvelopeSkeleton();

	const tiles: JsonObject[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		const x = i % shape.width;
		const y = Math.floor(i / shape.width);
		tiles.push({
			index: i,
			x,
			y,
			topography: {
				h: topography.h[i],
				r: topography.r[i],
				v: topography.v[i],
				structure: {
					basinPersistence: topographyStructure.basinPersistence[i],
					peakPersistence: topographyStructure.peakPersistence[i],
					basinLike: topographyStructure.basinLike[i] === 1,
					ridgeLike: topographyStructure.ridgeLike[i] === 1,
				},
			},
		});
	}
	envelope.tiles = tiles;

	await writeModeOutputs(
		request.mode,
		validated.outputFile,
		validated.outputDir,
		validated.debugOutputFile,
		envelope,
		validated.force,
		undefined,
		undefined,
		topographyStructure,
	);
}
