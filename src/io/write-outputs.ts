import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { Mode, TerrainEnvelope } from "../domain/types.js";
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

  const { width, height } = deriveGridDimensions(envelope);
  const debugManifest = {
    mode: "debug",
    specVersion: envelope.meta.specVersion,
    width,
    height,
    tileCount: envelope.tiles.length
    ,
    artifacts: [...DEBUG_ARTIFACT_FILES]
  };
  const debugManifestPath = `${outputDir}/debug-manifest.json`;
  await writeFile(debugManifestPath, serializeJson(debugManifest), "utf8");

  await writeFile(
    `${outputDir}/topography.json`,
    serializeJson({
      tiles: buildPhaseTiles(envelope, "topography")
    }),
    "utf8"
  );
  await writeFile(
    `${outputDir}/hydrology.json`,
    serializeJson({
      tiles: buildPhaseTiles(envelope, "hydrology")
    }),
    "utf8"
  );
  await writeFile(
    `${outputDir}/ecology.json`,
    serializeJson({
      tiles: buildPhaseTiles(envelope, "ecology")
    }),
    "utf8"
  );
  await writeFile(
    `${outputDir}/navigation.json`,
    serializeJson({
      tiles: buildPhaseTiles(envelope, "navigation")
    }),
    "utf8"
  );

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
