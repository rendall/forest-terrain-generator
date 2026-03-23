import type { JsonObject, JsonValue } from "../domain/types.js";

function isPlainObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];

    if (value === undefined) {
      continue;
    }

    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = deepMerge(current, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}
