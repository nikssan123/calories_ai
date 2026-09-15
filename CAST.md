# Cast

The logo's three macro dots become characters: **Ember** (protein, amber, flame tuft), **Skye** (carbs, blue, sprout) and **Plum** (fat, violet, drop). They follow on from the glow-up's "illustration" principle.

Mockups: https://claude.ai/artifact/N26P3aEFAHJQGXHGhp52wr

## Rules the drawings keep
- **React to showing up, never to the number.** No mood for over, under, gained or lost (STREAKS.md §1). There is no "disappointed" drawing.
- **Nothing floats over words at rest.** A character gets its own row or sits in empty space.
- **Today's sky keeps one object:** the ring. The cast lives below it and on other screens.
- **No words inside a drawing.** The only new copy is two strings, in all thirteen catalogues.
- **Paths and Reanimated only.** No Rive, no Lottie. Loops pause off-screen, and Reduce Motion holds the pose.

## What ships
1. **Typing indicator.** `Waiting` in the journal draws the trio hopping instead of three dots.
2. **Empty states.**
   - Journal and Today: the trio peeks over the empty plate.
   - Exercise: Ember.
   - Cook ideas: Skye, thinking.
3. **Streak moment.** At 7, 30, 100 and 365 days, shown once per run on whichever of Today or the journal is focused. Headline and body come from existing badge and streak copy, plus `cast.showedUp` and `cast.keepGoing`.
4. **Badge medallions.** The fourteen emoji in `Achievements.tsx` become drawn glyphs, tinted by group: streaks amber, training pink, firsts teal, totals blue.
5. **Welcome.** The trio stands under the ring, with Skye waving.
6. **After midnight.** Between 00:00 and `day_start_hour`, Today shows Plum asleep beside `setup.dayFooter`, which already explains where a 1am snack lands.
7. **Home-screen widget (Android).** `components/cast/figure.ts` holds the geometry, shared by `Character` and the widget's SVG string, so the two can't drift apart.
   - Before the app has left a note, the empty widget shows the trio saying hello.
   - Dragged to two rows and wide, the Day widget's one-line layout gets one figure at its start, only where the whole line, ratio included, still fits beside it:
     - Skye waving while nothing is logged.
     - Plum asleep after midnight.
     - Ember the rest of the day.

## The living cast (second pass)
The first pass left them at the edges: once somebody logged anything, they were gone. Mockups: https://claude.ai/artifact/MuxMDgnrCZyAQ2NMphSRYv

- **Idle life** (`components/cast/life.ts`).
  - One app-wide timer. Every 2.8–5.5s it picks one focused figure to glance, stretch, wave, yawn or hop.
  - Only figures at ease (`idle`, `sit`) take over their whole pose. Figures holding something, or in the middle of a moment, only glance or hop.
  - Nothing registers under Reduce Motion.
- **Pokes.** A tap gives a jump and a light haptic. A figure at ease also giggles. Figures are never announced to screen readers.
- **Presence on Today** (`Presence.tsx`).
  - The three sit on the macro card, each above its own bar. Their mood never follows the bar.
  - Each meal section's icon becomes one of them holding the meal.
- **Reactions in the journal.** `CardPeek` wraps every meal card, but only the newest is active.
  - Whoever the meal is mostly made of (by calories) peeks over it.
  - They pop up and cheer once when the card lands live.
  - A meal is caught once per session, so deleting a newer one never cheers.
  - There's no pop or buzz if the journal isn't focused.
- **After dark,** Plum sleeps at the end of the journal's status line.
- **Scenes** (`Scenes.tsx`). A kitchen under Cook's title and a park path under Exercise's, lit by `useSky()` for the hour:
  - Morning: a coffee at the window.
  - Afternoon and evening: somebody at the pot.
  - Night: the lamp on and Plum asleep.

### Two traps worth knowing
- **Every animated layer is `collapsable={false}`.**
  - Fabric flattened some of them away. Reanimated's sync-props path then logged a warning with a full stack trace every frame, on every build, not only debug: about 200 a second on Today, which caused an ANR on the emulator.
  - Check with `adb logcat | grep -c "W Reanimated: Caused by"`. At rest it should read 0.
- **Keep animation hooks out of wrappers that most cards don't use.**
  - When every meal card's wrapper held its own `useAnimatedStyle`, cards stopped showing. `ChatCard`'s `Land` entrance left them at opacity 0.
  - `CardPeek` is a plain view, and only the active card mounts the animated `Peeker`.

## Third pass: the app's own moments, the season, the site
- **Streak at risk:** Ember, hands clasped, beside "Log today to keep it" (`StreakChip`).
- **Scanned packet:** Skye, surprised, beside the product name (`BarcodeScanner`).
- **Weekly review:** its icon is Plum with a mug (`CastIcon`).
- **Badge earned in the last fortnight:** its group's character holds up a medal at the end of the row.
  - streaks: Ember
  - training: Plum
  - firsts and totals: Skye
- **Progress:** a hill scene. It's scenery, not a chart, so nothing on it moves with the numbers.
- **Onboarding:**
  - Skye looks over the top of the picked option (`EdgePeek`, clipped at the card's edge because the card is glass).
  - The plan reveal ends with the three of them cheering, then waving.
- **Seasons** (`useSeason`), northern-hemisphere months:
  - scarf: December–February
  - flower: March–May
  - leaf: September–November
- **Web:** the geometry moved to `@ct/shared/cast`, and the landing hero draws the three with CSS motion (`apps/web/components/Cast.tsx`).
- **Emails:** the signature's three bars are three round faces built from table cells, with nothing loaded, like the logo.
- **iOS widget:** the empty state and gallery preview show three faces built from Circle and Capsule.
- **Fix:** a journal card's `Land` entrance now starts on layout, not on mount.
- **You:** a porch scene under the title (`PorchScene`).
  - morning: Skye waves from the door, Ember has a coffee
  - afternoon: Ember hops in the garden, Plum sits on the bench
  - evening: all three sit on the porch edge
  - night: the lamp is on and Plum is asleep
- **Journal:** no scene. The empty state is the only room for one, only a new account sees it, and the plate already does that job.

## Not now
- **Direction B scenes** (drawn landscapes). Only if the cast reads too young.
- **The web app behind the login.** Only the landing page has the cast so far.
- **The iOS widget beyond its empty state.** Its medium Day widget is the ring card, and `dayLayout` finds no room beside the card's words.
