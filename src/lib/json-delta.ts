import type { JsonObject, JsonValue } from "../domain/types.js";

const isObject = (value: JsonValue | undefined): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const deepEqual = (a: JsonValue | undefined, b: JsonValue | undefined): boolean => {
	if (a === b) {
		return true;
	}
	if (typeof a !== typeof b) {
		return false;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i += 1) {
			if (!deepEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	if (isObject(a) || isObject(b)) {
		if (!isObject(a) || !isObject(b)) {
			return false;
		}
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const key of keys) {
			if (!deepEqual(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}
	return false;
};

const computeDeltaValue = (
	base: JsonValue | undefined,
	next: JsonValue | undefined,
): JsonValue | undefined => {
	if (next === undefined) {
		return undefined;
	}
	if (deepEqual(base, next)) {
		return undefined;
	}
	if (isObject(base) && isObject(next)) {
		const out: JsonObject = {};
		for (const key of Object.keys(next)) {
			const delta = computeDeltaValue(base[key], next[key]);
			if (delta !== undefined) {
				out[key] = delta;
			}
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}
	return next;
};

export const computeJsonDelta = (
	base: JsonObject,
	next: JsonObject,
): JsonObject => {
	const out: JsonObject = {};
	for (const key of Object.keys(next)) {
		const delta = computeDeltaValue(base[key], next[key]);
		if (delta !== undefined) {
			out[key] = delta;
		}
	}
	return out;
};

