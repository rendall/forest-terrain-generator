import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import type { Mode, TerrainEnvelope } from "../domain/types.js";
import type { StreamCoherenceMetrics } from "../pipeline/hydrology.js";
import { serializeEnvelope } from "./serialize-envelope.js";

const DEBUG_ARTIFACT_FILES = [
  "topography.json",
  "hydrology.json",
  "ecology.json",
  "navigation.json"
] as const;

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deriveGridDimensions(envelope: TerrainEnvelope): { width: number; height: number } {
  let maxX = -1;
  let maxY = -1;

  for (const tile of envelope.tiles) {
    if (typeof tile.x === "number" && Number.isInteger(tile.x) && tile.x >= 0) {
      maxX = Math.max(maxX, tile.x);
    }
    if (typeof tile.y === "number" && Number.isInteger(tile.y) && tile.y >= 0) {
      maxY = Math.max(maxY, tile.y);
    }
  }

  return {
    width: maxX + 1,
    height: maxY + 1
  };
}

function buildPhaseTiles(
  envelope: TerrainEnvelope,
  phaseKey: "topography" | "hydrology" | "ecology" | "navigation"
) {
  return envelope.tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    [phaseKey]: tile[phaseKey]
  }));
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unknown filesystem error.";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(path: string, payload: unknown, context: string): Promise<void> {
  try {
    await writeFile(path, serializeJson(payload), "utf8");
  } catch (error) {
    throw new FileIoError(`I/O error during ${context} at "${path}": ${messageFromUnknown(error)}`);
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

export async function writeStandardOutput(
  outputFile: string,
  envelope: TerrainEnvelope,
  force: boolean
): Promise<void> {
  await prepareFileTarget(outputFile, force);
  try {
    await writeFile(outputFile, serializeEnvelope(envelope), "utf8");
  } catch (error) {
    throw new FileIoError(
      `I/O error during terrain output write at "${outputFile}": ${messageFromUnknown(error)}`
    );
  }
}

async function writeDebugArtifacts(
  targetDir: string,
  envelope: TerrainEnvelope,
  streamCoherence: StreamCoherenceMetrics | undefined
): Promise<void> {
  const { width, height } = deriveGridDimensions(envelope);
  const debugManifest = {
    mode: "debug",
    specVersion: envelope.meta.specVersion,
    width,
    height,
    tileCount: envelope.tiles.length,
    artifacts: [...DEBUG_ARTIFACT_FILES],
    ...(streamCoherence ? { streamCoherence } : {})
  };
  await writeJsonFile(join(targetDir, "debug-manifest.json"), debugManifest, "debug manifest write");
  await writeJsonFile(
    join(targetDir, "topography.json"),
    { tiles: buildPhaseTiles(envelope, "topography") },
    "topography debug artifact write"
  );
  await writeJsonFile(
    join(targetDir, "hydrology.json"),
    { tiles: buildPhaseTiles(envelope, "hydrology") },
    "hydrology debug artifact write"
  );
  await writeJsonFile(
    join(targetDir, "ecology.json"),
    { tiles: buildPhaseTiles(envelope, "ecology") },
    "ecology debug artifact write"
  );
  await writeJsonFile(
    join(targetDir, "navigation.json"),
    { tiles: buildPhaseTiles(envelope, "navigation") },
    "navigation debug artifact write"
  );
}

async function publishDebugDirectory(
  stagingDir: string,
  outputDir: string,
  force: boolean
): Promise<void> {
  if (await pathExists(outputDir)) {
    if (!force) {
      throw new InputValidationError(
        `Output directory already exists: "${outputDir}". Re-run with --force to replace.`
      );
    }
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch (error) {
      throw new FileIoError(
        `I/O error during debug output replace at "${outputDir}": ${messageFromUnknown(error)}`
      );
    }
  }

  await mkdir(dirname(outputDir), { recursive: true });
  try {
    await rename(stagingDir, outputDir);
  } catch (error) {
    throw new FileIoError(
      `I/O error during debug output publish to "${outputDir}": ${messageFromUnknown(error)}`
    );
  }
}

export async function writeDebugOutputs(
  outputDir: string,
  envelope: TerrainEnvelope,
  debugOutputFile: string | undefined,
  force: boolean,
  streamCoherence: StreamCoherenceMetrics | undefined
): Promise<void> {
  if (await pathExists(outputDir) && !force) {
    throw new InputValidationError(
      `Output directory already exists: "${outputDir}". Re-run with --force to replace.`
    );
  }

  await mkdir(dirname(outputDir), { recursive: true });
  const stagingDir = join(dirname(outputDir), `.ftg-debug-staging-${randomUUID()}`);
  await mkdir(stagingDir, { recursive: false });
  let published = false;

  try {
    await writeDebugArtifacts(stagingDir, envelope, streamCoherence);

    if (debugOutputFile) {
      await writeStandardOutput(debugOutputFile, envelope, force);
    }

    await publishDebugDirectory(stagingDir, outputDir, force);
    published = true;
  } finally {
    if (!published) {
      await rm(stagingDir, { recursive: true, force: true });
    }
  }
}

export async function writeModeOutputs(
  mode: Mode,
  outputFile: string | undefined,
  outputDir: string | undefined,
  debugOutputFile: string | undefined,
  envelope: TerrainEnvelope,
  force: boolean,
  streamCoherence?: StreamCoherenceMetrics
): Promise<void> {
  if (mode === "debug") {
    if (!outputDir) {
      throw new InputValidationError("Missing required output argument for debug mode: --output-dir.");
    }
    await writeDebugOutputs(outputDir, envelope, debugOutputFile, force, streamCoherence);
    return;
  }

  if (!outputFile) {
    throw new InputValidationError(
      `Missing required output argument for ${mode} mode: --output-file.`
    );
  }
  await writeStandardOutput(outputFile, envelope, force);
}
