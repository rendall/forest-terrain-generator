export type Mode = "generate" | "derive" | "debug";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export interface BaseInputs {
	seed?: string;
	width?: number;
	height?: number;
	params?: JsonObject;
	inputFilePath?: string;
	mapHPath?: string;
	mapRPath?: string;
	mapVPath?: string;
	outputFile?: string;
	outputDir?: string;
	debugOutputFile?: string;
	force?: boolean;
}

export interface CliArgs {
	seed?: string;
	width?: number;
	height?: number;
	paramsPath?: string;
	inputFilePath?: string;
	mapHPath?: string;
	mapRPath?: string;
	mapVPath?: string;
	outputFile?: string;
	outputDir?: string;
	debugOutputFile?: string;
	force: boolean;
}

export interface RunRequest {
	mode: Mode;
	args: CliArgs;
	cwd: string;
}

export interface ResolvedInputs {
	seed?: string;
	width?: number;
	height?: number;
	params: JsonObject;
	paramsPath?: string;
	inputFilePath?: string;
	mapHPath?: string;
	mapRPath?: string;
	mapVPath?: string;
	outputFile?: string;
	outputDir?: string;
	debugOutputFile?: string;
	force: boolean;
}

export interface TerrainEnvelopeMeta {
	specVersion: string;
}

export interface TerrainEnvelope {
	meta: TerrainEnvelopeMeta;
	tiles: JsonObject[];
}
