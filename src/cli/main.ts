#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runGenerator } from "../app/run-generator.js";
import {
	type HydrologyVizMode,
	runHydrologyInspectorVisualization,
} from "../app/run-hydrology-inspector.js";
import { runSee } from "../app/run-see.js";
import {
	exitCodeForCategory,
	InputValidationError,
	normalizeCliError,
} from "../domain/errors.js";
import type { CliArgs, Mode } from "../domain/types.js";
import { validateArgv } from "./argv-validation.js";

function parseIntArg(raw: string): number {
	return Number.parseInt(raw, 10);
}

function toArgs(options: {
	seed?: string;
	width?: number;
	height?: number;
	params?: string;
	inputFile?: string;
	mapH?: string;
	mapR?: string;
	mapV?: string;
	outputFile?: string;
	outputDir?: string;
	debugOutputFile?: string;
	force?: boolean;
}): CliArgs {
	return {
		seed: options.seed,
		width: options.width,
		height: options.height,
		paramsPath: options.params,
		inputFilePath: options.inputFile,
		mapHPath: options.mapH,
		mapRPath: options.mapR,
		mapVPath: options.mapV,
		outputFile: options.outputFile,
		outputDir: options.outputDir,
		debugOutputFile: options.debugOutputFile,
		force: options.force ?? false,
	};
}

function addCommonInputOptions(command: Command): Command {
	return command
		.option("--seed <seed>", "Global terrain seed")
		.option("--width <width>", "Grid width", parseIntArg)
		.option("--height <height>", "Grid height", parseIntArg)
		.option("--params <path>", "Path to JSON params file")
		.option(
			"--input-file <path>",
			'Path to terrain envelope JSON (v2 preferred; debug only)',
		)
		.option("--map-h <path>", "Path to authored H map")
		.option("--map-r <path>", "Path to authored R map")
		.option("--map-v <path>", "Path to authored V map")
		.option(
			"--output-file <path>",
			"Path to terrain output JSON file (generate/derive only)",
		)
		.option(
			"--output-dir <path>",
			"Path to debug output directory (debug only)",
		)
		.option(
			"--debug-output-file <path>",
			"Optional terrain output file in debug mode",
		)
		.option("--force", "Allow replacing existing output targets", false);
}

async function runMode(mode: Mode, options: CliArgs): Promise<void> {
	await runGenerator({
		mode,
		args: options,
		cwd: process.cwd(),
	});
}

interface SeeOptions {
	inputFile?: string;
	outputFile?: string;
	layer?: "h" | "r" | "v" | "landforms" | "landscape";
	landforms?: boolean;
	landscape?: boolean;
	force?: boolean;
}

interface DebugOptions {
	seed?: string;
	width?: number;
	height?: number;
	params?: string;
	inputFile?: string;
	mapH?: string;
	mapR?: string;
	mapV?: string;
	outputFile?: string;
	outputDir?: string;
	debugOutputFile?: string;
	force?: boolean;
	hydrologyViz?: string;
	hydrologyInspectorStats?: boolean;
	hydrologyInspectorStatsFile?: string;
}

const assertHydrologyVizMode = (
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
		raw !== "basins" &&
		raw !== "hydrology" &&
		raw !== "all"
	) {
		throw new InputValidationError(
			`Invalid --hydrology-viz mode "${raw}". Expected one of: fa|fd|fa-normalized|carry-over|basins|hydrology|all.`,
		);
	}
	return raw;
};

const program = new Command();
program
	.name("forest-terrain-generator")
	.description("Procedural forest terrain generation CLI")
	.version("1.0.0")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride();

addCommonInputOptions(
	program
		.command("generate")
		.description('Generate terrain envelope (meta.specVersion="forest-terrain-v2")'),
).action(async (options) => runMode("generate", toArgs(options)));

addCommonInputOptions(
	program
		.command("derive")
		.description(
			'Derive terrain envelope from authored maps (meta.specVersion="forest-terrain-v2")',
		),
).action(async (options) => runMode("derive", toArgs(options)));

addCommonInputOptions(
	program
		.command("debug")
		.description("Emit debug artifacts and optional v2 debug envelope output"),
)
	.option(
		"--hydrology-viz <mode>",
		"Write hydrology visualization(s) into --output-dir after debug artifacts are generated",
	)
	.option(
		"--hydrology-inspector-stats",
		"Write hydrology inspector stats JSON after debug artifacts are generated",
		false,
	)
	.option(
		"--hydrology-inspector-stats-file <path>",
		"Optional hydrology inspector stats output path override",
	)
	.action(async (options: DebugOptions) => {
		const hydrologyViz = assertHydrologyVizMode(options.hydrologyViz);
		const statsEnabled = options.hydrologyInspectorStats === true;
		if (options.hydrologyInspectorStatsFile && !statsEnabled) {
			throw new InputValidationError(
				"--hydrology-inspector-stats-file requires --hydrology-inspector-stats.",
			);
		}
		await runMode("debug", toArgs(options));
		const vizEnabled = typeof hydrologyViz === "string";
		if (!vizEnabled && !statsEnabled) {
			return;
		}
		if (!options.outputDir) {
			throw new InputValidationError(
				"Missing --output-dir for hydrology visualization/stat output in debug mode.",
			);
		}
		await runHydrologyInspectorVisualization({
			cwd: process.cwd(),
			args: {
				inputJsonPath: options.debugOutputFile,
				sinkMode: "strict_local",
				sourceMode: "auto",
				paramsPath: options.params,
				viz: hydrologyViz,
				debugDirPath: options.outputDir,
				stats: statsEnabled,
				statsFilePath: options.hydrologyInspectorStatsFile,
				force: options.force ?? false,
			},
		});
	});

program
	.command("see")
	.description(
		"Render a grayscale topography image from terrain envelope JSON (PGM output)",
	)
	.requiredOption("--input-file <path>", "Path to source terrain envelope JSON")
	.requiredOption("--output-file <path>", "Path to output image file (.pgm)")
	.option(
		"--layer <layer>",
		"Topography layer to render (h|r|v|landforms)",
		"h",
	)
	.option(
		"--landforms",
		"Render topography structure classes as uniform grayscale values",
		false,
	)
	.option("--landscape", "Alias for --landforms", false)
	.option("--force", "Allow replacing existing output file", false)
	.action(async (options: SeeOptions) =>
		runSee({
			cwd: process.cwd(),
			args: {
				inputFilePath: options.inputFile,
				outputFile: options.outputFile,
				layer:
					options.landforms === true || options.landscape === true
						? "landforms"
						: (options.layer ?? "h"),
				force: options.force ?? false,
			},
		}),
	);

try {
	const argv = process.argv.slice(2);
	if (argv.length === 0) {
		program.outputHelp();
		process.exitCode = 0;
	} else {
		validateArgv(argv);
		await program.parseAsync(process.argv);
	}
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
