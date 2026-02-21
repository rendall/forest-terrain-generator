import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BaseInputs, JsonObject } from "../domain/types.js";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readParamsFile(
  paramsPath: string | undefined,
  cwd: string
): Promise<BaseInputs> {
  if (!paramsPath) {
    return {};
  }

  const resolvedPath = resolve(cwd, paramsPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!isObject(parsed)) {
    return {};
  }

  const seed = typeof parsed.seed === "string" ? parsed.seed : undefined;
  const width = typeof parsed.width === "number" ? parsed.width : undefined;
  const height = typeof parsed.height === "number" ? parsed.height : undefined;
  const params = isObject(parsed.params) ? parsed.params : parsed;

  return { seed, width, height, params };
}
