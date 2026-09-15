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
# the kcal on the corrected card and appears nowhere in the geometry. The card's
# title is matched as well, because it is this language's own: straight after
# force-stop a dump can still return the *previous* language's journal, marker
# and all, which is how a Welcome screen and a blank frame went out for hr.
TITLE=$(node -p "JSON.parse(require('fs').readFileSync('$R/store/listings/$CODE.json','utf8')).shots.cardTitle")
journal(){ $A -s emulator-5554 shell rm -f /sdcard/w.xml
  $A -s emulator-5554 shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1 || return 1
  $A -s emulator-5554 exec-out cat /sdcard/w.xml 2>/dev/null > "$OUT/.w.xml" || return 1
  grep -q -- '~780' "$OUT/.w.xml" && grep -qF -- "$TITLE" "$OUT/.w.xml"; }
till(){ t=$SECONDS
  while [ $((SECONDS-t)) -lt "$1" ]; do
    # The app must be the resumed activity before a dump counts. Re-issuing the
    # link while it boots would send it back to the splash, so only start it
    # when it is genuinely not up.
    if ! up; then $A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "$LINK" >/dev/null 2>&1; w 3; continue; fi
    journal && return 0
    # The app opens on Today since 1.2.0, and the frames start in the journal,
    # which is the root route. Asked for again on every miss, because a link
    # fired while the bundle is still loading is dropped.
    $A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "daysofar:///" >/dev/null 2>&1
    w 2
  done
  echo "capture-shots: the journal never appeared in ${1}s — $CODE not captured" >&2; exit 1; }
# A capture is retaken until it is a painted screen. Blank frames come back at
# about 20 KB and Today's loading skeleton at about 210 KB; every finished frame
# of these screens is well over 300 KB.
fresh(){ for n in 1 2 3 4 5 6 7 8; do
    cap "$1"; [ "$(stat -f%z "$OUT/$1.png")" -gt 300000 ] && return 0; w 2; done
  echo "capture-shots: $1 never finished painting — $CODE not captured" >&2; exit 1; }

# The cast idles on every screen since 1.3.0 (CAST.md), and uiautomator only dumps
# a window that has gone idle, so with animations on every dump fails and the
# wait below runs out. With them off the figures hold still, still drawn.
for s in animator_duration_scale transition_animation_scale window_animation_scale; do
  $A -s emulator-5554 shell settings put global $s 0; done
(cd "$R/apps/api" && npx tsx src/store-shots.ts "$R/store/listings/$CODE.json" "$LOCALE" >/dev/null)
$A -s emulator-5554 shell am force-stop com.daysofar.app; w 3
till 180; w 2
# A deep link that lands while the tab bar is still mounting leaves its pill on
# Today, and with animations off nothing moves it. Step off the journal and back,
# until the journal is what is on screen again.
for n in 1 2 3 4; do
  $A -s emulator-5554 shell input tap 126 2270; w 2
  $A -s emulator-5554 shell input tap 291 2270; w 3
  journal && break
  [ "$n" = 4 ] && { echo "capture-shots: could not get back to the journal — $CODE not captured" >&2; exit 1; }
done
# Frame 2 — the journal sits at the newest message: the correction and the updated card.
fresh raw-2
# Frame 1 — one screen up: the typed meal, the reply and the first card.
$A -s emulator-5554 shell input swipe 30 700 30 1750 500; w 3
fresh raw-1
# Frame 3 — Today.
$A -s emulator-5554 shell am start -a android.intent.action.VIEW -d "daysofar://today" >/dev/null 2>&1; w 7
fresh raw-3
rm -f "$OUT/.w.xml"
echo "captured $CODE"
