# Glow-Up

Make Day So Far feel premium by borrowing Moonly's approach, not its look. The six principles are atmosphere, depth, editorial type, a cinematic onboarding, emotional moments and illustration. All of them are carried out in our own warm palette: cream, green→teal and the macro colours.

Mockups: https://claude.ai/code/artifact/aed99166-bb22-4b1d-88fc-f1100da93e8f

## What we're changing
- **Sky header on Today.** A sky gradient that follows the clock. There is no sun or moon: the ring is the only object and gives off its own light. Every hour also has a dark-theme sky.
- **Glass surfaces** replace the 2px borders and the ledge slabs. Macro bars become glowing capsules.
- **Fraunces** for hero moments (greetings, questions, headlines), next to our existing sans.
- **3D splash.** The logo ring is extruded, tumbles, and has the macro dots orbiting it (Rive).
- **Cinematic onboarding.** Serif questions, 3D feature teases, a loader tied to the real API stages, and a plan reveal where the curve draws itself.
- **Logged moment.** Particles fly into the ring, a flash, then the streak flame, with haptics.
- **Paywall glow.** The Monthly/Yearly toggle and all tiers stay the same as in `upgrade.tsx`.
- **Scanner glow.**
- **12 glossy SVG icons** replace the emoji.

## Libraries
- **Already installed:** `react-native-reanimated` 4.5.1, `react-native-svg`, `expo-blur`, `expo-haptics`, `expo-sensors`, `expo-splash-screen`, `expo-font`, `expo-camera`.
- **To add:** `@shopify/react-native-skia` and `rive-react-native`. Both are native, so they need a `--local` rebuild on both platforms.
- **Skip:** `expo-gl` and three. Rive covers the 3D splash at a fraction of the cost.

The tokens are ported from `apps/web/app/globals.css`. Retheme both places together, or the app and the site will drift apart.

## Onboarding before account creation
Today `Gate()` in `apps/mobile/app/_layout.tsx` runs authenticated → emailVerified → needsSetup → onboarding. `lib/onboarding.tsx` calls `api.onboarding()`, which needs a session.

- The six questions write a **local draft** with no session.
- The plan is computed **client-side** for the reveal. Move the calorie/macro formula into a shared package or mirror it in `lib/`, with a test that pins it to the server's result.
- **New gate, no session:** if the draft is incomplete, go to onboarding; otherwise go to login ("Save your plan").
- **New gate, session and verified:** if the server says `needsSetup`, upload the draft when there is one, otherwise go to onboarding. If not, go to the tabs.
- Existing users on a new phone still skip onboarding, because the server returns `needsSetup=false`.
- `verify.tsx` posts the draft on the first verified session. The draft is cleared only after a 2xx.

## Layout rule
- **Nothing floats over text.** No FAB, chip, toast, orb or particle may sit on top of words at rest. Anything decorative lives in empty space or behind content; scroll views pad their ends so the last line clears the tab bar.

## Performance rules (every PR)
- All motion runs on the UI thread (reanimated worklets and Skia), with no per-frame `setState`. Sky colours interpolate once a minute.
- Use one Skia canvas for the Today header: sky, haze, ring and orbit. Draw bloom as a radial gradient or a snapshot, never as a live `Blur` over a large area.
- At most 3 `expo-blur` views per screen. Android gets a tinted translucent fallback, unless `experimentalBlurMethod` measures clean on the real device.
- Particles are capped at 16 and play once. The splash and the flame use Rive.
- Load a static Fraunces subset (Regular and Italic), not the variable file.
- Measure each phase on the Android phone over adb, using `dumpsys gfxinfo` jank % and the RN perf monitor. A screen that runs below 55 fps does not merge.

## Store and email
- **Screenshots:** recapture `store/screenshots/01…08` on the simulator after phase 3. Change the copy in `store/listings/*.json` only where it describes visuals, and have a native speaker read `bg.json`.
- **Email palette:** `apps/api/src/email/layout.ts` holds the palette, and `apps/api/test/email-layout.test.ts` pins it.
  - Move to a cream ground `#fbf3e7` and hairline `#eadcc9`.
  - Add a green→teal header band with a solid `bgcolor` fallback.
  - Set headings in `Fraunces, Georgia, serif`.
  - Keep `#0f7b5c` on buttons.
  - Mirror all of this in the dark overrides, then run that test file alone.

## Phases
1. **Foundation:** install Skia and Rive, then add the tokens, a `Glass` card with its Android fallback, the fonts, the 12 icons and the perf checklist.
2. **Onboarding before account:** the gate refactor above. Logic first.
3. **Arrival and onboarding:** the Rive splash, serif questions, the two 3D teases (real `View` trees, so they can be translated), the loader and the plan reveal.
4. **Today:** the sky header with its dark sky set, the ring, glass cards, capsules, and a date strip with "Back to today".
5. **Logged moment, paywall, scanner glow.**
6. **Emails, screenshots, listings, marketing cards.**
