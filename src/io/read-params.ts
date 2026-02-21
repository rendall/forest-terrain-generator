import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { BaseInputs, JsonObject } from "../domain/types.js";
import { InputValidationError } from "../domain/errors.js";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFromBase(baseDir: string, maybeRelativePath: string): string {
  return isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : resolve(baseDir, maybeRelativePath);
}

export async function readParamsFile(
  paramsPath: string | undefined,
  cwd: string
): Promise<BaseInputs> {
  if (!paramsPath) {
    return {};
  }

  const resolvedPath = resolve(cwd, paramsPath);
  if (extname(resolvedPath).toLowerCase() !== ".json") {
    throw new InputValidationError(
      `Unsupported params file format for "${paramsPath}". Only JSON params files are supported.`
    );
  }

  const raw = await readFile(resolvedPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputValidationError(
      `Malformed JSON in params file "${paramsPath}". Fix JSON syntax and try again.`
    );
  }

  if (!isObject(parsed)) {
    return {};
  }

  const baseDir = dirname(resolvedPath);
  const seed = typeof parsed.seed === "string" ? parsed.seed : undefined;
  const width = typeof parsed.width === "number" ? parsed.width : undefined;
  const height = typeof parsed.height === "number" ? parsed.height : undefined;
  const mapHPath =
    typeof parsed.mapHPath === "string"
      ? resolveFromBase(baseDir, parsed.mapHPath)
      : undefined;
  const mapRPath =
    typeof parsed.mapRPath === "string"
      ? resolveFromBase(baseDir, parsed.mapRPath)
      : undefined;
  const mapVPath =
    typeof parsed.mapVPath === "string"
      ? resolveFromBase(baseDir, parsed.mapVPath)
      : undefined;
  const outputFile =
    typeof parsed.outputFile === "string"
      ? resolveFromBase(baseDir, parsed.outputFile)
      : undefined;
  const outputDir =
    typeof parsed.outputDir === "string"
      ? resolveFromBase(baseDir, parsed.outputDir)
      : undefined;
  const debugOutputFile =
    typeof parsed.debugOutputFile === "string"
      ? resolveFromBase(baseDir, parsed.debugOutputFile)
      : undefined;
  const force = typeof parsed.force === "boolean" ? parsed.force : undefined;
  const params = isObject(parsed.params) ? parsed.params : parsed;

  return {
    seed,
    width,
    height,
    params,
    mapHPath,
    mapRPath,
    mapVPath,
    outputFile,
    outputDir,
    debugOutputFile,
    force
  };
}
