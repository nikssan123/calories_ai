#!/bin/bash
# capture.sh <play-code> <locale> — seeds the account in one language and captures three frames.
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; SP="${RAW_DIR:-$TMPDIR/daysofar-shots}"
A=/opt/homebrew/share/android-commandlinetools/platform-tools/adb
CODE=$1; LOCALE=$2
OUT=$SP/shots/$CODE; mkdir -p "$OUT"
w(){ t=$SECONDS; while [ $((SECONDS-t)) -lt "$1" ]; do :; done; }
cap(){ $A -s emulator-5554 exec-out screencap -p > "$OUT/$1.png"; }

(cd "$R/apps/api" && npx tsx src/store-shots.ts "$R/store/listings/$CODE.json" "$LOCALE" >/dev/null)
$A -s emulator-5554 shell am force-stop com.daysofar.app
$A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "daysofar://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8083" >/dev/null 2>&1
w 22
# Frame 2 — the journal sits at the newest message: the correction and the updated card.
cap raw-2
# Frame 1 — one screen up: the typed meal, the reply and the first card.
$A -s emulator-5554 shell input swipe 30 700 30 1750 500; w 3
cap raw-1
# Frame 3 — Today.
$A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "daysofar://today" >/dev/null 2>&1; w 7
cap raw-3
echo "captured $CODE"
