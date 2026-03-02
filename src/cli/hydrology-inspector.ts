#!/usr/bin/env node
/**
 * Hydrology Inspector CLI Manual
 *
 * Purpose:
 * - Produce hydrology diagnostics from an envelope or debug artifacts.
 * - Write hydrology visualization outputs (`fa`, `fd`, `fa-normalized`, `carry-over`, `hydrology`).
 * - Emit deterministic hydrology stats snapshots for review/regression.
 *
 * Basic Usage:
 * - `node --import tsx src/cli/hydrology-inspector.ts --input-json <file> --debug-dir <dir> --viz all --stats`
 *
 * Required:
 * - `--input-json <path>`
 *
 * Main options:
 * - `--viz <mode>` where mode is `fa|fd|fa-normalized|carry-over|hydrology|all`
 * - `--debug-dir <path>` required when `--viz` is set
 * - `--stats` emit stats JSON
 * - `--stats-file <path>` optional stats output override (requires `--stats`)
 * - `--sink-mode strict_local|overflow_guided` used only when hydrology maps must be recomputed
 * - `--force` required to overwrite existing viz/stats target files
 * - `--debug` include request/options echo in output payload
 *
 * Output shape:
 * - Always pretty JSON.
 * - Includes `hydrologyMapsSource` (`debug_artifacts|envelope|recomputed`).
 * - Includes `viz.writtenFiles` when `--viz` is used.
 * - Includes `stats` and `statsFilePath` when `--stats` is used.
 */
import { Command, CommanderError } from "commander";
import {
	type HydrologyVizMode,
	runHydrologyInspectorVisualization,
} from "../app/run-hydrology-inspector.js";
import {
	exitCodeForCategory,
	InputValidationError,
	normalizeCliError,
} from "../domain/errors.js";

interface HydrologyInspectorOptions {
	inputJson?: string;
	sinkMode?: "strict_local" | "overflow_guided";
	debug?: boolean;
	viz?: string;
	debugDir?: string;
	stats?: boolean;
	statsFile?: string;
	force?: boolean;
}

const printJson = (value: unknown): void => {
	console.log(JSON.stringify(value, null, 2));
};

const program = new Command();
const assertVizMode = (
	raw: string | undefined,
): HydrologyVizMode | undefined => {
	if (typeof raw === "undefined") {
		return undefined;
	}
	if (
		raw !== "fa" &&
		raw !== "fd" &&
		raw !== "fa-normalized" &&
		raw !== "carry-over" &&
		raw !== "hydrology" &&
		raw !== "all"
	) {
		throw new InputValidationError(
			`Invalid --viz mode "${raw}". Expected one of: fa|fd|fa-normalized|carry-over|hydrology|all.`,
		);
	}
	return raw;
};

program
	.name("forest-terrain-hydrology-inspector")
	.description("Inspect hydrology maps, visualizations, and stats")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-json <path>", "Path to source terrain envelope JSON")
	.option(
		"--sink-mode <mode>",
		"Sink handling mode when recomputing hydrology (strict_local|overflow_guided)",
		"strict_local",
	)
	.option("--debug", "Include request/options diagnostics", false)
	.option(
		"--viz <mode>",
		"Write hydrology visualization(s) to --debug-dir (fa|fd|fa-normalized|carry-over|hydrology|all)",
	)
	.option(
		"--debug-dir <path>",
		"Directory containing debug artifacts and output target for --viz files",
	)
	.option("--stats", "Emit hydrology stats JSON output", false)
	.option("--stats-file <path>", "Optional stats output path override")
	.option("--force", "Allow replacing existing output file(s)", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<HydrologyInspectorOptions>();
	const vizMode = assertVizMode(options.viz);
	const statsEnabled = options.stats === true;
	if (!vizMode && !statsEnabled) {
		throw new InputValidationError(
			"Nothing to do. Provide --viz and/or --stats.",
		);
	}

	const result = await runHydrologyInspectorVisualization({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			sinkMode: options.sinkMode,
			viz: vizMode,
			debugDirPath: options.debugDir,
			stats: statsEnabled,
			statsFilePath: options.statsFile,
			force: options.force ?? false,
		},
	});

	if (!result) {
		throw new InputValidationError("No hydrology output was produced.");
	}

	const payload: Record<string, unknown> = {
		hydrologyMapsSource: result.hydrologyMapsSource,
	};
	if (result.writtenFiles.length > 0) {
		payload.viz = { writtenFiles: result.writtenFiles };
	}
	if (result.stats) {
		payload.stats = result.stats;
		payload.statsFilePath = result.statsFilePath;
	}
	if (options.debug) {
		payload.debug = {
			inputJsonPath: options.inputJson,
			debugDirPath: options.debugDir,
			sinkMode: options.sinkMode,
			viz: vizMode,
			stats: statsEnabled,
		};
	}
	printJson(payload);
} catch (error: unknown) {
	if (error instanceof CommanderError) {
		if (error.exitCode === 0) {
			process.exitCode = 0;
		} else {
			console.error(`[input] stage=cli_parse ${error.message}`);
			process.exitCode = 2;
		}
	} else {
		const normalizedError = normalizeCliError(error);
		console.error(
			`[${normalizedError.category}] stage=cli_runtime ${normalizedError.message}`,
		);
		process.exitCode = exitCodeForCategory(normalizedError.category);
	}
}
