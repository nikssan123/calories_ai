# Making the app feel like a phone app

`apps/mobile` is a faithful port. Every screen the web has that belongs on a
phone is there, the design language survived the crossing, and it has been
driven end to end against a live API.

Faithful is not the same as native. The port asked "what does the web do here?"
at every turn, which was the right question for getting it built and is the
wrong one for finishing it — because a phone can do things the browser was never
asked about, and it has habits the browser does not. Nothing below is a bug.
This is the list of what the port did not think to ask for.

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

## 2. Gestures the port does not have

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

## 3. What only a phone can do

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

## 4. What a phone needs and a desktop does not

### An offline queue for turns

A failed send already reconciles honestly — it asks the server what actually
landed rather than assuming, which is why a lost response does not double-log.
What it does not do is hold the message and try again.

Phones lose signal in supermarkets, gyms and lifts, which is precisely where and
when people log food. "I will send this when you are back" is the difference
between an app you can rely on and one you learn not to trust in a basement.

## 5. Two bugs in waiting

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

## If only two things get done

Haptics and swipe-to-delete-with-undo. Together they are about a day, they touch
every list and every button in the app, and they are the two that change how the
whole thing feels rather than what it can do.
