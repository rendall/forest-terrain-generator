import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { BaseInputs, JsonObject } from "../domain/types.js";
import { InputValidationError } from "../domain/errors.js";
import { suggestClosest } from "../lib/suggest.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";

const PARAMS_VALIDATION_SCHEMA: JsonObject = {
  ...APPENDIX_A_DEFAULTS,
  // Compatibility alias accepted at root params level.
  vegVarianceStrength: (APPENDIX_A_DEFAULTS.vegVarianceNoise as JsonObject).strength
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFromBase(baseDir: string, maybeRelativePath: string): string {
  return isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : resolve(baseDir, maybeRelativePath);
}

function validateUnknownKeys(
  input: JsonObject,
  schema: JsonObject,
  pathPrefix: string
): void {
  const allowedKeys = Object.keys(schema);
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.includes(key)) {
      const suggestion = suggestClosest(key, allowedKeys);
      const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
      throw new InputValidationError(
        `Unknown params key "${pathPrefix}.${key}".${hint}`
      );
    }

    const schemaValue = schema[key];
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof schemaValue === "object" &&
      schemaValue !== null &&
      !Array.isArray(schemaValue)
    ) {
      validateUnknownKeys(value as JsonObject, schemaValue as JsonObject, `${pathPrefix}.${key}`);
    }
  }
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function lakeCoherencePath(key: string): string {
  return `params.hydrology.lakeCoherence.${key}`;
}

function expectOptionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new InputValidationError(
      `Invalid params value "${path}". Expected a boolean.`
    );
  }
}

function expectOptionalEnum(value: unknown, path: string, allowed: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new InputValidationError(
      `Invalid params value "${path}". Expected one of: ${allowed.join(", ")}.`
    );
  }
}

function expectOptionalNonNegativeInteger(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new InputValidationError(
      `Invalid params value "${path}". Expected a non-negative integer.`
    );
  }
}

function expectOptionalNonNegativeNumber(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InputValidationError(
      `Invalid params value "${path}". Expected a non-negative number.`
    );
  }
}

function expectOptionalRangeNumber(
  value: unknown,
  path: string,
  min: number,
  max: number
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new InputValidationError(
      `Invalid params value "${path}". Expected a number in [${min}, ${max}].`
    );
  }
}

function validateLakeCoherenceParams(params: JsonObject): void {
  if (!isObject(params.hydrology)) {
    return;
  }

  const hydrology = params.hydrology as JsonObject;
  const lakeCoherence = hydrology.lakeCoherence;
  if (lakeCoherence === undefined) {
    return;
  }

  if (!isObject(lakeCoherence)) {
    throw new InputValidationError(
      'Invalid params value "params.hydrology.lakeCoherence". Expected an object.'
    );
  }

  const value = lakeCoherence as JsonObject;
  expectOptionalBoolean(value.enabled, lakeCoherencePath("enabled"));
  expectOptionalNonNegativeInteger(
    value.microLakeMaxSize,
    lakeCoherencePath("microLakeMaxSize")
  );
  expectOptionalEnum(
    value.microLakeMode,
    lakeCoherencePath("microLakeMode"),
    ["merge", "remove", "leave"]
  );
  expectOptionalBoolean(value.bridgeEnabled, lakeCoherencePath("bridgeEnabled"));
  expectOptionalNonNegativeInteger(
    value.maxBridgeDistance,
    lakeCoherencePath("maxBridgeDistance")
  );
  expectOptionalBoolean(value.repairSingletons, lakeCoherencePath("repairSingletons"));
  expectOptionalBoolean(
    value.enforceBoundaryRealism,
    lakeCoherencePath("enforceBoundaryRealism")
  );
  expectOptionalNonNegativeNumber(value.boundaryEps, lakeCoherencePath("boundaryEps"));
  expectOptionalEnum(
    value.boundaryRepairMode,
    lakeCoherencePath("boundaryRepairMode"),
    ["trim_first"]
  );
}

function hydrologyStructurePath(key: string): string {
  return `params.hydrology.structure.${key}`;
}

function validateHydrologyStructureParams(params: JsonObject): void {
  if (!isObject(params.hydrology)) {
    return;
  }

  const hydrology = params.hydrology as JsonObject;
  const structure = hydrology.structure;
  if (structure === undefined) {
    return;
  }
  if (!isObject(structure)) {
    throw new InputValidationError(
      'Invalid params value "params.hydrology.structure". Expected an object.'
    );
  }

  const value = structure as JsonObject;
  expectOptionalBoolean(value.enabled, hydrologyStructurePath("enabled"));
  expectOptionalRangeNumber(
    value.sinkPersistenceRouteMax,
    hydrologyStructurePath("sinkPersistenceRouteMax"),
    0,
    1
  );
  expectOptionalRangeNumber(
    value.sinkPersistenceLakeMin,
    hydrologyStructurePath("sinkPersistenceLakeMin"),
    0,
    1
  );
  expectOptionalNonNegativeInteger(
    value.basinTileCountMinLake,
    hydrologyStructurePath("basinTileCountMinLake")
  );
  expectOptionalBoolean(
    value.inflowGateEnabled,
    hydrologyStructurePath("inflowGateEnabled")
  );
  expectOptionalRangeNumber(
    value.lakeInflowMin,
    hydrologyStructurePath("lakeInflowMin"),
    0,
    1
  );
  expectOptionalEnum(
    value.unresolvedLakePolicy,
    hydrologyStructurePath("unresolvedLakePolicy"),
    ["deny", "allow_with_strict_gates", "allow"]
  );
  expectOptionalBoolean(
    value.spillAwareRouteThroughEnabled,
    hydrologyStructurePath("spillAwareRouteThroughEnabled")
  );
  expectOptionalRangeNumber(
    value.retentionWeight,
    hydrologyStructurePath("retentionWeight"),
    0,
    1
  );
  expectOptionalEnum(
    value.retentionNormalization,
    hydrologyStructurePath("retentionNormalization"),
    ["quantile", "minmax", "raw"]
  );
}

function topographyStructurePath(key: string): string {
  return `params.topography.structure.${key}`;
}

function validateTopographyStructureParams(params: JsonObject): void {
  if (params.topography === undefined) {
    return;
  }
  if (!isObject(params.topography)) {
    throw new InputValidationError(
      'Invalid params value "params.topography". Expected an object.'
    );
  }
  const topography = params.topography as JsonObject;
  const structure = topography.structure;
  if (structure === undefined) {
    return;
  }

  if (!isObject(structure)) {
    throw new InputValidationError(
      'Invalid params value "params.topography.structure". Expected an object.'
    );
  }

  const value = structure as JsonObject;
  expectOptionalBoolean(value.enabled, topographyStructurePath("enabled"));
  expectOptionalEnum(
    value.connectivity,
    topographyStructurePath("connectivity"),
    ["dir8"]
  );
  expectOptionalNonNegativeNumber(value.hEps, topographyStructurePath("hEps"));
  expectOptionalNonNegativeNumber(
    value.persistenceMin,
    topographyStructurePath("persistenceMin")
  );
  expectOptionalEnum(
    value.unresolvedPolicy,
    topographyStructurePath("unresolvedPolicy"),
    ["nan"]
  );
}

function normalizeLegacyHydrologyAliases(params: JsonObject): void {
  if (!isObject(params.hydrology)) {
    return;
  }

  const hydrology = params.hydrology as JsonObject;
  const legacyAccum = hydrology.streamAccumThreshold;
  const legacySlope = hydrology.streamMinSlopeThreshold;

  if (
    legacyAccum !== undefined &&
    !(typeof legacyAccum === "number" && Number.isFinite(legacyAccum))
  ) {
    throw new InputValidationError(
      'Invalid params value "params.hydrology.streamAccumThreshold". Expected a finite number.'
    );
  }
  if (
    legacySlope !== undefined &&
    !(typeof legacySlope === "number" && Number.isFinite(legacySlope))
  ) {
    throw new InputValidationError(
      'Invalid params value "params.hydrology.streamMinSlopeThreshold". Expected a finite number.'
    );
  }

  const streamThresholds = isObject(hydrology.streamThresholds)
    ? (hydrology.streamThresholds as JsonObject)
    : {};

  const sourceAccumMin = finiteNumberOrUndefined(streamThresholds.sourceAccumMin);
  if (sourceAccumMin === undefined && legacyAccum !== undefined) {
    streamThresholds.sourceAccumMin = legacyAccum;
  }

  const minSlope = finiteNumberOrUndefined(streamThresholds.minSlope);
  if (minSlope === undefined && legacySlope !== undefined) {
    streamThresholds.minSlope = legacySlope;
  }

  if (Object.keys(streamThresholds).length > 0) {
    hydrology.streamThresholds = streamThresholds;
  }

  delete hydrology.streamAccumThreshold;
  delete hydrology.streamMinSlopeThreshold;
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
  const wrapperKeys = [
    "seed",
    "width",
    "height",
    "params",
    "mapHPath",
    "mapRPath",
    "mapVPath",
    "outputFile",
    "outputDir",
    "debugOutputFile",
    "force"
  ];
  const isWrapperMode =
    "params" in parsed || wrapperKeys.some((key) => key !== "params" && key in parsed);

  if (isWrapperMode) {
    for (const key of Object.keys(parsed)) {
      if (!wrapperKeys.includes(key)) {
        const suggestion = suggestClosest(key, wrapperKeys);
        const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
        throw new InputValidationError(`Unknown params wrapper key "${key}".${hint}`);
      }
    }
  }

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
  normalizeLegacyHydrologyAliases(params);
  validateUnknownKeys(params, PARAMS_VALIDATION_SCHEMA, "params");
  validateLakeCoherenceParams(params);
  validateHydrologyStructureParams(params);
  validateTopographyStructureParams(params);

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
