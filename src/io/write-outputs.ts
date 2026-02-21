import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { Mode, TerrainEnvelope } from "../domain/types.js";
import { serializeEnvelope } from "./serialize-envelope.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareFileTarget(path: string, force: boolean): Promise<void> {
  if (await pathExists(path)) {
    if (!force) {
      throw new InputValidationError(
        `Output file already exists: "${path}". Re-run with --force to overwrite.`
      );
    }
    await rm(path, { force: true });
  }

  await mkdir(dirname(path), { recursive: true });
}

async function prepareDirectoryTarget(path: string, force: boolean): Promise<void> {
  if (await pathExists(path)) {
    if (!force) {
      throw new InputValidationError(
        `Output directory already exists: "${path}". Re-run with --force to replace.`
      );
    }
    await rm(path, { recursive: true, force: true });
  }

  await mkdir(path, { recursive: true });
}

export async function writeStandardOutput(
  outputFile: string,
  envelope: TerrainEnvelope,
  force: boolean
): Promise<void> {
  await prepareFileTarget(outputFile, force);
  await writeFile(outputFile, serializeEnvelope(envelope), "utf8");
}

export async function writeDebugOutputs(
  outputDir: string,
  envelope: TerrainEnvelope,
  debugOutputFile: string | undefined,
  force: boolean
): Promise<void> {
  await prepareDirectoryTarget(outputDir, force);

  const debugManifest = {
    mode: "debug",
    artifacts: ["debug-manifest.json"],
    tileCount: envelope.tiles.length
  };
  const debugManifestPath = `${outputDir}/debug-manifest.json`;
  await writeFile(debugManifestPath, `${JSON.stringify(debugManifest, null, 2)}\n`, "utf8");

  if (debugOutputFile) {
    await writeStandardOutput(debugOutputFile, envelope, force);
  }
}

export async function writeModeOutputs(
  mode: Mode,
  outputFile: string | undefined,
  outputDir: string | undefined,
  debugOutputFile: string | undefined,
  envelope: TerrainEnvelope,
  force: boolean
): Promise<void> {
  if (mode === "debug") {
    if (!outputDir) {
      throw new InputValidationError("Missing required output argument for debug mode: --output-dir.");
    }
    await writeDebugOutputs(outputDir, envelope, debugOutputFile, force);
    return;
  }

  if (!outputFile) {
    throw new InputValidationError(
      `Missing required output argument for ${mode} mode: --output-file.`
    );
  }
  await writeStandardOutput(outputFile, envelope, force);
}
