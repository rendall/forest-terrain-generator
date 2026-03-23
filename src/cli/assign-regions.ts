#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runAssignRegions } from "../app/run-assign-regions.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface AssignRegionsOptions {
	inputFile?: string;
	outputFile?: string;
	force?: boolean;
}

const program = new Command();
program
	.name("forest-terrain-assign-regions")
	.description("Attach deterministic biome region IDs to a terrain envelope")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-file <path>", "Path to source terrain envelope JSON")
	.requiredOption(
		"--output-file <path>",
		"Path to enriched terrain output JSON",
	)
	.option("--force", "Allow replacing existing output file", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<AssignRegionsOptions>();

	await runAssignRegions({
		cwd: process.cwd(),
		args: {
			inputFilePath: options.inputFile,
			outputFile: options.outputFile,
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

