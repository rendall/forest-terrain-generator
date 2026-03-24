#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runLos } from "../app/run-los.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface LosOptions {
	inputJson?: string;
	x0?: number;
	y0?: number;
	x1?: number;
	y1?: number;
	debug?: boolean;
}

const program = new Command();
program
	.name("forest-terrain-los")
	.description("Check line-of-sight visibility between two tile coordinates")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-json <path>", "Path to source terrain envelope JSON")
	.requiredOption("--x0 <number>", "Source x coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.requiredOption("--y0 <number>", "Source y coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.requiredOption("--x1 <number>", "Target x coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.requiredOption("--y1 <number>", "Target y coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.option("--debug", "Print LOS debug details", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<LosOptions>();
	const result = await runLos({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			x0: options.x0,
			y0: options.y0,
			x1: options.x1,
			y1: options.y1,
			debug: options.debug ?? false,
		},
	});
	if (options.debug === true && result.debug) {
		console.log(
			`start: x=${result.debug.start.x}, y=${result.debug.start.y}, h=${result.debug.start.h}`,
		);
		console.log(
			`end: x=${result.debug.end.x}, y=${result.debug.end.y}, h=${result.debug.end.h}`,
		);
		console.log(`line: ${result.debug.lineEquation}`);
		console.log(`path: ${JSON.stringify(result.debug.path)}`);
	}
	console.log(result.visible ? "true" : "false");
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
