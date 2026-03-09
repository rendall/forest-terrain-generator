export type StreamDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type StreamTerminalKind = "confluence" | "sink" | "error";

export interface TileStreamGeometry {
	outgoingDirection: StreamDirection | null;
	incomingDirections: StreamDirection[];
}

export interface StreamFeature {
	id: string;
	originTileId: number;
	pathTileIds: number[];
	terminalTileId: number;
	terminalKind: StreamTerminalKind;
}
