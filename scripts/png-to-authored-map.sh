#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/png-to-authored-map.sh --input <image.png> --output <map.json> [--expect-size <WIDTHxHEIGHT>]

Description:
  Convert an image to authored-map JSON for --map-h/--map-r/--map-v:
  {
    "width": number,
    "height": number,
    "data": number[]
  }

  Output values are normalized grayscale samples in [0,1], row-major order.

Options:
  --input <path>         Input image path (PNG recommended)
  --output <path>        Output JSON file path
  --expect-size <WxH>    Optional hard size check (example: 64x64)
  --help, -h             Show this help
EOF
}

fail() {
  echo "png-to-authored-map: $*" >&2
  exit 1
}

INPUT_PATH=""
OUTPUT_PATH=""
EXPECT_SIZE=""

while (($# > 0)); do
  case "$1" in
    --input)
      shift
      (($# > 0)) || fail "missing value for --input"
      INPUT_PATH="$1"
      ;;
    --output)
      shift
      (($# > 0)) || fail "missing value for --output"
      OUTPUT_PATH="$1"
      ;;
    --expect-size)
      shift
      (($# > 0)) || fail "missing value for --expect-size"
      EXPECT_SIZE="$1"
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

[[ -n "$INPUT_PATH" ]] || fail "--input is required"
[[ -n "$OUTPUT_PATH" ]] || fail "--output is required"
[[ -f "$INPUT_PATH" ]] || fail "input file not found: $INPUT_PATH"

if command -v magick >/dev/null 2>&1; then
  IDENTIFY_CMD=(magick identify)
  CONVERT_CMD=(magick)
elif command -v identify >/dev/null 2>&1 && command -v convert >/dev/null 2>&1; then
  IDENTIFY_CMD=(identify)
  CONVERT_CMD=(convert)
else
  fail "ImageMagick is required (magick or identify/convert not found in PATH)"
fi

DIMENSIONS="$("${IDENTIFY_CMD[@]}" -format "%w %h" "$INPUT_PATH")"
WIDTH="${DIMENSIONS%% *}"
HEIGHT="${DIMENSIONS##* }"
[[ -n "$WIDTH" && -n "$HEIGHT" ]] || fail "unable to read image dimensions for: $INPUT_PATH"

if [[ -n "$EXPECT_SIZE" ]]; then
  if [[ ! "$EXPECT_SIZE" =~ ^([0-9]+)x([0-9]+)$ ]]; then
    fail "invalid --expect-size format: $EXPECT_SIZE (expected WIDTHxHEIGHT)"
  fi
  EXPECT_WIDTH="${BASH_REMATCH[1]}"
  EXPECT_HEIGHT="${BASH_REMATCH[2]}"
  if [[ "$WIDTH" != "$EXPECT_WIDTH" || "$HEIGHT" != "$EXPECT_HEIGHT" ]]; then
    fail "dimension mismatch: expected ${EXPECT_WIDTH}x${EXPECT_HEIGHT}, got ${WIDTH}x${HEIGHT}"
  fi
fi

EXPECTED_LEN=$((WIDTH * HEIGHT))

{
  printf '{\n  "width": %s,\n  "height": %s,\n  "data": [' "$WIDTH" "$HEIGHT"
  "${CONVERT_CMD[@]}" "$INPUT_PATH" -alpha off -colorspace Gray -depth 8 gray:- \
    | od -An -tu1 -v \
    | awk -v expected="$EXPECTED_LEN" '
      {
        for (i = 1; i <= NF; i++) {
          if (count++ > 0) {
            printf ", "
          }
          printf "%.6f", $i / 255
        }
      }
      END {
        if (count != expected) {
          printf "\npng-to-authored-map: pixel count mismatch: expected %d, got %d\n", expected, count > "/dev/stderr"
          exit 1
        }
      }
    '
  printf ']\n}\n'
} > "$OUTPUT_PATH"
