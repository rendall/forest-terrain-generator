import {
	createHydrologyMaps,
	DIR8_NONE,
	type HydrologyMapsSoA,
	WATER_CLASS_CODE,
} from "../domain/hydrology.js";
import {
	type GridShape,
	LANDFORM_CODE,
	type TopographicStructureMapsSoA,
} from "../domain/topography.js";
import { mix64 } from "../lib/sub-seed.js";

const U64_MASK = 0xffffffffffffffffn;
const X_MIX = 0x9e3779b97f4a7c15n;
const Y_MIX = 0xc2b2ae3d27d4eb4fn;

export const DIR8_NEIGHBORS = [
	{ dir: 0, dx: 1, dy: 0 }, // E
	{ dir: 1, dx: 1, dy: 1 }, // SE
	{ dir: 2, dx: 0, dy: 1 }, // S
	{ dir: 3, dx: -1, dy: 1 }, // SW
	{ dir: 4, dx: -1, dy: 0 }, // W
	{ dir: 5, dx: -1, dy: -1 }, // NW
	{ dir: 6, dx: 0, dy: -1 }, // N
	{ dir: 7, dx: 1, dy: -1 }, // NE
] as const;

export const CANONICAL_DIR8_ORDER = DIR8_NEIGHBORS.map((entry) => entry.dir);
const DIR4_NEIGHBORS = DIR8_NEIGHBORS.filter(
	(neighbor) => neighbor.dir % 2 === 0,
);

export interface FlowDirectionParams {
	minDropThreshold: number;
	tieEps: number;
}

export interface LakeMaskParams {
	lakeFlatSlopeThreshold: number;
	lakeAccumThreshold: number;
	lakeGrowSteps?: number;
	lakeGrowHeightDelta?: number;
}

export interface LakeCoherenceParams {
	enabled: boolean;
	microLakeMaxSize: number;
	microLakeMode: "merge" | "remove" | "leave";
	bridgeEnabled: boolean;
	maxBridgeDistance: number;
	repairSingletons: boolean;
	enforceBoundaryRealism: boolean;
	boundaryEps: number;
	boundaryRepairMode: "trim_first" | "fill_first";
}

export interface StreamThresholdParams {
	sourceAccumMin: number;
	channelAccumMin: number;
	minSlope: number;
	maxGapFillSteps?: number;
}

export interface StreamHeadwaterBoostParams {
	enabled: boolean;
	minElevationPct: number;
	minSlope: number;
	minSourceSpacing: number;
	maxExtraSources: number;
}

export interface HydrologyStructureParams {
	enabled: boolean;
	sinkPersistenceRouteMax: number;
	sinkPersistenceLakeMin: number;
	basinTileCountMinLake: number;
	inflowGateEnabled: boolean;
	lakeInflowMin: number;
	unresolvedLakePolicy: "deny" | "allow_with_strict_gates" | "allow";
	spillAwareRouteThroughEnabled: boolean;
	retentionWeight: number;
	retentionNormalization: "quantile" | "minmax" | "raw";
}

interface StreamThresholdCompatParams {
	streamThresholds?: Partial<StreamThresholdParams>;
	streamAccumThreshold?: number;
	streamMinSlopeThreshold?: number;
}

export interface MoistureParams {
	moistureAccumStart: number;
	flatnessThreshold: number;
	waterProxMaxDist: number;
	weights: {
		accum: number;
		flat: number;
		prox: number;
	};
}

export interface WaterClassParams {
	marshMoistureThreshold: number;
	marshSlopeThreshold: number;
}

export interface DistWaterParams {
	waterProxMaxDist: number;
}

export interface DistStreamParams {
	streamProxMaxDist: number;
}

export interface HydrologyParams
	extends FlowDirectionParams,
			LakeMaskParams,
			StreamThresholdCompatParams,
			DistWaterParams,
			DistStreamParams,
			MoistureParams,
			WaterClassParams {
	streamHeadwaterBoost?: Partial<StreamHeadwaterBoostParams>;
	lakeCoherence?: Partial<LakeCoherenceParams>;
	structure?: Partial<HydrologyStructureParams>;
}

const U32_MAX = 0xffffffff;
const DEFAULT_STREAM_SOURCE_ACCUM_MIN = 0.55;
const DEFAULT_STREAM_CHANNEL_ACCUM_MIN = 0.55;
const DEFAULT_STREAM_MIN_SLOPE = 0.01;

const DEFAULT_HEADWATER_BOOST: StreamHeadwaterBoostParams = {
	enabled: false,
	minElevationPct: 0.7,
	minSlope: 0.015,
	minSourceSpacing: 6,
	maxExtraSources: 24,
};

const DEFAULT_LAKE_COHERENCE: LakeCoherenceParams = {
	enabled: true,
	microLakeMaxSize: 2,
	microLakeMode: "merge",
	bridgeEnabled: true,
	maxBridgeDistance: 1,
	repairSingletons: true,
	enforceBoundaryRealism: true,
	boundaryEps: 0.0005,
	boundaryRepairMode: "trim_first",
};

const DEFAULT_HYDROLOGY_STRUCTURE: HydrologyStructureParams = {
	enabled: true,
	sinkPersistenceRouteMax: 0.005,
	sinkPersistenceLakeMin: 0.02,
	basinTileCountMinLake: 3,
	inflowGateEnabled: false,
	lakeInflowMin: 0.15,
	unresolvedLakePolicy: "deny",
	spillAwareRouteThroughEnabled: false,
	retentionWeight: 0.2,
	retentionNormalization: "quantile",
};

function u64(value: bigint): bigint {
	return value & U64_MASK;
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

function finiteOrFallback(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return value;
}

function normalizeStreamThresholdParams(
	params: StreamThresholdCompatParams,
): StreamThresholdParams {
	const nested = params.streamThresholds ?? {};
	const sourceAccumMin = finiteOrFallback(
		nested.sourceAccumMin,
		finiteOrFallback(params.streamAccumThreshold, DEFAULT_STREAM_SOURCE_ACCUM_MIN),
	);
	const channelAccumMin = finiteOrFallback(
		nested.channelAccumMin,
		sourceAccumMin,
	);
	const minSlope = finiteOrFallback(
		nested.minSlope,
		finiteOrFallback(params.streamMinSlopeThreshold, DEFAULT_STREAM_MIN_SLOPE),
	);
	const maxGapFillSteps = Math.max(
		0,
		Math.floor(finiteOrFallback(nested.maxGapFillSteps, 0)),
	);

	return {
		sourceAccumMin,
		channelAccumMin,
		minSlope,
		maxGapFillSteps,
	};
}

function normalizeHeadwaterBoostParams(
	params: HydrologyParams,
): StreamHeadwaterBoostParams {
	const raw = params.streamHeadwaterBoost ?? {};
	return {
		enabled: raw.enabled === true,
		minElevationPct: clamp01(
			finiteOrFallback(raw.minElevationPct, DEFAULT_HEADWATER_BOOST.minElevationPct),
		),
		minSlope: Math.max(
			0,
			finiteOrFallback(raw.minSlope, DEFAULT_HEADWATER_BOOST.minSlope),
		),
		minSourceSpacing: Math.max(
			0,
			Math.floor(
				finiteOrFallback(
					raw.minSourceSpacing,
					DEFAULT_HEADWATER_BOOST.minSourceSpacing,
				),
			),
		),
		maxExtraSources: Math.max(
			0,
			Math.floor(
				finiteOrFallback(raw.maxExtraSources, DEFAULT_HEADWATER_BOOST.maxExtraSources),
			),
		),
	};
}

function normalizeLakeCoherenceParams(
	raw: Partial<LakeCoherenceParams> | undefined,
): LakeCoherenceParams {
	const input = raw ?? {};
	const microLakeMode =
		input.microLakeMode === "merge" ||
		input.microLakeMode === "remove" ||
		input.microLakeMode === "leave"
			? input.microLakeMode
			: DEFAULT_LAKE_COHERENCE.microLakeMode;
	const boundaryRepairMode =
		input.boundaryRepairMode === "trim_first" ||
		input.boundaryRepairMode === "fill_first"
			? input.boundaryRepairMode
			: DEFAULT_LAKE_COHERENCE.boundaryRepairMode;

	return {
		enabled:
			typeof input.enabled === "boolean"
				? input.enabled
				: DEFAULT_LAKE_COHERENCE.enabled,
		microLakeMaxSize: Math.max(
			0,
			Math.floor(
				finiteOrFallback(
					input.microLakeMaxSize,
					DEFAULT_LAKE_COHERENCE.microLakeMaxSize,
				),
			),
		),
		microLakeMode,
		bridgeEnabled:
			typeof input.bridgeEnabled === "boolean"
				? input.bridgeEnabled
				: DEFAULT_LAKE_COHERENCE.bridgeEnabled,
		maxBridgeDistance: Math.max(
			0,
			Math.floor(
				finiteOrFallback(
					input.maxBridgeDistance,
					DEFAULT_LAKE_COHERENCE.maxBridgeDistance,
				),
			),
		),
		repairSingletons:
			typeof input.repairSingletons === "boolean"
				? input.repairSingletons
				: DEFAULT_LAKE_COHERENCE.repairSingletons,
		enforceBoundaryRealism:
			typeof input.enforceBoundaryRealism === "boolean"
				? input.enforceBoundaryRealism
				: DEFAULT_LAKE_COHERENCE.enforceBoundaryRealism,
		boundaryEps: Math.max(
			0,
			finiteOrFallback(input.boundaryEps, DEFAULT_LAKE_COHERENCE.boundaryEps),
		),
		boundaryRepairMode,
	};
}

export function normalizeHydrologyStructureParams(
	raw: Partial<HydrologyStructureParams> | undefined,
): HydrologyStructureParams {
	const input = raw ?? {};
	const unresolvedLakePolicy =
		input.unresolvedLakePolicy === "deny" ||
		input.unresolvedLakePolicy === "allow_with_strict_gates" ||
		input.unresolvedLakePolicy === "allow"
			? input.unresolvedLakePolicy
			: DEFAULT_HYDROLOGY_STRUCTURE.unresolvedLakePolicy;
	const retentionNormalization =
		input.retentionNormalization === "quantile" ||
		input.retentionNormalization === "minmax" ||
		input.retentionNormalization === "raw"
			? input.retentionNormalization
			: DEFAULT_HYDROLOGY_STRUCTURE.retentionNormalization;

	return {
		enabled:
			typeof input.enabled === "boolean"
				? input.enabled
				: DEFAULT_HYDROLOGY_STRUCTURE.enabled,
		sinkPersistenceRouteMax: Math.max(
			0,
			finiteOrFallback(
				input.sinkPersistenceRouteMax,
				DEFAULT_HYDROLOGY_STRUCTURE.sinkPersistenceRouteMax,
			),
		),
		sinkPersistenceLakeMin: Math.max(
			0,
			finiteOrFallback(
				input.sinkPersistenceLakeMin,
				DEFAULT_HYDROLOGY_STRUCTURE.sinkPersistenceLakeMin,
			),
		),
		basinTileCountMinLake: Math.max(
			0,
			Math.floor(
				finiteOrFallback(
					input.basinTileCountMinLake,
					DEFAULT_HYDROLOGY_STRUCTURE.basinTileCountMinLake,
				),
			),
		),
		inflowGateEnabled:
			typeof input.inflowGateEnabled === "boolean"
				? input.inflowGateEnabled
				: DEFAULT_HYDROLOGY_STRUCTURE.inflowGateEnabled,
		lakeInflowMin: Math.max(
			0,
			finiteOrFallback(
				input.lakeInflowMin,
				DEFAULT_HYDROLOGY_STRUCTURE.lakeInflowMin,
			),
		),
		unresolvedLakePolicy,
		spillAwareRouteThroughEnabled:
			typeof input.spillAwareRouteThroughEnabled === "boolean"
				? input.spillAwareRouteThroughEnabled
				: DEFAULT_HYDROLOGY_STRUCTURE.spillAwareRouteThroughEnabled,
		retentionWeight: Math.max(
			0,
			finiteOrFallback(
				input.retentionWeight,
				DEFAULT_HYDROLOGY_STRUCTURE.retentionWeight,
			),
		),
		retentionNormalization,
	};
}

export type TerminalClass = "lake" | "pool" | "route_through";
export type TerminalRejectionReason =
	| "persistence_below_route_max"
	| "persistence_below_lake_min"
	| "basin_size_below_lake_min"
	| "inflow_below_lake_min"
	| "unresolved_policy_denied";

export interface TerminalWaterClassDecision {
	terminalClass: TerminalClass;
	waterClass: number;
	rejectionReason: TerminalRejectionReason | null;
}

export interface TerminalWaterClassInput {
	persistence: number;
	basinTileCount: number;
	inflow: number;
	unresolved: boolean;
	config: HydrologyStructureParams;
}

export function deriveBasinTileCounts(
	shape: GridShape,
	basinMinIdx: Int32Array,
): Uint32Array {
	validateMapLength(shape, basinMinIdx, "basinMinIdx");
	const countsByMinimum = new Uint32Array(shape.size);
	const out = new Uint32Array(shape.size);

	for (let i = 0; i < shape.size; i += 1) {
		const minimum = basinMinIdx[i];
		if (minimum < 0 || minimum >= shape.size) {
			continue;
		}
		countsByMinimum[minimum] += 1;
	}

	for (let i = 0; i < shape.size; i += 1) {
		const minimum = basinMinIdx[i];
		if (minimum < 0 || minimum >= shape.size) {
			continue;
		}
		out[i] = countsByMinimum[minimum];
	}

	return out;
}

export function isTopographicStructureActive(
	shape: GridShape,
	topographicStructure: TopographicStructureMapsSoA | undefined,
): boolean {
	if (!topographicStructure) {
		return false;
	}
	validateMapLength(shape, topographicStructure.basinMinIdx, "basinMinIdx");
	for (let i = 0; i < shape.size; i += 1) {
		if (topographicStructure.basinMinIdx[i] >= 0) {
			return true;
		}
	}
	return false;
}

function unresolvedLakeAllowed(
	input: TerminalWaterClassInput,
): { allowed: boolean; rejectionReason: TerminalRejectionReason | null } {
	const { unresolved, config, inflow } = input;
	if (!unresolved) {
		return { allowed: true, rejectionReason: null };
	}
	if (config.unresolvedLakePolicy === "deny") {
		return { allowed: false, rejectionReason: "unresolved_policy_denied" };
	}
	if (config.unresolvedLakePolicy === "allow") {
		return { allowed: true, rejectionReason: null };
	}
	if (inflow < config.lakeInflowMin) {
		return { allowed: false, rejectionReason: "inflow_below_lake_min" };
	}
	return { allowed: true, rejectionReason: null };
}

export function classifyTerminalWaterClass(
	input: TerminalWaterClassInput,
): TerminalWaterClassDecision {
	const {
		persistence,
		basinTileCount,
		inflow,
		unresolved,
		config,
	} = input;

	if (Number.isFinite(persistence) && persistence < config.sinkPersistenceRouteMax) {
		return {
			terminalClass: "route_through",
			waterClass: WATER_CLASS_CODE.none,
			rejectionReason: "persistence_below_route_max",
		};
	}

	if (!Number.isFinite(persistence) || persistence < config.sinkPersistenceLakeMin) {
		return {
			terminalClass: "pool",
			waterClass: WATER_CLASS_CODE.pool,
			rejectionReason: "persistence_below_lake_min",
		};
	}
	if (basinTileCount < config.basinTileCountMinLake) {
		return {
			terminalClass: "pool",
			waterClass: WATER_CLASS_CODE.pool,
			rejectionReason: "basin_size_below_lake_min",
		};
	}
	if (config.inflowGateEnabled && inflow < config.lakeInflowMin) {
		return {
			terminalClass: "pool",
			waterClass: WATER_CLASS_CODE.pool,
			rejectionReason: "inflow_below_lake_min",
		};
	}
	const unresolvedCheck = unresolvedLakeAllowed({
		persistence,
		basinTileCount,
		inflow,
		unresolved,
		config,
	});
	if (!unresolvedCheck.allowed) {
		return {
			terminalClass: "pool",
			waterClass: WATER_CLASS_CODE.pool,
			rejectionReason: unresolvedCheck.rejectionReason,
		};
	}
	return {
		terminalClass: "lake",
		waterClass: WATER_CLASS_CODE.lake,
		rejectionReason: null,
	};
}

interface FloatSummaryStats {
	min: number;
	max: number;
	avg: number;
	p10: number;
	p50: number;
	p90: number;
}

interface SinkCandidateCounters {
	routeThrough: number;
	pool: number;
	lake: number;
}

interface SinkRejectionCounters {
	persistence_below_route_max: number;
	persistence_below_lake_min: number;
	basin_size_below_lake_min: number;
	inflow_below_lake_min: number;
	unresolved_policy_denied: number;
}

interface EndpointReasonCounters {
	lake: number;
	pool: number;
	marsh: number;
	route_through: number;
	blocked: number;
}

export interface HydrologyStructureDiagnostics {
	params: HydrologyStructureParams;
	sinkCandidates: SinkCandidateCounters;
	sinkRejections: SinkRejectionCounters;
	endpointReasons: EndpointReasonCounters;
	moistureDecomposition: {
		baseMoisture: FloatSummaryStats;
		retentionTerm: FloatSummaryStats;
		finalMoisture: FloatSummaryStats;
	};
}

function summarizeFloatArray(values: Float32Array): FloatSummaryStats {
	if (values.length === 0) {
		return { min: 0, max: 0, avg: 0, p10: 0, p50: 0, p90: 0 };
	}
	const finite: number[] = [];
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i];
		if (!Number.isFinite(value)) {
			continue;
		}
		finite.push(value);
	}
	if (finite.length === 0) {
		return { min: 0, max: 0, avg: 0, p10: 0, p50: 0, p90: 0 };
	}
	finite.sort((a, b) => a - b);
	const min = finite[0];
	const max = finite[finite.length - 1];
	const sum = finite.reduce((acc, value) => acc + value, 0);
	const avg = sum / finite.length;
	const atPct = (pct: number): number => {
		const index = Math.min(
			finite.length - 1,
			Math.max(0, Math.floor((finite.length - 1) * pct)),
		);
		return finite[index];
	};
	return {
		min,
		max,
		avg,
		p10: atPct(0.1),
		p50: atPct(0.5),
		p90: atPct(0.9),
	};
}

function normalizeRetentionTerm(
	shape: GridShape,
	topographicStructure: TopographicStructureMapsSoA | undefined,
	mode: HydrologyStructureParams["retentionNormalization"],
): Float32Array {
	const out = new Float32Array(shape.size);
	if (!topographicStructure) {
		return out;
	}

	const depth = topographicStructure.basinDepthLike;
	validateMapLength(shape, depth, "basinDepthLike");

	if (mode === "raw") {
		for (let i = 0; i < shape.size; i += 1) {
			const value = depth[i];
			out[i] = Number.isFinite(value) ? clamp01(Math.max(0, value)) : 0;
		}
		return out;
	}

	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	const finite: number[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		const value = depth[i];
		if (!Number.isFinite(value)) {
			continue;
		}
		const clamped = Math.max(0, value);
		finite.push(clamped);
		if (clamped < min) {
			min = clamped;
		}
		if (clamped > max) {
			max = clamped;
		}
	}
	if (finite.length === 0) {
		return out;
	}

	let low = min;
	let high = max;
	if (mode === "quantile") {
		finite.sort((a, b) => a - b);
		const pick = (pct: number): number =>
			finite[Math.min(finite.length - 1, Math.floor((finite.length - 1) * pct))];
		low = pick(0.05);
		high = pick(0.95);
	}
	const denom = high - low;
	if (denom <= 0) {
		return out;
	}
	for (let i = 0; i < shape.size; i += 1) {
		const value = depth[i];
		if (!Number.isFinite(value)) {
			continue;
		}
		out[i] = clamp01((Math.max(0, value) - low) / denom);
	}
	return out;
}

function blendMoistureWithRetention(
	baseMoisture: Float32Array,
	retentionTerm: Float32Array,
	retentionWeight: number,
): Float32Array {
	const out = new Float32Array(baseMoisture.length);
	for (let i = 0; i < baseMoisture.length; i += 1) {
		out[i] = clamp01(baseMoisture[i] + retentionWeight * retentionTerm[i]);
	}
	return out;
}

function validateMapLength(
	shape: GridShape,
	map: ArrayLike<unknown>,
	mapName: string,
): void {
	if (map.length !== shape.size) {
		hydrologyFail(
			"input_contract",
			"map_length_matches_shape",
			"map_length_mismatch",
			{
				map: mapName,
				expected: shape.size,
				actual: map.length,
			},
		);
	}
}

function hydrologyFail(
	stage: string,
	invariant: string,
	reason: string,
	context: Record<string, number | string> = {},
): never {
	const contextFields = Object.entries(context).map(
		([key, value]) => `${key}=${value}`,
	);
	const suffix = contextFields.length > 0 ? ` ${contextFields.join(" ")}` : "";
	throw new Error(
		`Hydrology fail-fast: stage=${stage} invariant=${invariant} reason=${reason}${suffix}`,
	);
}

export function tieBreakHash64(seed: bigint, x: number, y: number): bigint {
	let z = u64(seed);
	z = u64(z ^ u64(BigInt(x) * X_MIX));
	z = u64(z ^ u64(BigInt(y) * Y_MIX));
	return mix64(z);
}

export function enumerateRowMajorIndices(shape: GridShape): number[] {
	const out: number[] = [];
	for (let y = 0; y < shape.height; y += 1) {
		for (let x = 0; x < shape.width; x += 1) {
			out.push(y * shape.width + x);
		}
	}
	return out;
}

export function enumerateNeighborIndices(
	shape: GridShape,
	index: number,
): number[] {
	const x = index % shape.width;
	const y = Math.floor(index / shape.width);
	const out: number[] = [];

	for (const neighbor of DIR8_NEIGHBORS) {
		const nx = x + neighbor.dx;
		const ny = y + neighbor.dy;
		if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
			continue;
		}
		out.push(ny * shape.width + nx);
	}

	return out;
}

export function deriveFlowDirection(
	shape: GridShape,
	h: Float32Array,
	seed: bigint,
	params: FlowDirectionParams,
): Uint8Array {
	validateMapLength(shape, h, "H");

	const fd = new Uint8Array(shape.size).fill(DIR8_NONE);
	const { minDropThreshold, tieEps } = params;

	for (let y = 0; y < shape.height; y += 1) {
		for (let x = 0; x < shape.width; x += 1) {
			const centerIndex = y * shape.width + x;
			const centerHeight = h[centerIndex];
			const eligibleDrops: Array<{ dir: number; drop: number }> = [];
			let maxDrop = Number.NEGATIVE_INFINITY;

			for (const neighbor of DIR8_NEIGHBORS) {
				const nx = x + neighbor.dx;
				const ny = y + neighbor.dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}

				const neighborHeight = h[ny * shape.width + nx];
				const drop = centerHeight - neighborHeight;
				if (drop < minDropThreshold) {
					continue;
				}
				eligibleDrops.push({ dir: neighbor.dir, drop });
				if (drop > maxDrop) {
					maxDrop = drop;
				}
			}

			const tiedCandidates: number[] = [];
			for (const candidate of eligibleDrops) {
				if (Math.abs(candidate.drop - maxDrop) <= tieEps) {
					tiedCandidates.push(candidate.dir);
				}
			}

			if (tiedCandidates.length === 1) {
				fd[centerIndex] = tiedCandidates[0];
			} else if (tiedCandidates.length > 1) {
				const pick = Number(
					tieBreakHash64(seed, x, y) % BigInt(tiedCandidates.length),
				);
				fd[centerIndex] = tiedCandidates[pick];
			}
		}
	}

	return fd;
}

function downstreamIndex(
	shape: GridShape,
	index: number,
	dir: number,
	stage: string,
): number {
	if (dir < 0 || dir > 7) {
		hydrologyFail(stage, "fd_domain", "invalid_fd_code", { index, dir });
	}

	const x = index % shape.width;
	const y = Math.floor(index / shape.width);
	const step = DIR8_NEIGHBORS[dir];
	const nx = x + step.dx;
	const ny = y + step.dy;
	if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
		hydrologyFail(stage, "downstream_in_bounds", "fd_points_outside_grid", {
			index,
			dir,
			width: shape.width,
			height: shape.height,
		});
	}
	return ny * shape.width + nx;
}

export function deriveDownstreamIndexMap(
	shape: GridShape,
	fd: Uint8Array,
): Int32Array {
	validateMapLength(shape, fd, "FD");
	const out = new Int32Array(shape.size).fill(-1);
	for (let i = 0; i < shape.size; i += 1) {
		const dir = fd[i];
		if (dir === DIR8_NONE) {
			continue;
		}
		out[i] = downstreamIndex(shape, i, dir, "downstream_map");
	}
	return out;
}

export function deriveFlowAccumulation(
	shape: GridShape,
	fd: Uint8Array,
): Uint32Array {
	validateMapLength(shape, fd, "FD");

	const fa = new Uint32Array(shape.size).fill(1);
	const inDeg = new Uint8Array(shape.size);

	for (let i = 0; i < shape.size; i += 1) {
		const dir = fd[i];
		if (dir === DIR8_NONE) {
			continue;
		}
		const downstream = downstreamIndex(shape, i, dir, "flow_accumulation");
		inDeg[downstream] += 1;
	}

	const queue: number[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		if (inDeg[i] === 0) {
			queue.push(i);
		}
	}

	let head = 0;
	let processed = 0;
	while (head < queue.length) {
		const tile = queue[head];
		head += 1;
		processed += 1;

		const dir = fd[tile];
		if (dir === DIR8_NONE) {
			continue;
		}

		const downstream = downstreamIndex(shape, tile, dir, "flow_accumulation");
		const sum = fa[downstream] + fa[tile];
		if (sum > U32_MAX) {
			hydrologyFail("flow_accumulation", "uint32_no_overflow", "fa_overflow", {
				tile: downstream,
				current: fa[downstream],
				incoming: fa[tile],
			});
		}
		fa[downstream] = sum;

		inDeg[downstream] -= 1;
		if (inDeg[downstream] === 0) {
			queue.push(downstream);
		}
	}

	if (processed !== shape.size) {
		hydrologyFail("flow_accumulation", "acyclic_fd", "cycle_detected", {
			processed,
			size: shape.size,
		});
	}

	return fa;
}

export function deriveInDegree(shape: GridShape, fd: Uint8Array): Uint8Array {
	validateMapLength(shape, fd, "FD");
	const inDeg = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		const dir = fd[i];
		if (dir === DIR8_NONE) {
			continue;
		}
		const downstream = downstreamIndex(shape, i, dir, "flow_accumulation");
		inDeg[downstream] += 1;
	}
	return inDeg;
}

export function normalizeFlowAccumulation(fa: Uint32Array): Float32Array {
	let faMin = Number.POSITIVE_INFINITY;
	let faMax = Number.NEGATIVE_INFINITY;

	for (let i = 0; i < fa.length; i += 1) {
		const value = fa[i];
		if (value < faMin) {
			faMin = value;
		}
		if (value > faMax) {
			faMax = value;
		}
	}

	const out = new Float32Array(fa.length);
	if (faMax === faMin) {
		return out;
	}

	const logMin = Math.log(faMin);
	const logMax = Math.log(faMax);
	const denom = logMax - logMin;
	for (let i = 0; i < fa.length; i += 1) {
		const normalized = (Math.log(fa[i]) - logMin) / denom;
		out[i] = clamp01(normalized);
	}
	return out;
}

function floodFillMask(shape: GridShape, candidate: Uint8Array): Uint8Array {
	const mask = new Uint8Array(shape.size);

	for (let start = 0; start < shape.size; start += 1) {
		if (candidate[start] === 0 || mask[start] === 1) {
			continue;
		}

		const queue: number[] = [start];
		mask[start] = 1;
		let head = 0;
		while (head < queue.length) {
			const tile = queue[head];
			head += 1;
			const x = tile % shape.width;
			const y = Math.floor(tile / shape.width);

			for (const neighbor of DIR8_NEIGHBORS) {
				const nx = x + neighbor.dx;
				const ny = y + neighbor.dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}
				const next = ny * shape.width + nx;
				if (candidate[next] === 1 && mask[next] === 0) {
					mask[next] = 1;
					queue.push(next);
				}
			}
		}
	}

	return mask;
}

function collectConnectedComponents(
	shape: GridShape,
	mask: Uint8Array,
): number[][] {
	const visited = new Uint8Array(shape.size);
	const components: number[][] = [];

	for (let start = 0; start < shape.size; start += 1) {
		if (mask[start] === 0 || visited[start] === 1) {
			continue;
		}

		const queue: number[] = [start];
		const component: number[] = [];
		visited[start] = 1;
		let head = 0;
		while (head < queue.length) {
			const tile = queue[head];
			head += 1;
			component.push(tile);
			const x = tile % shape.width;
			const y = Math.floor(tile / shape.width);

			for (const neighbor of DIR8_NEIGHBORS) {
				const nx = x + neighbor.dx;
				const ny = y + neighbor.dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}
				const next = ny * shape.width + nx;
				if (mask[next] === 1 && visited[next] === 0) {
					visited[next] = 1;
					queue.push(next);
				}
			}
		}
		components.push(component);
	}

	return components;
}

function sortComponentStable(component: number[]): number[] {
	component.sort((a, b) => a - b);
	return component;
}

export function deriveLakeComponents(
	shape: GridShape,
	lakeMask: Uint8Array,
): number[][] {
	validateMapLength(shape, lakeMask, "LakeMask");
	const components = collectConnectedComponents(shape, lakeMask).map(
		sortComponentStable,
	);
	components.sort((a, b) => a[0] - b[0]);
	return components;
}

function indexX(shape: GridShape, index: number): number {
	return index % shape.width;
}

function indexY(shape: GridShape, index: number): number {
	return Math.floor(index / shape.width);
}

function chebyshevDistance(
	shape: GridShape,
	from: number,
	to: number,
): number {
	return Math.max(
		Math.abs(indexX(shape, from) - indexX(shape, to)),
		Math.abs(indexY(shape, from) - indexY(shape, to)),
	);
}

function pathBetweenIndices(
	shape: GridShape,
	from: number,
	to: number,
): number[] {
	const path: number[] = [];
	let x = indexX(shape, from);
	let y = indexY(shape, from);
	const tx = indexX(shape, to);
	const ty = indexY(shape, to);

	while (x !== tx || y !== ty) {
		const dx = Math.sign(tx - x);
		const dy = Math.sign(ty - y);
		x += dx;
		y += dy;
		path.push(y * shape.width + x);
	}

	return path;
}

function chooseClosestTilePair(
	shape: GridShape,
	componentA: number[],
	componentB: number[],
): { from: number; to: number; distance: number } {
	let bestFrom = componentA[0];
	let bestTo = componentB[0];
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const from of componentA) {
		for (const to of componentB) {
			const distance = chebyshevDistance(shape, from, to);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestFrom = from;
				bestTo = to;
				continue;
			}
			if (distance === bestDistance) {
				if (from < bestFrom || (from === bestFrom && to < bestTo)) {
					bestFrom = from;
					bestTo = to;
				}
			}
		}
	}

	return { from: bestFrom, to: bestTo, distance: bestDistance };
}

function mutateMaskWithPath(mask: Uint8Array, path: number[]): void {
	for (const tile of path) {
		mask[tile] = 1;
	}
}

function applyComponentTiles(mask: Uint8Array, component: number[], value: 0 | 1): void {
	for (const tile of component) {
		mask[tile] = value;
	}
}

function componentKey(component: number[]): string {
	return component.join(",");
}

export function applyMicroLakePolicy(
	shape: GridShape,
	lakeMask: Uint8Array,
	raw: Partial<LakeCoherenceParams>,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	const params = normalizeLakeCoherenceParams(raw);
	const out = lakeMask.slice();

	if (params.microLakeMode === "leave" || params.microLakeMaxSize === 0) {
		return out;
	}

	const initialComponents = deriveLakeComponents(shape, out);
	const candidates = initialComponents.filter((component) => {
		const size = component.length;
		if (!params.repairSingletons && size === 1) {
			return false;
		}
		return size <= params.microLakeMaxSize;
	});

	if (params.microLakeMode === "remove") {
		for (const component of candidates) {
			applyComponentTiles(out, component, 0);
		}
		return out;
	}

	for (const sourceCandidate of candidates) {
		const sourceTile = sourceCandidate.find((tile) => out[tile] === 1);
		if (sourceTile === undefined) {
			continue;
		}

		const componentsNow = deriveLakeComponents(shape, out);
		const sourceComponent = componentsNow.find((component) =>
			component.includes(sourceTile),
		);
		if (!sourceComponent) {
			continue;
		}

		const sourceIdentity = componentKey(sourceComponent);
		let targetComponents = componentsNow.filter(
			(component) =>
				componentKey(component) !== sourceIdentity &&
				component.length > params.microLakeMaxSize,
		);
		if (targetComponents.length === 0) {
			targetComponents = componentsNow.filter(
				(component) => componentKey(component) !== sourceIdentity,
			);
		}
		if (targetComponents.length === 0) {
			continue;
		}

		let best:
			| {
					gapDistance: number;
					targetStart: number;
					from: number;
					to: number;
					distance: number;
			  }
			| undefined;
		for (const target of targetComponents) {
			const pair = chooseClosestTilePair(shape, sourceComponent, target);
			const gapDistance = Math.max(0, pair.distance - 1);
			if (gapDistance > params.maxBridgeDistance) {
				continue;
			}
			const candidate = {
				gapDistance,
				targetStart: target[0],
				from: pair.from,
				to: pair.to,
				distance: pair.distance,
			};
			if (!best) {
				best = candidate;
				continue;
			}
			if (candidate.distance < best.distance) {
				best = candidate;
				continue;
			}
			if (candidate.distance === best.distance) {
				if (
					candidate.gapDistance < best.gapDistance ||
					(candidate.gapDistance === best.gapDistance &&
						(candidate.targetStart < best.targetStart ||
							(candidate.targetStart === best.targetStart &&
								(candidate.from < best.from ||
									(candidate.from === best.from && candidate.to < best.to)))))
				) {
					best = candidate;
				}
			}
		}

		if (!best) {
			continue;
		}
		mutateMaskWithPath(out, pathBetweenIndices(shape, best.from, best.to));
	}

	return out;
}

export function applyLakeComponentBridging(
	shape: GridShape,
	lakeMask: Uint8Array,
	raw: Partial<LakeCoherenceParams>,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	const params = normalizeLakeCoherenceParams(raw);
	const out = lakeMask.slice();
	if (!params.bridgeEnabled || params.maxBridgeDistance <= 0) {
		return out;
	}

	const components = deriveLakeComponents(shape, out);
	if (components.length < 2) {
		return out;
	}

	const candidates: Array<{
		gapDistance: number;
		leftIndex: number;
		rightIndex: number;
		leftStart: number;
		rightStart: number;
		from: number;
		to: number;
	}> = [];

	for (let left = 0; left < components.length; left += 1) {
		for (let right = left + 1; right < components.length; right += 1) {
			const pair = chooseClosestTilePair(shape, components[left], components[right]);
			const gapDistance = Math.max(0, pair.distance - 1);
			if (gapDistance > params.maxBridgeDistance) {
				continue;
			}
			candidates.push({
				gapDistance,
				leftIndex: left,
				rightIndex: right,
				leftStart: components[left][0],
				rightStart: components[right][0],
				from: pair.from,
				to: pair.to,
			});
		}
	}

	candidates.sort((a, b) => {
		if (a.gapDistance !== b.gapDistance) {
			return a.gapDistance - b.gapDistance;
		}
		if (a.leftStart !== b.leftStart) {
			return a.leftStart - b.leftStart;
		}
		if (a.rightStart !== b.rightStart) {
			return a.rightStart - b.rightStart;
		}
		if (a.from !== b.from) {
			return a.from - b.from;
		}
		return a.to - b.to;
	});

	const used = new Uint8Array(components.length);
	for (const candidate of candidates) {
		if (used[candidate.leftIndex] === 1 || used[candidate.rightIndex] === 1) {
			continue;
		}
		used[candidate.leftIndex] = 1;
		used[candidate.rightIndex] = 1;
		mutateMaskWithPath(out, pathBetweenIndices(shape, candidate.from, candidate.to));
	}

	return out;
}

export function applyLakeCoherence(
	shape: GridShape,
	lakeMask: Uint8Array,
	raw: Partial<LakeCoherenceParams> | undefined,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	const params = normalizeLakeCoherenceParams(raw);
	if (!params.enabled) {
		return lakeMask;
	}

	let out = lakeMask.slice();
	out = applyMicroLakePolicy(shape, out, params);
	out = applyLakeComponentBridging(shape, out, params);

	// First-wave policy keeps total-lake-share as a reported metric, not a hard guardrail.
	return out;
}

interface LakeBoundaryParams {
	boundaryEps: number;
}

export function deriveLakeBoundaryViolations(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	raw: Partial<LakeBoundaryParams>,
): number[] {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");
	const boundaryEps = Math.max(0, finiteOrFallback(raw.boundaryEps, 0));
	const violations: number[] = [];

	for (let i = 0; i < shape.size; i += 1) {
		if (lakeMask[i] !== 1) {
			continue;
		}
		const x = indexX(shape, i);
		const y = indexY(shape, i);
		let hasLowerAdjacentNonLake = false;
		for (const neighbor of DIR8_NEIGHBORS) {
			const nx = x + neighbor.dx;
			const ny = y + neighbor.dy;
			if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
				continue;
			}
			const next = ny * shape.width + nx;
			if (lakeMask[next] === 1) {
				continue;
			}
			if (h[next] + boundaryEps < h[i]) {
				hasLowerAdjacentNonLake = true;
				break;
			}
		}
		if (hasLowerAdjacentNonLake) {
			violations.push(i);
		}
	}

	return violations;
}

export function applyBoundaryRealismTrimFirst(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	raw: Partial<LakeBoundaryParams>,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");

	const out = lakeMask.slice();
	while (true) {
		const violations = deriveLakeBoundaryViolations(shape, out, h, raw);
		if (violations.length === 0) {
			break;
		}
		for (const tile of violations) {
			out[tile] = 0;
		}
	}

	return out;
}

export function applyLakeBoundaryRealism(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	raw: Partial<LakeCoherenceParams> | undefined,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");

	const params = normalizeLakeCoherenceParams(raw);
	if (!params.enabled || !params.enforceBoundaryRealism) {
		return lakeMask.slice();
	}
	if (params.boundaryRepairMode === "trim_first") {
		return applyBoundaryRealismTrimFirst(shape, lakeMask, h, params);
	}

	// fill_first is deferred in this first-wave track; trim-first remains the enforced fallback.
	return applyBoundaryRealismTrimFirst(shape, lakeMask, h, params);
}

export function validateLakeBoundaryRealism(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	raw: Partial<LakeCoherenceParams> | undefined,
): void {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");

	const params = normalizeLakeCoherenceParams(raw);
	if (!params.enabled || !params.enforceBoundaryRealism) {
		return;
	}
	const violations = deriveLakeBoundaryViolations(shape, lakeMask, h, params);
	if (violations.length > 0) {
		hydrologyFail(
			"lake_boundary_realism",
			"boundary_no_lower_adjacent_non_lake",
			"boundary_violation_remaining",
			{ count: violations.length, firstTile: violations[0] },
		);
	}
}

export function deriveLakeSurfaceH(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
): Float32Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");
	const out = new Float32Array(shape.size);
	const components = deriveLakeComponents(shape, lakeMask);
	for (const component of components) {
		let surface = Number.NEGATIVE_INFINITY;
		for (const tile of component) {
			surface = Math.max(surface, h[tile]);
		}
		const surfaceValue = Math.fround(surface);
		for (const tile of component) {
			out[tile] = surfaceValue;
		}
	}
	return out;
}

function normalizeGrowSteps(raw: number | undefined): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) {
		return 0;
	}
	return Math.max(0, Math.floor(raw));
}

function normalizeGrowHeightDelta(raw: number | undefined): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) {
		return 0;
	}
	return Math.max(0, raw);
}

export function growLakeMask(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	slopeMag: Float32Array,
	params: LakeMaskParams,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");
	validateMapLength(shape, slopeMag, "SlopeMag");

	const growSteps = normalizeGrowSteps(params.lakeGrowSteps);
	if (growSteps === 0) {
		return lakeMask;
	}

	const baseMask = lakeMask;
	const flatSlopeThreshold = Math.fround(params.lakeFlatSlopeThreshold);
	const heightDelta = Math.fround(
		normalizeGrowHeightDelta(params.lakeGrowHeightDelta),
	);
	const components = collectConnectedComponents(shape, baseMask);
	const grown = baseMask.slice();
	const componentExpanded = new Uint8Array(shape.size);
	const touched: number[] = [];

	for (const component of components) {
		let referenceHeight = Number.POSITIVE_INFINITY;
		for (const tile of component) {
			referenceHeight = Math.min(referenceHeight, h[tile]);
		}

		const queue: number[] = [...component];
		const depth: number[] = new Array(queue.length).fill(0);
		let head = 0;
		while (head < queue.length) {
			const tile = queue[head];
			const tileDepth = depth[head];
			head += 1;
			if (tileDepth >= growSteps) {
				continue;
			}

			const x = tile % shape.width;
			const y = Math.floor(tile / shape.width);
			for (const neighbor of DIR4_NEIGHBORS) {
				const nx = x + neighbor.dx;
				const ny = y + neighbor.dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}
				const next = ny * shape.width + nx;
				if (baseMask[next] === 1 || componentExpanded[next] === 1) {
					continue;
				}
				if (slopeMag[next] > flatSlopeThreshold) {
					continue;
				}
				if (h[next] > referenceHeight + heightDelta) {
					continue;
				}

				componentExpanded[next] = 1;
				touched.push(next);
				queue.push(next);
				depth.push(tileDepth + 1);
			}
		}

		for (const tile of touched) {
			grown[tile] = 1;
			componentExpanded[tile] = 0;
		}
		touched.length = 0;
	}

	return grown;
}

export function deriveLakeMask(
	shape: GridShape,
	landform: Uint8Array,
	slopeMag: Float32Array,
	faN: Float32Array,
	params: LakeMaskParams,
): Uint8Array {
	validateMapLength(shape, landform, "Landform");
	validateMapLength(shape, slopeMag, "SlopeMag");
	validateMapLength(shape, faN, "FA_N");
	const flatSlopeThreshold = Math.fround(params.lakeFlatSlopeThreshold);
	const accumThreshold = Math.fround(params.lakeAccumThreshold);

	const candidate = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		if (
			landform[i] === LANDFORM_CODE.basin &&
			slopeMag[i] < flatSlopeThreshold &&
			faN[i] >= accumThreshold
		) {
			candidate[i] = 1;
		}
	}

	return floodFillMask(shape, candidate);
}

export function deriveStreamMask(
	shape: GridShape,
	lakeMask: Uint8Array,
	faN: Float32Array,
	slopeMag: Float32Array,
	params: StreamThresholdCompatParams,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, faN, "FA_N");
	validateMapLength(shape, slopeMag, "SlopeMag");
	const thresholds = normalizeStreamThresholdParams(params);
	const accumThreshold = Math.fround(thresholds.sourceAccumMin);
	const minSlopeThreshold = Math.fround(thresholds.minSlope);

	const stream = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		if (
			lakeMask[i] === 0 &&
			faN[i] >= accumThreshold &&
			slopeMag[i] >= minSlopeThreshold
		) {
			stream[i] = 1;
		}
	}
	return stream;
}

export function deriveBaseStreamSources(
	shape: GridShape,
	lakeMask: Uint8Array,
	faN: Float32Array,
	slopeMag: Float32Array,
	thresholds: StreamThresholdParams,
): Uint8Array {
	return deriveStreamMask(shape, lakeMask, faN, slopeMag, {
		streamThresholds: thresholds,
	});
}

function hasSourceWithinSpacing(
	shape: GridShape,
	sourceMask: Uint8Array,
	index: number,
	minSpacing: number,
): boolean {
	if (minSpacing <= 0) {
		return sourceMask[index] === 1;
	}
	const x = index % shape.width;
	const y = Math.floor(index / shape.width);
	for (let ny = Math.max(0, y - minSpacing); ny <= Math.min(shape.height - 1, y + minSpacing); ny += 1) {
		for (let nx = Math.max(0, x - minSpacing); nx <= Math.min(shape.width - 1, x + minSpacing); nx += 1) {
			const i = ny * shape.width + nx;
			if (sourceMask[i] !== 1) {
				continue;
			}
			const chebyshev = Math.max(Math.abs(nx - x), Math.abs(ny - y));
			if (chebyshev <= minSpacing) {
				return true;
			}
		}
	}
	return false;
}

export function applyHeadwaterBoostSources(
	shape: GridShape,
	h: Float32Array,
	slopeMag: Float32Array,
	lakeMask: Uint8Array,
	baseSources: Uint8Array,
	boost: StreamHeadwaterBoostParams,
): Uint8Array {
	validateMapLength(shape, h, "H");
	validateMapLength(shape, slopeMag, "SlopeMag");
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, baseSources, "BaseStreamSources");

	const out = baseSources.slice();
	if (!boost.enabled || boost.maxExtraSources <= 0) {
		return out;
	}

	let added = 0;
	for (let i = 0; i < shape.size; i += 1) {
		if (added >= boost.maxExtraSources) {
			break;
		}
		if (lakeMask[i] === 1 || out[i] === 1) {
			continue;
		}
		if (h[i] < boost.minElevationPct || slopeMag[i] < boost.minSlope) {
			continue;
		}
		if (hasSourceWithinSpacing(shape, out, i, boost.minSourceSpacing)) {
			continue;
		}
		out[i] = 1;
		added += 1;
	}

	return out;
}

export function deriveStreamTopology(
	shape: GridShape,
	downstream: Int32Array,
	lakeMask: Uint8Array,
	sourceMask: Uint8Array,
	faN: Float32Array,
	streamThresholds: StreamThresholdParams,
): { isStream: Uint8Array; poolMask: Uint8Array } {
	validateMapLength(shape, downstream, "DownstreamIndexMap");
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, sourceMask, "StreamSourceMask");
	validateMapLength(shape, faN, "FA_N");

	const isStream = new Uint8Array(shape.size);
	const poolMask = new Uint8Array(shape.size);

	for (let i = 0; i < shape.size; i += 1) {
		if (sourceMask[i] !== 1) {
			continue;
		}

		const path: number[] = [];
		let current = i;
		let guard = 0;

		while (current >= 0 && guard < shape.size) {
			guard += 1;
			if (lakeMask[current] === 1) {
				break;
			}

			path.push(current);
			const next = downstream[current];
			if (next < 0) {
				break;
			}
			if (lakeMask[next] === 1 || isStream[next] === 1) {
				break;
			}
			current = next;
		}

		for (const tile of path) {
			if (lakeMask[tile] === 0) {
				isStream[tile] = 1;
			}
		}

		const terminal = path[path.length - 1];
		if (
			terminal !== undefined &&
			lakeMask[terminal] === 0 &&
			downstream[terminal] < 0 &&
			faN[terminal] >= streamThresholds.channelAccumMin
		) {
			poolMask[terminal] = 1;
			isStream[terminal] = 0;
		}
	}

	return { isStream, poolMask };
}

export function applyOptionalStreamCleanup(
	shape: GridShape,
	downstream: Int32Array,
	isStream: Uint8Array,
	lakeMask: Uint8Array,
	poolMask: Uint8Array,
	maxGapFillSteps: number,
): Uint8Array {
	validateMapLength(shape, downstream, "DownstreamIndexMap");
	validateMapLength(shape, isStream, "isStream");
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, poolMask, "poolMask");

	const gapSteps = Math.max(0, Math.floor(maxGapFillSteps));
	if (gapSteps === 0) {
		return isStream;
	}

	const out = isStream.slice();
	for (let i = 0; i < shape.size; i += 1) {
		if (isStream[i] !== 1) {
			continue;
		}
		let current = i;
		for (let step = 0; step < gapSteps; step += 1) {
			const next = downstream[current];
			if (next < 0 || lakeMask[next] === 1 || poolMask[next] === 1 || out[next] === 1) {
				break;
			}
			out[next] = 1;
			current = next;
		}
	}
	return out;
}

export function validateStreamContinuity(
	shape: GridShape,
	downstream: Int32Array,
	isStream: Uint8Array,
	lakeMask: Uint8Array,
	poolMask: Uint8Array,
	routeThroughMask?: Uint8Array,
): void {
	validateMapLength(shape, downstream, "DownstreamIndexMap");
	validateMapLength(shape, isStream, "isStream");
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, poolMask, "poolMask");
	const routeMask = routeThroughMask ?? new Uint8Array(shape.size);
	validateMapLength(shape, routeMask, "routeThroughMask");

	for (let i = 0; i < shape.size; i += 1) {
		if (isStream[i] !== 1) {
			continue;
		}
		const next = downstream[i];
		if (next >= 0) {
			if (isStream[next] === 1 || lakeMask[next] === 1 || poolMask[next] === 1) {
				continue;
			}
		} else if (poolMask[i] === 1 || routeMask[i] === 1) {
			continue;
		}
		hydrologyFail(
			"stream_continuity",
			"stream_downstream_continuation",
			"invalid_stream_termination",
			{ tile: i, next },
		);
	}
}

export function deriveMoisture(
	shape: GridShape,
	faN: Float32Array,
	slopeMag: Float32Array,
	distWater: Uint32Array,
	params: MoistureParams,
): Float32Array {
	validateMapLength(shape, faN, "FA_N");
	validateMapLength(shape, slopeMag, "SlopeMag");
	validateMapLength(shape, distWater, "distWater");

	const out = new Float32Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		const wetAccum = clamp01(
			(faN[i] - params.moistureAccumStart) / (1 - params.moistureAccumStart),
		);
		const wetFlat = clamp01(
			(params.flatnessThreshold - slopeMag[i]) / params.flatnessThreshold,
		);
		const wetProx = clamp01(1 - distWater[i] / params.waterProxMaxDist);
		out[i] = clamp01(
			params.weights.accum * wetAccum +
				params.weights.flat * wetFlat +
				params.weights.prox * wetProx,
		);
	}
	return out;
}

export function classifyWaterClass(
	shape: GridShape,
	lakeMask: Uint8Array,
	isStream: Uint8Array,
	poolMask: Uint8Array | undefined,
	moisture: Float32Array,
	slopeMag: Float32Array,
	params: WaterClassParams,
): Uint8Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, isStream, "isStream");
	const pools = poolMask ?? new Uint8Array(shape.size);
	validateMapLength(shape, pools, "poolMask");
	validateMapLength(shape, moisture, "Moisture");
	validateMapLength(shape, slopeMag, "SlopeMag");
	const marshMoistureThreshold = Math.fround(params.marshMoistureThreshold);
	const marshSlopeThreshold = Math.fround(params.marshSlopeThreshold);

	const waterClass = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		if (lakeMask[i] === 1) {
			waterClass[i] = WATER_CLASS_CODE.lake;
			continue;
		}
		if (isStream[i] === 1) {
			waterClass[i] = WATER_CLASS_CODE.stream;
			continue;
		}
		if (pools[i] === 1) {
			waterClass[i] = WATER_CLASS_CODE.pool;
			continue;
		}
		if (
			moisture[i] >= marshMoistureThreshold &&
			slopeMag[i] < marshSlopeThreshold
		) {
			waterClass[i] = WATER_CLASS_CODE.marsh;
			continue;
		}
		waterClass[i] = WATER_CLASS_CODE.none;
	}
	return waterClass;
}

function deriveDistanceFromSources(
	shape: GridShape,
	sources: Uint8Array,
	maxDist: number,
): Uint32Array {
	const out = new Uint32Array(shape.size).fill(maxDist);
	const queue: number[] = [];

	for (let i = 0; i < shape.size; i += 1) {
		if (sources[i] === 1) {
			out[i] = 0;
			queue.push(i);
		}
	}

	if (queue.length === 0) {
		return out;
	}

	let head = 0;
	while (head < queue.length) {
		const tile = queue[head];
		head += 1;
		const baseDist = out[tile];
		if (baseDist >= maxDist) {
			continue;
		}

		const x = tile % shape.width;
		const y = Math.floor(tile / shape.width);
		for (const neighbor of DIR8_NEIGHBORS) {
			const nx = x + neighbor.dx;
			const ny = y + neighbor.dy;
			if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
				continue;
			}
			const next = ny * shape.width + nx;
			if (out[next] !== maxDist) {
				continue;
			}
			out[next] = Math.min(maxDist, baseDist + 1);
			queue.push(next);
		}
	}

	return out;
}

export function deriveDistWater(
	shape: GridShape,
	lakeMask: Uint8Array,
	isStream: Uint8Array,
	poolMask: Uint8Array | undefined,
	params: DistWaterParams,
): Uint32Array {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, isStream, "isStream");
	const pools = poolMask ?? new Uint8Array(shape.size);
	validateMapLength(shape, pools, "poolMask");
	const source = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		source[i] =
			lakeMask[i] === 1 || isStream[i] === 1 || pools[i] === 1 ? 1 : 0;
	}
	return deriveDistanceFromSources(shape, source, params.waterProxMaxDist);
}

export function deriveDistStream(
	shape: GridShape,
	isStream: Uint8Array,
	params: DistStreamParams,
): Uint32Array {
	validateMapLength(shape, isStream, "isStream");
	return deriveDistanceFromSources(shape, isStream, params.streamProxMaxDist);
}

export interface StreamCoherenceMetrics {
	continuationViolations: number;
	componentCount: number;
	singletonCount: number;
	largestComponentSize: number;
	streamTileShare: number;
	noStreamFallback: boolean;
}

export function deriveStreamCoherenceMetrics(
	shape: GridShape,
	downstream: Int32Array,
	isStream: Uint8Array,
	lakeMask: Uint8Array,
	poolMask: Uint8Array,
): StreamCoherenceMetrics {
	validateMapLength(shape, downstream, "DownstreamIndexMap");
	validateMapLength(shape, isStream, "isStream");
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, poolMask, "poolMask");

	let streamCount = 0;
	let continuationViolations = 0;
	for (let i = 0; i < shape.size; i += 1) {
		if (isStream[i] !== 1) {
			continue;
		}
		streamCount += 1;
		const next = downstream[i];
		if (next >= 0) {
			if (isStream[next] === 1 || lakeMask[next] === 1 || poolMask[next] === 1) {
				continue;
			}
		} else if (poolMask[i] === 1) {
			continue;
		}
		continuationViolations += 1;
	}

	let componentCount = 0;
	let singletonCount = 0;
	let largestComponentSize = 0;
	const visited = new Uint8Array(shape.size);
	for (let i = 0; i < shape.size; i += 1) {
		if (isStream[i] !== 1 || visited[i] === 1) {
			continue;
		}
		componentCount += 1;
		const queue: number[] = [i];
		visited[i] = 1;
		let head = 0;
		let size = 0;
		while (head < queue.length) {
			const tile = queue[head];
			head += 1;
			size += 1;
			const x = tile % shape.width;
			const y = Math.floor(tile / shape.width);
			for (const step of DIR8_NEIGHBORS) {
				const nx = x + step.dx;
				const ny = y + step.dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}
				const n = ny * shape.width + nx;
				if (isStream[n] !== 1 || visited[n] === 1) {
					continue;
				}
				visited[n] = 1;
				queue.push(n);
			}
		}
		if (size === 1) {
			singletonCount += 1;
		}
		if (size > largestComponentSize) {
			largestComponentSize = size;
		}
	}

	return {
		continuationViolations,
		componentCount,
		singletonCount,
		largestComponentSize,
		streamTileShare: shape.size > 0 ? streamCount / shape.size : 0,
		noStreamFallback: streamCount === 0,
	};
}

export interface LakeCoherenceMetrics {
	componentCount: number;
	singletonCount: number;
	largestComponentSize: number;
	largestComponentShare: number;
	totalLakeShare: number;
	boundaryViolationCount: number;
}

export interface HydrologyDeriveResult extends HydrologyMapsSoA {
	structureDiagnostics?: HydrologyStructureDiagnostics;
}

export interface HydrologyDeriveOptions {
	emitStructureDiagnostics?: boolean;
}

export function deriveLakeCoherenceMetrics(
	shape: GridShape,
	lakeMask: Uint8Array,
	h: Float32Array,
	raw: Partial<LakeCoherenceParams> | undefined,
): LakeCoherenceMetrics {
	validateMapLength(shape, lakeMask, "LakeMask");
	validateMapLength(shape, h, "H");
	const params = normalizeLakeCoherenceParams(raw);
	const components = deriveLakeComponents(shape, lakeMask);

	let lakeCount = 0;
	let singletonCount = 0;
	let largestComponentSize = 0;
	for (const component of components) {
		const size = component.length;
		lakeCount += size;
		if (size === 1) {
			singletonCount += 1;
		}
		if (size > largestComponentSize) {
			largestComponentSize = size;
		}
	}

	const boundaryViolationCount = deriveLakeBoundaryViolations(
		shape,
		lakeMask,
		h,
		params,
	).length;

	return {
		componentCount: components.length,
		singletonCount,
		largestComponentSize,
		largestComponentShare:
			shape.size > 0 ? largestComponentSize / shape.size : 0,
		totalLakeShare: shape.size > 0 ? lakeCount / shape.size : 0,
		boundaryViolationCount,
	};
}

export function deriveHydrology(
	shape: GridShape,
	h: Float32Array,
	slopeMag: Float32Array,
	landform: Uint8Array,
	seed: bigint,
	params: HydrologyParams,
	topographicStructure?: TopographicStructureMapsSoA,
	options?: HydrologyDeriveOptions,
): HydrologyDeriveResult {
	const maps = createHydrologyMaps(shape);
	const emitStructureDiagnostics = options?.emitStructureDiagnostics === true;
	const structureConfig = normalizeHydrologyStructureParams(params.structure);
	const structureEnabled =
		structureConfig.enabled &&
		isTopographicStructureActive(shape, topographicStructure);
	let sinkCandidates: SinkCandidateCounters | undefined;
	let sinkRejections: SinkRejectionCounters | undefined;
	let endpointReasons: EndpointReasonCounters | undefined;
	if (emitStructureDiagnostics) {
		sinkCandidates = {
			routeThrough: 0,
			pool: 0,
			lake: 0,
		};
		sinkRejections = {
			persistence_below_route_max: 0,
			persistence_below_lake_min: 0,
			basin_size_below_lake_min: 0,
			inflow_below_lake_min: 0,
			unresolved_policy_denied: 0,
		};
		endpointReasons = {
			lake: 0,
			pool: 0,
			marsh: 0,
			route_through: 0,
			blocked: 0,
		};
	}
	maps.fd = deriveFlowDirection(shape, h, seed, params);
	const downstream = deriveDownstreamIndexMap(shape, maps.fd);
	maps.inDeg = deriveInDegree(shape, maps.fd);
	maps.fa = deriveFlowAccumulation(shape, maps.fd);
	maps.faN = normalizeFlowAccumulation(maps.fa);
	maps.lakeMask = deriveLakeMask(shape, landform, slopeMag, maps.faN, params);
	maps.lakeMask = growLakeMask(shape, maps.lakeMask, h, slopeMag, params);
	maps.lakeMask = applyLakeCoherence(shape, maps.lakeMask, params.lakeCoherence);
	maps.lakeMask = applyLakeBoundaryRealism(
		shape,
		maps.lakeMask,
		h,
		params.lakeCoherence,
	);
	validateLakeBoundaryRealism(shape, maps.lakeMask, h, params.lakeCoherence);

	const streamThresholds = normalizeStreamThresholdParams(params);
	const headwaterBoost = normalizeHeadwaterBoostParams(params);
	const baseSources = deriveBaseStreamSources(
		shape,
		maps.lakeMask,
		maps.faN,
		slopeMag,
		streamThresholds,
	);
	const sourceMask = applyHeadwaterBoostSources(
		shape,
		h,
		slopeMag,
		maps.lakeMask,
		baseSources,
		headwaterBoost,
	);
	const topology = deriveStreamTopology(
		shape,
		downstream,
		maps.lakeMask,
		sourceMask,
		maps.faN,
		streamThresholds,
	);
	maps.isStream = applyOptionalStreamCleanup(
		shape,
		downstream,
		topology.isStream,
		maps.lakeMask,
		topology.poolMask,
		streamThresholds.maxGapFillSteps ?? 0,
	);
	maps.poolMask = topology.poolMask;
	const routeThroughMask = new Uint8Array(shape.size);
	if (structureEnabled && topographicStructure) {
		const basinTileCount = deriveBasinTileCounts(
			shape,
			topographicStructure.basinMinIdx,
		);
		for (let i = 0; i < shape.size; i += 1) {
			if (maps.isStream[i] !== 1 || maps.lakeMask[i] === 1 || downstream[i] >= 0) {
				continue;
			}
			const decision = classifyTerminalWaterClass({
				persistence: topographicStructure.basinPersistence[i],
				basinTileCount: basinTileCount[i],
				inflow: maps.faN[i],
				unresolved: Number.isNaN(topographicStructure.basinSpillH[i]),
				config: structureConfig,
			});
			if (emitStructureDiagnostics) {
				sinkCandidates![
					decision.terminalClass === "route_through"
						? "routeThrough"
						: decision.terminalClass
				] += 1;
			}
			if (emitStructureDiagnostics && decision.rejectionReason) {
				sinkRejections![decision.rejectionReason] += 1;
			}
			if (decision.terminalClass === "lake") {
				maps.lakeMask[i] = 1;
				maps.poolMask[i] = 0;
				maps.isStream[i] = 0;
				continue;
			}
			if (decision.terminalClass === "pool") {
				maps.poolMask[i] = 1;
				maps.isStream[i] = 0;
				continue;
			}
			routeThroughMask[i] = 1;
			maps.poolMask[i] = 0;
		}
	}
	validateStreamContinuity(
		shape,
		downstream,
		maps.isStream,
		maps.lakeMask,
		maps.poolMask,
		routeThroughMask,
	);
	maps.distWater = deriveDistWater(
		shape,
		maps.lakeMask,
		maps.isStream,
		maps.poolMask,
		params,
	);
	const baseMoisture = deriveMoisture(
		shape,
		maps.faN,
		slopeMag,
		maps.distWater,
		params,
	);
	const retentionTerm = normalizeRetentionTerm(
		shape,
		structureEnabled ? topographicStructure : undefined,
		structureConfig.retentionNormalization,
	);
	maps.moisture = blendMoistureWithRetention(
		baseMoisture,
		retentionTerm,
		structureEnabled ? structureConfig.retentionWeight : 0,
	);
	maps.waterClass = classifyWaterClass(
		shape,
		maps.lakeMask,
		maps.isStream,
		maps.poolMask,
		maps.moisture,
		slopeMag,
		params,
	);

	if (emitStructureDiagnostics) {
		for (let i = 0; i < shape.size; i += 1) {
			if (downstream[i] >= 0) {
				continue;
			}
			if (maps.lakeMask[i] === 1) {
				endpointReasons!.lake += 1;
				continue;
			}
			if (maps.poolMask[i] === 1) {
				endpointReasons!.pool += 1;
				continue;
			}
			if (maps.waterClass[i] === WATER_CLASS_CODE.marsh) {
				endpointReasons!.marsh += 1;
				continue;
			}
			if (routeThroughMask[i] === 1) {
				endpointReasons!.route_through += 1;
				continue;
			}
			endpointReasons!.blocked += 1;
		}
	}

	maps.lakeSurfaceH = deriveLakeSurfaceH(shape, maps.lakeMask, h);
	if (emitStructureDiagnostics) {
		maps.structureDiagnostics = {
			params: structureConfig,
			sinkCandidates: sinkCandidates!,
			sinkRejections: sinkRejections!,
			endpointReasons: endpointReasons!,
			moistureDecomposition: {
				baseMoisture: summarizeFloatArray(baseMoisture),
				retentionTerm: summarizeFloatArray(retentionTerm),
				finalMoisture: summarizeFloatArray(maps.moisture),
			},
		};
	}
	return maps;
}

export { DIR8_NONE, WATER_CLASS_CODE, createHydrologyMaps };
