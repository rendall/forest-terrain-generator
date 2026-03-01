#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runMap } from "../app/run-map.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface MapOptions {
	inputJson?: string;
	outputPgm?: string;
	layer?: "h" | "r" | "v" | "landforms" | "landscape";
	threshold?: number;
	force?: boolean;
}

const program = new Command();
program
	.name("forest-terrain-map")
	.description("Render terrain envelope fields as grayscale PGM images")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-json <path>", "Path to source terrain envelope JSON")
	.requiredOption("--output-pgm <path>", "Path to output PGM image")
	.option(
		"--layer <layer>",
		"Layer to render (h|r|v|landforms)",
		"h",
	)
	.option(
		"--threshold <number>",
		"3-band threshold for h: h<threshold => black, h>1-threshold => white, otherwise gray (default: 0.1)",
		(raw) => Number.parseFloat(raw),
	)
	.option("--force", "Allow replacing existing output file", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<MapOptions>();

	await runMap({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			outputPgmPath: options.outputPgm,
			layer: options.layer ?? "h",
			threshold: options.threshold,
			force: options.force ?? false,
		},
	});
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
