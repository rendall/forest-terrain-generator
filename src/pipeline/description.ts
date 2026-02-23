export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type Visibility = "short" | "medium" | "long";

export type WaterClass = "none" | "marsh" | "stream" | "lake";

type KnownBiome =
	| "spruce_swamp"
	| "pine_heath"
	| "mixed_forest"
	| "open_bog"
	| "esker_pine"
	| "stream_bank"
	| "lake";

type KnownLandform =
	| "ridge"
	| "basin"
	| "plain"
	| "flat"
	| "low_rise"
	| "slope"
	| "valley";

const KNOWN_BIOMES = new Set<KnownBiome>([
	"spruce_swamp",
	"pine_heath",
	"mixed_forest",
	"open_bog",
	"esker_pine",
	"stream_bank",
	"lake",
]);

const KNOWN_LANDFORMS = new Set<KnownLandform>([
	"ridge",
	"basin",
	"plain",
	"flat",
	"low_rise",
	"slope",
	"valley",
]);

export type Obstacle =
	| "windthrow"
	| "deadfall"
	| "boulder"
	| "fallen_log"
	| "root_tangle"
	| "brush_blockage";

export interface NeighborSignal {
	biome: string;
	water: WaterClass;
	elevDelta: number;
	densityDelta: number;
}

export interface DescriptionTileInput {
	biome: string;
	landform: string;
	moisture: number;
	standingWater: boolean;
	slopeDirection: Direction;
	slopeStrength: number;
	obstacles: Obstacle[];
	visibility: Visibility;
	neighbors: Record<Direction, NeighborSignal>;
}

export interface DescriptionSentence {
	slot:
		| "landform"
		| "biome"
		| "hydrology"
		| "obstacle"
		| "slope"
		| "visibility"
		| "directional";
	text: string;
}

export interface DescriptionResult {
	sentences: DescriptionSentence[];
	text: string;
}

export interface DescriptionGenerationOptions {
	strict?: boolean;
}

export interface MissingPhraseDetail {
	slot: DescriptionSentence["slot"];
	key: string;
}

export class DescriptionPhraseError extends Error {
	public readonly code = "phrase_library_missing";
	public readonly details: MissingPhraseDetail[];

	public constructor(details: MissingPhraseDetail[]) {
		super(
			`Missing phrase options for: ${details
				.map((detail) => `${detail.slot}:${detail.key}`)
				.join(", ")}.`,
		);
		this.name = "DescriptionPhraseError";
		this.details = details;
	}
}

export function isKnownDescriptionBiome(biome: string): biome is KnownBiome {
	return KNOWN_BIOMES.has(biome as KnownBiome);
}

export function isKnownDescriptionLandform(
	landform: string,
): landform is KnownLandform {
	return KNOWN_LANDFORMS.has(landform as KnownLandform);
}

const DEFAULT_LANDFORM_PHRASES = [
	"The forest floor shifts between subtle rises and hollows.",
	"The ground changes gently across this stretch of trees.",
	"The terrain here varies without any sharp breaks.",
];

const LANDFORM_PHRASES: Partial<Record<KnownLandform, string[]>> = {
	ridge: [
		"A low ridge runs through the trees here.",
		"The ground rises onto a narrow spine of higher earth.",
		"The footing sits slightly above the surrounding low ground.",
		"A gentle crest lifts the forest floor along this stretch.",
		"The land forms a shallow high line between lower areas.",
	],
	basin: [
		"The land dips into a shallow basin.",
		"The ground lies low here, holding moisture in the hollow.",
		"This spot sits in a gentle bowl of lower ground.",
		"The terrain settles into a low pocket among the trees.",
		"The forest floor drops into a broad, low depression.",
	],
	plain: [
		"The ground is mostly level here.",
		"The terrain lies flat beneath the trees.",
		"The forest floor runs even with little rise or fall.",
		"The land is low and level across this patch.",
		"The ground stays level between the trunks.",
	],
	flat: [
		"The ground is mostly level here.",
		"The terrain lies flat beneath the trees.",
		"The forest floor runs even with little rise or fall.",
		"The land is low and level across this patch.",
		"The ground stays level between the trunks.",
	],
	low_rise: [
		"The ground breaks into small rises and shallow dips.",
		"Low hummocks and minor hollows interrupt the forest floor.",
		"The terrain is uneven with gentle undulations.",
		"Small rises of firmer ground alternate with lower patches.",
		"The forest floor shifts subtly between higher and lower spots.",
	],
	slope: [
		"The ground slopes gently across this stretch of forest.",
		"The terrain leans steadily in one direction.",
		"The forest floor tilts at a noticeable angle.",
		"The land rises on one side and falls on the other.",
		"A steady incline runs through the trees here.",
	],
	valley: [
		"The land narrows into a shallow valley between higher ground.",
		"The forest follows a low trough through this area.",
		"The terrain forms a subtle valley between gentle rises.",
		"A broad dip runs between higher patches of forest.",
		"The ground settles into a low corridor between slopes.",
	],
};

const DEFAULT_BIOME_PHRASES = [
	"Conifers and birch share this patch in an uneven stand.",
	"Tree cover varies here, with denser and lighter pockets.",
	"Mixed woodland fills the area at a moderate density.",
];

const BIOME_PHRASES: Partial<Record<KnownBiome, string[]>> = {
	spruce_swamp: [
		"Spruce dominate here, growing close together.",
		"Dense spruce stand in tight ranks across the low ground.",
		"The trees are mostly spruce, with little open space between trunks.",
		"Dark spruce crowd the area, narrowing the lines of sight.",
		"A thick stand of spruce fills this wet stretch of forest.",
		"Spruce grow densely over soft ground here.",
		"The forest is heavy with spruce on all sides.",
		"Close-set spruce and low branches define this patch of trees.",
		"Spruce cover is dense enough to break the view into short intervals.",
		"The tree cover is dominated by spruce, thickest in the low spots.",
	],
	pine_heath: [
		"Pine dominate here, spaced widely enough for open sightlines.",
		"Tall pines stand apart over drier ground.",
		"The forest here is mostly pine, with light between trunks.",
		"Pines rise above low ground cover in an open stand.",
		"A dry pine stand stretches across this higher patch.",
		"Pine and low undergrowth define the ground here.",
		"The trees are mostly pine, with sparse lower growth.",
		"Pines stand in a scattered pattern across firm footing.",
		"The pine stand opens enough to see well between trunks.",
		"Pine dominate this stretch, with little dense brush.",
	],
	mixed_forest: [
		"Birch and spruce mix together across this patch of forest.",
		"The stand alternates between lighter birch and darker spruce.",
		"Mixed trees break up the canopy, with birch among spruce.",
		"Birch appear regularly among the conifers here.",
		"The forest is mixed, with both spruce and birch present.",
		"Birch trunks brighten parts of the stand among darker conifers.",
		"The tree cover shifts between birch and spruce across short distances.",
		"Spruce and birch share the ground here in an uneven mix.",
		"Mixed woodland fills this area, neither fully open nor fully dense.",
		"The canopy is varied, with birch scattered through conifer growth.",
	],
	esker_pine: [
		"Pine dominate this higher, drier ground.",
		"A stand of pine covers the raised ridge here.",
		"The forest here is mostly pine over firm soil.",
		"Tall pines follow the higher ground in a narrow band.",
		"The trees are pine, spaced along elevated terrain.",
		"Pine grow over sandy, well-drained soil.",
		"The raised ground supports an open pine stand.",
		"Pine form a dry crest above the surrounding low areas.",
	],
	lake: [
		"Open water covers this area.",
		"A broad stretch of still water lies here.",
		"The surface is open water with little vegetation.",
		"This spot is part of a lake.",
		"Water extends across this low-lying ground.",
		"The forest gives way here to open water.",
		"The area is occupied by still lake water.",
	],
	open_bog: [
		"Trees thin out across open, wet ground.",
		"Low growth and scattered trees cover the boggy surface.",
		"The forest loosens here into open, saturated ground.",
		"Sparse trees stand over low, wet terrain.",
		"Open bog replaces denser forest in this patch.",
		"The ground is wet and open with only scattered trees.",
		"Vegetation is low and broken across this bog.",
		"Tree cover is sparse over the saturated ground.",
	],
	stream_bank: [
		"Trees line the edge of a nearby stream.",
		"The forest follows the course of running water here.",
		"The ground sits close to a small stream.",
		"Vegetation thickens along the stream bank.",
		"The forest edge runs beside moving water.",
		"Trees grow along the narrow channel nearby.",
		"The stand adjusts to the presence of running water.",
	],
};

const STANDING_WATER_PHRASES = [
	"Shallow standing water lies in low pockets.",
	"Water collects in small pools across the ground.",
	"Pooled water sits between hummocks and roots.",
	"The low ground holds water in scattered patches.",
	"Thin sheets of water cover parts of the surface.",
	"Small pools remain where the ground dips.",
];

const STREAM_PHRASES = [
	"a narrow run of water lies nearby",
	"running water can be heard close by",
	"a small stream is close enough to track between the trees",
	"a thread of moving water passes nearby through the low ground",
	"the sound of a stream carries from a short distance away",
];

const LAKE_PHRASES = [
	"open water lies nearby beyond the trees",
	"the forest edges toward a lake a short distance away",
	"a wider, still body of water is visible through gaps in the trunks",
	"the tree line thins toward open water nearby",
	"the ground slopes toward a lakeshore not far from here",
];

const ROOT_TANGLE_PHRASES = [
	"Roots spread across the surface in dense, interwoven lines.",
	"Thick roots cross the ground in irregular patterns.",
	"The surface is threaded with exposed roots.",
	"Interlocking roots rise slightly above the soil.",
	"A network of roots breaks up the forest floor.",
	"Broad root systems run close to the surface here.",
	"Roots form a rough lattice over the ground.",
	"The ground is marked by raised, twisting roots.",
];

const OBSTACLE_PHRASES: Record<Exclude<Obstacle, "root_tangle">, string[]> = {
	boulder: [
		"A large boulder stands among the trees, mottled with lichen.",
		"A heavy erratic boulder breaks the line of trunks nearby.",
		"Stones and one prominent boulder sit on firmer ground.",
		"A broad rock rises from the forest floor near the trees.",
	],
	windthrow: [
		"Uprooted trees lie tangled together across the ground.",
		"Windthrown trunks and broken branches cover parts of the area.",
		"Several fallen trees lie crossed and piled in a rough tangle.",
		"Deadfall and snapped limbs are scattered over the forest floor.",
	],
	deadfall: [
		"Uprooted trees lie tangled together across the ground.",
		"Windthrown trunks and broken branches cover parts of the area.",
		"Several fallen trees lie crossed and piled in a rough tangle.",
		"Deadfall and snapped limbs are scattered over the forest floor.",
	],
	fallen_log: [
		"Several fallen trees lie crossed and piled in a rough tangle.",
		"Deadfall and snapped limbs are scattered over the forest floor.",
		"Windthrown trunks and broken branches cover parts of the area.",
		"Uprooted trees lie tangled together across the ground.",
	],
	brush_blockage: [
		"Dense lower growth fills the gaps between trunks.",
		"Thick brush and young growth narrow the open paths.",
		"Close undergrowth makes movement uneven between the trees.",
		"Low branches and brush form a thicker barrier in places.",
	],
};

const VISIBILITY_PHRASES: Record<Visibility, string[]> = {
	short: [
		"Sightlines are short between trunks and lower branches.",
		"The view is cut into short distances by dense growth.",
		"Close trees and undergrowth limit visibility here.",
		"The ground is cluttered enough to slow a direct line.",
	],
	medium: [],
	long: [
		"The trees are spaced enough for long sightlines.",
		"The stand is open, with clear lines between trunks.",
		"Visibility runs well through this patch of forest.",
		"The ground is open enough for a direct route.",
	],
};

const DIRECTIONAL_CONNECTORS: Record<Direction, string> = {
	N: "To the north",
	NE: "To the northeast",
	E: "To the east",
	SE: "To the southeast",
	S: "To the south",
	SW: "To the southwest",
	W: "To the west",
	NW: "To the northwest",
};

const CARDINALS: Direction[] = ["N", "E", "S", "W"];
const DIAGONALS: Direction[] = ["NE", "SE", "SW", "NW"];

function hash32(text: string): number {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pickDeterministic<T>(items: readonly T[], seedKey: string): T {
	return items[hash32(seedKey) % items.length] as T;
}

function requirePhraseOptions(
	options: readonly string[] | undefined,
	detail: MissingPhraseDetail,
	strict: boolean,
	lenientFallback: readonly string[] = [],
): readonly string[] | null {
	if (options && options.length > 0) {
		return options;
	}
	if (strict) {
		throw new DescriptionPhraseError([detail]);
	}
	return lenientFallback.length > 0 ? lenientFallback : null;
}

function phraseOptionsForLandform(
	landform: string,
	strict: boolean,
): readonly string[] {
	return requirePhraseOptions(
		LANDFORM_PHRASES[landform as KnownLandform],
		{ slot: "landform", key: landform },
		strict,
		DEFAULT_LANDFORM_PHRASES,
	) as readonly string[];
}

function phraseOptionsForBiome(
	biome: string,
	strict: boolean,
): readonly string[] {
	return requirePhraseOptions(
		BIOME_PHRASES[biome as KnownBiome],
		{ slot: "biome", key: biome },
		strict,
		DEFAULT_BIOME_PHRASES,
	) as readonly string[];
}

function chooseSlopeBand(
	slopeStrength: number,
): "gentle" | "noticeable" | "steep" | null {
	if (slopeStrength < 0.03) {
		return null;
	}
	if (slopeStrength < 0.07) {
		return "gentle";
	}
	if (slopeStrength < 0.12) {
		return "noticeable";
	}
	return "steep";
}

function renderSlopeSentence(input: DescriptionTileInput): string | null {
	const band = chooseSlopeBand(input.slopeStrength);
	if (!band) {
		return null;
	}

	if (band === "gentle") {
		return `${DIRECTIONAL_CONNECTORS[input.slopeDirection]}, the ground slopes gently.`;
	}
	if (band === "noticeable") {
		return `${DIRECTIONAL_CONNECTORS[input.slopeDirection]}, the ground slopes noticeably.`;
	}
	return `${DIRECTIONAL_CONNECTORS[input.slopeDirection]}, the slope is steep enough to stand out clearly.`;
}

function directionalSignalStrength(neighbor: NeighborSignal): number {
	let score = 0;
	if (neighbor.water === "lake") {
		score += 1.4;
	} else if (neighbor.water === "stream") {
		score += 1.2;
	} else if (neighbor.water === "marsh") {
		score += 0.7;
	}
	score += Math.abs(neighbor.elevDelta) * 3;
	score += Math.abs(neighbor.densityDelta) * 2;
	return score;
}

function chooseDirectional(input: DescriptionTileInput): Direction | null {
	let best: { dir: Direction; score: number; water: WaterClass } | null = null;

	for (const dir of CARDINALS) {
		const neighbor = input.neighbors[dir];
		const score = directionalSignalStrength(neighbor);
		if (!best || score > best.score) {
			best = { dir, score, water: neighbor.water };
		}
	}

	let bestDiagonal: {
		dir: Direction;
		score: number;
		water: WaterClass;
	} | null = null;
	for (const dir of DIAGONALS) {
		const neighbor = input.neighbors[dir];
		const score = directionalSignalStrength(neighbor);
		if (!bestDiagonal || score > bestDiagonal.score) {
			bestDiagonal = { dir, score, water: neighbor.water };
		}
	}

	if (!best) {
		return null;
	}

	const diagonalCanOverride =
		bestDiagonal !== null &&
		(input.visibility === "long" || bestDiagonal.score >= best.score * 1.2) &&
		bestDiagonal.score > 0.5;

	if (diagonalCanOverride && bestDiagonal) {
		return bestDiagonal.dir;
	}

	return best.score > 0.5 ? best.dir : null;
}

function renderDirectionalSentence(
	input: DescriptionTileInput,
	seedKey: string,
	strict: boolean,
): string | null {
	const direction = chooseDirectional(input);
	if (!direction) {
		return null;
	}

	const neighbor = input.neighbors[direction];
	const connector = DIRECTIONAL_CONNECTORS[direction];

	if (neighbor.water === "lake") {
		const lakeOptions = requirePhraseOptions(
			LAKE_PHRASES,
			{ slot: "directional", key: "lake" },
			strict,
		);
		if (!lakeOptions) {
			return null;
		}
		const phrase = pickDeterministic(
			lakeOptions,
			`${seedKey}:dir:lake:${direction}`,
		);
		return `${connector}, ${phrase}.`;
	}
	if (neighbor.water === "stream") {
		const streamOptions = requirePhraseOptions(
			STREAM_PHRASES,
			{ slot: "directional", key: "stream" },
			strict,
		);
		if (!streamOptions) {
			return null;
		}
		const phrase = pickDeterministic(
			streamOptions,
			`${seedKey}:dir:stream:${direction}`,
		);
		return `${connector}, ${phrase}.`;
	}
	if (neighbor.water === "marsh") {
		return `${connector}, the ground becomes wetter.`;
	}

	if (neighbor.densityDelta >= 0.15) {
		return `${connector}, the forest grows denser.`;
	}
	if (neighbor.densityDelta <= -0.15) {
		return `${connector}, the trees thin slightly.`;
	}
	if (neighbor.elevDelta >= 0.08) {
		return `${connector}, the land rises onto firmer earth.`;
	}
	if (neighbor.elevDelta <= -0.08) {
		return `${connector}, the ground falls away.`;
	}

	return null;
}

function obstaclePriority(obstacle: Obstacle): number {
	switch (obstacle) {
		case "windthrow":
			return 0;
		case "deadfall":
			return 1;
		case "boulder":
			return 2;
		case "fallen_log":
			return 3;
		case "root_tangle":
			return 4;
		case "brush_blockage":
			return 5;
	}
}

function chooseObstacle(input: DescriptionTileInput): Obstacle | null {
	if (input.obstacles.length === 0) {
		return null;
	}
	return (
		[...input.obstacles].sort(
			(a, b) => obstaclePriority(a) - obstaclePriority(b),
		)[0] ?? null
	);
}

function renderObstacleSentence(
	input: DescriptionTileInput,
	seedKey: string,
	strict: boolean,
): string | null {
	const obstacle = chooseObstacle(input);
	if (!obstacle) {
		return null;
	}
	if (obstacle === "root_tangle") {
		const rootOptions = requirePhraseOptions(
			ROOT_TANGLE_PHRASES,
			{ slot: "obstacle", key: "root_tangle" },
			strict,
		);
		if (!rootOptions) {
			return null;
		}
		return pickDeterministic(rootOptions, `${seedKey}:obstacle:root_tangle`);
	}

	const options = requirePhraseOptions(
		OBSTACLE_PHRASES[obstacle],
		{ slot: "obstacle", key: obstacle },
		strict,
	);
	if (!options) {
		return null;
	}
	return pickDeterministic(options, `${seedKey}:obstacle:${obstacle}`);
}

function shouldIncludeBothAnchors(input: DescriptionTileInput): boolean {
	if (input.landform === "ridge" || input.landform === "basin") {
		return true;
	}

	return CARDINALS.some((dir) => input.neighbors[dir].biome !== input.biome);
}

function shouldMentionWater(input: DescriptionTileInput): boolean {
	if (input.standingWater) {
		return true;
	}

	for (const dir of [...CARDINALS, ...DIAGONALS]) {
		const water = input.neighbors[dir].water;
		if (water === "lake" || water === "stream") {
			return true;
		}
	}

	return input.moisture >= 0.65;
}

function sanitizeSentence(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function generateRawDescription(
	input: DescriptionTileInput,
	seedKey: string,
	options: DescriptionGenerationOptions = {},
): DescriptionResult {
	const strict = options.strict === true;
	const sentences: DescriptionSentence[] = [];

	const includeBothAnchors = shouldIncludeBothAnchors(input);

	const landformSentence = pickDeterministic(
		phraseOptionsForLandform(input.landform, strict),
		`${seedKey}:landform:${input.landform}`,
	);
	const biomeSentence = pickDeterministic(
		phraseOptionsForBiome(input.biome, strict),
		`${seedKey}:biome:${input.biome}`,
	);

	if (includeBothAnchors) {
		sentences.push({ slot: "landform", text: landformSentence });
		sentences.push({ slot: "biome", text: biomeSentence });
	} else {
		sentences.push({ slot: "biome", text: biomeSentence });
	}

	if (shouldMentionWater(input)) {
		if (input.standingWater) {
			const standingOptions = requirePhraseOptions(
				STANDING_WATER_PHRASES,
				{ slot: "hydrology", key: "standing_water" },
				strict,
			);
			if (standingOptions) {
				sentences.push({
					slot: "hydrology",
					text: pickDeterministic(
						standingOptions,
						`${seedKey}:hydrology:standing`,
					),
				});
			}
		}
	}

	const obstacleSentence = renderObstacleSentence(input, seedKey, strict);
	if (obstacleSentence) {
		sentences.push({ slot: "obstacle", text: obstacleSentence });
	}

	if (input.landform !== "slope") {
		const slopeSentence = renderSlopeSentence(input);
		if (slopeSentence) {
			sentences.push({ slot: "slope", text: slopeSentence });
		}
	}

	const directionalSentence = renderDirectionalSentence(input, seedKey, strict);
	if (directionalSentence) {
		const existingDirectional = sentences.some(
			(sentence) => sentence.slot === "directional",
		);
		if (!existingDirectional) {
			sentences.push({ slot: "directional", text: directionalSentence });
		}
	}

	if (input.visibility !== "medium") {
		const visibilityOptions = requirePhraseOptions(
			VISIBILITY_PHRASES[input.visibility as Visibility],
			{ slot: "visibility", key: input.visibility },
			strict,
		);
		if (visibilityOptions) {
			const visibilitySentence = pickDeterministic(
				visibilityOptions,
				`${seedKey}:visibility:${input.visibility}`,
			);
			sentences.push({ slot: "visibility", text: visibilitySentence });
		}
	}

	const capped = sentences.slice(0, 4).map((sentence) => ({
		slot: sentence.slot,
		text: sanitizeSentence(sentence.text),
	}));

	return {
		sentences: capped,
		text: capped.map((sentence) => sentence.text).join(" "),
	};
}
