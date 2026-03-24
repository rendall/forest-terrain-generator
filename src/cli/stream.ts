#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runStreamTrace, writeStreamOverlayPpm } from "../app/run-stream.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface StreamOptions {
	inputJson?: string;
	x?: number;
	y?: number;
	maxSteps?: number;
	overflow?: boolean;
	waterLevel?: number;
	volume?: number;
	debug?: boolean;
	outputPpm?: string;
	force?: boolean;
}

const program = new Command();
program
	.name("forest-terrain-stream")
	.description("Compute stream path from a source tile")
	.showSuggestionAfterError(true)
	.showHelpAfterError()
	.exitOverride()
	.requiredOption("--input-json <path>", "Path to source terrain envelope JSON")
	.requiredOption("--x <number>", "Source x coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.requiredOption("--y <number>", "Source y coordinate", (raw) =>
		Number.parseInt(raw, 10),
	)
	.option("--max-steps <number>", "Maximum coordinate steps", (raw) =>
		Number.parseInt(raw, 10),
	)
	.option("--overflow", "Enable explicit overflow post-pass", false)
	.option("--water-level <number>", "Accepted but currently ignored", (raw) =>
		Number.parseFloat(raw),
	)
	.option("--volume <number>", "Accepted but currently ignored", (raw) =>
		Number.parseFloat(raw),
	)
	.option("--debug", "Include per-step routing diagnostics", false)
	.option(
		"--output-ppm <path>",
		"Optional stream overlay image output (PPM, grayscale height + blue stream)",
	)
	.option("--force", "Allow replacing existing output file", false);

try {
	await program.parseAsync(process.argv);
	const options = program.opts<StreamOptions>();
	const trace = await runStreamTrace({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			x: options.x,
			y: options.y,
			maxSteps: options.maxSteps,
			overflow: options.overflow ?? false,
			waterLevel: options.waterLevel,
			volume: options.volume,
			debug: options.debug ?? false,
		},
	});
	if (options.debug) {
		console.log(
			JSON.stringify({
				path: trace.path,
				debugSteps: trace.debugSteps,
				pathTileIds: trace.pathTileIds,
				continuePathTileIds: trace.continuePathTileIds,
				segments: trace.segments,
				routingExcludedTileIds: trace.routingExcludedTileIds,
				overflowConnectorTileIds: trace.overflowConnectorTileIds,
				overflowCrossingEdges: trace.overflowCrossingEdges,
				overflowEvents: trace.overflowEvents,
				warnings: trace.debugWarnings,
			}),
		);
	} else {
		console.log(JSON.stringify(trace.path));
		if (options.overflow) {
			console.log(
				JSON.stringify({
					overflow: {
						ran: true,
						connectorLen: trace.overflowConnectorTileIds.length,
						events: trace.overflowEvents.map((event) => event.type),
					},
				}),
			);
		}
	}
	if (options.outputPpm) {
		await writeStreamOverlayPpm({
			cwd: process.cwd(),
			inputJsonPath: options.inputJson,
			outputPpmPath: options.outputPpm,
			force: options.force ?? false,
			streamPath: trace.path,
			additionalPathTileIds: options.overflow ? trace.continuePathTileIds : [],
			overflowConnectorTileIds: options.overflow
				? trace.overflowConnectorTileIds
				: [],
			overflowCrossingEdges: options.overflow
				? trace.overflowCrossingEdges
				: [],
		});
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
