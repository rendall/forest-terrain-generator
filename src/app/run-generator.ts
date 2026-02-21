import { isAbsolute, resolve } from "node:path";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deepMerge } from "../lib/deep-merge.js";
import { readParamsFile } from "../io/read-params.js";
import type {
  JsonObject,
  ResolvedInputs,
  RunRequest,
  TerrainEnvelope
} from "../domain/types.js";
import { validateResolvedInputs } from "./validate-input.js";
import { buildEnvelopeSkeleton } from "./build-envelope.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { createGridShape } from "../domain/topography.js";
import { resolveBaseMaps } from "../pipeline/resolve-base-maps.js";
import { deriveSlopeAspect } from "../pipeline/derive-slope-aspect.js";
import { classifyLandform } from "../pipeline/classify-landform.js";

function resolveFromCwd(cwd: string, maybeRelativePath: string | undefined): string | undefined {
  if (!maybeRelativePath) {
    return undefined;
  }
  return isAbsolute(maybeRelativePath) ? maybeRelativePath : resolve(cwd, maybeRelativePath);
}

export async function resolveInputs(request: RunRequest): Promise<ResolvedInputs> {
  const fromFile = await readParamsFile(request.args.paramsPath, request.cwd);
  const cliMapHPath = resolveFromCwd(request.cwd, request.args.mapHPath);
  const cliMapRPath = resolveFromCwd(request.cwd, request.args.mapRPath);
  const cliMapVPath = resolveFromCwd(request.cwd, request.args.mapVPath);
  const cliOutputFile = resolveFromCwd(request.cwd, request.args.outputFile);
  const cliOutputDir = resolveFromCwd(request.cwd, request.args.outputDir);
  const cliDebugOutputFile = resolveFromCwd(request.cwd, request.args.debugOutputFile);
  const cliParamsPath = resolveFromCwd(request.cwd, request.args.paramsPath);

  const baseParams = APPENDIX_A_DEFAULTS;
  const fileParams = (fromFile.params ?? {}) as JsonObject;
  const mergedParams = deepMerge(baseParams, fileParams);

  return {
    seed: request.args.seed ?? fromFile.seed,
    width: request.args.width ?? fromFile.width,
    height: request.args.height ?? fromFile.height,
    params: mergedParams,
    paramsPath: cliParamsPath,
    mapHPath: cliMapHPath ?? fromFile.mapHPath,
    mapRPath: cliMapRPath ?? fromFile.mapRPath,
    mapVPath: cliMapVPath ?? fromFile.mapVPath,
    outputFile: cliOutputFile ?? fromFile.outputFile,
    outputDir: cliOutputDir ?? fromFile.outputDir,
    debugOutputFile: cliDebugOutputFile ?? fromFile.debugOutputFile,
    force: request.args.force || fromFile.force || false
  };
}

export async function runGenerator(request: RunRequest): Promise<void> {
  const resolved = await resolveInputs(request);
  const validated = validateResolvedInputs(resolved, request.mode);
  const shape = createGridShape(validated.width, validated.height);
  const baseMaps = await resolveBaseMaps({
    shape,
    seed: validated.seed,
    params: validated.params,
    cwd: request.cwd,
    mapHPath: validated.mapHPath,
    mapRPath: validated.mapRPath,
    mapVPath: validated.mapVPath
  });
  const { slopeMag } = deriveSlopeAspect(shape, baseMaps.h);
  classifyLandform(shape, baseMaps.h, slopeMag, validated.params);

  const envelope: TerrainEnvelope = buildEnvelopeSkeleton();
  await writeModeOutputs(
    request.mode,
    validated.outputFile,
    validated.outputDir,
    validated.debugOutputFile,
    envelope,
    validated.force
  );
}
