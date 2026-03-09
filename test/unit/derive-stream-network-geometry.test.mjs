import { describe, expect, it } from "vitest";
import { deriveStreamNetwork } from "../../src/pipeline/derive-stream-network.js";
import { createStreamFixture } from "./helpers/stream-fixtures.mjs";

const confluenceFixture = createStreamFixture({
	width: 3,
	height: 3,
	hValues: [0.92, 0.82, 0.74, 0.86, 0.68, 0.52, 0.79, 0.58, 0.31],
	faValues: [10, 9, 8, 8, 7, 6, 7, 6, 5],
});

const includeAllOrigins = () => true;

describe("derive-stream-network tile geometry", () => {
	it("B1 derives outgoing and incoming directions from stream edges", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		const tile0 = result.tileGeometry[0];
		const tile1 = result.tileGeometry[1];
		expect(tile0.outgoingDirection).toBe("e");
		expect(tile1.incomingDirections).toContain("w");
	});

	it("B2 sorts incoming directions canonically at confluences", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		const confluenceTile = result.tileGeometry[4];
		expect(confluenceTile.incomingDirections.length).toBeGreaterThan(1);
		expect(confluenceTile.incomingDirections).toEqual(["n", "w"]);
	});

	it("B3 assigns null outgoing direction on terminal tiles", () => {
		const result = deriveStreamNetwork({
			...confluenceFixture,
			originPredicate: includeAllOrigins,
		});
		const terminalIds = result.streams.map((stream) => stream.terminalTileId);
		expect(terminalIds.length).toBeGreaterThan(0);
		for (const tileId of terminalIds) {
			expect(result.tileGeometry[tileId].outgoingDirection).toBeNull();
		}
	});

	it("B4 never emits more than one outgoing direction per tile", () => {
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
