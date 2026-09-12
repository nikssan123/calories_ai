#!/bin/bash
# compose-shots.sh <play-code> — three raw captures plus that language's captions
# become the three Play frames in store/screenshots-localised/<code>/.
#
#   RAW_DIR=/tmp/daysofar-shots store/tools/compose-shots.sh bg
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="${RAW_DIR:-${TMPDIR:-/tmp}/daysofar-shots}"
CODE=$1
OUT="$R/store/screenshots-localised/$CODE"; mkdir -p "$OUT"
NAMES=(01-log 02-correct 03-today)
for i in 1 2 3; do
  head=$(node -p "JSON.parse(require('fs').readFileSync('$R/store/listings/$CODE.json','utf8')).captions[$((i-1))].headline")
  sub=$(node -p "JSON.parse(require('fs').readFileSync('$R/store/listings/$CODE.json','utf8')).captions[$((i-1))].sub")
  node "$R/store/tools/compose-shot.cjs" "$RAW/$CODE/raw-$i.png" "$OUT/${NAMES[$((i-1))]}.png" "$head" "$sub" >/dev/null
done
echo "composed $CODE → store/screenshots-localised/$CODE"
