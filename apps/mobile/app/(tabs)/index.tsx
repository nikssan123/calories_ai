import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type {
  Allowance,
  ChatAction,
  ChatMessage,
  ChatStreamEvent,
  DaySummary,
  FoodItemInput,
  Meal,
  UnitSystem,
} from '@ct/shared';
import { formatNumber, inferMeal, isDeletion, unitsOf } from '@ct/shared';
import { ChatActionCard } from '@/components/ChatCard';
import { Composer, type ComposerPayload } from '@/components/Composer';
import { FoodEditor } from '@/components/FoodEditor';
import { Markdown } from '@/components/Markdown';
import { Material } from '@/components/Material';
import { PressableChunk } from '@/components/Chunk';
import { MeterChip, PencilGlyph, PlanWall } from '@/components/PlanWall';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api, planLimitOf } from '@/lib/api';
import { uploadPhotoFile } from '@/lib/image';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/lib/entitlements';
import { enqueue, newId } from '@/lib/outbox';
import { useOutbox } from '@/hooks/useOutbox';
import { duration, ease, font, type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { onEntryRemoved } from '@/lib/removals';
import { writeDaySnapshot } from '@/lib/snapshot';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';

/** Optimistic rows carry a local id until the server assigns the real one. */
interface Bubble {
  key: string;
  role: 'user' | 'assistant';
  content: string;
  photoUrl?: string;
  pending?: boolean;
  failed?: boolean;
  actions?: ChatAction[];
  /**
   * This turn just happened, rather than having been read back from the
   * server. The only thing it changes is whether a correction wears its ring:
   * reopening the app must not flash every correction in the last forty
   * messages, because none of them is news any more.
   */
  live?: boolean;
  /**
   * The tool the model is running right now, while this row is still pending.
   * Set from the stream and cleared when text starts arriving again, so the
   * wait says "logging food" rather than nothing.
   */
  tool?: string;
  /**
   * What the turn said on its way to the answer — the sentence before a tool
   * call, which the server does not persist. Shown while the row is pending
   * and dropped when the reply lands. See `applyEvent`.
   */
  steps?: string[];
  /**
   * This turn was refused because the plan is spent, and the row is the wall
   * rather than a reply.
   *
   * A field on the bubble rather than a modal over the screen, and that is the
   * whole design: the refusal lands in the transcript where the answer would
   * have been, scrolls with it, and is still there tomorrow. Nothing is
   * dismissed and nothing is covered — see `PlanWall`.
   *
   * `text` is what they were trying to say, carried so the manual form can open
   * with their own sentence already in it.
   */
  wall?: { allowance: Allowance | null; message: string; text: string };
}

/** Near enough to the end that a new message should still carry the view. */
const NEAR_BOTTOM_PX = 64;

/**
 * The empty-state suggestions. Only the run carries a unit, and it carries one
 * because a distance without one is not a sentence anybody says — so there are
 * two lists rather than a placeholder to substitute into.
 */
const RUN_DISTANCE: Record<UnitSystem, string> = { metric: '5km', imperial: '3 mile' };

const prompts = (tr: ReturnType<typeof useT>, units: UnitSystem): string[] => [
  tr('journal.promptEggs'),
  tr('journal.promptLunch'),
  tr('journal.promptRun')(RUN_DISTANCE[units]),
  tr('journal.promptProtein'),
];

/**
 * The product itself: one continuous conversation.
 *
 * The web pairs this with the day on a wide screen; here the day is its own
 * tab, so this is the phone layout and only that — status bar welded to the
 * top, conversation, composer welded to the bottom.
 */
export default function JournalScreen() {
  const colors = useColors();
  const { profile, refresh: refreshAuth, adoptProfile } = useAuth();
  const units = unitsOf(profile);
  /*
   * The language this screen is drawn in, which is also the language the reply
   * has to come back in. Sent with every turn: the profile's preference wins on
   * the server, and this is what answers for an account that has none — where
   * the app is following the device and the model would otherwise write English
   * underneath a Bulgarian interface. See `ChatRequest.locale`.
   */
  const locale = useLocale();
  const tr = useT();
  const toast = useToast();
  const { adopt, refresh: refreshPlan } = useEntitlements();

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);

  /*
   * The buzz that says a turn logged something.
   *
   * A turn is the app's main way of putting food in the journal — "two eggs
   * and toast" — and it is the one path that never announces itself. The
   * stream carries prose, the model decides mid-sentence whether to call the
   * tool, and nothing in the events says outright "that landed". What is
   * certain is the day that comes back with the reply, so the test is the
   * honest one: if the number moved, something was logged.
   *
   * Held in a ref rather than read off `day`, because the send callback is
   * memoised against the profile and deliberately does not close over the day
   * it is about to replace.
   */
  const consumed = useRef<number | null>(null);
  const commitDay = useCallback((next: DaySummary) => {
    if (consumed.current !== null && next.consumed.kcal !== consumed.current) haptics.logged();
    consumed.current = next.consumed.kcal;
    setDay(next);
    // The home screen learns what the journal just learned. Safe here because
    // the journal is always today — see `today.tsx` for the case that is not.
    void writeDaySnapshot(next);
  }, []);
  /*
   * Setup, held for the whole app rather than for this screen.
   *
   * It used to live here, and that is exactly why setup was skippable: this
   * screen knew the profile was half empty and the five screens drawing targets
   * off it did not. See `lib/onboarding.tsx`.
   */
  const { state: onboarding, pending: setupPending, refresh: refreshOnboarding } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  /*
   * The count, hidden for this launch.
   *
   * Deliberately not persisted. It comes back next launch because the number it
   * reports will have changed by then — and a warning somebody silenced once,
   * forever, is a warning that fails at the only moment it was for.
   */
  const [dismissedCount, setDismissedCount] = useState(false);

  const scroller = useRef<ScrollView>(null);
  /*
   * Whether the conversation is parked at its end. Everything that grows it
   * follows it down while this holds, and nothing does once the reader has
   * scrolled back through history.
   */
  const pinned = useRef(true);
  /** Guards the one-time setup kickoff against re-renders and remounts. */
  const kickedOff = useRef(false);
  /**
   * The day, for the callbacks that need only its date.
   *
   * Same reason as `bubblesRef`: `logManually` is a prop on memoised rows and
   * must not be rebuilt every time the day's calorie total moves, but the local
   * date it queues against has to be the current one. This app's day turns over
   * at 4am, so taking the date off the device clock instead would file a meal
   * eaten at 1am under tomorrow.
   */
  const dayRef = useRef<DaySummary | null>(null);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  /** Lets `send` see the messages it started from without depending on them. */
  const bubblesRef = useRef<Bubble[]>([]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [history, today] = await Promise.all([api.history(40), api.day()]);
        if (cancelled) return;
        setBubbles(history.messages.map(toBubble));
        consumed.current = today.consumed.kcal;
        setDay(today);
        void writeDaySnapshot(today);
      } catch {
        // Reported by the empty conversation rather than over it: there is no
        // toast here, and an error bar above a blank screen says less than the
        // screen already does.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * A meal deleted somewhere else in the app, struck through here.
   *
   * The server writes the same mark onto the stored card, so this is not what
   * makes it stick — it is what makes it happen now. This tab is mounted the
   * whole time the Today tab is being used and reads its history exactly once,
   * at launch, so without this the card sits here counting a meal the reader
   * just watched leave the other screen, until the next cold start.
   */
  useEffect(
    () => onEntryRemoved((entryId) => setBubbles((prev) => strike(prev, entryId))),
    [],
  );

  /*
   * Reaching the end is not one scroll but a series: a photo has no height
   * until it decodes, so the column keeps growing under a scroll that has
   * already finished. `onContentSizeChange` is the RN spelling of the web's
   * ResizeObserver on the column — it fires on every one of those growths, and
   * following it is what stops a freshly opened journal parking just above the
   * message it was opened to read.
   */
  const stickToBottom = useCallback(() => {
    if (pinned.current) scroller.current?.scrollToEnd({ animated: false });
  }, []);

  /**
   * Re-read the day. Stable, because it is a prop on every memoised row — an
   * inline arrow would hand each of them a new function on every render and
   * quietly undo the memoisation while looking like it worked.
   */
  const refreshDay = useCallback(() => {
    void api.day().then(setDay).catch(() => {});
  }, []);

  /*
   * A queued meal that has landed, folded into the status bar.
   *
   * The manual form on the wall below writes to the outbox rather than to the
   * API — the same path Today uses, so an offline log behaves identically from
   * either screen — and the outbox sends on its own schedule. Watching the
   * queue *shrink* is the signal that something reached the server, and it is
   * the only one there is: nothing else on this screen is told.
   *
   * A count rather than the contents, because a meal added and a meal sent in
   * the same tick would net to zero on any comparison finer than this one and
   * neither would be worth the redraw.
   */
  const queued = useOutbox().length;
  const wasQueued = useRef(queued);
  useEffect(() => {
    if (queued < wasQueued.current) refreshDay();
    wasQueued.current = queued;
  }, [queued, refreshDay]);

  /**
   * A meal typed into the wall, handed to the queue rather than to the API.
   *
   * Identical to Today's manual path on purpose, down to going through the
   * outbox on a perfect connection: two code paths that differ only under bad
   * network are two code paths that diverge where it is hardest to notice. The
   * `client_id` is what makes the retry safe.
   *
   * Nothing about this spends a meter, which is the entire point of offering it
   * here — see `plans.ts` on why the free tier can be as small as it is.
   */
  const logManually = useCallback(
    (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => {
      void enqueue({
        kind: 'create',
        id: newId(),
        userId: profile?.id ?? '',
        localDate: dayRef.current?.local_date ?? '',
        payload: {
          description: draft.description,
          meal: draft.meal,
          eaten_at: new Date().toISOString(),
          items: draft.items,
        },
        queuedAt: new Date().toISOString(),
      });
      const kcal = draft.items.reduce((sum, item) => sum + item.kcal, 0);
      toast.success(`Logged ${draft.description} — ${Math.round(kcal)} kcal`);
    },
    [profile?.id, toast],
  );

  /**
   * A scan, arriving in the conversation.
   *
   * The scanner logs through its own route rather than a turn, so nothing here
   * had written the meal down — the packet went into the status bar and the
   * Today tab and left the journal with a gap where a meal should be. The
   * server now stores the message with the card on it and returns it, so this
   * is the same row a relaunch would show, put in without waiting for one.
   */
  const onScanned = useCallback(
    (message: ChatMessage) => {
      // Scanning is a request to be at the end of the conversation, wherever
      // the reader had scrolled back to — the same as sending.
      pinned.current = true;
      setBubbles((prev) => [...prev, toBubble(message)]);
      refreshDay();
    },
    [refreshDay],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pinned.current =
      contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_BOTTOM_PX;
  }, []);

  const send = useCallback(
    async (payload: ComposerPayload) => {
      const localKey = `local-${Date.now()}`;
      // Ids the server had already given us. Anything outside this set
      // afterwards arrived during this turn, which is clock-free evidence that
      // it landed.
      const known = new Set(bubblesRef.current.map((b) => b.key));
      // Sending is a request to be at the end of the conversation, wherever the
      // reader had scrolled back to.
      pinned.current = true;

      const replyKey = `${localKey}-reply`;
      // Render the user's message immediately — a multi-second wait before
      // anything appears would break the "continuous conversation" feel.
      setBubbles((prev) => [
        ...prev,
        { key: localKey, role: 'user', content: payload.text, photoUrl: payload.photoPreview },
        { key: replyKey, role: 'assistant', content: '', pending: true },
      ]);
      setBusy(true);

      try {
        /*
         * The photo goes phone-to-bucket, and the turn carries a key. Expo's
         * `File.upload` streams the file the picker already wrote to disk, so
         * the bytes never enter JS — a phone never has to hold several
         * megabytes in memory to send a photo it is sitting on.
         *
         * Any failure falls back to base64, which still logs the meal, and says
         * so in `photo_upload_failed` so a bucket that has quietly stopped
         * accepting writes does not look like one nobody configured.
         */
        let photoKey: string | undefined;
        let uploadFailed = false;
        if (payload.photoPreview && payload.photoMediaType) {
          try {
            const ticket = await api.photoUploadTicket(payload.photoMediaType);
            if (ticket.url && ticket.key) {
              const ok = await uploadPhotoFile(
                payload.photoPreview,
                payload.photoMediaType,
                ticket.url,
              );
              if (ok) photoKey = ticket.key;
              else uploadFailed = true;
            }
          } catch {
            uploadFailed = true;
          }
        }

        const result = await api.chatStream(
          {
            text: payload.text,
            photo_key: photoKey,
            photo_base64: photoKey ? undefined : payload.photoBase64,
            photo_media_type: payload.photoMediaType,
            photo_upload_failed: uploadFailed || undefined,
            scanned: payload.scanned,
            locale,
          },
          // The stream is a preview of the reply, never the record of it:
          // `result` below is what actually lands in the conversation. So this
          // only ever touches the one pending row, and nothing here has to be
          // undone.
          (event) =>
            setBubbles((prev) => prev.map((b) => (b.key === replyKey ? applyEvent(b, event) : b))),
        );

        setBubbles((prev) =>
          prev.map((b) =>
            b.key === replyKey
              ? {
                  ...b,
                  key: result.message.id,
                  content: result.message.content,
                  pending: false,
                  tool: undefined,
                  // The trace was scaffolding for the wait. The reply it was
                  // standing in for is here now, and it says the same things.
                  steps: undefined,
                  actions: result.actions,
                  live: true,
                }
              : b,
          ),
        );
        // A turn can delete an entry too, and the card that logged it is
        // somewhere above in this same conversation.
        for (const action of result.actions) {
          if (isDeletion(action) && action.entry_id) {
            const gone = action.entry_id;
            setBubbles((prev) => strike(prev, gone));
          }
        }
        commitDay(result.day);
        // What the turn just spent, so the count above the composer is right
        // without a request of its own. See `ChatResponse.allowance`.
        if (result.allowance) adopt(result.allowance);
        // The turn may have changed the profile — units, diet, a name. Adopting
        // it here is what makes "switch me to pounds" take effect now rather
        // than at the next launch.
        adoptProfile(result.profile);

        /*
         * set_profile may have completed setup during this turn — and the meal
         * this turn logged may have opened the rest of the app without setup
         * being finished at all. Both are answered by the same question, asked
         * of the one place the tab bar can also read it from.
         */
        if (!onboarding?.complete) {
          const state = await refreshOnboarding();
          if (state?.complete) void refreshAuth();
        }
      } catch (e) {
        /*
         * A price, not a fault, and told apart before anything else.
         *
         * This is the branch this whole screen used to get wrong: a 402 fell
         * through to the transport handler below and became a red sentence in
         * the conversation, which reads as the app being broken at the exact
         * moment it is asking to be paid for. It is also the one failure where
         * nothing was attempted — no turn ran, no meal was logged — so there is
         * nothing to reconcile and asking the server about it would be a wasted
         * round trip on a screen somebody is waiting on.
         *
         * The row becomes the wall instead, carrying what they typed so the
         * free path opens with their own sentence in it.
         */
        const limit = planLimitOf(e);
        if (limit) {
          if (limit.allowance) adopt(limit.allowance);
          else void refreshPlan();
          setBubbles((prev) =>
            prev.map((b) =>
              b.key === replyKey
                ? {
                    ...b,
                    content: '',
                    pending: false,
                    tool: undefined,
                    steps: undefined,
                    wall: { ...limit, text: payload.text },
                  }
                : b,
            ),
          );
          return;
        }

        /*
         * A lost response is not a lost turn. The server commits the message
         * and the reply together at the very end, so a connection that dies
         * while waiting — a phone changing network, a screen locking mid-upload
         * — leaves the meal logged but the answer undelivered. Ask what actually
         * happened before calling it a failure, or the obvious retry logs the
         * meal twice.
         */
        const landed = await reconcile(known);
        if (landed) {
          setBubbles(landed.bubbles);
          commitDay(landed.day);
        } else {
          const message = (e as Error).message;
          setBubbles((prev) =>
            prev.map((b) =>
              b.key === replyKey
                ? {
                    ...b,
                    content: message,
                    pending: false,
                    tool: undefined,
                    steps: undefined,
                    failed: true,
                  }
                : b,
            ),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [
      locale,
      onboarding?.complete,
      refreshOnboarding,
      refreshAuth,
      adoptProfile,
      commitDay,
      adopt,
      refreshPlan,
    ],
  );

  // A new account opens straight into setup: the agent introduces itself and
  // asks for what it needs, rather than pointing at a settings form.
  useEffect(() => {
    if (loading || kickedOff.current) return;
    if (!onboarding || onboarding.complete) return;
    if (bubbles.length > 0) return;
    kickedOff.current = true;
    /*
     * In their language, not in English. This sentence is sent *as the user* —
     * it is the first bubble in the transcript and the sentence the model
     * answers — so an English one under a Bulgarian interface both reads wrong
     * and quietly argues for an English reply.
     */
    void send({ text: tr('journal.kickoff') });
  }, [loading, onboarding, bubbles.length, send, tr]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      /*
       * `padding` on both platforms, and no offset.
       *
       * The usual advice is that Android resizes its own window and needs
       * nothing here. That stopped being true with edge-to-edge: the window now
       * spans the keyboard instead of shrinking away from it, so the composer
       * simply ends up underneath. Padding driven by the keyboard events works
       * the same way on both, and the offset is zero because the tab bar —
       * which is the only other thing down there — takes itself off screen
       * while the keyboard is up. See `useKeyboardVisible`.
       */
      behavior="padding"
    >
      <StatusBar day={day} loading={loading} setupPending={setupPending} />

      <ScrollView
        ref={scroller}
        style={styles.flex}
        contentContainerStyle={styles.column}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={stickToBottom}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {loading && <ChatSkeleton />}

        {!loading && bubbles.length === 0 && onboarding?.complete && (
          <View style={styles.empty}>
            {/* The one screen in the app with room for a mascot, and the one
                that otherwise offers a new account a wall of text. */}
            <Text style={styles.mascot}>🍽️</Text>
            <Text style={[t.largeTitle, { color: colors.foreground }]}>
              {tr('journal.emptyTitle')}
            </Text>
            <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>
              {tr('journal.emptyBody')}
            </Text>
            <View style={styles.prompts}>
              {prompts(tr, units).map((prompt) => (
                <PressableChunk
                  key={prompt}
                  depth={3}
                  radius={999}
                  onPress={() => void send({ text: prompt })}
                  accessibilityRole="button"
                  contentStyle={[
                    styles.prompt,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.promptLabel, { color: colors.secondaryForeground }]}>
                    {prompt}
                  </Text>
                </PressableChunk>
              ))}
            </View>
          </View>
        )}

        {bubbles.map((bubble) => (
          <Row
            key={bubble.key}
            bubble={bubble}
            today={day?.local_date}
            timezone={profile?.timezone}
            onLogged={refreshDay}
            onLogManually={logManually}
          />
        ))}
      </ScrollView>

      {/*
        The count, three messages out, and only then.
        
        Above the composer rather than in the conversation: it is about the app
        rather than about the food, and a line that reappears in the transcript
        every time you open the journal is an advert. Here it sits with the
        controls, says a number, and goes away when it is dismissed or when
        there is nothing left to count. See `MeterChip`.
      */}
      {!dismissedCount && <MeterChip meter="chat" onDismiss={() => setDismissedCount(true)} />}

      <Composer
        onSend={(p) => void send(p)}
        // A scanned packet is logged by the scanner itself, without a turn — so
        // the message it produced is dropped into the conversation here, and the
        // status bar above told to re-read itself.
        onLogged={onScanned}
        disabled={busy}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * One streamed frame folded into the row it belongs to.
 *
 * Text before a tool call is a preamble — "Let me log that" — and is not part
 * of the reply the server persists, which is the model's final message. So it
 * cannot stay in the body of the bubble: the real answer would replace it and
 * a sentence the reader was halfway through would change under them.
 *
 * It does not get deleted either, which is what this used to do and what read
 * as a bug — a line appearing, vanishing a second later, and the whole reply
 * arriving after it. On `tool` the preamble moves into `steps`, where it stays
 * beside the dots as the trace of what the turn is doing, until the reply it
 * was announcing arrives and takes over. Nothing on screen is ever removed
 * before the thing that replaces it exists.
 */
function applyEvent(bubble: Bubble, event: ChatStreamEvent): Bubble {
  switch (event.type) {
    case 'text':
      return { ...bubble, content: bubble.content + event.text, tool: undefined };
    case 'tool': {
      const said = bubble.content.trim();
      return {
        ...bubble,
        content: '',
        steps: said ? [...(bubble.steps ?? []), said] : bubble.steps,
        tool: event.name,
      };
    }
    case 'reset':
      // A run that died and is being started over. Its trace described that
      // run, so it goes with it.
      return { ...bubble, content: '', steps: undefined, tool: undefined };
    default:
      // `done` and `error` never reach here — the client resolves or throws on
      // them — but a frame from a newer server should be ignored, not rendered.
      return bubble;
  }
}

/**
 * What to call the pause while a tool runs.
 *
 * Keyed on the verb rather than on all thirty-odd tool names, because the names
 * are already `verb_noun` and a table of every one of them would be a second
 * place to update whenever a tool is added. An unknown verb falls through to
 * the plain dots.
 */
const TOOL_VERBS: Record<string, StringKey> = {
  log: 'tool.log',
  update: 'tool.update',
  delete: 'tool.delete',
  get: 'tool.get',
  search: 'tool.search',
  find: 'tool.find',
  set: 'tool.set',
  show: 'tool.show',
  suggest: 'tool.suggest',
  import: 'tool.import',
  adapt: 'tool.adapt',
  save: 'tool.save',
  plan: 'tool.plan',
  cook: 'tool.cook',
  repeat: 'tool.repeat',
  remember: 'tool.remember',
  forget: 'tool.forget',
  lookup: 'tool.lookup',
  run: 'tool.run',
  define: 'tool.define',
  ask: 'tool.ask',
};

/**
 * The verb alone, and deliberately not the object — see the web twin. The tool
 * name's second half is an identifier, so appending it printed half a sentence
 * in English inside an otherwise translated status line.
 */
function toolLabel(name: string, tr: ReturnType<typeof useT>): string | null {
  const [verb = ''] = name.split('_');
  const key = TOOL_VERBS[verb];
  return key ? tr(key) : null;
}

/**
 * Marks every card drawn from an entry that has since been deleted.
 *
 * The mark itself is the server's — it writes it onto the stored cards as the
 * entry goes, so a relaunch is right whatever the app was doing at the time.
 * This is the same edit applied to the copy already on screen, because the
 * conversation is read once at launch and would otherwise go on showing the
 * meal until the next one.
 *
 * Untouched bubbles keep their identity: the rows are memoised, and rebuilding
 * every one of them to strike a single card would redraw the whole journal.
 */
function strike(bubbles: Bubble[], entryId: string): Bubble[] {
  return bubbles.map((bubble) =>
    bubble.actions?.some((action) => action.entry_id === entryId && !action.removed)
      ? {
          ...bubble,
          actions: bubble.actions.map((action) =>
            action.entry_id === entryId ? { ...action, removed: true } : action,
          ),
        }
      : bubble,
  );
}

/**
 * A stored message as a bubble. `actions` comes back from the server with the
 * turn, so a reopened conversation still shows what it was answered with.
 */
function toBubble(message: ChatMessage): Bubble {
  return {
    key: message.id,
    role: message.role,
    content: message.content,
    photoUrl: message.photo_url ? api.photoUrl(message.photo_url) : undefined,
    actions: message.actions,
  };
}

/**
 * Re-reads the conversation after a send failed at the transport. Returns the
 * server's version of it when this turn is present there, and null when the
 * request really never arrived.
 */
async function reconcile(
  known: Set<string>,
): Promise<{ bubbles: Bubble[]; day: DaySummary } | null> {
  try {
    const [history, today] = await Promise.all([api.history(40), api.day()]);
    if (!history.messages.some((m) => !known.has(m.id))) return null;
    return { bubbles: history.messages.map(toBubble), day: today };
  } catch {
    // The network is still down; report the original failure.
    return null;
  }
}

/** Compact always-visible answer to "how am I doing today?" (§25). */
function StatusBar({
  day,
  loading,
  setupPending,
}: {
  day: DaySummary | null;
  loading: boolean;
  setupPending?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const locale = useLocale();
  const frame = [styles.status, { borderBottomColor: colors.border, paddingTop: insets.top + 10 }];

  if (loading || !day) {
    return (
      <Material style={frame}>
        <Skeleton style={styles.statusSkeleton} />
      </Material>
    );
  }

  if (setupPending) {
    return (
      <Material style={frame}>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('setup.inProgress')}</Text>
      </Material>
    );
  }

  const { consumed, targets } = day;
  const remaining = targets.kcal - consumed.kcal;
  const pct = Math.min(100, (consumed.kcal / Math.max(1, targets.kcal)) * 100);
  const over = remaining < 0;

  return (
    <Material style={frame}>
      <View style={styles.statusRow}>
        <Text style={[t.figure, styles.statusFigure, { color: colors.foreground }]}>
          {formatNumber(Math.round(consumed.kcal), locale)}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {` / ${formatNumber(targets.kcal, locale)} kcal`}
          </Text>
        </Text>
        {/* Ink rather than red — see the note on --destructive in globals.css. */}
        <Text
          style={[
            t.footnoteBold,
            t.tnum,
            { color: over ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {over
            ? tr('journal.over')(formatNumber(Math.abs(remaining), locale))
            : tr('journal.left')(formatNumber(remaining, locale))}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Bar pct={pct} color={over ? colors.foreground : colors.calories} />
      </View>

      {/*
        §9: the bar tracks the plain target, so a run never quietly enlarges the
        budget. But logging one has to visibly change this screen — otherwise
        the only feedback is a chat bubble — so the burn and the net sit under it.
      */}
      {day.burned_kcal > 0 && (
        <Text style={[t.footnoteSemibold, t.tnum, styles.burn, { color: colors.mutedForeground }]}>
          <Text style={{ fontFamily: font.bold, color: colors.exerciseText }}>
            {tr('journal.burned')(formatNumber(day.burned_kcal, locale))}
          </Text>
          {tr('journal.net')(formatNumber(day.net_kcal, locale))}
        </Text>
      )}
    </Material>
  );
}

/**
 * The fill, which travels rather than jumps.
 *
 * `transition: width var(--dur-spring) var(--ease-spring)` on the web, and the
 * overshoot is the point: logging a meal is the moment the app is meant to feel
 * like it did something, and a bar that is simply at its new length the next
 * frame reports the same fact without any of that. It is also the only feedback
 * on this screen that the number at the top changed.
 */
function Bar({ pct, color }: { pct: number; color: string }) {
  const reduced = useReducedMotion();
  const width = useSharedValue(pct);

  useEffect(() => {
    width.value = reduced
      ? pct
      : withTiming(pct, { duration: duration.spring, easing: ease.spring });
  }, [pct, reduced, width]);

  const style = useAnimatedStyle(() => ({
    // The spring overshoots, and a fill wider than its track paints out of the
    // rounded end — so the clamp lives here rather than in the easing.
    width: `${Math.max(0, Math.min(100, width.value))}%`,
  }));

  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

/**
 * Memoised, which matters here rather than elsewhere.
 *
 * A streamed reply lands as tens of state updates a second, and every one of
 * them would otherwise re-render the whole conversation to add a word to the
 * last row. `bubble` is a fresh object only for the row that changed, so with
 * `onLogged` held stable by the caller this narrows each delta to the one row
 * it actually touches.
 */
const Row = memo(function Row({
  bubble,
  today,
  timezone,
  onLogged,
  onLogManually,
}: {
  bubble: Bubble;
  today?: string;
  /** For guessing which meal a manually typed entry belongs to. */
  timezone?: string;
  onLogged: () => void;
  onLogManually: (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => void;
}) {
  const colors = useColors();
  const tr = useT();

  if (bubble.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userStack}>
          {bubble.photoUrl && (
            <Image
              source={{ uri: bubble.photoUrl }}
              style={[styles.photo, { borderColor: colors.border }]}
              resizeMode="cover"
            />
          )}
          {bubble.content.length > 0 && (
            <View style={styles.userBubbleWrap}>
              <View
                style={[styles.userLedge, { backgroundColor: colors.caloriesDeep }]}
                pointerEvents="none"
              />
              <View style={[styles.userBubble, { backgroundColor: colors.primary }]}>
                <Text style={[t.body, styles.userText, { color: colors.primaryForeground }]}>
                  {bubble.content}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (bubble.wall) {
    return (
      <View style={styles.assistantRow}>
        <Wall wall={bubble.wall} timezone={timezone} onLogManually={onLogManually} />
      </View>
    );
  }

  const label = bubble.tool ? toolLabel(bubble.tool, tr) : null;
  const waiting = bubble.pending && !bubble.content;
  /*
   * The weekly review is the one turn whose card *replaces* the words rather
   * than illustrating them: the card folds the prose into itself, so drawing
   * both would print the review twice — once unfolded above the thing built to
   * fold it. Every other card in the app sits under its reply.
   */
  const review = bubble.actions?.find((action) => action.card?.type === 'review');

  return (
    <View style={styles.assistantRow}>
      {/*
        What the turn said before it went to work, kept where it cannot be
        mistaken for the answer: quiet, one line per step, and gone the moment
        the reply arrives. It is the same words the model wrote, so it reads as
        the turn narrating itself rather than as a message that changed its mind.
      */}
      {bubble.pending && bubble.steps && bubble.steps.length > 0 && (
        <View style={styles.steps}>
          {bubble.steps.map((step, i) => (
            <Text key={i} style={[t.footnote, { color: colors.mutedForeground }]}>
              {step}
            </Text>
          ))}
        </View>
      )}

      {waiting ? (
        <Waiting label={label} />
      ) : review ? null : (
        <Markdown
          text={bubble.content}
          style={
            bubble.failed
              ? { color: colors.destructive, fontFamily: font.semibold }
              : undefined
          }
        />
      )}

      {bubble.actions && bubble.actions.length > 0 && (
        <View style={styles.actions}>
          {bubble.actions.map((action, i) => (
            <ChatActionCard
              key={`${action.entry_id ?? action.kind}-${i}`}
              action={action}
              // The two action kinds that are a correction rather than a new
              // fact, and the only thing that tells them apart on screen from a
              // fresh log — both arrive as a card with a number on it.
              touched={
                bubble.live === true &&
                (action.kind === 'food_updated' || action.kind === 'exercise_updated')
              }
              // The workout card posts its own answer and the server rewrites
              // this message's card into a receipt — so it has to know which
              // message it is sitting on.
              messageId={bubble.key}
              today={today}
              onLogged={onLogged}
              // Only the review card reads this; see the note above.
              text={bubble.content}
            />
          ))}
        </View>
      )}
    </View>
  );
});

/**
 * A refused turn, and the two ways forward from it.
 *
 * The manual form opens *inside the conversation*, under the wall, rather than
 * sending anybody to the Today tab to find it. That is the part that makes this
 * an answer rather than a redirect: the sentence they typed is still on screen
 * two rows up, the form opens with it already in the name field, and the meal
 * ends up in the same day it would have.
 *
 * `logged` is what happens afterwards, and it matters more than it looks. A
 * form that simply closed would leave the wall sitting there as the last word
 * on a turn that did, in the end, work — so the card says so instead, and says
 * the thing worth knowing: that path is always open and never costs anything.
 */
function Wall({
  wall,
  timezone,
  onLogManually,
}: {
  wall: NonNullable<Bubble['wall']>;
  timezone?: string;
  onLogManually: (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  if (logged) {
    return (
      <View style={styles.wallDone}>
        <PencilGlyph color={colors.mutedForeground} size={13} />
        <Text style={[t.footnoteSemibold, styles.wallDoneText, { color: colors.mutedForeground }]}>
          Logged by hand — that way is always open, and never counts against
          anything.
        </Text>
      </View>
    );
  }

  if (open) {
    return (
      <View style={styles.wallForm}>
        <FoodEditor
          entryId={null}
          initialMeal={inferMeal(new Date(), timezone ?? 'UTC')}
          // Their own words, so the refusal did not cost them the sentence.
          initialDescription={wall.text}
          onCreate={(draft) => {
            onLogManually(draft);
            setLogged(true);
          }}
          onCancel={() => setOpen(false)}
        />
      </View>
    );
  }

  return (
    <PlanWall
      allowance={wall.allowance}
      message={wall.message}
      /*
       * Only where there is genuinely a free way to do the same thing. That is
       * true of both journal meters — a message and a photo scan are both ways
       * of saying what you ate, and typing it in says the same thing for
       * nothing. It would not be true of a meal plan, which is why this is a
       * check rather than an assumption.
       */
      onLogManually={
        !wall.allowance || wall.allowance.meter === 'chat' || wall.allowance.meter === 'photo'
          ? () => setOpen(true)
          : undefined
      }
    />
  );
}

/**
 * The dots are for silence, not for waiting.
 *
 * They cover only the gaps the stream cannot fill — before the first word, and
 * while a tool is running, which is where the label comes from. Once text is
 * arriving it speaks for itself, and there is deliberately nothing decorating
 * it: text that is visibly growing already reads as live.
 */
function Waiting({ label }: { label: string | null }) {
  const colors = useColors();
  const tr = useT();
  const dots = [colors.protein, colors.carbs, colors.fat];

  return (
    <View style={styles.waiting} accessibilityLabel={label ?? tr('journal.thinking')}>
      <View style={styles.dots}>
        {dots.map((color, i) => (
          <Dot key={color} color={color} index={i} />
        ))}
      </View>
      {label && (
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label}…</Text>
      )}
    </View>
  );
}

/**
 * One of the three, bouncing.
 *
 * `animate-bounce` rather than the fade an earlier version of this used, and
 * the difference is not decoration: three dots taking turns to light up is a
 * *progress* indicator, and there is no progress to report — the model has not
 * said how long it will be. A bounce says only that something is still
 * happening, which is the whole of what is known.
 *
 * Tailwind's keyframes, ported exactly: a quarter of its own height, and the
 * two halves carry different easings so the fall accelerates and the rise
 * settles. Reduced motion leaves the dots still rather than substituting
 * something quieter — the web resolves that with a blanket rule, so this does
 * too, and the label beside them still says what is going on.
 */
function Dot({ color, index }: { color: string; index: number }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      y.value = 0;
      return;
    }
    y.value = -BOUNCE;
    y.value = withDelay(
      index * 140,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 500, easing: Easing.bezier(0.8, 0, 1, 1) }),
          withTiming(-BOUNCE, { duration: 500, easing: Easing.bezier(0, 0, 0.2, 1) }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reduced, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** `translateY(-25%)` of a 10px dot. */
const BOUNCE = 2.5;

function ChatSkeleton() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.userRow}>
        <Skeleton style={{ height: 44, width: 192, borderRadius: 22 }} />
      </View>
      <View style={{ gap: 8 }}>
        <Skeleton style={{ height: 16, borderRadius: 8 }} />
        <Skeleton style={{ height: 16, width: '60%', borderRadius: 8 }} />
      </View>
    </View>
  );
}

/**
 * The tucked corner of a sent bubble — `rounded-br-lg`, which is `--radius-lg`.
 *
 * Worth naming rather than inlining, because the radius scale is overridden
 * wholesale in `@theme inline` and `lg` is 16px here, not Tailwind's stock 8.
 * Read as the stock value it makes the tuck twice as sharp as the web's, which
 * is small on paper and the difference between a bubble and an arrow on screen.
 */
const TUCK = 16;

const styles = StyleSheet.create({
  // The wall and the form it opens both sit at the assistant row's own width,
  // with the ledge's overhang held open so the card below does not ride up it.
  wallForm: { paddingBottom: 4 },
  wallDone: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  wallDoneText: { flexShrink: 1 },
  flex: { flex: 1 },
  status: { borderBottomWidth: 2, paddingHorizontal: 16, paddingBottom: 10 },
  statusSkeleton: { height: 16, width: 160, borderRadius: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  statusFigure: { fontSize: 16, lineHeight: 24 },
  track: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
  burn: { marginTop: 6 },
  column: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  empty: { paddingTop: 40 },
  mascot: { fontSize: 44, lineHeight: 52, marginBottom: 12 },
  blurb: { marginTop: 12, lineHeight: 24 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 28 },
  prompt: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  promptLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  userRow: { alignItems: 'flex-end' },
  userStack: { maxWidth: '85%', alignItems: 'flex-end', gap: 8 },
  /*
   * Square, where the web keeps the photo's own proportions under a `max-h-72`.
   *
   * The web can do that because an `<img>` sizes itself once it decodes; an RN
   * `<Image>` with a remote source has no intrinsic size and lays out at
   * whatever it is told, so honouring the aspect ratio means knowing it, and
   * the ratio of a photo pulled from `photo_url` is not known until it is
   * fetched. A fixed square with `cover` is the version that never lays out at
   * zero height and never distorts; carrying the real dimensions through is
   * worth doing when the photo becomes tappable.
   */
  photo: { width: 240, height: 240, borderRadius: 24, borderWidth: 2 },
  /*
   * The ledge again, and drawn by hand rather than with <Chunk> because this
   * one is not a rounded rectangle: the corner nearest the sender is tucked in,
   * which is the whole reason a chat bubble reads as coming *from* somewhere.
   */
  userBubbleWrap: { alignSelf: 'flex-end' },
  userLedge: {
    position: 'absolute',
    top: 3,
    right: 0,
    bottom: -3,
    left: 0,
    borderRadius: 22,
    borderBottomRightRadius: TUCK,
  },
  userBubble: {
    borderRadius: 22,
    borderBottomRightRadius: TUCK,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // `leading-relaxed`, which overrides the 24 that `text-body` sets.
  userText: { fontFamily: font.semibold, lineHeight: 26 },
  assistantRow: { maxWidth: '92%', gap: 10 },
  actions: { gap: 6 },
  receipt: { borderWidth: 2, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  steps: { gap: 4, paddingBottom: 2 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  skeleton: { gap: 20, paddingTop: 16 },
});
