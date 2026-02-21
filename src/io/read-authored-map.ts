import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { InputValidationError, ShapeValidationError } from "../domain/errors.js";
import { createGridShape, type GridShape } from "../domain/topography.js";
import type { JsonValue } from "../domain/types.js";

export interface AuthoredMap {
  shape: GridShape;
  data: Float32Array;
  sourcePath: string;
  flagName: "--map-h" | "--map-r" | "--map-v";
}

interface AuthoredMapJson {
  width: number;
  height: number;
  data: JsonValue[];
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputValidationError("Authored map file must contain a JSON object.");
  }
}

function assertInteger(value: unknown, key: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new InputValidationError(`Authored map key "${key}" must be a positive integer.`);
  }
}

function parseAuthoredMapJson(
  parsed: unknown,
  sourcePath: string,
  flagName: AuthoredMap["flagName"]
): AuthoredMapJson {
  assertObject(parsed);
  const { width, height, data } = parsed;

  assertInteger(width, "width");
  assertInteger(height, "height");
  if (!Array.isArray(data)) {
    throw new InputValidationError(`Authored map key "data" must be an array.`);
  }

  return {
    width,
    height,
    data
  };
}

function validateData(
  input: AuthoredMapJson,
  sourcePath: string,
  flagName: AuthoredMap["flagName"]
): Float32Array {
  const expectedLength = input.width * input.height;
  if (input.data.length !== expectedLength) {
    throw new ShapeValidationError(
      `Authored map ${flagName} (${sourcePath}) has data length ${input.data.length}, expected ${expectedLength} (width*height).`
    );
  }

  const out = new Float32Array(expectedLength);
  for (let i = 0; i < input.data.length; i += 1) {
    const value = input.data[i];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InputValidationError(
        `Authored map ${flagName} (${sourcePath}) has invalid numeric value at data[${i}].`
      );
    }
    if (value < 0 || value > 1) {
      throw new InputValidationError(
        `Authored map ${flagName} (${sourcePath}) has out-of-range value at data[${i}] (expected [0,1]).`
      );
    }
    out[i] = value;
  }

  return out;
}

function validateExpectedShape(
  shape: GridShape,
  expectedShape: GridShape | undefined,
  sourcePath: string,
  flagName: AuthoredMap["flagName"]
): void {
  if (!expectedShape) {
    return;
  }
  if (shape.width !== expectedShape.width || shape.height !== expectedShape.height) {
    throw new ShapeValidationError(
      `Authored map ${flagName} (${sourcePath}) dimensions ${shape.width}x${shape.height} do not match expected ${expectedShape.width}x${expectedShape.height}.`
    );
  }
}

export async function readAuthoredMapFile(
  mapPath: string,
  flagName: AuthoredMap["flagName"],
  cwd: string,
  expectedShape?: GridShape
): Promise<AuthoredMap> {
  const sourcePath = resolve(cwd, mapPath);
  const raw = await readFile(sourcePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputValidationError(
      `Malformed JSON for authored map ${flagName} (${sourcePath}).`
    );
  }

  const mapJson = parseAuthoredMapJson(parsed, sourcePath, flagName);
  const shape = createGridShape(mapJson.width, mapJson.height);
  validateExpectedShape(shape, expectedShape, sourcePath, flagName);
  const data = validateData(mapJson, sourcePath, flagName);

  return {
    shape,
    data,
    sourcePath,
    flagName
  };
}
