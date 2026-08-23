# Making the app feel like a phone app

`apps/mobile` is a faithful port. Every screen the web has that belongs on a
phone is there, the design language survived the crossing, and it has been
driven end to end against a live API.

Faithful is not the same as native. The port asked "what does the web do here?"
at every turn, which was the right question for getting it built and is the
wrong one for finishing it — because a phone can do things the browser was never
asked about, and it has habits the browser does not. Nothing below is a bug.
This is the list of what the port did not think to ask for.

Two of the sections are about *feel* rather than capability — haptics and
motion — and they are first on purpose. The app's whole visual language is
physical objects, and a phone is the only device that can finish that idea.
Reanimated is already carrying most of the weight; what it has not been asked to
do yet is the part people would notice.

Ordered by what I would do first, which is not the same as by size. **The first
three sections are now built** — haptics, the travelling tab lozenge, and
swipe-to-delete with undo. What they turned out to cost, and the two claims in
here they proved wrong, are noted in place.

---

## 1. Haptics — done

**The largest gap relative to this specific design, and the cheapest to close.**

The whole visual language is chunky physical objects. A button sits on a ledge,
and pressing it makes the surface travel exactly the depth of that ledge and
land flush — the metaphor is a key on a keyboard, and it is drawn everywhere:
`Chunk`, `PressableChunk`, the tab lozenge, the switch thumb, the day cells.

It looks physical and feels like nothing. On a phone that is a half-delivered
promise, because the phone is the one device that can finish it.

`expo-haptics`, three rules and roughly fifty lines:

- **Light impact** on every `PressableChunk` press.

  Written here as press-*in*, and built as `onPress` instead. Pairing the buzz
  with the visual sink is what a real key does, but a `Pressable` inside a
  `ScrollView` gets `onPressIn` on touch-down before the scroll is recognised,
  so every flick down a list would buzz on the way past. iOS hides most of that
  behind `delaysContentTouches` and Android does not — a platform split on
  exactly the thing this design cannot split on. A buzz a fraction late beats
  one that fires when you were only scrolling.
- **Success notification** when something is actually logged — a meal, a
  weigh-in, a cooked recipe. The moment the number moves.

  In the journal there is nothing that says outright whether a turn logged
  anything: the model decides mid-sentence and the stream never mentions it.
  What is certain is the day that comes back with the reply, so the test is
  literally whether the number moved.
- **One on a successful barcode decode.** The scanner is currently silent at the
  exact instant the user needs to know it worked, and they are holding a tin at
  an awkward angle and cannot see the screen well.

Reduced motion should not silence these. Haptics are not motion, and for someone
who turned animation off they are *more* of the feedback rather than less — the
existing `useReducedMotion` contract says the spring is decoration and the
information must survive it, which is an argument for the buzz rather than
against it.

## 2. Motion — done, except one item blocked upstream

**Reanimated is already in the app and already doing real work.** The ring's arc
springs open and its figure counts up, the macro bars stagger in at 70ms apart,
cards drop and bounce on arrival, the switch thumb overshoots, a meal's band
grows out of the day it landed in, the sheet fades its scrim and slides its
panel. None of that needs redoing.

What follows is the part it has not been asked to do — and one rule that matters
more than any item on the list.

### The rule: extend the vocabulary, do not start a second one

The app has a motion language already, lifted whole from the web: three cubic
béziers — `ease.spring` (overshoots and settles), `ease.pop` (overshoots harder)
and `ease.out` (settles without overshoot) — and two durations, `duration.spring`
at 700ms and `duration.quick` at 180ms.

Anything new should be expressible in those. An animation that needs a fourth
curve is usually an animation that belongs to a different app. The value of a
small vocabulary is that a screen full of independently-authored motion still
reads as one object behaving consistently, and that is exactly what is easy to
lose when "add some animation" is the brief.

### The bottom tabs — done

**Each of the six tabs used to own its own lozenge and cross-fade it in place.**
Tap Cook and Today's lozenge fades out while Cook's fades in — which is two
objects appearing and disappearing at once. It works, and it is the wrong mental
model: the lozenge is the *selection*, and there is only ever one selection.

Make it one lozenge that travels. A single `Animated.View` in the bar, its
`translateX` and width driven to the measured position of the active tab with
`ease.spring`, so it overshoots slightly and settles — the same curve the ring
and the bars already use. Selection then reads as a thing sliding to where you
pointed, which is both truer and considerably more satisfying.

Two smaller things on top of it:

- **A pop on the icon that was just chosen**, `ease.pop` over `duration.quick`,
  scale 1 → 1.12 → 1. Only the arriving one; popping the departing icon as well
  would draw the eye to where you just left.
- **Colour and weight crossfading as the lozenge lands** rather than switching
  on the frame of the tap, so the label appears to be lit by the lozenge's
  arrival rather than to change independently of it.

Deliberately *not*: per-tab character animations — the flame flickering, the
chef's hat lifting. Charming the first time and noise by the fortieth log of the
week, and the tab bar is on screen for the entire session.

Measured rather than assumed, on the emulator: the pill leaves 89, passes 722
and 886, overshoots to 1040 and settles back to 990. Six equal columns meant the
geometry fell out of one measurement of the row, so no tab had to report its own
— which stops being true the moment a tab is given a different width.

### Shared element transitions — **blocked upstream**

Tapping a recipe tile pushes a screen in from the right, and the tile's picture
and the reader's hero are two unrelated images of the same dish. Having the
tile's image **grow into the hero** is still the single most impressive thing
on this list, and it sits on the path people actually walk: Cook is a grid you
scan and then commit to, which is precisely the interaction a shared element is
*for* — it answers "where did that come from?" without a word.

It cannot be built on this stack, and the reason turned out not to be ours.

The first guess was the feature flag. `AnimatedComponent._configureSharedTransition`
returns immediately unless `ENABLE_SHARED_ELEMENT_TRANSITIONS` is on; it defaults
to false and only `setDynamicFeatureFlag` is exported. That much is real, and it
has a supported fix — both the Android Gradle build and the iOS podspec read a
`reanimated.staticFeatureFlags` block out of the app's own `package.json`, so no
patching is needed. A dev build with the flag set compiles
`ENABLE_SHARED_ELEMENT_TRANSITIONS:true` into the CMake arguments and
`getStaticFeatureFlag` returns `true` at runtime. Both were verified.

It still does nothing. Tags on both ends, `SharedTransitionBoundary` wrapping the
navigator, no errors — and the screens simply cross-slide.

The reason is one grep: **`react-native-screens` 4.26.2 does not mention shared
transitions anywhere**, in JS or in its Android sources. In Reanimated 3 this
feature was wired through react-native-screens on the old architecture. In
Reanimated 4 the machinery is all present — the flag, the native module, a
`SharedTransitionBoundary` component — and there is no navigator that drives it.
Android also logs `Could not find generated setter for class
REASharedTransitionBoundaryManager` on every launch, which fits a half-landed
feature.

So this is not waiting on our build any more; it is waiting on upstream. **The
thing to watch is react-native-screens gaining shared-transition support**, not
anything in this repo. Everything wired for it was reverted rather than left in
as props that promise what they cannot deliver.

### Lists — done

- **Layout animations on removal** shipped inside `SwipeRow` rather than at the
  call sites, so nothing can be given a swipe without them.
- **Entrance stagger** at 70ms — `MacroBars`' own interval, so the app arrives
  to one rhythm rather than three. Capped at the seventh row: past that the
  delay outlasts the patience of anyone about to scroll, and a list of twenty
  would spend a second and a half assembling itself. It rides on `SwipeRow` for
  the lists, and on a small wrapper on Cook, whose grid is the one that really
  does land all at once when a run finishes.

### Numbers that move — done for Today

`useCountUp` is out of `CalorieRing` and in `hooks/`. Today's total and the three
macro figures now travel rather than swap, which matters most where the change
was something the reader just did — they are looking straight at it, waiting for
an answer, and the ring beside them was already moving.

It starts from the value it is first handed, so opening a screen counts nothing
up. Counting from zero on every navigation is a tax dressed as a delight, and it
lands exactly when someone is trying to read the number.

**Still to do:** the Progress headline figures and the plan's per-night kcal.

### Scroll-driven — the header is done

- **Today's header condenses as you scroll.** It turned out to be an errand
  rather than a decoration: Today is the longest screen in the app and that
  header is the only way to History *and* the only way to step a day, so from
  the bottom of a Tuesday both were out of reach. Driven on the UI thread via
  `useAnimatedScrollHandler`, so it tracks the finger rather than lagging a
  frame behind it, and the JS thread hears about it exactly twice a screen —
  one boolean, which exists only so an invisible bar stops swallowing taps.
- **The tab bar retracting on scroll-down** in the Journal is tempting and I
  would hold it: the bar already disappears for the keyboard, and two independent
  reasons for the same chrome to vanish is how a layout starts feeling
  unpredictable.

### Skeletons — done

`Skeleton` used to pulse its opacity between 1 and 0.45. It now sweeps a light
band across itself, which reads as *working* where a pulse reads as *waiting* —
worth distinguishing on the one screen where the wait is genuinely long, since
half a minute of pulsing starts to look like something has hung. Drawn with an
SVG gradient, which the app already depends on, rather than adding a gradient
library for one band.

### The discipline

Three constraints, all of which the existing animations already honour and all
of which are easy to drop when adding more:

- **Reduced motion means jumping to the end state, never showing less.** The one
  exception is a loop, which has no end state worth arriving at — Confetti does
  not fire at all, and the skeleton settles at the dim end rather than never
  settling.
- **Everything on the UI thread.** `useAnimatedStyle` and
  `useAnimatedScrollHandler`, never per-frame `setState`. The journal learned
  this the expensive way: a streamed reply lands as tens of state updates a
  second, and re-rendering forty bubbles for each of them is why `Row` is
  memoised.
- **Nothing may delay input.** An entrance stagger that leaves the third tile
  untappable for 200ms is strictly worse than no stagger. Animate appearance,
  never availability.

## 3. Gestures the port does not have — done

### Swipe on a row to act on it — done

Five lists hung their destructive action on a 15pt trash mark with 10pt of
`hitSlop` — about 35pt of real target, not the ~15pt claimed here before anyone
counted the slop, but still under the 44pt minimum and reliably missable with a
thumb. So this is an accessibility fix as much as an idiom: the gesture is how
phones give a small control a big target without spending layout on it. The mark
stays where it is for discoverability.

Done on all five: Today's food and exercise rows, Exercise's sessions, the
pantry's items, and the shopping lines somebody typed — only those last ones,
since a line derived from the week's plan cannot be removed at all.

On Today's food rows it composes rather than competes: tap still expands to show
the items and the note, swipe reveals **delete** and **log again**.

Use `react-native-gesture-handler`'s `Swipeable`, which is already in the tree
as a Reanimated peer.

### Undo in the toast, not a confirmation — done

A confirmation dialog is a desktop habit and a bad trade on a phone: it costs
everyone a tap to protect the rare mistake, and it interrupts the thing you were
doing to ask whether you meant it.

The better shape is to act immediately and offer the reversal — *"Removed
chicken salad · Undo"* — which is faster in the common case and safer in the
rare one, because it survives the mis-tap you did not notice until the row
vanished.

The toast grew an action slot for it, and now exports its own lifetime, because
the offer and the grace period have to be the same four seconds.

**The server-side question answered itself.** The plan assumed undo meant
re-creating what had been deleted, and worried that `repeatFoodEntry` clones to
*now* — wrong time, and past midnight the wrong day. The way out is not to
delete during the window at all: the row leaves the screen at once and the
request is *held*, so undo is a `clearTimeout` and a state restore. The entry
keeps its own id, timestamp and day, and the API needs nothing new. If the app
dies inside the window the delete never runs and the entry stays, which of the
two ways this can fail is the recoverable one.

One consequence worth writing down: Today's totals now come off optimistically.
They used to be left to the reload that followed the delete, which was fine when
the delete went out immediately — holding it would have left the ring counting a
meal the reader had just watched leave the screen.

### Swipe down to dismiss a sheet — done

A gap the port introduced rather than inherited: `Sheet` closed by tapping the
scrim and nothing else. It has a grabber now, and the drag tracks the finger.

The gesture is on the header rather than the whole panel, which is the decision
worth stating. The body of a sheet is a `ScrollView`, and a pan over the whole
surface has to answer "is this a scroll or a dismiss?" on every touch — a
question it gets wrong often enough to be infuriating. A grabber is a small
explicit place where the answer is never in doubt, which is why every phone has
one.

It closes on distance *or* speed: a slow pull most of the way down and a quick
flick from the top are both unambiguously "close this", and judging on distance
alone turns the flick — the faster and commoner of the two — into a bounce back.
The scrim thins as the sheet is pulled away, so it reads as moving the whole
arrangement rather than sliding one card over a fixed grey pane.

### Swipe left and right on Today to step days — **dropped**

Not skipped for cost: dropped because the thing it was for went away.

The friction was that the chevrons live at the top of the longest screen in the
app, so stepping a day from the bottom of a Tuesday meant scrolling up first.
The condensing header in §2 fixed that — the chevrons are now reachable from
anywhere on the screen — and what is left for the gesture to buy is much
smaller.

Against that: a screen-level horizontal pan would compete with swipe-to-delete
on every row of the same screen. Both are horizontal, both start with a finger
moving sideways, and the arbitration between them is exactly the kind that is
wrong often enough to matter. Trading a shipped, tested gesture for a
convenience whose problem has already been solved is a bad deal.

**So a horizontal swipe in this app means one thing: act on this row.** That
also settles the open question below — it is one axis, and the axis is spoken
for.

### Tap the active tab to scroll to top — done

Standard, expected, and never reported when missing: people simply scroll, and
conclude this is one of the apps that does not do it.

A **single** tap on the already-selected tab, not the double-tap written here
before. Double-tapping is the gesture for something a single tap cannot already
express, and a single tap on the tab you are already on means nothing at all —
which makes it free. Reserving it for a second press would be inventing a rule
the platform does not have.

Wired through `tabPress`, so the bar emits and each screen listens; the bar has
no business knowing what any screen is scrolling. On Today, Progress, Exercise
and Cook. Not the Journal: a chat's home position is the bottom, and it already
goes there on its own.

## 4. What only a phone can do — push is built

This is where the value is, as opposed to the polish.

### A share-sheet target

Photograph a meal in the camera app, share, pick Day So Far, and land in the
composer with the photo attached.

The product's whole pitch is *say what you ate or photograph it*, and the photo
half currently begins with "first, open the app". Being in the share sheet moves
the app to where the photo already is. This is the single most on-brand thing on
the list after Siri.

### Push notifications — built; needs one credential

The profile carried `notify_weekly_review` and `notify_nudges` from the
beginning and both sent **email**. The switches existed; the transport did not.
It does now, through Expo's relay — one call reaches both APNs and FCM, which is
why the token table stores Expo's tokens rather than the platform-native ones.

**How loud is a nudge allowed to be?** Answered, since the plan said to answer it
before building the transport rather than after. The switch copy promises "at
most one a week", and that promise was made about the quieter medium — so a
nudge that reaches a phone does *not* also reach an inbox. One sentence, one
telling. Anyone with no device registered still gets the mail, and so does
anyone whose phone could not be reached, because a skipped send and a failed one
both mean the pocket stayed quiet.

The weekly review is the exception and earns it: the mail carries the review and
the push carries the news that it exists. Two different messages, so both go, and
the push deliberately does not try to quote the review — a weekly review is
something to sit down with, and squeezing it onto a lock screen only guarantees
it is skimmed in the one place it cannot be read properly.

The permission dialog is raised by turning a switch on and at no other moment,
where it is an answer to something the reader just did rather than a modal in
the way of an app they opened. Saying no is not reported: the preference still
holds and the notification still goes by email.

**What is left is a credential, not code.** Getting a token on Android needs FCM
— the emulator says so plainly, `FirebaseApp failed to initialize because no
default options were found` — and iOS needs an APNs key. Both are uploaded once
to the EAS project (`eas credentials`), and both belong to the account holder
rather than to the repository. Until then `registerForPush` returns
`unavailable`, nothing is registered, and every notification goes by email
exactly as it did before: verified on the emulator, switch on, no error shown.

### Siri, via App Intents

*"Hey Siri, log two eggs and toast"* is not a feature request, it is the
product's thesis said out loud. The journal already accepts exactly that sentence
over `chatStream`.

The real build here is an intent that hands a string to the API and reports the
kcal back, which is small — the cost is the native config and the App Intents
plumbing, which needs a dev client rather than Expo Go.

### A widget, and a home-screen quick action

The ring is the app's face and it is currently three taps away from the home
screen. A widget showing today's ring, and a long-press quick action that opens
straight into the composer with the keyboard already up.

## 5. What a phone needs and a desktop does not

### An offline queue for turns

A failed send already reconciles honestly — it asks the server what actually
landed rather than assuming, which is why a lost response does not double-log.
What it does not do is hold the message and try again.

Phones lose signal in supermarkets, gyms and lifts, which is precisely where and
when people log food. "I will send this when you are back" is the difference
between an app you can rely on and one you learn not to trust in a basement.

## 6. Two bugs in waiting

Neither is broken today. Both will be reported eventually.

### iPad

`app.json` sets `supportsTablet: true` *and* locks `orientation: "portrait"`,
and the web's `lg:` two-column layouts were deliberately not ported. An iPad
therefore gets a blown-up phone in portrait only.

Two honest options: drop tablet support, or port those layouts — which is
cheaper than it sounds, because the web already has them and the components are
the same ones. Pick one; the current state is neither.

### Dynamic Type

Every size and line height in `theme/typography.ts` is a fixed number, and
`DISPLAY_LEADING` exists precisely because RN clips a glyph that overflows a
short line box where CSS lets it hang out. At 200% text those numbers stop
holding, and the failure mode is the one already seen once: cropped text.

Decide whether large text is supported before someone reports it. If it is, the
leading has to be computed from the scaled size rather than baked.

---

## Open questions

**Is the share sheet worth a third-party plugin?** Android takes an intent
filter and nothing else. iOS needs a share *extension* — a second native target,
which Expo cannot generate without a community config plugin. Doing only Android
would split the platforms on a whole feature, which is a bigger version of the
split this design refuses everywhere else; so it is one dependency or neither.

---

## What is next

The three that were supposed to come first are in: haptics, the travelling
lozenge, and swipe-to-delete-with-undo — which did drag list layout animations
along with it, as predicted, and could not honestly have shipped without them.

Two bugs turned up while testing them, neither caused by them, both now fixed:
the pantry's rows were silently not swipeable because a `Modal` is its own
native window and the app's gesture root does not reach inside one; and `Sheet`
was animating its slide from a guessed height, because it read a ref that a
worklet had already frozen.

Since then the whole of §1–§3 has followed, and the condensing Today header with
it. Every item that Expo Go could build is built.

**There is now a dev client**, and it did not turn out to be the thing standing
between us and the showpiece. The shared element transition is blocked upstream:
Reanimated 4 has the machinery and `react-native-screens` has no idea it exists.
That is a wait, not a task.

What the dev build *does* unlock is the whole of §4, and the first of it is
built: **push notifications**, including the answer to how loud a nudge may be.
Only a credential stands between that and a phone actually buzzing, and it is
the account holder's to add.

Left in §4: the share-sheet target, App Intents, a widget. The first of those
still needs a decision before it needs code — see Open questions.
