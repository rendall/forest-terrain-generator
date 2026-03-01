import { InputValidationError } from "../domain/errors.js";
import { suggestClosest } from "../lib/suggest.js";

const VALUE_FLAGS = new Set<string>([
	"--seed",
	"--width",
	"--height",
	"--params",
	"--input-file",
	"--map-h",
	"--map-r",
	"--map-v",
	"--output-file",
	"--output-dir",
	"--debug-output-file",
	"--layer",
]);

const BOOLEAN_FLAGS = new Set<string>([
	"--force",
	"--landforms",
	"--landscape",
	"--help",
	"-h",
	"--version",
	"-V",
]);
const ALL_FLAGS = [...VALUE_FLAGS, ...BOOLEAN_FLAGS];

function parseTokenFlag(token: string): string {
	const eqIndex = token.indexOf("=");
	return eqIndex === -1 ? token : token.slice(0, eqIndex);
}

function unknownFlagError(flag: string): InputValidationError {
	const suggestion = suggestClosest(flag, ALL_FLAGS);
	const hint = suggestion ? ` Did you mean ${suggestion}?` : "";
	return new InputValidationError(`Unknown CLI flag "${flag}".${hint}`);
}

export function validateArgv(argv: readonly string[]): void {
	const seen = new Set<string>();

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];

		if (!token.startsWith("-")) {
			continue;
		}

		if (
			token === "-h" ||
			token === "--help" ||
			token === "-V" ||
			token === "--version"
		) {
			continue;
		}

		if (!token.startsWith("--")) {
			throw unknownFlagError(token);
		}

		const flag = parseTokenFlag(token);
		const hasInlineValue = token.includes("=");
		const isKnownValueFlag = VALUE_FLAGS.has(flag);
		const isKnownBooleanFlag = BOOLEAN_FLAGS.has(flag);

		if (!isKnownValueFlag && !isKnownBooleanFlag) {
			throw unknownFlagError(flag);
		}

		if (seen.has(flag)) {
			throw new InputValidationError(
				`Duplicate CLI flag "${flag}" is not allowed. Provide it only once.`,
			);
		}
		seen.add(flag);

		if (isKnownValueFlag && !hasInlineValue) {
			i += 1;
		}
	}
}
