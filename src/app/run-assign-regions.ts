import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { TerrainEnvelope } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { writeStandardOutput } from "../io/write-outputs.js";
import { deriveBiomeRegions, summarizeBiomeRegions } from "./assign-regions.js";

export interface AssignRegionsCliArgs {
	inputFilePath?: string;
	outputFile?: string;
	force: boolean;
}

export interface AssignRegionsRequest {
	args: AssignRegionsCliArgs;
	cwd: string;
}

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

export function assignRegions(envelope: TerrainEnvelope): TerrainEnvelope {
	const derived = deriveBiomeRegions(envelope.tiles);
	const regions = summarizeBiomeRegions(envelope.tiles, derived);

	const tiles = envelope.tiles.map((tile, tileIndex) => ({
		...tile,
		region: {
			biomeRegionId: derived.tileRegionIds[tileIndex],
		},
	}));

	return {
		meta: {
			specVersion: envelope.meta.specVersion,
		},
		regions,
		tiles,
	};
}

export async function runAssignRegions(
	request: AssignRegionsRequest,
): Promise<void> {
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
	const assigned = assignRegions(envelope);
	await writeStandardOutput(outputFile, assigned, request.args.force);
}
