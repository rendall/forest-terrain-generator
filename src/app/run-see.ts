import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";

export type SeeOverlay = "water" | "stream";

export interface SeeCliArgs {
	inputFilePath?: string;
	outputFile?: string;
	layer: "h" | "r" | "v" | "landforms" | "landscape";
	overlays: SeeOverlay[];
	force: boolean;
}

export interface SeeRequest {
	args: SeeCliArgs;
	cwd: string;
}

function resolveFromCwd(
	cwd: string,
	maybeRelativePath: string | undefined,
): string | undefined {
	if (!maybeRelativePath) {
		return undefined;
	}
	return isAbsolute(maybeRelativePath)
		? maybeRelativePath
		: resolve(cwd, maybeRelativePath);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown filesystem error.";
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function prepareOutputFile(path: string, force: boolean): Promise<void> {
	if (await pathExists(path)) {
		if (!force) {
			throw new InputValidationError(
				`Output file already exists: "${path}". Re-run with --force to overwrite.`,
			);
		}
	}

	await mkdir(dirname(path), { recursive: true });
}

function assertLayer(
	layer: string,
): asserts layer is "h" | "r" | "v" | "landforms" | "landscape" {
	if (
		layer !== "h" &&
		layer !== "r" &&
		layer !== "v" &&
		layer !== "landforms" &&
		layer !== "landscape"
	) {
		throw new InputValidationError(
			`Invalid --layer value "${layer}". Expected one of: h, r, v, landforms, landscape.`,
		);
	}
}

function clamp01(value: number): number {
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function readStringIdArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is string => typeof entry === "string");
}

const SEE_OVERLAY_ORDER: SeeOverlay[] = ["water", "stream"];

export function parseSeeOverlays(raw: string | undefined): SeeOverlay[] {
	if (typeof raw === "undefined" || raw.trim().length === 0) {
		return [];
	}
	const requested = raw
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
	if (requested.length === 0) {
		return [];
	}
	const seen = new Set<SeeOverlay>();
	for (const token of requested) {
		if (token !== "water" && token !== "stream") {
			throw new InputValidationError(
				`Invalid --overlay value "${token}". Expected comma-separated values from: water, stream.`,
			);
		}
		seen.add(token);
	}
	return SEE_OVERLAY_ORDER.filter((overlay) => seen.has(overlay));
}

interface SeeGridData {
	width: number;
	height: number;
	basePixels: Uint8Array;
	heightPixels: Uint8Array;
	waterDepthByIndex: Float64Array;
	streamMask: Uint8Array;
}

function blendChannel(base: number, tint: number, alpha: number): number {
	return Math.max(0, Math.min(255, Math.round(base * (1 - alpha) + tint * alpha)));
}

function hasOverlay(
	overlays: readonly SeeOverlay[],
	overlay: SeeOverlay,
): boolean {
	return overlays.includes(overlay);
}

function readFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildSeeGridData(
	inputFilePath: string,
	tiles: JsonObject[],
	layer: "h" | "r" | "v" | "landforms",
	overlays: readonly SeeOverlay[],
): SeeGridData {
	let maxX = -1;
	let maxY = -1;
	for (const tile of tiles) {
		const x = tile.x;
		const y = tile.y;
		if (
			typeof x !== "number" ||
			!Number.isInteger(x) ||
			x < 0 ||
			typeof y !== "number" ||
			!Number.isInteger(y) ||
			y < 0
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates.`,
			);
		}
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}

	const width = maxX + 1;
	const height = maxY + 1;
	const expectedSize = width * height;
	if (expectedSize !== tiles.length) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" is not a dense ${width}x${height} grid (tileCount=${tiles.length}).`,
		);
	}

	const seen = new Uint8Array(expectedSize);
	const basePixels = new Uint8Array(expectedSize);
	const heightPixels = new Uint8Array(expectedSize);
	const waterDepthByIndex = new Float64Array(expectedSize);
	const streamMask = new Uint8Array(expectedSize);
	const needHeightPixels = layer !== "landforms" || overlays.length > 0;
	for (const tile of tiles) {
		const x = tile.x;
		const y = tile.y;
		if (
			typeof x !== "number" ||
			!Number.isInteger(x) ||
			x < 0 ||
			typeof y !== "number" ||
			!Number.isInteger(y) ||
			y < 0
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates.`,
			);
		}

		const index = y * width + x;
		if (seen[index] === 1) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" has duplicate tile coordinates at (${x},${y}).`,
			);
		}
		seen[index] = 1;

		const topography = isJsonObject(tile.topography) ? tile.topography : null;
		if (!topography) {
			throw new InputValidationError(
				`Tile (${x},${y}) is missing required object "topography".`,
			);
		}

		if (needHeightPixels) {
			const rawH = topography.h;
			if (typeof rawH !== "number" || !Number.isFinite(rawH)) {
				throw new InputValidationError(
					`Tile (${x},${y}) is missing finite topography.h.`,
				);
			}
			heightPixels[index] = Math.round(clamp01(rawH) * 255);
		}

		if (layer === "landforms") {
			const hasActiveFeatureArray = Array.isArray(tile.activeFeatureIds);
			const hasFeatureArray = Array.isArray(tile.featureIds);
			const activeFeatureIds = readStringIdArray(tile.activeFeatureIds);
			const featureIds = readStringIdArray(tile.featureIds);
			const structure = isJsonObject(topography.structure)
				? topography.structure
				: null;
			const hasModernFeatureSignals =
				hasActiveFeatureArray || hasFeatureArray;
			if (!hasModernFeatureSignals && !structure) {
				throw new InputValidationError(
					`Tile (${x},${y}) is missing required feature IDs for --layer landforms (expected tile.activeFeatureIds/featureIds; legacy fallback: topography.structure).`,
				);
			}
			const basinLike =
				hasActiveFeatureArray
					? activeFeatureIds.some((id) => id.startsWith("b_"))
					: hasFeatureArray
						? featureIds.some((id) => id.startsWith("b_"))
						: structure?.basinLike === true;
			const ridgeLike =
				hasActiveFeatureArray
					? activeFeatureIds.some((id) => id.startsWith("p_"))
					: hasFeatureArray
						? featureIds.some((id) => id.startsWith("p_"))
						: structure?.ridgeLike === true;
			if (basinLike && ridgeLike) {
				basePixels[index] = 160;
			} else if (basinLike) {
				basePixels[index] = 64;
			} else if (ridgeLike) {
				basePixels[index] = 224;
			} else {
				basePixels[index] = 128;
			}
		} else {
			const raw = topography[layer];
			if (typeof raw !== "number" || !Number.isFinite(raw)) {
				throw new InputValidationError(
					`Tile (${x},${y}) is missing finite topography.${layer}.`,
				);
			}
			basePixels[index] = Math.round(clamp01(raw) * 255);
		}

		const hydrology = isJsonObject(tile.hydrology) ? tile.hydrology : null;
		if (hydrology && hasOverlay(overlays, "water")) {
			waterDepthByIndex[index] = clamp01(readFiniteNumber(hydrology.waterDepth) ?? 0);
		}
		if (hydrology && hasOverlay(overlays, "stream")) {
			const stream = isJsonObject(hydrology.stream) ? hydrology.stream : null;
			const outgoingDirection = stream?.outgoingDirection;
			const incomingDirections = Array.isArray(stream?.incomingDirections)
				? stream.incomingDirections
				: [];
			const hasOutgoingDirection =
				outgoingDirection !== null &&
				typeof outgoingDirection !== "undefined";
			if (
				hasOutgoingDirection ||
				incomingDirections.length > 0
			) {
				streamMask[index] = 1;
			}
		}
	}

	return {
		width,
		height,
		basePixels,
		heightPixels,
		waterDepthByIndex,
		streamMask,
	};
}

export function renderOverlayRgbPixels(
	basePixels: Uint8Array,
	waterDepthByIndex: Float64Array,
	streamMask: Uint8Array,
	overlays: readonly SeeOverlay[],
): Uint8Array {
	const pixels = new Uint8Array(basePixels.length * 3);
	for (let index = 0; index < basePixels.length; index += 1) {
		const baseGray = basePixels[index] ?? 0;
		let r = baseGray;
		let g = baseGray;
		let b = baseGray;
		if (hasOverlay(overlays, "water")) {
			const waterAlpha = clamp01(waterDepthByIndex[index] ?? 0);
			if (waterAlpha > 0) {
				r = blendChannel(r, 0, waterAlpha);
				g = blendChannel(g, 0, waterAlpha);
				b = blendChannel(b, 255, waterAlpha);
			}
		}
		if (hasOverlay(overlays, "stream") && streamMask[index] === 1) {
			r = blendChannel(r, 255, 0.5);
			g = blendChannel(g, 255, 0.5);
			b = blendChannel(b, 0, 0.5);
		}
		const base = index * 3;
		pixels[base] = r;
		pixels[base + 1] = g;
		pixels[base + 2] = b;
	}
	return pixels;
}

export async function runSee(request: SeeRequest): Promise<void> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputFilePath);
	const outputFile = resolveFromCwd(request.cwd, request.args.outputFile);

	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-file.");
	}
	if (!outputFile) {
		throw new InputValidationError("Missing required output: --output-file.");
	}

	assertLayer(request.args.layer);
	const layer = request.args.layer === "landscape" ? "landforms" : request.args.layer;
	const overlays = request.args.overlays;

	const envelope = await readTerrainEnvelopeFile(inputFilePath);
	if (envelope.tiles.length === 0) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" has no tiles.`,
		);
	}

	const grid = buildSeeGridData(inputFilePath, envelope.tiles, layer, overlays);

	await prepareOutputFile(outputFile, request.args.force);

	const hasOverlays = overlays.length > 0;
	const outputPixels = hasOverlays
		? renderOverlayRgbPixels(
				grid.heightPixels,
				grid.waterDepthByIndex,
				grid.streamMask,
				overlays,
			)
		: grid.basePixels;
	const header = Buffer.from(
		`${hasOverlays ? "P6" : "P5"}\n${grid.width} ${grid.height}\n255\n`,
		"ascii",
	);
	const payload = Buffer.concat([header, Buffer.from(outputPixels)]);
	try {
		await writeFile(outputFile, payload);
	} catch (error) {
		throw new FileIoError(
			`I/O error during image output write at "${outputFile}": ${messageFromUnknown(error)}`,
		);
	}
}
