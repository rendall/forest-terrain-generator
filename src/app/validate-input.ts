import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, Mode, ResolvedInputs } from "../domain/types.js";

const UINT64_MAX = 18446744073709551615n;
const UINT64_DECIMAL = /^[0-9]+$/;

export interface ValidatedInputs
	extends Omit<ResolvedInputs, "seed" | "width" | "height"> {
	seed: bigint;
	width: number;
	height: number;
}

export interface ValidatedDebugInputFileInputs extends ResolvedInputs {
	inputFilePath: string;
}

function validateSeed(seed: string | undefined): bigint {
	if (seed === undefined) {
		throw new InputValidationError("Missing required input: seed.");
	}

	if (!UINT64_DECIMAL.test(seed)) {
		throw new InputValidationError(
			"Invalid seed value. Seed must be a base-10 unsigned integer token.",
		);
	}

	const parsed = BigInt(seed);
	if (parsed > UINT64_MAX) {
		throw new InputValidationError(
			"Invalid seed value. Seed exceeds uint64 maximum.",
		);
	}

	return parsed;
}

function validatePositiveInt(name: string, value: number | undefined): number {
	if (value === undefined) {
		throw new InputValidationError(`Missing required input: ${name}.`);
	}

	if (!Number.isInteger(value) || value <= 0) {
		throw new InputValidationError(
			`Invalid ${name}. Value must be a positive integer.`,
		);
	}

	return value;
}

function validateParams(params: JsonObject | undefined): JsonObject {
	if (!params) {
		throw new InputValidationError("Missing required input: params.");
	}

	return params;
}

function validateModeOutputRules(mode: Mode, resolved: ResolvedInputs): void {
	if (mode === "debug") {
		if (!resolved.outputDir) {
			throw new InputValidationError(
				"Missing required output argument for debug mode: --output-dir.",
			);
		}

		if (resolved.outputFile) {
			throw new InputValidationError(
				"--output-file is not valid in debug mode. You might mean --debug-output-file.",
			);
		}

		return;
	}

	if (resolved.inputFilePath) {
		throw new InputValidationError(`--input-file is only valid in debug mode.`);
	}

	if (!resolved.outputFile) {
		throw new InputValidationError(
			`Missing required output argument for ${mode} mode: --output-file.`,
		);
	}

	if (resolved.outputDir) {
		throw new InputValidationError(
			`--output-dir is not valid in ${mode} mode. Use --output-file.`,
		);
	}

	if (resolved.debugOutputFile) {
		throw new InputValidationError(
			`--debug-output-file is not valid in ${mode} mode.`,
		);
	}

	if (mode === "derive" && !resolved.mapHPath) {
		throw new InputValidationError(
			"Missing required authored map for derive mode: --map-h.",
		);
	}
}

export function validateDebugInputFileInputs(
	resolved: ResolvedInputs,
): ValidatedDebugInputFileInputs {
	validateModeOutputRules("debug", resolved);

	if (!resolved.inputFilePath) {
		throw new InputValidationError("Missing required input: --input-file.");
	}

	return {
		...resolved,
		inputFilePath: resolved.inputFilePath,
	};
}

export function validateResolvedInputs(
	resolved: ResolvedInputs,
	mode: Mode,
): ValidatedInputs {
	validateModeOutputRules(mode, resolved);

	return {
		...resolved,
		seed: validateSeed(resolved.seed),
		width: validatePositiveInt("width", resolved.width),
		height: validatePositiveInt("height", resolved.height),
		params: validateParams(resolved.params),
	};
}
