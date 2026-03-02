import {
	runStreamTrace,
	writeStreamOverlayPpm,
	type StreamCliArgs,
	type StreamRequest,
} from "./run-stream.js";

export interface HydrologyInspectorCliArgs extends StreamCliArgs {
	sinkMode?: "strict_local" | "overflow_guided";
}

export interface HydrologyInspectorRequest {
	args: HydrologyInspectorCliArgs;
	cwd: string;
}

export const runHydrologyInspectorTrace = async (
	request: HydrologyInspectorRequest,
) => {
	const sinkMode = request.args.sinkMode ?? "strict_local";
	const streamRequest: StreamRequest = {
		cwd: request.cwd,
		args: {
			...request.args,
			overflow: sinkMode === "overflow_guided",
		},
	};
	return runStreamTrace(streamRequest);
};

export const writeHydrologyInspectorOverlayPpm = writeStreamOverlayPpm;
