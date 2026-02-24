import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const MAIN_CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
const DESCRIBE_CLI_ENTRY = resolve(process.cwd(), "src/cli/describe.ts");
const tempDirs = [];

function runCli(entry, args = []) {
	return new Promise((resolveResult, rejectResult) => {
		const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
			cwd: process.cwd(),
			env: { ...process.env, FORCE_COLOR: "0" },
		});

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		child.once("error", rejectResult);
		child.once("close", (code) => {
			resolveResult({
				code: code ?? 0,
				stdout,
				stderr,
			});
		});
	});
}

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("describe CLI", () => {
	it("writes envelope copy with string descriptions", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const describedFile = join(dir, "described.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"42",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const describeResult = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			describedFile,
		]);
		expect(describeResult.code).toBe(0);

		const parsed = JSON.parse(await readFile(describedFile, "utf8"));
		expect(parsed.meta.specVersion).toBe("forest-terrain-v1");
		expect(parsed.tiles).toHaveLength(16);
		expect(typeof parsed.tiles[0].description).toBe("string");
		expect(parsed.tiles[0].description.length).toBeGreaterThan(0);
		expect(parsed.tiles[0].descriptionStructured).toBeUndefined();
		expect(parsed.tiles[0].descriptionDebug).toBeUndefined();
	});

	it("emits descriptionStructured when --include-structured is provided", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const describedFile = join(dir, "described-structured.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"7",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const describeResult = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			describedFile,
			"--include-structured",
		]);
		expect(describeResult.code).toBe(0);

		const parsed = JSON.parse(await readFile(describedFile, "utf8"));
		const first = parsed.tiles[0];
		expect(typeof first.description).toBe("string");
		expect(first.descriptionStructured).toBeDefined();
		expect(first.descriptionStructured.text).toBe(first.description);
		expect(Array.isArray(first.descriptionStructured.sentences)).toBe(true);
		expect(
			Array.isArray(first.descriptionStructured.sentences[0].contributors),
		).toBe(true);
		expect(
			typeof first.descriptionStructured.sentences[0].contributorKeys,
		).toBe("object");
		const movementSentence = first.descriptionStructured.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		if (movementSentence) {
			expect(Array.isArray(movementSentence.movement)).toBe(true);
			expect(["passage", "blockage"]).toContain(
				movementSentence.movement[0].type,
			);
			expect(Array.isArray(movementSentence.movement[0].directions)).toBe(true);
		}
	});

	it("follows output overwrite policy and supports --force", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const describedFile = join(dir, "described.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"99",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const firstDescribe = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			describedFile,
		]);
		expect(firstDescribe.code).toBe(0);

		const secondWithoutForce = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			describedFile,
		]);
		expect(secondWithoutForce.code).toBe(2);
		expect(secondWithoutForce.stderr).toContain("Output file already exists");

		const thirdWithForce = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			describedFile,
			"--force",
		]);
		expect(thirdWithForce.code).toBe(0);
	});

	it("marks unknown taxonomy as failure in --strict mode", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const strictSourceFile = join(dir, "source-strict.json");
		const describedFile = join(dir, "described-strict.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"123",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const source = JSON.parse(await readFile(sourceFile, "utf8"));
		source.tiles[0].ecology.biome = "alien_biome";
		await writeFile(
			strictSourceFile,
			`${JSON.stringify(source, null, 2)}\n`,
			"utf8",
		);

		const describeResult = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			strictSourceFile,
			"--output-file",
			describedFile,
			"--strict",
			"--include-structured",
		]);
		expect(describeResult.code).toBe(0);

		const described = JSON.parse(await readFile(describedFile, "utf8"));
		const first = described.tiles[0];
		expect(first.description).toBeNull();
		expect(first.descriptionStructured).toBeNull();
		expect(first.descriptionDebug).toEqual({
			code: "unknown_taxonomy",
			message:
				"Unknown biome/landform encountered in strict mode for description generation.",
			x: 0,
			y: 0,
			unknownBiome: "alien_biome",
		});
	});

	it("marks malformed passability as per-tile failure", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const malformedSourceFile = join(dir, "source-malformed-passability.json");
		const describedFile = join(dir, "described-malformed-passability.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"321",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const source = JSON.parse(await readFile(sourceFile, "utf8"));
		delete source.tiles[0].navigation.passability.NE;
		await writeFile(
			malformedSourceFile,
			`${JSON.stringify(source, null, 2)}\n`,
			"utf8",
		);

		const describeResult = await runCli(DESCRIBE_CLI_ENTRY, [
			"--input-file",
			malformedSourceFile,
			"--output-file",
			describedFile,
			"--include-structured",
		]);
		expect(describeResult.code).toBe(0);

		const described = JSON.parse(await readFile(describedFile, "utf8"));
		const first = described.tiles[0];
		expect(first.description).toBeNull();
		expect(first.descriptionStructured).toBeNull();
		expect(first.descriptionDebug).toEqual({
			code: "malformed_passability",
			message:
				"Tile navigation.passability is missing or malformed for description generation.",
			x: 0,
			y: 0,
		});
	});
});
