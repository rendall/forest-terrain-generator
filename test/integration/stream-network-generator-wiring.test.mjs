import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

const makeTempDir = async () => {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-stream-network-"),
	);
	tempDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("stream-network generator wiring", () => {
	it("writes features.streams in generator output using the stream feature schema fields", async () => {
		const cwd = await makeTempDir();
		const outputFile = join(cwd, "out.json");

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "101",
				width: 8,
				height: 8,
				outputFile,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		expect(Array.isArray(envelope.features.streams)).toBe(true);
		expect(envelope.features.streams.length).toBeGreaterThan(0);
		expect(envelope.features.streams[0]).toEqual(
			expect.objectContaining({
				id: expect.any(String),
				originTileId: expect.any(Number),
				pathTileIds: expect.any(Array),
				terminalTileId: expect.any(Number),
				terminalKind: expect.stringMatching(/^(confluence|sink|error)$/),
			}),
		);
	});

	it("adds hydrology.stream geometry to each output tile with valid direction values", async () => {
		const cwd = await makeTempDir();
		const outputFile = join(cwd, "out.json");

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "102",
				width: 8,
				height: 8,
				outputFile,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		expect(Array.isArray(envelope.tiles)).toBe(true);
		expect(envelope.tiles.length).toBe(64);
		let nonNullOutgoingCount = 0;
		for (const tile of envelope.tiles) {
			expect(tile.hydrology.stream).toEqual(
				expect.objectContaining({
					incomingDirections: expect.any(Array),
				}),
			);
			expect([null, "n", "ne", "e", "se", "s", "sw", "w", "nw"]).toContain(
				tile.hydrology.stream.outgoingDirection,
			);
			if (tile.hydrology.stream.outgoingDirection !== null) {
				nonNullOutgoingCount += 1;
			}
		}
		if (nonNullOutgoingCount === 0) {
			const observedSummary = envelope.tiles
				.map((tile) => tile.hydrology.stream.outgoingDirection)
				.join(", ");
			throw new Error(
				`expected at least one non-null outgoing stream direction, observed outgoingDirection values: [${observedSummary}]`,
			);
		}
		expect(nonNullOutgoingCount).toBeGreaterThan(0);
	});

	it("produces identical stream feature and tile stream geometry outputs across repeat runs", async () => {
		const firstCwd = await makeTempDir();
		const secondCwd = await makeTempDir();
		const firstOutput = join(firstCwd, "out.json");
		const secondOutput = join(secondCwd, "out.json");
		const args = {
			seed: "103",
			width: 8,
			height: 8,
			force: false,
		};

		await runGenerator({
			mode: "generate",
			cwd: firstCwd,
			args: {
				...args,
				outputFile: firstOutput,
			},
		});
		await runGenerator({
			mode: "generate",
			cwd: secondCwd,
			args: {
				...args,
				outputFile: secondOutput,
			},
		});

		const firstEnvelope = JSON.parse(await readFile(firstOutput, "utf8"));
		const secondEnvelope = JSON.parse(await readFile(secondOutput, "utf8"));
		expect(firstEnvelope.features.streams.length).toBeGreaterThan(0);
		expect(firstEnvelope.features.streams).toEqual(
			secondEnvelope.features.streams,
		);
		expect(firstEnvelope.tiles.map((tile) => tile.hydrology.stream)).toEqual(
			secondEnvelope.tiles.map((tile) => tile.hydrology.stream),
		);
	});
});
