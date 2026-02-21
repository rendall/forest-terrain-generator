import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deepMerge } from "../lib/deep-merge.js";
import { readParamsFile } from "../io/read-params.js";
import type { JsonObject, ResolvedInputs, RunRequest } from "../domain/types.js";

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
  // Phase 1 item 51 focuses on parsing + precedence resolution.
  // Later items will validate and execute full generation flows.
  await resolveInputs(request);
}
