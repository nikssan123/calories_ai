#!/bin/bash
# capture.sh <play-code> <locale> — seeds the account in one language and captures three frames.
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; SP="${RAW_DIR:-$TMPDIR/daysofar-shots}"
A=/opt/homebrew/share/android-commandlinetools/platform-tools/adb
CODE=$1; LOCALE=$2
OUT=$SP/shots/$CODE; mkdir -p "$OUT"
w(){ t=$SECONDS; while [ $((SECONDS-t)) -lt "$1" ]; do :; done; }
cap(){ $A -s emulator-5554 exec-out screencap -p > "$OUT/$1.png"; }
# Two things went wrong on the run that shipped el-GR, hr and sr: the dev-client
# deep link is dropped often enough to matter — that run came back to a launcher —
# and 22 fixed seconds is not always enough for the journal to paint, so the
# capture caught its skeleton and the card went out full of blank pills.
# So: keep re-issuing the link, and wait for the corrected card's own number
# (780 kcal, store-shots.ts) to be on screen. Fail loudly if it never is.
LINK="daysofar://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8083"
up(){ $A -s emulator-5554 shell dumpsys activity activities 2>/dev/null |
      grep -q 'topResumedActivity.*com\.daysofar\.app'; }
# Match the card's own text, never a bare number: uiautomator writes bounds like
# [0,780][1080,900], so grepping 780 returns true on the splash screen. "~780" is
# the kcal on the corrected card and appears nowhere in the geometry.
till(){ t=$SECONDS
  while [ $((SECONDS-t)) -lt "$2" ]; do
    # The app must be the resumed activity before a dump counts. Straight after
    # force-stop the dump still returns the *previous* language's window, marker
    # and all — which is how a splash got captured with the match already true.
    # Re-issuing the link while it boots would send it back to the splash too,
    # so only start it when it is genuinely not up.
    if ! up; then $A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "$LINK" >/dev/null 2>&1; w 3; continue; fi
    $A -s emulator-5554 shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1 || continue
    $A -s emulator-5554 shell grep -q -- "$1" /sdcard/w.xml 2>/dev/null && return 0
  done
  echo "capture-shots: '$1' never appeared in ${2}s — $CODE not captured" >&2; exit 1; }

(cd "$R/apps/api" && npx tsx src/store-shots.ts "$R/store/listings/$CODE.json" "$LOCALE" >/dev/null)
$A -s emulator-5554 shell am force-stop com.daysofar.app; w 3
till '~780' 180; w 2
# Frame 2 — the journal sits at the newest message: the correction and the updated card.
cap raw-2
# Frame 1 — one screen up: the typed meal, the reply and the first card.
$A -s emulator-5554 shell input swipe 30 700 30 1750 500; w 3
cap raw-1
# Frame 3 — Today.
$A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "daysofar://today" >/dev/null 2>&1; w 7
cap raw-3
echo "captured $CODE"
