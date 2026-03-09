import { describe, expect, it } from "vitest";
import { deriveStreamNetwork } from "../../src/pipeline/derive-stream-network.js";
import { createStreamFixture } from "./helpers/stream-fixtures.mjs";

const fixture = createStreamFixture({
	width: 4,
	height: 4,
	hValues: [
		0.95, 0.9, 0.82, 0.76, 0.88, 0.73, 0.66, 0.58, 0.8, 0.7, 0.5, 0.35, 0.74,
		0.6, 0.4, 0.2,
	],
	faValues: [16, 14, 12, 10, 13, 11, 9, 8, 12, 10, 7, 5, 9, 7, 4, 2],
});

const originTieFixture = createStreamFixture({
	width: 2,
	height: 2,
	hValues: [1.0, 0.5, 0.7, 0.5],
	faValues: [10, 9, 8, 7],
});

const nonOriginTieFixture = createStreamFixture({
	width: 3,
	height: 2,
	hValues: [1.0, 0.8, 0.6, 0.95, 0.9, 0.6],
	faValues: [10, 9, 8, 7, 6, 5],
});

const includeAllOrigins = () => true;
const onlyOriginZero = (tile) => tile.tileId === 0;

describe("derive-stream-network behavior slices", () => {
	it("orders origin processing by height, flow, y, x, then tile id", () => {
		const result = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(result.streams.length).toBeGreaterThan(3);
		expect(
			result.streams.map((stream) => stream.originTileId).slice(0, 5),
		).toEqual([0, 1, 4, 2, 8]);
	});

	it("skips creating a new stream when an origin tile is already on a traced path", () => {
		const result = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(result.streams.length).toBeGreaterThan(0);
		const traversed = new Set(
			result.streams.flatMap((stream) => stream.pathTileIds),
		);
		const dedupedOrigins = result.streams.filter((stream) =>
			traversed.has(stream.originTileId),
		);
		expect(dedupedOrigins.length).toBe(result.streams.length);
		expect(result.streams.length).toBeLessThan(16);
	});

	it("chooses the first downstream step from an origin by elevation then canonical direction", () => {
		const result = deriveStreamNetwork({
			...originTieFixture,
			originPredicate: onlyOriginZero,
		});
		const originZero = result.streams.find(
			(stream) => stream.originTileId === 0,
		);
		expect(originZero).toBeDefined();
		expect(originZero.pathTileIds[1]).toBe(1);
	});

	it("prefers continuing direction on non-origin steps when downhill candidates tie", () => {
		const result = deriveStreamNetwork({
			...nonOriginTieFixture,
			originPredicate: onlyOriginZero,
		});
		const trunk = result.streams.find((stream) => stream.originTileId === 0);
		expect(trunk).toBeDefined();
		expect(trunk.pathTileIds.slice(0, 3)).toEqual([0, 1, 2]);
	});

	it("classifies terminal as confluence when a traced path joins an existing stream tile", () => {
		const result = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(
			result.streams.some((stream) => stream.terminalKind === "confluence"),
		).toBe(true);
	});

	it("classifies terminal as sink when a traced path ends without joining an existing stream", () => {
		const result = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(
			result.streams.some((stream) => stream.terminalKind === "sink"),
		).toBe(true);
	});

	it("avoids immediate error when a revisited tile is encountered during tracing", () => {
		const cycleFixture = createStreamFixture({
			width: 3,
			height: 3,
			hValues: [0.9, 0.8, 0.75, 0.85, 0.7, 0.65, 0.82, 0.6, 0.3],
			faValues: [9, 8, 7, 8, 7, 6, 7, 6, 5],
		});
		const result = deriveStreamNetwork({
			...cycleFixture,
			originPredicate: includeAllOrigins,
		});
		expect(result.streams.length).toBeGreaterThan(0);
		expect(
			result.streams.some((stream) => stream.terminalKind === "error"),
		).toBe(false);
	});

	it("classifies terminal as error when no valid downstream continuation can be resolved", () => {
		const exhaustedFixture = createStreamFixture({
			width: 2,
			height: 2,
			hValues: [0.5, 0.5, 0.5, 0.5],
			faValues: [4, 3, 2, 1],
		});
		const result = deriveStreamNetwork({
			...exhaustedFixture,
			originPredicate: includeAllOrigins,
		});
		expect(
			result.streams.some((stream) => stream.terminalKind === "error"),
		).toBe(true);
	});

	it("emits stream features with origin/path/terminal field consistency", () => {
		const result = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(result.streams.length).toBeGreaterThan(0);
		for (const stream of result.streams) {
			expect(stream.pathTileIds.length).toBeGreaterThanOrEqual(1);
			expect(stream.originTileId).toBe(stream.pathTileIds[0]);
			expect(stream.terminalTileId).toBe(
				stream.pathTileIds[stream.pathTileIds.length - 1],
			);
		}
	});

	it("returns identical stream outputs for repeated runs on the same input", () => {
		const resultA = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		const resultB = deriveStreamNetwork({
			...fixture,
			originPredicate: includeAllOrigins,
		});
		expect(resultA.streams.length).toBeGreaterThan(0);
		expect(resultA).toEqual(resultB);
	});
});
