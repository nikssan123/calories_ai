#!/usr/bin/env bash
#
# Build the iOS app on this machine rather than on an EAS builder — the
# counterpart of the Android line documented at the top of `app.config.js`.
#
# Two things a bare `eas build --platform ios --local` gets wrong here:
#
#   - **Xcode is not the active developer directory.** `xcode-select -p` points
#     at `/Library/Developer/CommandLineTools`, and moving it properly needs
#     sudo, so don't. Everything that matters reads `DEVELOPER_DIR` first, so
#     set it for the one command; the failure without it is `xcodebuild
#     requires Xcode`, which arrives several minutes in.
#   - **Fastlane is not a dependency of anything in this repo.** `--local` shells
#     out to it for the Xcode invocation, and finds it on PATH or not at all:
#     `spawn fastlane ENOENT`, ~40 seconds in, after it has already compressed
#     and fingerprinted the project. `brew install fastlane`. The check below
#     moves that failure to the first second.
#   - **`.env` never arrives.** `--local` copies the project into a temp
#     directory *honouring .gitignore*, and the root `.gitignore` ignores
#     `.env*`. Anything the bundle needs at build time — every
#     `EXPO_PUBLIC_*` — has to come from `eas.json`'s `env` block, not from the
#     file sitting beside this script. Same shape as the `google-services.json`
#     trap, and it fails the same quiet way: the app builds, and the paywall
#     reports that the store has nothing on sale.
#
# Usage:
#
#     pnpm build:ios          # store archive → build-*.ipa
#     pnpm build:ios:sim      # simulator .app → build-*.tar.gz
#
# The store archive needs a distribution certificate and a provisioning
# profile, which means a paid Apple Developer Program membership; without one
# EAS stops at the Apple sign-in with nothing to issue. The simulator build
# needs no credentials at all and is the one that runs today.
#
# What the simulator build cannot show you is **the widget**. Having no
# credentials, it signs with an empty entitlements set — `codesign -d
# --entitlements -` on the .app and on both .appex comes back `{}` — so App
# Group `group.com.daysofar.app` is never provisioned, the extension reads its
# own container instead of the shared one, finds no layout, and draws a blank
# rectangle rather than a red box. That is the build, not the widget. To see
# the widget on a simulator, drive xcodebuild directly with
# `CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES`,
# which signs ad-hoc and keeps the entitlements.

set -euo pipefail

profile=production
for arg in "$@"; do
  case "$arg" in
    --sim|--simulator) profile=simulator ;;
    *) echo "build-ios: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

# Honour an explicit DEVELOPER_DIR, then a properly-selected Xcode, then the
# usual place. Only the CommandLineTools instance is disqualified.
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  active=$(xcode-select -p 2>/dev/null || true)
  if [[ $active == */Xcode*.app/* ]]; then
    DEVELOPER_DIR=$active
  elif [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
    DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  else
    echo "build-ios: no Xcode found — install it, or set DEVELOPER_DIR." >&2
    exit 1
  fi
  export DEVELOPER_DIR
fi

if ! command -v fastlane >/dev/null 2>&1; then
  echo "build-ios: fastlane is not on PATH — \`eas build --local\` needs it." >&2
  echo "           brew install fastlane" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "build-ios: profile=$profile  DEVELOPER_DIR=$DEVELOPER_DIR"
exec npx eas-cli build --platform ios --profile "$profile" --local
