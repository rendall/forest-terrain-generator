import { isAbsolute, resolve } from "node:path";
import {
	createHydrologyMaps,
	type HydrologyMapsSoA,
} from "../domain/hydrology.js";
import { createGridShape } from "../domain/topography.js";
import type { TerrainEnvelope } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { deriveHydrology } from "../pipeline/derive-hydrology.js";
import {
	runStreamTrace,
	type StreamCliArgs,
	type StreamRequest,
	writeStreamOverlayPpm,
} from "./run-stream.js";

export interface HydrologyInspectorCliArgs extends StreamCliArgs {
	sinkMode?: "strict_local" | "overflow_guided";
}

export interface HydrologyInspectorRequest {
	args: HydrologyInspectorCliArgs;
	cwd: string;
}

interface HydrologyMapsResolution {
	source: "envelope" | "recomputed";
	maps: HydrologyMapsSoA;
}

const asObject = (value: unknown): Record<string, unknown> | undefined => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
};

const readNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown): boolean | null =>
	typeof value === "boolean" ? value : null;

const resolveEnvelopePath = (
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

const buildGridFromEnvelope = (envelope: TerrainEnvelope) => {
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
		const topography = asObject(tile.topography);
		const tileH = readNumber(topography?.h);
		h[index] = typeof tileH === "number" ? tileH : 0;
		const featureIds = Array.isArray(tile.featureIds)
			? tile.featureIds.filter((id): id is string => typeof id === "string")
			: [];
		tileFeatureIds[index] = featureIds;
	}
	return { shape, h, tileFeatureIds };
};

const hasEnvelopeHydrologyFields = (envelope: TerrainEnvelope): boolean =>
	envelope.tiles.length > 0 &&
	envelope.tiles.every((tile) => {
		const hydrology = asObject(tile.hydrology);
		return (
			readNumber(hydrology?.fd) !== null &&
			readNumber(hydrology?.fa) !== null &&
			readNumber(hydrology?.faN) !== null &&
			readBoolean(hydrology?.isStream) !== null
		);
	});

const hydrologyMapsFromEnvelope = (
	envelope: TerrainEnvelope,
	shape: ReturnType<typeof createGridShape>,
): HydrologyMapsSoA => {
	const maps = createHydrologyMaps(shape);
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
		const hydrology = asObject(tile.hydrology);
		const fd = readNumber(hydrology?.fd);
		const fa = readNumber(hydrology?.fa);
		const faN = readNumber(hydrology?.faN);
		const isStream = readBoolean(hydrology?.isStream);
		maps.fd[index] = typeof fd === "number" ? fd : maps.fd[index];
		maps.fa[index] =
			typeof fa === "number" ? Math.max(0, Math.floor(fa)) : maps.fa[index];
		maps.faN[index] = typeof faN === "number" ? faN : maps.faN[index];
		maps.isStream[index] = isStream === true ? 1 : 0;
	}
	return maps;
};

const resolveHydrologyMapsForInspector = async (
	request: HydrologyInspectorRequest,
): Promise<HydrologyMapsResolution> => {
	const sinkMode = request.args.sinkMode ?? "strict_local";
	const inputPath = resolveEnvelopePath(
		request.cwd,
		request.args.inputJsonPath,
	);
	const envelope = await readTerrainEnvelopeFile(inputPath);
	const { shape, h, tileFeatureIds } = buildGridFromEnvelope(envelope);
	if (hasEnvelopeHydrologyFields(envelope)) {
		return {
			source: "envelope",
			maps: hydrologyMapsFromEnvelope(envelope, shape),
		};
	}
	const derived = deriveHydrology(
		shape,
		h,
		{
			basinFeatures: envelope.features?.basins ?? [],
			tileFeatureIds,
		},
		{ hydrology: { sinkMode } },
	);
	return {
		source: "recomputed",
		maps: derived.maps,
	};
};

export const runHydrologyInspectorTrace = async (
	request: HydrologyInspectorRequest,
) => {
	const resolvedHydrology = await resolveHydrologyMapsForInspector(request);
	const sinkMode = request.args.sinkMode ?? "strict_local";
	const streamRequest: StreamRequest = {
		cwd: request.cwd,
		args: {
			...request.args,
			overflow: sinkMode === "overflow_guided",
		},
	};
	const trace = await runStreamTrace(streamRequest);
	const sourceX = request.args.x ?? 0;
	const sourceY = request.args.y ?? 0;
	const sourceIndex = sourceY * resolvedHydrology.maps.shape.width + sourceX;
	return {
		...trace,
		hydrologyMapsSource: resolvedHydrology.source,
		hydrologyAtSource:
			sourceIndex >= 0 && sourceIndex < resolvedHydrology.maps.shape.size
				? {
						fd: resolvedHydrology.maps.fd[sourceIndex],
						fa: resolvedHydrology.maps.fa[sourceIndex],
						faN: resolvedHydrology.maps.faN[sourceIndex],
						isStream: resolvedHydrology.maps.isStream[sourceIndex] === 1,
					}
				: null,
	};
};

export const writeHydrologyInspectorOverlayPpm = writeStreamOverlayPpm;
