#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

print_help() {
	cat <<'EOF'
Usage:
  bash scripts/sweep-wetness.sh [options]

Description:
  Sweep hydrology.lakeFill.wetnessScale (k) in debug replay mode and emit:
  - per-k debug artifacts
  - per-k replay envelopes
  - summary TSV with basin/lake/stream counts

  Replay recomputes structure + hydrology from topography.h.

Options:
  --runs-dir <path>         Output root directory (default: <project-root>/out/wetness-sweep)
  --base-envelope <path>    Existing envelope to replay from
  --seed <uint64>           Seed for generating base envelope when --base-envelope is omitted
  --width <int>             Width for base generation when --base-envelope is omitted
  --height <int>            Height for base generation when --base-envelope is omitted
  --k-values "<list>"       Space-separated wetnessScale values (default: "0.01 0.02 0.05 0.1 0.2 0.4 0.8 1.0")
  --force                   Overwrite existing run outputs
  --help, -h                Show this help

Examples:
  bash scripts/sweep-wetness.sh --seed 1187 --width 128 --height 128
  bash scripts/sweep-wetness.sh --base-envelope runs/base/terrain.json --k-values "0.03 0.1 0.3 1.0"
EOF
}

fail() {
	echo "sweep-wetness: $*" >&2
	exit 1
}

is_positive_int() {
	[[ "$1" =~ ^[1-9][0-9]*$ ]]
}

is_non_negative_number() {
	[[ "$1" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]]
}

RUNS_DIR="$PROJECT_ROOT/out/wetness-sweep"
BASE_ENVELOPE=""
SEED=""
WIDTH=""
HEIGHT=""
K_VALUES="0.01 0.02 0.05 0.1 0.2 0.4 0.8 1.0"
FORCE=false

while (($# > 0)); do
	case "$1" in
		--runs-dir)
			shift
			(($# > 0)) || fail "missing value for --runs-dir"
			RUNS_DIR="$1"
			;;
		--base-envelope)
			shift
			(($# > 0)) || fail "missing value for --base-envelope"
			BASE_ENVELOPE="$1"
			;;
		--seed)
			shift
			(($# > 0)) || fail "missing value for --seed"
			SEED="$1"
			;;
		--width)
			shift
			(($# > 0)) || fail "missing value for --width"
			WIDTH="$1"
			;;
		--height)
			shift
			(($# > 0)) || fail "missing value for --height"
			HEIGHT="$1"
			;;
		--k-values)
			shift
			(($# > 0)) || fail "missing value for --k-values"
			K_VALUES="$1"
			;;
		--force)
			FORCE=true
			;;
		--help|-h)
			print_help
			exit 0
			;;
		*)
			fail "unknown argument: $1 (use --help)"
			;;
	esac
	shift
done

if [[ -n "$BASE_ENVELOPE" && ( -n "$SEED" || -n "$WIDTH" || -n "$HEIGHT" ) ]]; then
	fail "--base-envelope cannot be combined with --seed/--width/--height"
fi

if [[ "$RUNS_DIR" != /* ]]; then
	RUNS_DIR="$PROJECT_ROOT/$RUNS_DIR"
fi

if [[ -n "$BASE_ENVELOPE" && "$BASE_ENVELOPE" != /* ]]; then
	BASE_ENVELOPE="$PROJECT_ROOT/$BASE_ENVELOPE"
fi

if [[ -z "$BASE_ENVELOPE" ]]; then
	[[ -n "$SEED" ]] || fail "--seed is required when --base-envelope is omitted"
	[[ -n "$WIDTH" ]] || fail "--width is required when --base-envelope is omitted"
	[[ -n "$HEIGHT" ]] || fail "--height is required when --base-envelope is omitted"
	is_positive_int "$WIDTH" || fail "--width must be a positive integer"
	is_positive_int "$HEIGHT" || fail "--height must be a positive integer"
else
	[[ -f "$BASE_ENVELOPE" ]] || fail "base envelope not found: $BASE_ENVELOPE"
fi

mkdir -p "$RUNS_DIR"
SUMMARY_PATH="$RUNS_DIR/summary.tsv"

if [[ -z "$BASE_ENVELOPE" ]]; then
	BASE_DIR="$RUNS_DIR/base"
	BASE_ENVELOPE="$BASE_DIR/terrain.json"
	mkdir -p "$BASE_DIR"
		GEN_ARGS=(
		node --import tsx "$PROJECT_ROOT/src/cli/main.ts" generate
		--seed "$SEED"
		--width "$WIDTH"
		--height "$HEIGHT"
		--output-file "$BASE_ENVELOPE"
	)
	if $FORCE; then
		GEN_ARGS+=(--force)
	fi
	echo "sweep-wetness: generating base envelope at $BASE_ENVELOPE"
	"${GEN_ARGS[@]}"
fi

echo -e "k\tbasinTotal\tsink\toverflowCarrier\tterminalLake\tfillZero\tfillPartial\tfillFull\tlakeTiles\tstreamTiles\tfillFractionMean" > "$SUMMARY_PATH"

for k in $K_VALUES; do
	is_non_negative_number "$k" || fail "invalid k value \"$k\" (expected non-negative number)"
	case_dir="$RUNS_DIR/k-$k"
	debug_dir="$case_dir/debug"
	params_file="$case_dir/params.json"
	replay_file="$case_dir/replay.json"
	hydrology_file="$debug_dir/hydrology.json"

	mkdir -p "$case_dir"
	cat > "$params_file" <<EOF
{
  "hydrology": {
    "lakeFill": {
      "wetnessScale": $k
    }
  }
}
EOF

	DEBUG_ARGS=(
		node --import tsx "$PROJECT_ROOT/src/cli/main.ts" debug
		--input-file "$BASE_ENVELOPE"
		--params "$params_file"
		--output-dir "$debug_dir"
		--debug-output-file "$replay_file"
	)
	if $FORCE; then
		DEBUG_ARGS+=(--force)
	fi
	echo "sweep-wetness: running k=$k"
	"${DEBUG_ARGS[@]}"

	[[ -f "$hydrology_file" ]] || fail "missing hydrology artifact: $hydrology_file"
	K_VALUE="$k" HYDROLOGY_FILE="$hydrology_file" node <<'EOF' >> "$SUMMARY_PATH"
const fs = require("node:fs");

const k = process.env.K_VALUE;
const file = process.env.HYDROLOGY_FILE;
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const basins = Array.isArray(doc?.lakeAccounting?.basins)
	? doc.lakeAccounting.basins
	: [];
const tiles = Array.isArray(doc?.tiles) ? doc.tiles : [];

const sink = basins.filter((b) => b?.role === "sink").length;
const overflowCarrier = basins.filter((b) => b?.role === "overflow_carrier").length;
const terminalLake = basins.filter((b) => b?.role === "terminal_lake").length;
const fillZero = basins.filter((b) => b?.fillFraction === 0).length;
const fillPartial = basins.filter(
	(b) => typeof b?.fillFraction === "number" && b.fillFraction > 0 && b.fillFraction < 1,
).length;
const fillFull = basins.filter((b) => b?.fillFraction === 1).length;
const fillFractionMean =
	basins.length === 0
		? 0
		: basins.reduce((sum, b) => {
				const ff = typeof b?.fillFraction === "number" ? b.fillFraction : 0;
				return sum + ff;
			}, 0) / basins.length;

const lakeTiles = tiles.filter((t) => t?.hydrology?.lakeMask === true).length;
const streamTiles = tiles.filter((t) => t?.hydrology?.isStream === true).length;

console.log(
	[
		k,
		basins.length,
		sink,
		overflowCarrier,
		terminalLake,
		fillZero,
		fillPartial,
		fillFull,
		lakeTiles,
		streamTiles,
		fillFractionMean.toFixed(6),
	].join("\t"),
);
EOF
done

echo "sweep-wetness: complete"
echo "sweep-wetness: summary -> $SUMMARY_PATH"
