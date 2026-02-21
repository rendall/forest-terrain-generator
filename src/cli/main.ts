#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runGenerator } from "../app/run-generator.js";
import { validateArgv } from "./argv-validation.js";
import type { CliArgs, Mode } from "../domain/types.js";
import {
  exitCodeForCategory,
  normalizeCliError
} from "../domain/errors.js";

function parseIntArg(raw: string): number {
  return Number.parseInt(raw, 10);
}

function toArgs(options: {
  seed?: string;
  width?: number;
  height?: number;
  params?: string;
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
    mapHPath: options.mapH,
    mapRPath: options.mapR,
    mapVPath: options.mapV,
    outputFile: options.outputFile,
    outputDir: options.outputDir,
    debugOutputFile: options.debugOutputFile,
    force: options.force ?? false
  };
}

function addCommonInputOptions(command: Command): Command {
  return command
    .option("--seed <seed>", "Global terrain seed")
    .option("--width <width>", "Grid width", parseIntArg)
    .option("--height <height>", "Grid height", parseIntArg)
    .option("--params <path>", "Path to JSON params file")
    .option("--map-h <path>", "Path to authored H map")
    .option("--map-r <path>", "Path to authored R map")
    .option("--map-v <path>", "Path to authored V map")
    .option("--output-file <path>", "Path to terrain output JSON file")
    .option("--output-dir <path>", "Path to debug output directory")
    .option("--debug-output-file <path>", "Optional terrain output file in debug mode")
    .option("--force", "Allow replacing existing output targets", false);
}

async function runMode(mode: Mode, options: CliArgs): Promise<void> {
  await runGenerator({
    mode,
    args: options,
    cwd: process.cwd()
  });
}

const program = new Command();
program
  .name("forest-terrain-generator")
  .description("Procedural forest terrain generation CLI")
  .showSuggestionAfterError(true)
  .showHelpAfterError()
  .exitOverride();

addCommonInputOptions(program.command("generate").description("Generate terrain")).action(
  async (options) => runMode("generate", toArgs(options))
);

addCommonInputOptions(program.command("derive").description("Derive terrain from authored maps"))
  .action(async (options) => runMode("derive", toArgs(options)));

addCommonInputOptions(program.command("debug").description("Emit debug artifacts")).action(
  async (options) => runMode("debug", toArgs(options))
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
    if (error.code === "commander.helpDisplayed" || error.code === "commander.help") {
      process.exitCode = 0;
    } else {
      process.exitCode = 2;
    }
  } else {
    const normalizedError = normalizeCliError(error);
    console.error(normalizedError.message);
    process.exitCode = exitCodeForCategory(normalizedError.category);
  }
}
