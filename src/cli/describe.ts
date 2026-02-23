#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runDescribe } from "../app/run-describe.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface DescribeOptions {
	inputFile?: string;
	outputFile?: string;
	includeStructured?: boolean;
	strict?: boolean;
	force?: boolean;
}

const program = new Command();
program
	.name("forest-terrain-describe")
	.description(
		"Attach deterministic tile descriptions to an existing terrain envelope",
	)
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-file <path>", "Path to source terrain envelope JSON")
	.requiredOption(
		"--output-file <path>",
		"Path to described terrain output JSON",
	)
	.option(
		"--include-structured",
		"Include descriptionStructured with sentence slots",
		false,
	)
	.option(
		"--strict",
		"Fail per-tile on unknown biome/landform with descriptionDebug",
		false,
	)
	.option("--force", "Allow replacing existing output file", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<DescribeOptions>();

	await runDescribe({
		cwd: process.cwd(),
		args: {
			inputFilePath: options.inputFile,
			outputFile: options.outputFile,
			includeStructured: options.includeStructured ?? false,
			strict: options.strict ?? false,
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
