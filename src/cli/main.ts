#!/usr/bin/env node
import { Command } from "commander";
import { runGenerator } from "../app/run-generator.js";
import type { CliArgs, Mode } from "../domain/types.js";

function parseIntArg(raw: string): number {
  return Number.parseInt(raw, 10);
}

function toArgs(options: {
  seed?: string;
  width?: number;
  height?: number;
  params?: string;
}): CliArgs {
  return {
    seed: options.seed,
    width: options.width,
    height: options.height,
    paramsPath: options.params
  };
}

function addCommonInputOptions(command: Command): Command {
  return command
    .option("--seed <seed>", "Global terrain seed")
    .option("--width <width>", "Grid width", parseIntArg)
    .option("--height <height>", "Grid height", parseIntArg)
    .option("--params <path>", "Path to JSON params file");
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
  .showSuggestionAfterError(true);

addCommonInputOptions(program.command("generate").description("Generate terrain"))
  .action(async (options) => runMode("generate", toArgs(options)));

addCommonInputOptions(
  program.command("derive").description("Derive terrain from authored maps")
).action(async (options) => runMode("derive", toArgs(options)));

addCommonInputOptions(program.command("debug").description("Emit debug artifacts"))
  .action(async (options) => runMode("debug", toArgs(options)));

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 5;
});
