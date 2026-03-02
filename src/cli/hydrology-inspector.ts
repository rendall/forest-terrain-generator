#!/usr/bin/env node
/**
 * Hydrology Inspector CLI Manual
 *
 * Purpose:
 * - Inspect hydrology routing from one source tile `(x,y)` against an envelope JSON.
 * - Compare sink behavior between `strict_local` and `overflow_guided`.
 * - Optionally write a PPM overlay for quick visual inspection.
 *
 * Basic Usage:
 * - `node --import tsx src/cli/hydrology-inspector.ts --input-json <file> --x <int> --y <int>`
 * - Required flags:
 *   - `--input-json <path>`: terrain envelope file
 *   - `--x <number>`, `--y <number>`: source tile coordinates
 *
 * Main Options:
 * - `--sink-mode strict_local|overflow_guided`
 *   - `strict_local` (default): downhill-only trace, stops at local minimum / sea level / max steps.
 *   - `overflow_guided`: includes overflow continuation metadata/events.
 * - `--max-steps <number>`: hard cap for tracing steps.
 * - `--debug`: emit full diagnostics (step-by-step neighbors, segments, events, warnings).
 * - `--output-ppm <path>`: write grayscale height map with traced stream overlays.
 * - `--force`: allow replacing existing `--output-ppm` target.
 *
 * Accepted-but-ignored (current behavior):
 * - `--water-level <number>`
 * - `--volume <number>`
 * These are parsed for forward compatibility and currently not used in routing decisions.
 *
 * Output Shape:
 * - Always prints pretty JSON.
 * - Non-debug:
 *   - `{ path: [...] }`
 *   - plus `{ overflow: {...} }` when `--sink-mode overflow_guided`.
 * - Debug (`--debug`):
 *   - Includes `path`, `hydrologyMapsSource`, `hydrologyAtSource`, `debugSteps`,
 *     `segments`, `overflowEvents`, tile-id sets, and warnings.
 *
 * Notes:
 * - `hydrologyMapsSource` indicates whether inspector used envelope hydrology maps
 *   (`"envelope"`) or recomputed them (`"recomputed"`).
 * - In overflow-guided mode, event count can be large on complex terrain because each
 *   overflow hop emits connector/crossing/parent events.
 */
import { Command, CommanderError } from "commander";
import {
	runHydrologyInspectorTrace,
	writeHydrologyInspectorOverlayPpm,
} from "../app/run-hydrology-inspector.js";
import { exitCodeForCategory, normalizeCliError } from "../domain/errors.js";

interface HydrologyInspectorOptions {
	inputJson?: string;
	x?: number;
	y?: number;
	maxSteps?: number;
	sinkMode?: "strict_local" | "overflow_guided";
	waterLevel?: number;
	volume?: number;
	debug?: boolean;
	outputPpm?: string;
	force?: boolean;
}

const printJson = (value: unknown): void => {
	console.log(JSON.stringify(value, null, 2));
};

const program = new Command();
program
	.name("forest-terrain-hydrology-inspector")
	.description("Inspect hydrology routing from a source tile")
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
	.option(
		"--sink-mode <mode>",
		"Sink handling mode (strict_local|overflow_guided)",
		"strict_local",
	)
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
	const options = program.opts<HydrologyInspectorOptions>();
	const trace = await runHydrologyInspectorTrace({
		cwd: process.cwd(),
		args: {
			inputJsonPath: options.inputJson,
			x: options.x,
			y: options.y,
			maxSteps: options.maxSteps,
			sinkMode: options.sinkMode,
			waterLevel: options.waterLevel,
			volume: options.volume,
			debug: options.debug ?? false,
		},
	});
	if (options.debug) {
		printJson({
			path: trace.path,
			hydrologyMapsSource: trace.hydrologyMapsSource,
			hydrologyAtSource: trace.hydrologyAtSource,
			debugSteps: trace.debugSteps,
			pathTileIds: trace.pathTileIds,
			continuePathTileIds: trace.continuePathTileIds,
			segments: trace.segments,
			routingExcludedTileIds: trace.routingExcludedTileIds,
			overflowConnectorTileIds: trace.overflowConnectorTileIds,
			overflowCrossingEdges: trace.overflowCrossingEdges,
			overflowEvents: trace.overflowEvents,
			warnings: trace.debugWarnings,
		});
	} else {
		const payload: Record<string, unknown> = {
			path: trace.path,
		};
		if (options.sinkMode === "overflow_guided") {
			const overflowEvents = trace.overflowEvents.map((event) => {
				if (event.type === "overflow_connector") {
					return {
						type: event.type,
						basinId: event.basinId,
						fromTileId: event.fromTileId,
						toTileId: event.toTileId,
					};
				}
				if (event.type === "overflow_crossing") {
					return {
						type: event.type,
						basinId: event.basinId,
						fromTileId: event.fromTileId,
						toTileId: event.toTileId,
					};
				}
				if (event.type === "overflow_to_parent") {
					return {
						type: event.type,
						basinId: event.basinId,
						parentBasinId: event.parentBasinId,
						atTileId: event.atTileId,
					};
				}
				if (event.type === "cycle_detected") {
					return {
						type: event.type,
						basinId: event.basinId,
						atTileId: event.atTileId,
					};
				}
				if (event.type === "overflow_no_spill_tile_in_basin") {
					return {
						type: event.type,
						basinId: event.basinId,
						sinkTileId: event.sinkTileId,
						spillTileId: event.spillTileId,
					};
				}
				return {
					type: event.type,
					basinId: event.basinId,
					sinkTileId: event.sinkTileId,
				};
			});
			payload.overflow = {
				ran: true,
				connectorLen: trace.overflowConnectorTileIds.length,
				eventCount: overflowEvents.length,
				events: overflowEvents,
			};
		}
		printJson(payload);
	}
	if (options.outputPpm) {
		await writeHydrologyInspectorOverlayPpm({
			cwd: process.cwd(),
			inputJsonPath: options.inputJson,
			outputPpmPath: options.outputPpm,
			force: options.force ?? false,
			streamPath: trace.path,
			additionalPathTileIds:
				options.sinkMode === "overflow_guided" ? trace.continuePathTileIds : [],
			overflowConnectorTileIds:
				options.sinkMode === "overflow_guided"
					? trace.overflowConnectorTileIds
					: [],
			overflowCrossingEdges:
				options.sinkMode === "overflow_guided"
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
