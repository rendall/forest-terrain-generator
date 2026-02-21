import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, ResolvedInputs } from "../domain/types.js";

const UINT64_MAX = 18446744073709551615n;
const UINT64_DECIMAL = /^[0-9]+$/;

export interface ValidatedInputs extends Omit<ResolvedInputs, "seed" | "width" | "height"> {
  seed: bigint;
  width: number;
  height: number;
}

function validateSeed(seed: string | undefined): bigint {
  if (seed === undefined) {
    throw new InputValidationError("Missing required input: seed.");
  }

  if (!UINT64_DECIMAL.test(seed)) {
    throw new InputValidationError(
      "Invalid seed value. Seed must be a base-10 unsigned integer token."
    );
  }

  const parsed = BigInt(seed);
  if (parsed > UINT64_MAX) {
    throw new InputValidationError("Invalid seed value. Seed exceeds uint64 maximum.");
  }

  return parsed;
}

function validatePositiveInt(name: string, value: number | undefined): number {
  if (value === undefined) {
    throw new InputValidationError(`Missing required input: ${name}.`);
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new InputValidationError(`Invalid ${name}. Value must be a positive integer.`);
  }

  return value;
}

function validateParams(params: JsonObject | undefined): JsonObject {
  if (!params) {
    throw new InputValidationError("Missing required input: params.");
  }

  return params;
}

export function validateResolvedInputs(resolved: ResolvedInputs): ValidatedInputs {
  return {
    ...resolved,
    seed: validateSeed(resolved.seed),
    width: validatePositiveInt("width", resolved.width),
    height: validatePositiveInt("height", resolved.height),
    params: validateParams(resolved.params)
  };
}
