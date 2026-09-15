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

## Not now
- **Direction B scenes** (drawn landscapes). Only if the cast reads too young.
- **"Surprised" on the barcode sheet.**
- **The web client.** It has no cast yet.
- **The iOS widget.**
  - WidgetKit draws with `@expo/ui` shapes and has no SVG.
  - Its medium Day widget is the ring card, never the one-line layout, and `dayLayout` finds no spare room beside the card's words.
