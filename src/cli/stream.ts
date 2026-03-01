#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runStream } from "../app/run-stream.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface StreamOptions {
	inputJson?: string;
	x?: number;
	y?: number;
}

const program = new Command();
program
	.name("forest-terrain-stream")
	.description("Compute stream path from a source tile (phase 1: origin only)")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-json <path>", "Path to source terrain envelope JSON")
	.requiredOption("--x <number>", "Source x coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.requiredOption("--y <number>", "Source y coordinate", (raw) =>
		Number.parseInt(raw, 10),
	);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<StreamOptions>();
	const path = await runStream({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			x: options.x,
			y: options.y,
		},
	});
	console.log(JSON.stringify(path));
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
