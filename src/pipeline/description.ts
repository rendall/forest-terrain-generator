export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type Passability = "passable" | "difficult" | "blocked";
export type PassabilityByDir = Record<Direction, Passability>;

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
	followable?: readonly string[];
}

export interface DescriptionTileInput {
	biome: string;
	landform: string;
	moisture: number;
	standingWater: boolean;
	passability: PassabilityByDir;
	flowDirection?: Direction | "NONE" | null;
	slopeDirection: Direction;
	slopeStrength: number;
	obstacles: Obstacle[];
	followable: string[];
	visibility: Visibility;
	neighbors: Record<Direction, NeighborSignal>;
}

export interface PassageRun {
	type: "passage";
	directions: Direction[];
}

export interface BlockageRun {
	type: "blockage";
	directions: Direction[];
	blockedBy?: string;
}

export type MovementRun = PassageRun | BlockageRun;

interface BlockageRunContext {
	biome: string;
	landform: string;
	obstacles: readonly string[];
	slopeStrength: number;
	followable: readonly string[];
	runDirections: Direction[];
	neighborWater: WaterClass[];
	neighborElevDelta: number[];
}

interface BlockedPhraseRule {
	id: string;
	when: (ctx: BlockageRunContext) => boolean;
	phrases: readonly string[];
}

interface BlockagePhraseSelection {
	directions: Direction[];
	phrase: string;
}

type TraversalNoun = "way";

const TRAVERSAL_NOUNS: readonly TraversalNoun[] = ["way"] as const;

const BLOCK_RULES: readonly BlockedPhraseRule[] = [
	{
		id: "lake_water",
		when: (ctx) => ctx.neighborWater.some((water) => water === "lake"),
		phrases: [
			"lake water",
			"the lake",
			"deep water",
			"a broad stretch of water",
		],
	},
	{
		id: "stream_crossing",
		when: (ctx) => ctx.neighborWater.some((water) => water === "stream"),
		phrases: [
			"a wide stream",
			"running water",
			"a fast-moving channel",
			"the stream",
		],
	},
	{
		id: "saturated_ground",
		when: (ctx) =>
			ctx.biome === "open_bog" ||
			ctx.biome === "spruce_swamp" ||
			ctx.neighborWater.some((water) => water === "marsh"),
		phrases: [
			"deep bog",
			"saturated ground",
			"soft, waterlogged soil",
			"wet ground",
		],
	},
	{
		id: "steep_rise",
		when: (ctx) =>
			ctx.slopeStrength >= 0.1 &&
			ctx.neighborElevDelta.some((delta) => delta > 0.08),
		phrases: [
			"a steep rise",
			"a sharp incline",
			"rising ground",
			"a sudden climb",
		],
	},
	{
		id: "windthrow",
		when: (ctx) =>
			ctx.obstacles.includes("windthrow") ||
			ctx.obstacles.includes("deadfall") ||
			ctx.obstacles.includes("fallen_log"),
		phrases: [
			"a tangle of fallen trees",
			"deadfall",
			"a mass of broken timber",
			"uprooted trunks",
		],
	},
	{
		id: "brush_blockage",
		when: (ctx) => ctx.obstacles.includes("brush_blockage"),
		phrases: [
			"dense brush",
			"thick undergrowth",
			"a stand of young trees",
			"close growth",
		],
	},
	{
		id: "ridge_edge",
		when: (ctx) =>
			ctx.landform === "ridge" &&
			ctx.neighborElevDelta.some((delta) => delta < -0.08),
		phrases: [
			"a drop along the ridge edge",
			"falling ground",
			"the edge of the ridge",
		],
	},
	{
		id: "dense_stand",
		when: (ctx) =>
			ctx.biome === "spruce_swamp" || ctx.biome === "mixed_forest",
		phrases: ["a dense stand of trees", "close-set trunks", "thick forest"],
	},
];

function isPassageRun(run: MovementRun): run is PassageRun {
	return run.type === "passage";
}

function isBlockageRun(run: MovementRun): run is BlockageRun {
	return run.type === "blockage";
}

function cloneMovementRun(run: MovementRun): MovementRun {
	if (run.type === "passage") {
		return { type: "passage", directions: [...run.directions] };
	}
	return {
		type: "blockage",
		directions: [...run.directions],
		...(typeof run.blockedBy === "string" ? { blockedBy: run.blockedBy } : {}),
	};
}

function createMovementRun(
	type: MovementRun["type"],
	directions: Direction[],
): MovementRun {
	if (type === "passage") {
		return { type: "passage", directions };
	}
	return { type: "blockage", directions };
}

function buildBlockageRunContext(
	input: DescriptionTileInput,
	run: BlockageRun,
): BlockageRunContext {
	return {
		biome: input.biome,
		landform: input.landform,
		obstacles: input.obstacles,
		slopeStrength: input.slopeStrength,
		followable: input.followable,
		runDirections: [...run.directions],
		neighborWater: run.directions.map((direction) => input.neighbors[direction].water),
		neighborElevDelta: run.directions.map(
			(direction) => input.neighbors[direction].elevDelta,
		),
	};
}

function eligibleBlockedPhrasesForRun(ctx: BlockageRunContext): readonly string[] {
	const lakeRule = BLOCK_RULES[0];
	if (lakeRule && lakeRule.when(ctx)) {
		return [...lakeRule.phrases];
	}

	const eligible: string[] = [];
	for (const rule of BLOCK_RULES.slice(1)) {
		if (rule.when(ctx)) {
			eligible.push(...rule.phrases);
		}
	}
	return eligible;
}

function collectBlockageRuns(runs: readonly MovementRun[]): BlockageRun[] {
	return runs.filter(isBlockageRun);
}

function traversalArticle(noun: TraversalNoun): "A" | "An" {
	void noun;
	return "A";
}

function movementBiomePhrase(biome: string): string {
	if (biome === "lake") {
		return "across the water";
	}
	if (biome === "open_bog") {
		return "across the bog";
	}
	if (biome === "spruce_swamp") {
		return "through the swamp";
	}
	return "through the trees";
}

function joinClausesWithAnd(first: string, rest: readonly string[]): string {
	if (rest.length === 0) {
		return `${first}.`;
	}
	if (rest.length === 1) {
		return `${first}, and ${rest[0]}.`;
	}
	return `${first}, ${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}.`;
}

function renderPassageTransformedText(
	input: DescriptionTileInput,
	noun: TraversalNoun,
	passages: readonly PassageRun[],
): string {
	const terrainPhrase = movementBiomePhrase(input.biome);
	if (passages.length === 0) {
		return `No ${noun} ${terrainPhrase} leads out from here.`;
	}

	const firstRun = passages[0] as PassageRun;
	const firstClause = `${traversalArticle(noun)} ${noun} ${terrainPhrase} leads to the ${formatDirectionNames(firstRun.directions)}`;
	const restClauses = passages
		.slice(1)
		.map((run) => `to the ${formatDirectionNames(run.directions)}`);
	return joinClausesWithAnd(firstClause, restClauses);
}

function renderBlockageTransformedText(
	noun: TraversalNoun,
	selections: readonly BlockagePhraseSelection[],
): string {
	type PhraseGroup = { phrase: string; directions: Direction[] };
	const grouped: PhraseGroup[] = [];
	for (const selection of selections) {
		const existing = grouped.find((entry) => entry.phrase === selection.phrase);
		if (existing) {
			existing.directions.push(...selection.directions);
			continue;
		}
		grouped.push({
			phrase: selection.phrase,
			directions: [...selection.directions],
		});
	}

	const first = grouped[0] as PhraseGroup;
	const firstClause = `The ${noun} to the ${formatDirectionNames(first.directions)} is blocked by ${first.phrase}`;
	const restClauses = grouped
		.slice(1)
		.map(
			(group) =>
				`to the ${formatDirectionNames(group.directions)} by ${group.phrase}`,
		);
	return joinClausesWithAnd(firstClause, restClauses);
}

function renderTransformedMovementStructure(
	input: DescriptionTileInput,
	seedKey: string,
	movementRuns: readonly MovementRun[],
): { text?: string; movement: MovementRun[] } {
	const noun = pickDeterministic(
		TRAVERSAL_NOUNS,
		`${seedKey}:movement_structure:noun`,
	);
	const passableExitCount = countPassableExits(input.passability);
	const passages = movementRuns.filter(isPassageRun);
	const blockages = collectBlockageRuns(movementRuns);

	if (passableExitCount <= 4) {
		return {
			text: renderPassageTransformedText(input, noun, passages),
			movement: movementRuns.map((run) => cloneMovementRun(run)),
		};
	}
	if (blockages.length === 0) {
		return { movement: movementRuns.map((run) => cloneMovementRun(run)) };
	}

	const selections: BlockagePhraseSelection[] = [];
	let sharedLakePhrase: string | null = null;
	for (const [runIndex, run] of blockages.entries()) {
		const ctx = buildBlockageRunContext(input, run);
		const eligiblePhrases = eligibleBlockedPhrasesForRun(ctx);
		if (eligiblePhrases.length === 0) {
			// Whole-sentence fallback: omit transformed text and all blockedBy fields.
			return { movement: movementRuns.map((entry) => cloneMovementRun(entry)) };
		}
		const lakeRule = BLOCK_RULES[0];
		const isLakeOverride = lakeRule ? lakeRule.when(ctx) : false;
		const phrase: string =
			isLakeOverride && sharedLakePhrase
				? sharedLakePhrase
				: pickDeterministic(
					eligiblePhrases,
					`${seedKey}:movement_structure:blockage:${runIndex}:phrase`,
				);
		if (isLakeOverride && sharedLakePhrase === null) {
			sharedLakePhrase = phrase;
		}
		selections.push({ directions: [...run.directions], phrase });
	}

	const transformedRuns: MovementRun[] = [];
	let blockageIndex = 0;
	for (const run of movementRuns) {
		if (run.type === "passage") {
			transformedRuns.push(cloneMovementRun(run));
			continue;
		}
		const selection = selections[blockageIndex];
		blockageIndex += 1;
		transformedRuns.push({
			type: "blockage",
			directions: [...run.directions],
			blockedBy: selection?.phrase,
		});
	}

	return {
		text: renderBlockageTransformedText(noun, selections),
		movement: transformedRuns,
	};
}

export interface DescriptionSentence {
	slot:
	| "landform"
	| "biome"
	| "hydrology"
	| "obstacle"
	| "slope"
	| "followable"
	| "movement_structure"
	| "visibility"
	| "directional";
	text?: string;
	basicText?: string;
	contributorKeys: Partial<Record<DescriptionSentence["slot"], string>>;
	contributors?: Record<string, unknown>;
	movement?: MovementRun[];
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
const RING: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIR_LOWER: Record<Direction, string> = {
	N: "north",
	NE: "northeast",
	E: "east",
	SE: "southeast",
	S: "south",
	SW: "southwest",
	W: "west",
	NW: "northwest",
};

function directionRingDistance(a: Direction, b: Direction): number {
	const ai = RING.indexOf(a);
	const bi = RING.indexOf(b);
	if (ai < 0 || bi < 0) {
		return 0;
	}
	const delta = Math.abs(ai - bi);
	return Math.min(delta, RING.length - delta);
}

function oppositeDirection(direction: Direction): Direction {
	const index = RING.indexOf(direction);
	if (index < 0) {
		return direction;
	}
	return RING[(index + 4) % RING.length] as Direction;
}

function movementTypeForPassability(passability: Passability): MovementRun["type"] {
	return passability === "passable" ? "passage" : "blockage";
}

/**
 * Converts directional passability into contiguous movement arcs around the 8-way ring.
 *
 * Ring order is fixed: N, NE, E, SE, S, SW, W, NW.
 * Rules:
 * 1. `passage` means one contiguous arc of adjacent open exits (`passable`).
 * 2. `blockage` means one contiguous arc of adjacent closed exits (`blocked` + `difficult` in the current model).
 * 3. Adjacent directions with the same type are grouped into a single arc.
 * 4. Wraparound is normalized by merging first+last arcs if they share a type
 *    (for example, W/NW and N/NE become one continuous arc).
 */
function collectMovementRuns(passability: PassabilityByDir): MovementRun[] {
	const runs: MovementRun[] = [];
	let currentType: MovementRun["type"] | null = null;
	let currentDirections: Direction[] = [];

	for (const direction of RING) {
		const type = movementTypeForPassability(passability[direction]);
		if (currentType === null) {
			currentType = type;
			currentDirections = [direction];
			continue;
		}
		if (type === currentType) {
			currentDirections.push(direction);
			continue;
		}
		runs.push(createMovementRun(currentType, currentDirections));
		currentType = type;
		currentDirections = [direction];
	}

	if (currentType !== null) {
		runs.push(createMovementRun(currentType, currentDirections));
	}

	if (runs.length > 1) {
		const first = runs[0] as MovementRun;
		const last = runs[runs.length - 1] as MovementRun;
		if (first.type === last.type) {
			const merged = createMovementRun(last.type, [
				...last.directions,
				...first.directions,
			]);
			return [merged, ...runs.slice(1, -1)];
		}
	}

	return runs;
}

function countPassableExits(passability: PassabilityByDir): number {
	let count = 0;
	for (const direction of RING) {
		if (passability[direction] === "passable") {
			count += 1;
		}
	}
	return count;
}

function formatDirectionNames(directions: readonly Direction[]): string {
	const names = directions.map((direction) => DIR_LOWER[direction]);
	if (names.length === 0) {
		return "no direction";
	}
	if (names.length === 1) {
		return names[0] as string;
	}
	if (names.length === 2) {
		return `${names[0]} and ${names[1]}`;
	}
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function collectFollowableDirections(
	input: DescriptionTileInput,
	token: string,
): Direction[] {
	return RING.filter((direction) => {
		if (input.passability[direction] !== "passable") {
			return false;
		}
		const neighborFollowable = input.neighbors[direction].followable ?? [];
		return neighborFollowable.includes(token);
	});
}

function renderGameTrailSentence(directions: readonly Direction[]): string | null {
	if (directions.length === 0) {
		return null;
	}
	return `A trail leads ${formatDirectionNames(directions)} from here.`;
}

function renderRidgeSentence(directions: readonly Direction[]): string | null {
	if (directions.length === 0) {
		return null;
	}
	return `A ridge continues to the ${formatDirectionNames(directions)}.`;
}

function renderShoreSentence(directions: readonly Direction[]): string | null {
	if (directions.length === 0) {
		return null;
	}
	if (directions.length >= 4) {
		return "Lakeshore surrounds much of this area.";
	}
	return `Lakeshore lies to the ${formatDirectionNames(directions)}.`;
}

function farthestDirectionFrom(
	directions: readonly Direction[],
	target: Direction,
): Direction | null {
	let best: Direction | null = null;
	let bestDistance = -1;
	for (const direction of directions) {
		const distance = directionRingDistance(direction, target);
		if (distance > bestDistance) {
			best = direction;
			bestDistance = distance;
		}
	}
	return best;
}

function renderStreamSentence(
	directions: readonly Direction[],
	flowDirection: Direction | "NONE" | null | undefined,
): string | null {
	if (directions.length === 0) {
		return null;
	}
	if (directions.length === 1) {
		return `A stream flows ${formatDirectionNames(directions)}.`;
	}

	if (flowDirection && flowDirection !== "NONE") {
		if (directions.includes(flowDirection)) {
			const fromDirection =
				directions.length === 2
					? (directions.find((direction) => direction !== flowDirection) ?? null)
					: farthestDirectionFrom(
						directions.filter((direction) => direction !== flowDirection),
						flowDirection,
					);
			if (fromDirection) {
				return `A stream flows from ${DIR_LOWER[fromDirection]} to the ${DIR_LOWER[flowDirection]}.`;
			}
		}

		if (directions.length === 2) {
			return `A stream runs between the ${formatDirectionNames(directions)} and flows ${DIR_LOWER[flowDirection]}.`;
		}
		return `A stream runs to the ${formatDirectionNames(directions)}, flowing ${DIR_LOWER[flowDirection]}.`;
	}

	if (directions.length === 2) {
		return `A stream runs between the ${formatDirectionNames(directions)}.`;
	}

	return `A stream runs to the ${formatDirectionNames(directions)}.`;
}

function renderFollowableSentence(input: DescriptionTileInput): string | null {
	const tokenSet = new Set(input.followable);
	const parts: string[] = [];

	if (tokenSet.has("game_trail")) {
		const gameTrailText = renderGameTrailSentence(
			collectFollowableDirections(input, "game_trail"),
		);
		if (gameTrailText) {
			parts.push(gameTrailText);
		}
	}

	if (tokenSet.has("ridge")) {
		const ridgeText = renderRidgeSentence(
			collectFollowableDirections(input, "ridge"),
		);
		if (ridgeText) {
			parts.push(ridgeText);
		}
	}

	if (tokenSet.has("stream")) {
		const streamText = renderStreamSentence(
			collectFollowableDirections(input, "stream"),
			input.flowDirection,
		);
		if (streamText) {
			parts.push(streamText);
		}
	}

	if (tokenSet.has("shore")) {
		const shoreText = renderShoreSentence(
			collectFollowableDirections(input, "shore"),
		);
		if (shoreText) {
			parts.push(shoreText);
		}
	}

	if (parts.length === 0) {
		return null;
	}
	return parts.join(" ");
}

function renderPassageText(passages: readonly PassageRun[]): string {
	if (passages.length === 0) {
		return "No passage leads out from here.";
	}
	if (passages.length === 1) {
		const directions = passages[0]?.directions ?? [];
		if (directions.length >= 2) {
			return `A broad passage opens to the ${formatDirectionNames(directions)}.`;
		}
		return `A passage opens to the ${formatDirectionNames(directions)}.`;
	}

	const clauses = passages.map((run) => {
		if (run.directions.length >= 2) {
			return `a broad passage to the ${formatDirectionNames(run.directions)}`;
		}
		return `a passage to the ${formatDirectionNames(run.directions)}`;
	});

	if (clauses.length === 2) {
		return `There is ${clauses[0]}, and ${clauses[1]}.`;
	}
	return `There are ${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}.`;
}

function renderBlockageText(blockages: readonly BlockageRun[]): string {
	if (blockages.length === 0) {
		return "Passages open in all directions.";
	}

	const clauses = blockages.map(
		(run) => `to the ${formatDirectionNames(run.directions)}`,
	);
	if (clauses.length === 1) {
		return `Passage is blocked ${clauses[0]}.`;
	}
	return `Passage is blocked ${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}.`;
}

/**
 * Produces the baseline movement_structure sentence and structured run arcs.
 * 
 * Describe each passage in terms of direction, e.g. "passage to the north, northwest and west"
 * 
 * or
 * 
 * Describe each blockage in terms of direction, e.g. "passage is blocked to the north, northwest and west"
 * 
 *
 * Mode selection:
 * - If number of open exits are 0..4: describe each passage arc.
 * - If number of open exits are 5..8: describe each blockage arc.
 *
 * Returned `movement` always contains the full ring run breakdown used by structured output.
 * Returned `text` is the baseline sentence (later exposed as `basicText` in structured output).
 */
function renderMovementStructureSentence(
	input: DescriptionTileInput,
): { text: string; movement: MovementRun[] } {
	const passableExitCount = countPassableExits(input.passability);
	const movementRuns = collectMovementRuns(input.passability);
	const passages = movementRuns.filter(isPassageRun);
	const blockages = movementRuns.filter(isBlockageRun);
	const text =
		passableExitCount > 4
			? renderBlockageText(blockages)
			: renderPassageText(passages);
	return {
		text,
		movement: movementRuns,
	};
}

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

function classifyLocalSlopeBand(
	input: DescriptionTileInput,
): "flat" | "gentle" | "none" | "steep" {
	if (input.landform === "flat" || input.landform === "plain") {
		return "flat";
	}
	if (input.slopeStrength < 0.05) {
		return "gentle";
	}
	if (input.slopeStrength > 0.1) {
		return "steep";
	}
	return "none";
}

interface LocalLandformSentence {
	text: string;
	mode: "rise" | "descend" | "flat";
	direction: Direction | null;
	band: "flat" | "gentle" | "none" | "steep";
}

interface NeighborLandformSignal {
	direction: Direction;
	mode: "rise" | "descend" | "same";
	band: "same" | "gentle" | "none" | "steep";
}

interface NeighborLandformGroup {
	directions: Direction[];
	mode: "rise" | "descend" | "same";
	band: "same" | "gentle" | "none" | "steep";
}

function renderLocalLandformSentence(
	input: DescriptionTileInput,
): LocalLandformSentence {
	const band = classifyLocalSlopeBand(input);
	if (band === "flat") {
		return {
			text: "Here the land is flat.",
			mode: "flat",
			direction: null,
			band,
		};
	}

	const riseDirection = oppositeDirection(input.slopeDirection);
	const riseNeighbor = input.neighbors[riseDirection];
	const shouldUseDescend =
		Math.abs(riseNeighbor?.elevDelta ?? 0) < 0.03;
	const mode: "rise" | "descend" = shouldUseDescend ? "descend" : "rise";
	const direction = shouldUseDescend ? input.slopeDirection : riseDirection;
	const verb = mode === "rise" ? "rises" : "descends";
	const qualifier =
		band === "gentle" ? "gently " : band === "steep" ? "steeply " : "";
	const text = sanitizeSentence(
		`Here the land ${qualifier}${verb} to the ${DIR_LOWER[direction]}.`,
	);

	return {
		text,
		mode,
		direction,
		band,
	};
}

function classifyNeighborDelta(
	elevDelta: number,
): {
	mode: "rise" | "descend" | "same";
	band: "same" | "gentle" | "none" | "steep";
} {
	const absDelta = Math.abs(elevDelta);
	if (absDelta < 0.03) {
		return { mode: "same", band: "same" };
	}
	const band: "gentle" | "none" | "steep" =
		absDelta < 0.086 ? "gentle" : absDelta <= 0.1 ? "none" : "steep";
	return { mode: elevDelta > 0 ? "rise" : "descend", band };
}

function collectNeighborLandformSignals(
	input: DescriptionTileInput,
): NeighborLandformSignal[] {
	return RING.map((direction) => {
		const neighbor = input.neighbors[direction];
		const classified = classifyNeighborDelta(neighbor.elevDelta);
		return {
			direction,
			mode: classified.mode,
			band: classified.band,
		};
	});
}

function groupNeighborLandformSignals(
	signals: NeighborLandformSignal[],
): NeighborLandformGroup[] {
	if (signals.length === 0) {
		return [];
	}

	const groups: NeighborLandformGroup[] = [];
	for (const signal of signals) {
		const previous = groups[groups.length - 1];
		if (
			previous &&
			previous.mode === signal.mode &&
			previous.band === signal.band
		) {
			previous.directions.push(signal.direction);
			continue;
		}
		groups.push({
			directions: [signal.direction],
			mode: signal.mode,
			band: signal.band,
		});
	}

	if (groups.length > 1) {
		const first = groups[0] as NeighborLandformGroup;
		const last = groups[groups.length - 1] as NeighborLandformGroup;
		if (first.mode === last.mode && first.band === last.band) {
			return [
				{
					directions: [...last.directions, ...first.directions],
					mode: first.mode,
					band: first.band,
				},
				...groups.slice(1, -1),
			];
		}
	}

	return groups;
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

function obstacleSelectionWeightByRank(rank: number): number {
	if (rank <= 0) {
		return 3;
	}
	if (rank === 1) {
		return 2;
	}
	return 1;
}

function chooseObstacle(input: DescriptionTileInput, seedKey: string): Obstacle | null {
	if (input.obstacles.length === 0) {
		return null;
	}

	const ranked = [...new Set(input.obstacles)].sort(
		(a, b) => obstaclePriority(a) - obstaclePriority(b),
	);
	const topRanked = ranked.slice(0, 3);
	const weightedPool: Obstacle[] = [];
	for (const [index, obstacle] of topRanked.entries()) {
		const weight = obstacleSelectionWeightByRank(index);
		for (let i = 0; i < weight; i += 1) {
			weightedPool.push(obstacle);
		}
	}
	if (weightedPool.length === 0) {
		return null;
	}

	return pickDeterministic(weightedPool, `${seedKey}:obstacle:key`);
}

function renderObstacleSentence(
	obstacle: Obstacle | null,
	seedKey: string,
	strict: boolean,
): string | null {
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

function stripTerminalPunctuation(text: string): string {
	return sanitizeSentence(text).replace(/[.!?]+$/, "");
}

function lowercaseFirst(text: string): string {
	if (text.length === 0) {
		return text;
	}
	return text[0].toLowerCase() + text.slice(1);
}

function mergeAsClause(
	base: string,
	clause: string,
	joiner: "where" | "and",
): string {
	const baseCore = stripTerminalPunctuation(base);
	const clauseCore = lowercaseFirst(stripTerminalPunctuation(clause));
	return `${baseCore}, ${joiner} ${clauseCore}.`;
}

function directionalMentionsWater(text: string): boolean {
	return /\b(water|stream|lake)\b/i.test(text);
}

export function generateRawDescription(
	input: DescriptionTileInput,
	seedKey: string,
	options: DescriptionGenerationOptions = {},
): DescriptionResult {
	const strict = options.strict === true;
	const sentences: DescriptionSentence[] = [];

	const landformSentence = pickDeterministic(
		phraseOptionsForLandform(input.landform, strict),
		`${seedKey}:landform:${input.landform}`,
	);
	const biomeSentence = pickDeterministic(
		phraseOptionsForBiome(input.biome, strict),
		`${seedKey}:biome:${input.biome}`,
	);

	let hydrologySentence: string | null = null;
	let obstacleSentence: string | null = null;
	let slopeSentence: string | null = null;
	let chosenObstacle: Obstacle | null = null;

	let anchorSentence =
		input.biome === "lake"
			? "This is lake surface."
			: landformSentence;
	let hydrologyMerged = false;
	let obstacleMerged = false;
	const anchorContributorKeys: Partial<
		Record<DescriptionSentence["slot"], string>
	> = {
		landform: input.landform,
	};

	if (shouldMentionWater(input)) {
		if (input.standingWater) {
			const standingOptions = requirePhraseOptions(
				STANDING_WATER_PHRASES,
				{ slot: "hydrology", key: "standing_water" },
				strict,
			);
			if (standingOptions) {
				hydrologySentence = pickDeterministic(
					standingOptions,
					`${seedKey}:hydrology:standing`,
				);
			}
		}
	}

	if (
		hydrologySentence &&
		input.standingWater &&
		(input.landform === "basin" || input.landform === "valley")
	) {
		anchorSentence = mergeAsClause(anchorSentence, hydrologySentence, "where");
		hydrologyMerged = true;
		anchorContributorKeys.hydrology = "standing_water";
	}

	chosenObstacle = chooseObstacle(input, seedKey);
	obstacleSentence = renderObstacleSentence(chosenObstacle, seedKey, strict);
	if (
		obstacleSentence &&
		input.biome !== "lake" &&
		sanitizeSentence(anchorSentence).length < 100
	) {
		anchorSentence = mergeAsClause(anchorSentence, obstacleSentence, "and");
		obstacleMerged = true;
		if (chosenObstacle) {
			anchorContributorKeys.obstacle = chosenObstacle;
		}
	}

	sentences.push({
		slot: "landform",
		basicText: landformSentence,
		text: landformSentence,
		contributorKeys: anchorContributorKeys,
	});
	sentences.push({
		slot: "biome",
		basicText: biomeSentence,
		text: biomeSentence,
		contributorKeys: { biome: input.biome },
	});

	const followableSentence = renderFollowableSentence(input);
	if (followableSentence) {
		sentences.push({
			slot: "followable",
			text: followableSentence,
			contributorKeys: { followable: "present" },
		});
	}

	const movementStructureSentence = renderMovementStructureSentence(input);
	const transformedMovement = renderTransformedMovementStructure(
		input,
		seedKey,
		movementStructureSentence.movement,
	);
	sentences.push({
		slot: "movement_structure",
		...(typeof transformedMovement.text === "string"
			? { text: transformedMovement.text }
			: {}),
		basicText: movementStructureSentence.text,
		contributorKeys: {
			movement_structure:
				countPassableExits(input.passability) > 4 ? "blocked_bias" : "passage_bias",
		},
		movement: transformedMovement.movement,
	});

	if (input.landform !== "slope") {
		slopeSentence = renderSlopeSentence(input);
	}
	if (slopeSentence) {
		sentences.push({
			slot: "slope",
			text: slopeSentence,
			contributorKeys: { slope: input.slopeDirection },
		});
	}

	if (hydrologySentence && !hydrologyMerged) {
		sentences.push({
			slot: "hydrology",
			text: hydrologySentence,
			contributorKeys: { hydrology: "standing_water" },
		});
		hydrologyMerged = true;
	}

	if (obstacleSentence && !obstacleMerged) {
		sentences.push({
			slot: "obstacle",
			text: obstacleSentence,
			contributorKeys: { obstacle: chosenObstacle ?? "unknown" },
		});
	}

	const deduped: DescriptionSentence[] = [];
	const seen = new Map<string, number>();
	for (const sentence of sentences) {
		if (typeof sentence.text !== "string") {
			deduped.push({
				slot: sentence.slot,
				contributorKeys: sentence.contributorKeys,
				...(typeof sentence.basicText === "string"
					? { basicText: sanitizeSentence(sentence.basicText) }
					: {}),
				...(sentence.movement
					? {
						movement: sentence.movement.map((run) => cloneMovementRun(run)),
					}
					: {}),
			});
			continue;
		}

		const text = sanitizeSentence(sentence.text);
		if (text.length === 0) {
			continue;
		}
		const key = `${sentence.slot}:${text.toLowerCase()}`;
		const existingIndex = seen.get(key);
		if (existingIndex !== undefined) {
			const existing = deduped[existingIndex] as DescriptionSentence;
			existing.contributorKeys = {
				...existing.contributorKeys,
				...sentence.contributorKeys,
			};
			if (!existing.movement && sentence.movement) {
				existing.movement = sentence.movement.map((run) => cloneMovementRun(run));
			}
			continue;
		}
		seen.set(key, deduped.length);
		deduped.push({
			slot: sentence.slot,
			text,
			...(typeof sentence.basicText === "string"
				? { basicText: sanitizeSentence(sentence.basicText) }
				: {}),
			contributorKeys: sentence.contributorKeys,
			...(sentence.movement
				? {
					movement: sentence.movement.map((run) => cloneMovementRun(run)),
				}
				: {}),
		});
	}

	const capped = deduped.slice(0, 4);
	const proseParts = capped
		.filter(
			(sentence) =>
				sentence.slot !== "movement_structure" &&
				sentence.slot !== "followable" &&
				typeof sentence.text === "string",
		)
		.map((sentence) => sentence.text as string);
	const followableForProse = capped.find(
		(sentence) =>
			sentence.slot === "followable" &&
			typeof sentence.text === "string" &&
			sanitizeSentence(sentence.text).length > 0,
	);
	if (typeof followableForProse?.text === "string") {
		proseParts.push(followableForProse.text);
	}
	const proseText = proseParts.join(" ");

	return {
		sentences: capped,
		text: proseText,
	};
}
