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
  ChatAction,
  ChatMessage,
  ChatStreamEvent,
  DaySummary,
  OnboardingState,
  UnitSystem,
} from '@ct/shared';
import { unitsOf } from '@ct/shared';
import { ChatActionCard } from '@/components/ChatCard';
import { Composer, type ComposerPayload } from '@/components/Composer';
import { Markdown } from '@/components/Markdown';
import { Material } from '@/components/Material';
import { PressableChunk } from '@/components/Chunk';
import { Skeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { duration, ease, font, type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
   * The tool the model is running right now, while this row is still pending.
   * Set from the stream and cleared when text starts arriving again, so the
   * wait says "logging food" rather than nothing.
   */
  tool?: string;
}

/** Near enough to the end that a new message should still carry the view. */
const NEAR_BOTTOM_PX = 64;

/**
 * The empty-state suggestions. Only the run carries a unit, and it carries one
 * because a distance without one is not a sentence anybody says — so there are
 * two lists rather than a placeholder to substitute into.
 */
const PROMPTS: Record<UnitSystem, string[]> = {
  metric: [
    'Two eggs, toast and coffee',
    'Chicken and rice for lunch',
    'Went for a 5km run',
    'Am I eating enough protein?',
  ],
  imperial: [
    'Two eggs, toast and coffee',
    'Chicken and rice for lunch',
    'Went for a 3 mile run',
    'Am I eating enough protein?',
  ],
};

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

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const scroller = useRef<ScrollView>(null);
  /*
   * Whether the conversation is parked at its end. Everything that grows it
   * follows it down while this holds, and nothing does once the reader has
   * scrolled back through history.
   */
  const pinned = useRef(true);
  /** Guards the one-time setup kickoff against re-renders and remounts. */
  const kickedOff = useRef(false);
  /** Lets `send` see the messages it started from without depending on them. */
  const bubblesRef = useRef<Bubble[]>([]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [history, today, state] = await Promise.all([
          api.history(40),
          api.day(),
          api.onboarding(),
        ]);
        if (cancelled) return;
        setOnboarding(state);
        setBubbles(history.messages.map(toBubble));
        setDay(today);
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
        const result = await api.chatStream(
          {
            text: payload.text,
            photo_base64: payload.photoBase64,
            photo_media_type: payload.photoMediaType,
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
                  actions: result.actions,
                }
              : b,
          ),
        );
        setDay(result.day);
        // The turn may have changed the profile — units, diet, a name. Adopting
        // it here is what makes "switch me to pounds" take effect now rather
        // than at the next launch.
        adoptProfile(result.profile);

        // set_profile may have completed setup during this turn.
        if (!onboarding?.complete) {
          const state = await api.onboarding().catch(() => null);
          if (state) {
            setOnboarding(state);
            if (state.complete) void refreshAuth();
          }
        }
      } catch (e) {
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
          setDay(landed.day);
        } else {
          const message = (e as Error).message;
          setBubbles((prev) =>
            prev.map((b) =>
              b.key === replyKey
                ? { ...b, content: message, pending: false, tool: undefined, failed: true }
                : b,
            ),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [onboarding?.complete, refreshAuth, adoptProfile],
  );

  // A new account opens straight into setup: the agent introduces itself and
  // asks for what it needs, rather than pointing at a settings form.
  useEffect(() => {
    if (loading || kickedOff.current) return;
    if (!onboarding || onboarding.complete) return;
    if (bubbles.length > 0) return;
    kickedOff.current = true;
    void send({ text: "Hi — I'm new here. Let's get set up." });
  }, [loading, onboarding, bubbles.length, send]);

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
      <StatusBar day={day} loading={loading} setupPending={onboarding?.complete === false} />

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
              What have you eaten today?
            </Text>
            <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>
              Type it or take a photo — whatever&apos;s easiest. No forms, nothing to search for.
              Say what happened and I&apos;ll work out the rest.
            </Text>
            <View style={styles.prompts}>
              {PROMPTS[units].map((prompt) => (
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
            onLogged={refreshDay}
          />
        ))}
      </ScrollView>

      <Composer
        onSend={(p) => void send(p)}
        // A scanned packet is logged by the scanner itself, without a turn — so
        // the status bar above has to be told to re-read itself.
        onLogged={refreshDay}
        disabled={busy}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * One streamed frame folded into the row it belongs to.
 *
 * The clearing on `tool` is the part that is easy to get wrong by leaving it
 * out. Text before a tool call is a preamble — "Let me log that" — and is not
 * part of the reply the server persists, which is the model's final message. So
 * keeping it on screen buys a moment of extra text and pays for it with a
 * visible jump when the real answer replaces it.
 */
function applyEvent(bubble: Bubble, event: ChatStreamEvent): Bubble {
  switch (event.type) {
    case 'text':
      return { ...bubble, content: bubble.content + event.text, tool: undefined };
    case 'tool':
      return { ...bubble, content: '', tool: event.name };
    case 'reset':
      return { ...bubble, content: '', tool: undefined };
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
const TOOL_VERBS: Record<string, string> = {
  log: 'Logging',
  update: 'Updating',
  delete: 'Removing',
  get: 'Checking',
  search: 'Looking back',
  find: 'Finding',
  set: 'Saving',
  show: 'Drawing',
  suggest: 'Thinking up',
  import: 'Importing',
  adapt: 'Adapting',
  save: 'Saving',
  plan: 'Planning',
  cook: 'Cooking',
  repeat: 'Repeating',
  remember: 'Remembering',
  forget: 'Forgetting',
  lookup: 'Looking up',
  run: 'Running',
  define: 'Defining',
  ask: 'Asking about',
};

function toolLabel(name: string): string | null {
  const [verb = '', ...rest] = name.split('_');
  const gerund = TOOL_VERBS[verb];
  if (!gerund) return null;
  return rest.length > 0 ? `${gerund} ${rest.join(' ')}` : gerund;
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
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
          Setting up — your target is a placeholder until we finish.
        </Text>
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
          {Math.round(consumed.kcal).toLocaleString()}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {` / ${targets.kcal.toLocaleString()} kcal`}
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
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
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
            −{day.burned_kcal.toLocaleString()} burned
          </Text>
          {` · net ${day.net_kcal.toLocaleString()} kcal`}
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
  onLogged,
}: {
  bubble: Bubble;
  today?: string;
  onLogged: () => void;
}) {
  const colors = useColors();

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

  const label = bubble.tool ? toolLabel(bubble.tool) : null;
  const waiting = bubble.pending && !bubble.content;

  return (
    <View style={styles.assistantRow}>
      {waiting ? (
        <Waiting label={label} />
      ) : (
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
              // The workout card posts its own answer and the server rewrites
              // this message's card into a receipt — so it has to know which
              // message it is sitting on.
              messageId={bubble.key}
              today={today}
              onLogged={onLogged}
            />
          ))}
        </View>
      )}
    </View>
  );
});

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
  const dots = [colors.protein, colors.carbs, colors.fat];

  return (
    <View style={styles.waiting} accessibilityLabel={label ?? 'Thinking'}>
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
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  skeleton: { gap: 20, paddingTop: 16 },
});
