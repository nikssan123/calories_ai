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
  - **Dark is the lamp off in the room, not a later hour.** A scene's window shows the light theme's sky for the hour with the light taken out of it (`sceneSkyAt`, `dim`), and every wall, hill and lawn is that hour's own colour dimmed. Night's colours, and the stars, are for the hours that are actually night — they used to be for the whole of dark, so a kitchen at one in the afternoon was purple, lamplit and under a starfield.

### Three traps worth knowing
- **Every animated layer is `collapsable={false}`.**
  - Fabric flattened some of them away. Reanimated's sync-props path then logged a warning with a full stack trace every frame, on every build, not only debug: about 200 a second on Today, which caused an ANR on the emulator.
  - Check with `adb logcat | grep -c "W Reanimated: Caused by"`. At rest it should read 0.
- **Keep animation hooks out of wrappers that most cards don't use.**
  - When every meal card's wrapper held its own `useAnimatedStyle`, cards stopped showing. `ChatCard`'s `Land` entrance left them at opacity 0.
  - `CardPeek` is a plain view, and only the active card mounts the animated `Peeker`.
- **An arrival is two halves, keyed on different things.** `Seat.prime()` runs on every `emit()` and only puts the figure *off-stage*, ready to come in; the half that flies it back is an effect keyed on `here`.
  - So anything that stages an arrival without moving `here` — a re-claim of a seat the figure never left — primes them out of the scene and leaves them there. The cast simply disappears.
  - That is what made returning to the journal from Cook a dead cut for so long: only the journal and Today call `claimAll`, so the stage still had everyone on the composer and `claim` took its `occupancy === to` no-op. Opening that gate alone is *not* the fix; `prime` has to wake the landing effect too (`primed`).
  - Cook hides it best of all: its kitchen draws its own figures in `Scenes.tsx`, so they look like they travelled when nothing moved. A screen that should hold the cast needs seats and a `claimAll` — never a drawing.

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

## Fourth pass: one cast, and the journal is home
Mockups: https://claude.ai/artifact/MC6P4DsJ1oaAdVBBy1EyM3

- **The journal opens first.** It's the first tab and the launch route again; Today is second and keeps its name.
  - The journal's header says hello for the hour (the Today greeting, one quiet serif line) and its ring is a button to Today.
  - Today has a "What have you eaten today?" strip at the head of the log that opens the journal with the keyboard up (`lib/compose.ts`).
  - Somebody who used the app when Today came first sees the tab pill glide home to the journal once.
- **One of each, per screen.** A character is in one place at a time.
  - Today's meal sections have their glossy icons back (Ember was on the shelf, breakfast and the snack at once).
  - The at-risk streak is the shelf's Ember hoping, not a second Ember in the chip; after midnight the shelf's Plum sleeps beside the note.
  - The journal lost its separate night Plum (it sleeps on the ledge now); the empty plate is on Today no more.
  - Cook's empty ideas make the kitchen's Skye think, instead of a second Skye under the scene. Exercise's empty state has no figure (the park has Ember).
  - Weekly review's icon is a glossy calendar. On the badge wall each character holds only their newest recent medal.
- **Colour for data, temperament for moments.** Colour is the macro wherever numbers are (the shelf, the card peek, the ring's dots). Otherwise: Ember is momentum (streaks, training, exercise), Skye curiosity (hellos, scans, ideas, firsts), Plum rest (night, the weekly look back, totals). Training badges moved to Ember, totals to Plum.
- **The stage** (`components/cast/stage.tsx`). Screens that share the cast declare seats; a character sits in one seat at a time.
  - Within a screen a move is a flight: a stand-in drawn over the tabs arcs from one seat's window rectangle to the other's, re-measures the destination part-way, and hands back to the seat's own figure with a squash. Native shared transitions are still blocked upstream (MOBILE-UX.md).
  - Between tabs nothing flies (tried, and three figures sailing up a page that is gliding sideways read wrong). The seat plays an entrance: into the journal they bound in from the right along the composer in their own gaits and the carrier pops up behind its card; into Today they drop onto the shelf.
  - A screen passes its own route to `claimAll`: its focus reaches its effects before `TabScene`'s listener does.
  - An entrance's start is set before the figure is drawn (from the store's notification, or the first render's values), or it is seen seated for a frame first.
- **The meal's journey.** The three sit on the composer (`CastLedge`). Sending hops them up into the reply row (the typing indicator is them, `WaitingSeats`); while the reply streams they wait on the ledge; when a card lands whoever it is mostly made of flies onto it, cheers, and tosses a spark in their macro's colour into the header ring, which holds its number until the spark arrives (fallback 3.6s). Today's ring no longer plays the logged moment for meals logged in the journal; it still does for Log again and meals typed in on Today.
- **A gait each** (`GAIT` in `Character.tsx`): Ember quick and springy, Skye floaty with a sway, Plum heavy with a deep squash. Loops, pokes, flights, entrances and springs all read from it.
- **The director** (`life.ts`): when one moves, the others glance toward them some of the time; Plum's yawn is catching for Skye; big moves share an 8s cooldown.
- **Memory.** Today's shelf cheers the meal the journal last caught, once (`castMemory`).
- **Pushed screens got the glow-up** (`components/ScreenHeader.tsx`): History (the calendar speaks the date strip's language, Intl weekday letters, Plum on the month), Achievements, Plan, the recipe reader, the coach invite and Purchased.
- **Performance.** The ledge figures don't breathe (a pixel at 30pt) except a sleeping Plum; a figure dozing because the phone was left alone holds still.

## Fourth pass, continued: signs of life
Ideas: https://claude.ai/artifact/UyVwiZMSFpQyQmi9TeSR8k

- **Listening while typing** (`lib/food-cast.ts`). The newest food word in the composer perks up whoever it is mostly made of (hopeful, a hop) and the others glance over. `foodEmoji`'s five-language table answers the word; a table maps each picture to a macro. Debounced 250 ms, once per word, at most every 1.5 s.
- **The typing indicator is the ledge.** While a turn is silent (and while the conversation loads) the three bounce where they sit; the reply row only says "Thinking…" or the tool's label. While the reply streams they look up at it.
- **A correction gets a nod** (`CardPeek correcting`): thinking, then a small nod. Cheering a fix read as praise for getting it wrong.
- **A coach's comment turns heads** (`lookAll('lookUp')`).
- **Waking up with you**: the first open of the morning (once a day per phone) — Plum yawns, Ember stretches, Skye waves.
- **Dozing on the counter**: two minutes untouched and they nod off, Plum, Skye, Ember, holding still; any touch wakes them the other way round with a yawn.
- **Evening and birthdays**: after dinner Plum sits with a mug; on the profile's birthday Skye holds a slice of cake (new `cake` prop).
- **Leaning against a scroll** the reader makes (never the app's own scrolls), each by their own amount, settling on a loose spring.
- **Pokes feel like them** (`haptics.poke`): Ember a double tick, Skye a soft tap, Plum a heavy thud.
- **Streak milestones in place** (`useStreakMoment`): no modal. The cast celebrates where it sits, confetti comes off the composer or the card, and the words are a card in the journal (under the chip on Today).
- **A new badge shows where it went.** `DaySummary.earned` (new, optional) carries the badges the read just earned; the holder flies to the Progress tab icon (`visit`, `useAnchor('tab.progress')`), the icon kicks, and they fly home. Needs the API deployed; an older server just never sends it.
- **Replay the day** (`components/ReplayDay.tsx`): hold Today's ring and the meals drop in above it in the order they were eaten, with times, as the ring fills and each meal's character hops on the shelf.
- **The widget draws whoever caught the last meal** (`DaySnapshot.lastCatch`, `lib/cast-memory.ts`).
- **The empty journal's plate**: the three pop up behind the rim one after another, as the hand-off from the plan reveal.

## Fifth pass: a tap that is theirs, and the tabs outside the journal
Ideas: https://claude.ai/artifact/22UVeJJPgo8L65ciWt7Zys

- **A poke is answered by whoever you poked** (`POKE` in `Character.tsx`). Every
  figure used to giggle, hearts and all, with the only difference in the thumb.
  Three rungs each now — the first answer, a louder one if the taps keep coming,
  and a held finger:
  - Ember flares (`proud`, the flame, a doubled bounce) → too much fire (three
    shortening hops) → leans into the finger and stays there.
  - Skye floats further than it meant to (`hopeful`, a sparkle) → hiccups
    bubbles (`thinking`) → tips its sprout at you and blinks twice.
  - Plum squashes flat with its eyes shut → turns its back with a zz → sinks
    under a hold and springs back slowly.
  - A second tap inside 1.2s climbs a rung; the loud rung then rests 6s. A poke
    takes over an ambient wave or bounce, never a held prop or a moment.
  - The turn away is 160ms and rides a small hop: a flat drawing mirroring
    passes through no width at all.
  - `poked` in `life.ts`: the others look over, and Skye copies Ember a beat
    later. Plum's pokes are its own business.
- **Scenes answer their tab** (`SceneCue` in `Scenes.tsx`). Whoever it names
  reacts if they are in the scene at that hour, and nobody does if they are not.
  - Cook: while a recipe is being written the kitchen takes its afternoon places
    at any hour and whoever is at the pot stirs over steam; the fridge photo
    coming back startles Skye; a recipe that lands gets tasted.
  - Exercise: a logged session runs Ember out along the path and back, and it
    arrives `puffed` — a new mood from poses already drawn, over a new `pant`
    motion (a breath three times as fast).
- **The fourth pass's two quietest things, louder.** A food word heard while
  typing had nowhere to play when it named whoever was up on the newest card, so
  a card's peeker takes the screen's cues too; and the lean against a scroll was
  weighted at half the reader's velocity, which nobody saw.
- **Today, and the pushed screens.** The strip hands over with a hop; a pull to
  refresh ducks them; a meal logged again is taken by whoever it is made of; the
  day turning over makes Plum yawn. Plum hops as History's month pages, the
  badge wall raises its newest medal, the porch answers a language picked and
  the light changed, and a finished purchase gets the three under its confetti.
- **A cue can be movement alone** (`Cue.mood` optional, plus `duck`), so a
  figure can answer without dropping what it is holding.
- **Not the cast.** The sparkline draws itself once, left to right, the first
  time it has a width; a set arriving in or leaving the workout editor animates.
- **R8 is on** (`expo-build-properties`), which is what Play's app-optimisation
  warning wanted: obfuscation was at 2% against a 25% threshold. Keeps for the
  widget receivers, the widget library and RevenueCat's models.

## The first open: two halves of an arrival, again

Both of these are the journal's newest card, and both were reported as one bug.

- **A flight needs a destination that has stopped moving.** A claim is made in
  the commit that causes it, and on a cold start that commit is forty messages
  arriving at once, with the list still at the top of them: the peek seat
  measured at y=1612 on an 800pt screen — twice the height of the phone, below
  everything — because `scrollToEnd` had not landed yet. The stand-in set off
  for there, and the mid-flight retarget then hauled it the whole way back. A
  figure crossing the screen and snapping onto the card is what the reader saw
  on every launch with a meal in the day.
  - So `settledSeat` asks the destination again, every frame, until it is on
    screen and in the same place twice running, and the seat they are leaving is
    measured only then — the stand-in has to set off from where the figure is in
    *that* frame, not where it was before the list scrolled. Nothing shows
    meanwhile: the flight is still `pending`, so the old seat is still drawing
    them. A seat that never settles is not somewhere to fly to, and the figure is
    simply put there.
  - The retarget is a correction now, never a jump: a destination that has gone
    off screen mid-flight is left where it was aimed.
- **The hands are part of the figure and must not arrive before it.** `PeekHands`
  is drawn in *front* of the card, where the rest of the carrier is behind it,
  and it was shown on `useSeated` alone. But a seat is occupied from the moment
  the journal claims it, while a tab switch stows the figure behind the card and
  springs it up a beat later (`STAGGER` + 260ms) — so two paws held the card's
  edge for a third of a second with nobody behind them. `Seat` now hands its
  entrance out (`offstage`, assigned in render because `prime` stages the figure
  on the notification, before anything draws), and the hands come up out of the
  edge with it.

## Performance: what made it lag, and the rules now
Measured on an emulator with the host GPU (the default AVD here renders on SwiftShader, whose frame times mean nothing) against a build of the previous commit, with `dumpsys gfxinfo framestats`.

- **Reanimated replays its props registry on every event dispatched during an Android draw**, and `react-native-svg` dispatches a layout event for every shape the first time it draws. Entries for views that no longer exist made each replay throw inside `MountingManager` and log a full stack trace — about a million a minute while switching tabs. Production had the same flood on scroll. `patches/react-native-reanimated@4.5.1.patch` skips views that don't exist. Check with `adb logcat | grep -c "synchronouslyUpdateUIProps failed"`; it should stay 0.
- **Seats never unmount their figure.** They hide it (`SeatPresence` stops its loops, blinks and fidgets). Mounting a figure is the expensive part, and unmounting one mid-animation left registry entries behind.
- **Never put your own `ref` on a Reanimated `Animated.*` view that has an animated style.** The tab icon's anchor did that and every frame app-wide cost five times the UI-thread work. Put the ref on a plain `View` around it.
- **No typing trio in the reply row**: three figures mounting per turn was the worst churn; the ledge bounces instead.
- Result on the same emulator: 0–0.5% janky frames idle, scrolling and switching tabs, and 2–4 ms of UI-thread work per frame, at or below the previous build.

## Not now
- **Direction B scenes** (drawn landscapes). Only if the cast reads too young.
- **The web app behind the login.** Only the landing page has the cast so far.
- **The iOS widget beyond its empty state.** Its medium Day widget is the ring card, and `dayLayout` finds no room beside the card's words.
