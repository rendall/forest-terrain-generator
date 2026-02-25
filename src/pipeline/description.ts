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

const DEFAULT_BIOME_PHRASES = [
	"Conifers and birch share this patch in an uneven stand.",
	"Tree cover varies here, with denser and lighter pockets.",
	"Mixed woodland fills the area at a moderate density.",
];

const BIOME_PHRASES: Partial<Record<KnownBiome, string[]>> = {
	spruce_swamp: [
		"Spruce crowd low, waterlogged ground broken by hummocks and dark pools.",
		"Dense spruce rise from saturated soil, with standing water between the roots.",
		"The ground is soft and uneven beneath tightly spaced spruce.",
		"Spruce grow over peat-dark soil, with shallow water collecting in the hollows.",
		"Close-set spruce stand in wet, sunken terrain threaded with still water.",
		"The forest floor is spongy and irregular beneath the spruce canopy.",
		"Spruce roots twist through soaked ground and patches of open water.",
		"Low ground holds stagnant water among the trunks of dense spruce.",
		"Spruce press together above dark, saturated earth.",
		"The terrain dips and holds water beneath a tight stand of spruce."
	],
	pine_heath: [
		"Scattered pine rise from dry, sandy ground covered in heather and lichen.",
		"Tall pine stand over firm, acidic soil and low heath growth.",
		"Heather and pale lichen spread beneath widely spaced pine.",
		"The ground is dry and granular beneath an open stand of pine.",
		"Pine grow over thin soil and low, woody heath plants.",
		"Lichen and heather form a sparse mat under scattered pine.",
		"Firm, sandy ground and low shrubs stretch between pine trunks.",
		"Pine stand apart over dry heath and patches of reindeer moss.",
		"The undergrowth stays low here, mostly heather and lichen beneath pine.",
		"Open pine rise above pale ground cover and dry, compacted soil.",
		"Dry, resin-scented pine stand over thin soil and scattered heather.",
		"Sparse pine grow on slightly raised, well-drained ground.",
		"The soil is pale and dry beneath pine and low woody shrubs.",
		"Heath plants cling to sandy rises between open pine trunks.",
		"Pine roots grip shallow, stony ground with little underbrush.",
		"Dry needles gather over firm earth and low heath growth.",
		"Scattered pine stand on gently sloping, well-drained terrain.",
		"Low juniper and heather spread under open pine.",
		"The ground is compact and dry, with lichen scattered between pine.",
		"Pine stand over coarse, granular soil and sparse shrubs.",
		"The heath is open and dry, broken only by widely spaced pine.",
		"Thin soil and dry moss lie beneath tall pine.",
		"Pale lichen patches contrast with darker pine trunks.",
	],
	mixed_forest: [
		"Pale birch trunks rise among denser spruce, breaking up the shade.",
		"The canopy varies here, with brighter gaps beside darker clusters of spruce.",
		"Leaf litter and fallen needles mix across uneven forest floor.",
		"Spruce thicken in places, then give way to lighter stands of birch.",
		"The light changes over short distances beneath alternating birch and spruce.",
		"Ground cover shifts between drier patches and softer, shaded hollows.",
		"Birch brighten the understory between tighter stands of conifer.",
		"The forest feels neither fully open nor fully closed, but varied throughout.",
		"Low branches of spruce contrast with taller, bare birch trunks.",
		"The terrain carries both dry leaf scatter and darker, needle-covered soil.",
		"Spruce pockets narrow the space before birch open it again.",
		"The canopy breaks unevenly, with mixed shade and filtered light.",
		"Birch and spruce interlock, creating alternating bands of brightness and shadow."
	],
	esker_pine: [
		"A narrow sandy ridge rises here, lined with scattered pine.",
		"Pine follow the crest of a dry, gravelly spine.",
		"The ground lifts into a firm, sandy ridge with pine along its top.",
		"Loose sand and pine mark the raised back of the esker.",
		"A long, dry ridge carries an open stand of pine.",
		"Pine cling to elevated, well-drained sand above lower terrain.",
		"The footing turns sandy and firm along this pine-covered ridge.",
		"The ridge narrows here, with pine spaced along its crest.",
		"Gravelly soil and open pine define this raised strip of ground.",
		"Pine stand along a distinct, elongated rise in the landscape.",
		"Dry sand and exposed roots mark the spine of the ridge.",
		"The terrain slopes away on either side of this pine-lined height.",
		"An elevated band of sandy ground supports sparse pine.",
		"The crest remains dry and firm beneath widely spaced pine.",
		"Pine trace the higher line of land through otherwise lower forest."
	],
	lake: ["Lake surface."], // Lake surface is not reachable here

	open_bog: [
		"Open peat stretches here, broken by shallow pools and low sedge.",
		"The ground is flat and saturated, with dark water in scattered hollows.",
		"Low bog plants spread across wet, uneven peat.",
		"Still water collects between patches of sedge and dwarf shrubs.",
		"The terrain opens into a broad, waterlogged expanse.",
		"Peat-dark ground yields underfoot among sparse bog growth.",
		"Shallow pools and matted grasses cover this open wetland.",
		"The land lies flat and soft, with low vegetation and standing water.",
		"Wet peat and scattered cottongrass define this open stretch.",
		"The surface is spongy and broken by narrow channels of still water.",
		"Low shrubs and sedge rise from saturated, dark soil.",
		"The bog spreads wide here, with little cover and soft footing.",
		"Water stands in shallow depressions across the peat.",
		"The ground remains open and wet, with only low plants interrupting it.",
		"Flat, saturated land extends outward with scattered bog growth."
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
	"A broad lake to the {dir} meets the land here along a firm, stony edge.",
	"The ground slopes down to the ${dir} to meet the open water of a lake.",
	"Sand and small stones mark the shore of a lake to the {dir}.",
	"Open water extends outward to the {dir} from a narrow band of shore.",
	"Shoreline curves here, where land meets flat lake surface to the {dir}.",
	"Reeds and stones line the edge of a lake to the {dir}.",
	"Water lies open to the {dir} beyond a strip of damp earth and stones.",
	"A shallow margin of shore borders a broad lake to the {dir}.",
	"A lake begins here to the {dir}, its surface wide and uninterrupted.",
	"To the {dir}, exposed roots and stones frame the edge of a lake.",
	"A narrow band of sand borders a lake to the {dir}.",
	"To the {dir}, the ground transitions from soil to sand at the edge of a lake.",
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

const LOCAL_GENTLE_MAX = 0.05;
const LOCAL_STEEP_MIN = 0.1;
const NEIGHBOR_SAME_MAX = 0.03;
const NEIGHBOR_GENTLE_MAX = 0.086;
const NEIGHBOR_STEEP_MIN = 0.1;

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
	if (input.slopeStrength < LOCAL_GENTLE_MAX) {
		return "gentle";
	}
	if (input.slopeStrength > LOCAL_STEEP_MIN) {
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
	sourceDirectionCount?: number;
	mergedFromCount?: number;
	mergeBands?: Array<"same" | "gentle" | "none" | "steep">;
}

interface NeighborLandformContribution {
	directions: Direction[];
	mode: "rise" | "descend" | "same";
	band: "same" | "gentle" | "none" | "steep";
	mergedFromCount?: number;
	mergeBands?: Array<"same" | "gentle" | "none" | "steep">;
	minAbsDelta: number;
	maxAbsDelta: number;
	text: string;
	emitted?: boolean;
	suppressedBy?: "same_filtered" | "single_gentle_filtered";
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
		Math.abs(riseNeighbor?.elevDelta ?? 0) < NEIGHBOR_SAME_MAX;
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
	if (absDelta < NEIGHBOR_SAME_MAX) {
		return { mode: "same", band: "same" };
	}
	const band: "gentle" | "none" | "steep" =
		absDelta < NEIGHBOR_GENTLE_MAX
			? "gentle"
			: absDelta <= NEIGHBOR_STEEP_MIN
				? "none"
				: "steep";
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

function isMergeCompatibleNeighborBand(
	a: "same" | "gentle" | "none" | "steep",
	b: "same" | "gentle" | "none" | "steep",
): boolean {
	if (a === b) {
		return true;
	}
	if (a === "same" || b === "same") {
		return false;
	}
	const rank = (band: "gentle" | "none" | "steep"): number => {
		if (band === "gentle") {
			return 0;
		}
		if (band === "none") {
			return 1;
		}
		return 2;
	};
	const aRank = rank(a);
	const bRank = rank(b);
	return Math.abs(aRank - bRank) <= 1;
}

function collapseMergedNeighborBand(
	bands: readonly Array<"same" | "gentle" | "none" | "steep">,
): "same" | "gentle" | "none" | "steep" {
	const unique = [...new Set(bands)];
	if (unique.length === 0) {
		return "same";
	}
	if (unique.length === 1) {
		return unique[0] as "same" | "gentle" | "none" | "steep";
	}
	// Mixed intensity groups are rendered in neutral intensity prose.
	return "none";
}

function mergeNeighborLandformGroups(
	groups: NeighborLandformGroup[],
): NeighborLandformGroup[] {
	if (groups.length === 0) {
		return [];
	}

	const merged: NeighborLandformGroup[] = [];
	for (const group of groups) {
		const current: NeighborLandformGroup = {
			directions: [...group.directions],
			mode: group.mode,
			band: group.band,
			mergedFromCount: group.mergedFromCount ?? 1,
			mergeBands: [...(group.mergeBands ?? [group.band])],
		};
		const previous = merged[merged.length - 1];
		if (
			previous &&
			previous.mode === current.mode &&
			isMergeCompatibleNeighborBand(previous.band, current.band)
		) {
			const nextBands = [...(previous.mergeBands ?? [previous.band]), ...(current.mergeBands ?? [current.band])];
			previous.directions.push(...current.directions);
			previous.mergeBands = nextBands;
			previous.mergedFromCount =
				(previous.mergedFromCount ?? 1) + (current.mergedFromCount ?? 1);
			previous.band = collapseMergedNeighborBand(nextBands);
			continue;
		}
		merged.push(current);
	}

	while (merged.length > 1) {
		const first = merged[0] as NeighborLandformGroup;
		const last = merged[merged.length - 1] as NeighborLandformGroup;
		if (
			first.mode !== last.mode ||
			!isMergeCompatibleNeighborBand(first.band, last.band)
		) {
			break;
		}

		const nextBands = [...(last.mergeBands ?? [last.band]), ...(first.mergeBands ?? [first.band])];
		const mergedWrap: NeighborLandformGroup = {
			directions: [...last.directions, ...first.directions],
			mode: first.mode,
			band: collapseMergedNeighborBand(nextBands),
			mergedFromCount:
				(last.mergedFromCount ?? 1) + (first.mergedFromCount ?? 1),
			mergeBands: nextBands,
		};
		merged.splice(0, 1);
		merged.splice(merged.length - 1, 1);
		merged.unshift(mergedWrap);
	}

	return merged;
}

function isContiguousDirectionRun(directions: readonly Direction[]): boolean {
	if (directions.length <= 1) {
		return true;
	}
	for (let i = 1; i < directions.length; i += 1) {
		const previous = RING.indexOf(directions[i - 1] as Direction);
		const current = RING.indexOf(directions[i] as Direction);
		if (current !== (previous + 1) % RING.length) {
			return false;
		}
	}
	return true;
}

function formatDirectionArc(directions: readonly Direction[]): string {
	const first = directions[0] as Direction;
	const last = directions[directions.length - 1] as Direction;
	return `from the ${DIR_LOWER[first]} to the ${DIR_LOWER[last]}`;
}

function formatBroadDirectionForTriple(
	directions: readonly Direction[],
): string | null {
	if (directions.length !== 3 || !isContiguousDirectionRun(directions)) {
		return null;
	}

	const center = directions[1] as Direction;
	if (center === "N" || center === "E" || center === "S" || center === "W") {
		return `broadly ${DIR_LOWER[center]}`;
	}

	const pairByIntercardinal: Record<Extract<Direction, "NE" | "SE" | "SW" | "NW">, string> =
	{
		NE: "broadly north and east",
		SE: "broadly east and south",
		SW: "broadly south and west",
		NW: "broadly west and north",
	};
	return pairByIntercardinal[center as Extract<Direction, "NE" | "SE" | "SW" | "NW">];
}

function qualifierForBand(
	band: "flat" | "same" | "gentle" | "none" | "steep",
): string {
	if (band === "gentle") {
		return "gently ";
	}
	if (band === "steep") {
		return "steeply ";
	}
	return "";
}

function renderNeighborLandformSentences(
	groups: NeighborLandformGroup[],
): string[] {
	if (
		groups.length === 1 &&
		(groups[0] as NeighborLandformGroup).mode === "same" &&
		(groups[0] as NeighborLandformGroup).directions.length === RING.length
	) {
		return ["The surrounding land stays level."];
	}

	return groups.map((group) => {
		const directionNames = formatDirectionNames(group.directions);
		if (group.mode === "same") {
			return `To the ${directionNames}, the land stays level.`;
		}

		const verb = group.mode === "rise" ? "rises" : "descends";
		const qualifier = qualifierForBand(group.band);
		const broadDirection = formatBroadDirectionForTriple(group.directions);
		if (broadDirection) {
			return sanitizeSentence(
				`${broadDirection[0].toUpperCase()}${broadDirection.slice(1)}, the land ${qualifier}${verb}.`,
			);
		}
		if (
			group.directions.length === 4 &&
			isContiguousDirectionRun(group.directions)
		) {
			const directionArc = formatDirectionArc(group.directions);
			return sanitizeSentence(
				`${directionArc[0].toUpperCase()}${directionArc.slice(1)}, the land ${qualifier}${verb}.`,
			);
		}
		return sanitizeSentence(
			`To the ${directionNames}, the land ${qualifier}${verb}.`,
		);
	});
}

function filterNeighborGroupsToPassableDirections(
	groups: NeighborLandformGroup[],
	passability: PassabilityByDir,
): NeighborLandformGroup[] {
	const filtered: NeighborLandformGroup[] = [];
	for (const group of groups) {
		const passableDirections = group.directions.filter(
			(direction) => passability[direction] === "passable",
		);
		if (passableDirections.length === 0) {
			continue;
		}
		filtered.push({
			...group,
			directions: passableDirections,
			sourceDirectionCount: group.directions.length,
		});
	}
	return filtered;
}

function shouldEmitNeighborLandformGroup(
	group: NeighborLandformGroup,
): { emitted: boolean; suppressedBy?: "same_filtered" | "single_gentle_filtered" } {
	if (group.mode === "same") {
		return { emitted: false, suppressedBy: "same_filtered" };
	}
	if (
		group.band === "gentle" &&
		group.directions.length === 1 &&
		(group.sourceDirectionCount ?? group.directions.length) === 1
	) {
		return { emitted: false, suppressedBy: "single_gentle_filtered" };
	}
	return { emitted: true };
}

function renderDerivedLandform(
	input: DescriptionTileInput,
): { basicText: string; contributors: Record<string, unknown> } {
	const local = renderLocalLandformSentence(input);
	const riseDirection = oppositeDirection(input.slopeDirection);
	const riseNeighborDelta = input.neighbors[riseDirection]?.elevDelta ?? 0;
	const neighborSignals = collectNeighborLandformSignals(input);
	const neighborGroups = mergeNeighborLandformGroups(
		groupNeighborLandformSignals(neighborSignals),
	);
	const proseNeighborGroups = filterNeighborGroupsToPassableDirections(
		neighborGroups,
		input.passability,
	);
	const neighborSentences = renderNeighborLandformSentences(proseNeighborGroups);
	const neighborContributions: NeighborLandformContribution[] = neighborGroups.map(
		(group) => {
			const deltas = group.directions.map((direction) =>
				Math.abs(input.neighbors[direction].elevDelta),
			);
			const mergedFromCount = group.mergedFromCount ?? 1;
			const mergeBands = [...(group.mergeBands ?? [group.band])];
			const emission = shouldEmitNeighborLandformGroup(group);
			return {
				directions: [...group.directions],
				mode: group.mode,
				band: group.band,
				...(mergedFromCount > 1 ? { mergedFromCount } : {}),
				...(mergeBands.length > 1 ? { mergeBands } : {}),
				minAbsDelta: deltas.length > 0 ? Math.min(...deltas) : 0,
				maxAbsDelta: deltas.length > 0 ? Math.max(...deltas) : 0,
				text: renderNeighborLandformSentences([group])[0] as string,
				...(emission.emitted ? { emitted: true } : { emitted: false }),
				...(emission.suppressedBy
					? { suppressedBy: emission.suppressedBy }
					: {}),
			};
		},
	);
	const emittedNeighborContributions = proseNeighborGroups
		.map((group, index) => {
			const emission = shouldEmitNeighborLandformGroup(group);
			const mergedFromCount = group.mergedFromCount ?? 1;
			const mergeBands = [...(group.mergeBands ?? [group.band])];
			return {
				directions: [...group.directions],
				mode: group.mode,
				band: group.band,
				...(mergedFromCount > 1 ? { mergedFromCount } : {}),
				...(mergeBands.length > 1 ? { mergeBands } : {}),
				minAbsDelta: Math.min(
					...group.directions.map((direction) =>
						Math.abs(input.neighbors[direction].elevDelta),
					),
				),
				maxAbsDelta: Math.max(
					...group.directions.map((direction) =>
						Math.abs(input.neighbors[direction].elevDelta),
					),
				),
				text: neighborSentences[index] as string,
				...(emission.emitted ? { emitted: true } : { emitted: false }),
				...(emission.suppressedBy
					? { suppressedBy: emission.suppressedBy }
					: {}),
			};
		})
		.filter((group) => group.emitted !== false);
	const localDirectionBlocked =
		local.mode !== "flat" &&
		local.direction !== null &&
		input.passability[local.direction as Direction] !== "passable";
	const localOverlapsNeighbor =
		local.mode !== "flat" &&
		local.direction !== null &&
		emittedNeighborContributions.some(
			(group) => group.directions.includes(local.direction as Direction),
		);
	const localSuppressedBy:
		| "flat_filtered"
		| "blocked_direction"
		| "neighbor_overlap"
		| null =
		local.mode === "flat"
			? "flat_filtered"
			: localDirectionBlocked
				? "blocked_direction"
			: localOverlapsNeighbor
				? "neighbor_overlap"
				: null;
	const localEmitted = localSuppressedBy === null;
	const emittedNeighborSentences = emittedNeighborContributions.map(
		(group) => group.text,
	);
	const sentenceParts = localEmitted
		? [local.text, ...emittedNeighborSentences]
		: [...emittedNeighborSentences];
	const basicText = sanitizeSentence(sentenceParts.join(" "));

	const contributors: Record<string, unknown> = {
		local: {
			input: {
				slopeStrength: input.slopeStrength,
				slopeDirection: input.slopeDirection,
				landform: input.landform,
				riseDirection,
				riseNeighborDelta,
			},
			derived: {
				mode: local.mode,
				direction: local.direction,
				band: local.band,
				text: local.text,
			},
			emitted: localEmitted,
			suppressedBy: localSuppressedBy,
		},
		neighbors: neighborContributions,
		thresholds: {
			local: {
				flatLandforms: ["flat", "plain"],
				gentleMaxExclusive: LOCAL_GENTLE_MAX,
				steepMinExclusive: LOCAL_STEEP_MIN,
			},
			neighbor: {
				sameMaxExclusive: NEIGHBOR_SAME_MAX,
				gentleMaxExclusive: NEIGHBOR_GENTLE_MAX,
				steepMinExclusive: NEIGHBOR_STEEP_MIN,
			},
		},
		exception: {
			applied: local.mode === "descend",
			rule:
				local.mode === "descend"
					? "rise_neighbor_same_switch_to_descend"
					: null,
		},
	};

	return { basicText, contributors };
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

function renderLakeSentence(
	direction: Direction,
	seedKey: string,
	strict: boolean,
): string | null {
	const options = requirePhraseOptions(
		LAKE_PHRASES,
		{ slot: "hydrology", key: "lake" },
		strict,
	);
	if (!options) {
		return null;
	}
	const phrase = pickDeterministic(
		options,
		`${seedKey}:dir:lake:${direction}`,
	);

	return phrase.replace(/\$?\{dir\}/g, DIR_LOWER[direction]);
}

function chooseLakeSentenceDirection(input: DescriptionTileInput): Direction | null {
	const lakeDirections = RING.filter(
		(direction) => input.neighbors[direction].water === "lake",
	);
	if (lakeDirections.length === 0) {
		return null;
	}
	const preferredCardinal = lakeDirections.find((direction) =>
		CARDINALS.includes(direction),
	);
	return (preferredCardinal ?? lakeDirections[0]) ?? null;
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

function cloneContributors(
	contributors: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!contributors) {
		return undefined;
	}
	return { ...contributors };
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

	if (input.biome === "lake") {
		const lakeSentence: DescriptionSentence = {
			slot: "biome",
			basicText: "Lake surface.",
			text: "Lake surface.",
			contributorKeys: { biome: "lake" },
		};
		return {
			sentences: [lakeSentence],
			text: "Lake surface.",
		};
	}

	const sentences: DescriptionSentence[] = [];
	const derivedLandform = renderDerivedLandform(input);

	const landformSentence = derivedLandform.basicText;
	const biomeSentence = pickDeterministic(
		phraseOptionsForBiome(input.biome, strict),
		`${seedKey}:biome:${input.biome}`,
	);

	let hydrologySentence: string | null = null;
	let lakeSentence: string | null = null;
	let obstacleSentence: string | null = null;
	let chosenObstacle: Obstacle | null = null;

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

	chosenObstacle = chooseObstacle(input, seedKey);
	obstacleSentence = renderObstacleSentence(chosenObstacle, seedKey, strict);
	const lakeDirection = chooseLakeSentenceDirection(input);
	if (lakeDirection) {
		lakeSentence = renderLakeSentence(lakeDirection, seedKey, strict);
	}

	sentences.push({
		slot: "biome",
		basicText: biomeSentence,
		text: biomeSentence,
		contributorKeys: { biome: input.biome },
	});
	sentences.push({
		slot: "landform",
		...(landformSentence.length > 0
			? { basicText: landformSentence, text: landformSentence }
			: {}),
		contributorKeys: { landform: input.landform },
		contributors: derivedLandform.contributors,
	});

	if (lakeSentence) {
		sentences.push({
			slot: "hydrology",
			text: lakeSentence,
			contributorKeys: { hydrology: "lake_directional" },
		});
	}

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
	const movementPassableExitCount = countPassableExits(input.passability);
	const suppressMovementInProse = movementPassableExitCount === 8;
	sentences.push({
		slot: "movement_structure",
		...(typeof transformedMovement.text === "string" && !suppressMovementInProse
			? { text: transformedMovement.text }
			: {}),
		basicText: movementStructureSentence.text,
		contributorKeys: {
			movement_structure:
				movementPassableExitCount > 4 ? "blocked_bias" : "passage_bias",
		},
		contributors: {
			emit: !suppressMovementInProse,
			...(suppressMovementInProse
				? { suppressedBy: "fully_passable" }
				: {}),
		},
		movement: transformedMovement.movement,
	});

	if (hydrologySentence) {
		sentences.push({
			slot: "hydrology",
			text: hydrologySentence,
			contributorKeys: { hydrology: "standing_water" },
		});
	}

	if (obstacleSentence) {
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
				...(sentence.contributors
					? { contributors: cloneContributors(sentence.contributors) }
					: {}),
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
			if (existing.contributors && sentence.contributors) {
				existing.contributors = {
					...existing.contributors,
					...sentence.contributors,
				};
			} else if (!existing.contributors && sentence.contributors) {
				existing.contributors = cloneContributors(sentence.contributors);
			}
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
			...(sentence.contributors
				? { contributors: cloneContributors(sentence.contributors) }
				: {}),
			...(sentence.movement
				? {
					movement: sentence.movement.map((run) => cloneMovementRun(run)),
				}
				: {}),
		});
	}

	const selected = deduped;
	const proseParts = selected
		.filter(
			(sentence) =>
				sentence.slot !== "movement_structure" &&
				sentence.slot !== "followable" &&
				typeof sentence.text === "string",
		)
		.map((sentence) => sentence.text as string);
	const followableForProse = selected.find(
		(sentence) =>
			sentence.slot === "followable" &&
			typeof sentence.text === "string" &&
			sanitizeSentence(sentence.text).length > 0,
	);
	if (typeof followableForProse?.text === "string") {
		proseParts.push(followableForProse.text);
	}
	const movementForProse = selected.find(
		(sentence) =>
			sentence.slot === "movement_structure" &&
			(sentence.contributors as { emit?: boolean } | undefined)?.emit !== false &&
			((typeof sentence.text === "string" &&
				sanitizeSentence(sentence.text).length > 0) ||
				(typeof sentence.basicText === "string" &&
					sanitizeSentence(sentence.basicText).length > 0)),
	);
	if (typeof movementForProse?.text === "string") {
		proseParts.push(movementForProse.text);
	} else if (typeof movementForProse?.basicText === "string") {
		proseParts.push(movementForProse.basicText);
	}
	const proseText = proseParts.join(" ");

	return {
		sentences: selected,
		text: proseText,
	};
}
