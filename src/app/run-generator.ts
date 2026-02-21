import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deepMerge } from "../lib/deep-merge.js";
import { readParamsFile } from "../io/read-params.js";
import type { JsonObject, ResolvedInputs, RunRequest } from "../domain/types.js";
import { validateResolvedInputs } from "./validate-input.js";

export async function resolveInputs(request: RunRequest): Promise<ResolvedInputs> {
  const fromFile = await readParamsFile(request.args.paramsPath, request.cwd);

  const baseParams = APPENDIX_A_DEFAULTS;
  const fileParams = (fromFile.params ?? {}) as JsonObject;
  const mergedParams = deepMerge(baseParams, fileParams);

  return {
    seed: request.args.seed ?? fromFile.seed,
    width: request.args.width ?? fromFile.width,
    height: request.args.height ?? fromFile.height,
    params: mergedParams,
    paramsPath: request.args.paramsPath
  };
}

export async function runGenerator(request: RunRequest): Promise<void> {
  const resolved = await resolveInputs(request);
  validateResolvedInputs(resolved);
}
