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

Ordered by what I would do first, which is not the same as by size.

---

## 1. Haptics

**The largest gap relative to this specific design, and the cheapest to close.**

The whole visual language is chunky physical objects. A button sits on a ledge,
and pressing it makes the surface travel exactly the depth of that ledge and
land flush — the metaphor is a key on a keyboard, and it is drawn everywhere:
`Chunk`, `PressableChunk`, the tab lozenge, the switch thumb, the day cells.

It looks physical and feels like nothing. On a phone that is a half-delivered
promise, because the phone is the one device that can finish it.

`expo-haptics`, three rules and roughly fifty lines:

- **Light impact** on every `PressableChunk` press-in. One place to change, and
  every chunky control in the app inherits it.
- **Success notification** when something is actually logged — a meal, a
  weigh-in, a cooked recipe. The moment the number moves.
- **One on a successful barcode decode.** The scanner is currently silent at the
  exact instant the user needs to know it worked, and they are holding a tin at
  an awkward angle and cannot see the screen well.

Reduced motion should not silence these. Haptics are not motion, and for someone
who turned animation off they are *more* of the feedback rather than less — the
existing `useReducedMotion` contract says the spring is decoration and the
information must survive it, which is an argument for the buzz rather than
against it.

## 2. Motion

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

### The bottom tabs

**Today each of the six tabs owns its own lozenge and cross-fades it in place.**
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

### Shared element transitions — the showpiece

Tapping a recipe tile currently pushes a screen in from the right, and the tile's
picture and the reader's hero are two unrelated images of the same dish.

Have the tile's image **grow into the hero**. `react-native-screens` supports
shared element transitions through expo-router, so the tile and the reader
declare the same tag and the transition is handled natively.

This is the single most impressive thing available here, and it happens to sit
on the path people actually walk: Cook is a grid you scan and then commit to,
which is precisely the interaction a shared element is *for* — it answers "where
did that come from?" without a word. The same trick would work from a History
day cell into Today.

### Lists

- **Entrance stagger.** `FadeInDown` with a per-item delay on Today's meal
  groups, Exercise's sessions and Cook's tiles. Use 70ms, which is what
  `MacroBars` already staggers at, so the whole app has one rhythm rather than
  three.
- **Layout animations on removal**, and this one is not optional if swipe-to-
  delete happens: without `Layout` and an `exiting` animation, a swiped row
  vanishes and the list snaps shut underneath your thumb. With them the gap
  closes and the gesture feels finished. These two features should ship together.

### Numbers that move

`CalorieRing` already counts its figure up rather than swapping it, and that is
the most-noticed animation in the app. Nothing else does it — not Today's total,
not the Progress headline figures, not the plan's per-night kcal.

Lift `useCountUp` out of `CalorieRing` into a hook and use it wherever a figure
changes in response to something the user just did. Not on first paint of a
screen: counting up from zero on every navigation is a tax, not a delight.

### Scroll-driven

- **Today's header condensing as you scroll** — the large date shrinking into a
  compact title. This is a very iOS thing and Reanimated does it properly, on the
  UI thread via `useAnimatedScrollHandler`, so it tracks the finger exactly
  rather than lagging a frame behind it.
- **The tab bar retracting on scroll-down** in the Journal is tempting and I
  would hold it: the bar already disappears for the keyboard, and two independent
  reasons for the same chrome to vanish is how a layout starts feeling
  unpredictable.

### Skeletons

`Skeleton` pulses its opacity between 1 and 0.45. A shimmer — a light band
sweeping across the shape — reads as "working" where a pulse reads as "waiting",
and the two are worth distinguishing on a screen where a recipe run genuinely
takes half a minute.

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

## 3. Gestures the port does not have

### Swipe on a row to act on it

Five lists currently hang their destructive action on a ~15pt trash target:
Today's food and exercise rows, Exercise's sessions, Pantry's items, the plan's
shopping lines. That is well under the 44pt minimum, so this is an accessibility
fix as much as an idiom — the gesture is how phones give a small control a big
target without spending layout on it.

On Today's food rows it composes rather than competes: tap still expands to show
the items and the note, swipe reveals **delete** and **log again**.

Use `react-native-gesture-handler`'s `Swipeable`, which is already in the tree
as a Reanimated peer.

### Undo in the toast, not a confirmation

A confirmation dialog is a desktop habit and a bad trade on a phone: it costs
everyone a tap to protect the rare mistake, and it interrupts the thing you were
doing to ask whether you meant it.

The better shape is to act immediately and offer the reversal — *"Removed
chicken salad · Undo"* — which is faster in the common case and safer in the
rare one, because it survives the mis-tap you did not notice until the row
vanished.

**This needs the toast extended.** `useToast()` today is `success`, `error` and
`message`, all text-only, with no slot for an action. Deleting is already
optimistic in the client, so undo is mostly a matter of holding the removed
entry and re-posting it; the API has `repeatFoodEntry`, but a true undo wants to
restore the original id and time rather than clone it to now, which is a small
server-side question rather than a client one.

### Swipe down to dismiss a sheet

A gap the port introduced rather than inherited. `Sheet` closes by tapping the
scrim and nothing else. Every sheet on a phone is expected to have a grabber you
can drag, and the drag should track the finger rather than being a tap target
that happens to live at the top.

### Swipe left and right on Today to step days

The chevrons work and should stay for discoverability, but the gesture is free
and is how a phone expects to move along a series. See the open question below
before doing this one.

### Double-tap the active tab to scroll to top

Standard, expected, and both the Journal and Progress get long enough to want it.

## 4. What only a phone can do

This is where the value is, as opposed to the polish.

### A share-sheet target

Photograph a meal in the camera app, share, pick Day So Far, and land in the
composer with the photo attached.

The product's whole pitch is *say what you ate or photograph it*, and the photo
half currently begins with "first, open the app". Being in the share sheet moves
the app to where the photo already is. This is the single most on-brand thing on
the list after Siri.

### Push notifications

The profile already carries `notify_weekly_review` and `notify_nudges`, and both
send **email**. On a phone, email is the wrong channel for a nudge — the switches
exist, the transport does not.

Worth being careful about: a nudge that arrives as a push is a much louder thing
than one that arrives in a mailbox, and the copy on the switch ("at most one a
week, when something in your log is worth a mention") is a promise made about the
quieter medium. Either the promise gets stricter or the switch splits in two.

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

**One gesture axis or two?** Six tabs is one past where a bottom bar is usually
said to stop, and horizontal swipe between tabs would relieve it. But that
directly contradicts swipe-to-step-days on Today. Pick one meaning for a
horizontal swipe and use it everywhere — two would be worse than neither.

**Does undo want a server-side restore?** Cloning a deleted entry to now is
nearly right and quietly wrong: the entry comes back at the wrong time and, if
the day boundary has passed, on the wrong day. A real `restore` is a small
endpoint and makes undo honest.

**How loud is a nudge allowed to be?** See push, above. This is a product
decision rather than an engineering one, and it should be made before the
transport is built rather than after.

---

## If only three things get done

Haptics, the travelling tab lozenge, and swipe-to-delete-with-undo — the last of
which drags list layout animations along with it and should not ship without
them.

Together they are a day or two, they touch every list, every button and the one
piece of chrome that is on screen for the whole session, and they change how the
app *feels* rather than what it can do. The shared element transition is the one
to do fourth, because it is the one people would mention to someone else.
