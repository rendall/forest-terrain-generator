import { describe, expect, it } from "vitest";
import { deriveStreamNetwork } from "../../src/pipeline/derive-stream-network.js";
import { createStreamFixture } from "./helpers/stream-fixtures.mjs";

const confluenceFixture = createStreamFixture({
	width: 3,
	height: 3,
	hValues: [0.92, 0.82, 0.74, 0.86, 0.68, 0.52, 0.79, 0.58, 0.31],
	faValues: [10, 9, 8, 8, 7, 6, 7, 6, 5],
});

const eastEdgeFixture = createStreamFixture({
	width: 2,
	height: 2,
	hValues: [0.92, 0.82, 1.0, 1.0],
	faValues: [10, 9, 8, 7],
});

const includeAllOrigins = () => true;

describe("derive-stream-network tile geometry", () => {
	it("derives outgoing and incoming tile directions from traced stream edges", () => {
		const result = deriveStreamNetwork({
			...eastEdgeFixture,
			originPredicate: includeAllOrigins,
		});
		const tile0 = result.tileGeometry[0];
		const tile1 = result.tileGeometry[1];
		expect(tile0.outgoingDirection).toBe("e");
		expect(tile1.incomingDirections).toContain("w");
	});

	it("stores multiple incoming directions in canonical order at confluence tiles", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		const confluenceTile = result.tileGeometry[8];
		expect(confluenceTile.incomingDirections.length).toBeGreaterThan(1);
		expect(confluenceTile.incomingDirections).toEqual(["w", "nw", "n"]);
	});

	it("sets outgoingDirection to null for sink terminal stream tiles", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		const sinkTerminalIds = result.streams
			.filter((stream) => stream.terminalKind === "sink")
			.map((stream) => stream.terminalTileId);
		expect(sinkTerminalIds.length).toBeGreaterThan(0);
		for (const tileId of sinkTerminalIds) {
			expect(result.tileGeometry[tileId].outgoingDirection).toBeNull();
		}
	});

	it("emits at most one outgoingDirection value per tile geometry record", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		expect(result.streams.length).toBeGreaterThan(0);
		for (const tile of result.tileGeometry) {
			expect([null, "n", "ne", "e", "se", "s", "sw", "w", "nw"]).toContain(
				tile.outgoingDirection,
			);
		}
	});
});
