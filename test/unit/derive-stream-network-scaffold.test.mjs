import { describe, expect, it } from "vitest";
import { DIR8_CODE } from "../../src/domain/hydrology.js";
import {
	canonicalDirectionIndex,
	createEmptyTileStreamGeometry,
	deriveStreamNetwork,
	directionBetween,
	STREAM_DIRECTIONS,
} from "../../src/pipeline/derive-stream-network.js";
import { createStreamFixture } from "./helpers/stream-fixtures.mjs";

describe("derive-stream-network scaffolding", () => {
	it("provides deterministic empty stream output by default", () => {
		const fixture = createStreamFixture({
			width: 3,
			height: 2,
			hValues: [0.9, 0.7, 0.6, 0.4, 0.2, 0.1],
			faValues: [5, 5, 5, 4, 2, 1],
		});

		const resultA = deriveStreamNetwork(fixture);
		const resultB = deriveStreamNetwork(fixture);
		expect(resultA).toEqual(resultB);
		expect(resultA.streams).toEqual([]);
		expect(resultA.tileGeometry).toHaveLength(fixture.shape.size);
		expect(
			resultA.tileGeometry.every((tile) => tile.outgoingDirection === null),
		).toBe(true);
		expect(
			resultA.tileGeometry.every(
				(tile) => tile.incomingDirections.length === 0,
			),
		).toBe(true);
	});

	it("derives canonical stream directions from DIR8_CODE ordering", () => {
		const expected = Object.entries(DIR8_CODE)
			.sort(([, left], [, right]) => left - right)
			.map(([direction]) => direction);
		expect(STREAM_DIRECTIONS).toEqual(expected);
		expect(canonicalDirectionIndex("e")).toBe(0);
		expect(canonicalDirectionIndex("ne")).toBe(expected.length - 1);
	});

	it("returns direction only for immediate 8-neighbor tiles", () => {
		const fixture = createStreamFixture({
			width: 3,
			height: 3,
			hValues: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
			faValues: [1, 1, 1, 1, 1, 1, 1, 1, 1],
		});

		expect(directionBetween(fixture.shape, 4, 5)).toBe("e");
		expect(directionBetween(fixture.shape, 4, 0)).toBe("nw");
		expect(directionBetween(fixture.shape, 4, 8)).toBe("se");
		expect(directionBetween(fixture.shape, 4, 7)).toBe("s");
		expect(directionBetween(fixture.shape, 0, 8)).toBeNull();
	});

	it("creates fresh empty geometry objects per tile", () => {
		const geometry = createEmptyTileStreamGeometry(2);
		expect(geometry).toEqual([
			{ outgoingDirection: null, incomingDirections: [] },
			{ outgoingDirection: null, incomingDirections: [] },
		]);
		geometry[0].incomingDirections.push("e");
		expect(geometry[1].incomingDirections).toEqual([]);
	});
});
