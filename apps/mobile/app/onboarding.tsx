import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import type { ActivityLevel, Goal, Sex, Targets, UnitSystem } from '@ct/shared';
import {
  ACTIVITY_LEVELS,
  bodyWeightToKg,
  bodyWeightUnit,
  calculateTargets,
  cmToFeetInches,
  feetInchesToCm,
  formatWeightDelta,
  predictTdee,
  toBodyWeight,
} from '@ct/shared';
import { GlowButton } from '@/components/GlowButton';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Trio } from '@/components/cast/Character';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Advance, Rail, Step } from '@/components/onboarding/Chrome';
import { Measure, Segmented, Stepper } from '@/components/onboarding/Inputs';
import { DateWheel } from '@/components/onboarding/DateWheel';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { MeasureAsk } from '@/components/onboarding/MeasureAsk';
import { PlanReminder, type PlanReminderChoice } from '@/components/onboarding/PlanReminder';
import { Building, Plan, projectionFor } from '@/components/onboarding/Reveal';
import { Stage } from '@/components/onboarding/Stage';
import { DayTease, JournalTease } from '@/components/onboarding/Tease';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BIRTH_DATE_FLOOR } from '@/lib/birth-date';
import { setPreferredLocale, useLocale, useT, type StringKey } from '@/lib/i18n';
import { reachedStep } from '@/lib/funnel';
import { analyticsAvailable, logOnce, setConsent, storedConsent, type Consent } from '@/lib/analytics';
import { useOnboarding } from '@/lib/onboarding';
import { registerForPush } from '@/lib/push';
import { applyReminders, loadReminders } from '@/lib/reminders';
import { column, type as t, useColors, useType } from '@/theme';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Setup, as a form somebody walks through once.
 *
 * This replaced a conversation. The agent used to collect these seven values by
 * asking for them two at a time, which read beautifully in a transcript and
 * lost people in practice for three reasons worth writing down, because they
 * are the reasons not to put it back:
 *
 * - **A chat has no edge.** Nothing on screen said how many questions there
 *   were or how far in you had got, so "one more thing" was indistinguishable
 *   from "this never ends". Half the accounts that received the opening message
 *   never answered it.
 * - **Free text is a guess at both ends.** Somebody typing "about 5 foot 10ish"
 *   is trusting a model to round, and the model is trusting them to have meant
 *   height. Neither trust is necessary: these are seven values from small,
 *   known sets, and a set is a control.
 * - **It cost money to be slow.** Every setup answer was a model turn, on the
 *   one screen where the app has told the user nothing useful yet.
 *
 * What survives from it is the shape of the questions, and it survives on
 * purpose: two or three facts per screen, plain language, units carried by the
 * height-and-weight question rather than asked on their own, and the language
 * offer made once at the start where somebody reading in the wrong one can
 * still find it. The old brief argued all of those, and it argued them well.
 *
 * **It now runs before there is an account** (GLOW-UP.md). With no session the
 * answers go into a draft on the phone, the plan is worked out here with the
 * same shared arithmetic the server uses, and the last button saves the plan
 * by asking for an account — `lib/onboarding.tsx` writes the draft up once one
 * exists. A signed-in account that is not set up yet (made on the web, say)
 * still walks the same screens and saves straight to the server.
 *
 * Between the questions sit two looks at the product (`Tease.tsx`), and the
 * whole walk stands in the same warm moving light (`Stage.tsx`), because this is
 * where somebody decides what kind of app this is.
 *
 * The screen is a gate: `app/_layout.tsx` will not draw the tabs until the
 * profile is complete. That is a real change of posture — the old flow let you
 * walk past it and left every target in the app a placeholder with a banner
 * apologising for itself — and it is what every app in this category does,
 * because a calorie target computed for nobody is worse than a minute of
 * questions.
 */

/** The questions, in order. `target` drops out when nothing is being aimed at. */
type StepId = 'goal' | 'sex' | 'birth' | 'body' | 'target' | 'activity';

/** A look at the product between two questions. Not counted on the rail. */
type TeaseId = 'teaseJournal' | 'teaseDay';

/** Where the teases fall: after the question named. Two across the walk, never more. */
const TEASE_AFTER: Partial<Record<StepId, TeaseId>> = { sex: 'teaseJournal', body: 'teaseDay' };

/** Which screen the reader is on. The questions are one phase between two. */
type Phase = 'welcome' | 'questions' | 'building' | 'plan';

/** Sanity rails, not medical ones. They only exist to catch a slipped unit. */
const HEIGHT_CM = { min: 100, max: 250 };

/**
 * A height typed in metres, which is how most of Europe writes one: 1,78.
 *
 * `decimal` already reads the comma, so that arrives as 1.78 — a number below
 * `HEIGHT_CM.min` that used to leave Continue grey. Nobody is 1.78 cm tall and
 * nobody is 178 m tall, so the two ranges cannot overlap and reading anything
 * inside this one as metres is safe. It is not a conversion the screen
 * announces: the box still says cm, and somebody who types 178 is unaffected.
 */
const HEIGHT_M = { min: 1, max: 2.5 };
const WEIGHT_KG = { min: 30, max: 350 };

/**
 * What the height and weight boxes arrive holding.
 *
 * Two empty boxes and a keyboard is where this walk loses more people than
 * every other question put together: 78 installs reach that screen and 29 come
 * out of it with a plan. Driving it on a device says why, and it is not that
 * the numbers are hard to remember — the keypad opens itself, fills the lower
 * half of the screen, and leaves the weight box below the fold with a dead
 * Continue and a line asking for a weight there is nowhere to put.
 *
 * Every version of the fix so far has made the empty boxes easier to find
 * (`10f9274`, `5e05ea7`, `193a202`), and the cliff has not moved. So the boxes
 * stop being empty. Continue is a tap for anybody happy to be roughly right,
 * the keypad never opens unless it is asked for, and the screen that was a form
 * to fill in becomes a figure to correct — which is the same shape as the goal
 * weight two screens later, and that one loses almost nobody.
 *
 * Sex, and nothing else. It is the one thing already answered that moves these
 * numbers enough to be worth it; a table of medians per country would be more
 * precise about a figure that exists to be overwritten, and would need
 * maintaining. The weights are roughly a BMI of 24 at these heights — the
 * middle of the healthy band, so a plan built on an uncorrected guess is a
 * sensible plan rather than a startling one.
 *
 * Shown in the muted ink until touched (`provisional` on `MeasurePart`), so
 * nobody mistakes the app's guess for something they told it.
 */
const TYPICAL: Record<Sex, { heightCm: number; weightKg: number }> = {
  female: { heightCm: 165, weightKg: 65 },
  male: { heightCm: 178, weightKg: 76 },
};
const AGE = { min: 13, max: 100 };

/** What the goal weight is allowed to be, either side of where they are. */
const GOAL_SPAN = 0.4;

/**
 * How long the body step waits before putting the caret in its first box.
 *
 * Longer than `TRAVEL` in `Chrome.tsx`, so the keyboard rises after the step
 * has finished sliding across rather than against it — the two animations run
 * for the same quarter-second otherwise and Android lands the cards short.
 */
const FOCUS_AFTER_MS = 320;

const ACTIVITY_HINTS: Record<ActivityLevel, StringKey> = {
  sedentary: 'setup.activitySedentary',
  light: 'setup.activityLight',
  moderate: 'setup.activityModerate',
  active: 'setup.activityActive',
  very_active: 'setup.activityVeryActive',
};

const ACTIVITY_LABELS: Record<ActivityLevel, StringKey> = {
  sedentary: 'activity.sedentary',
  light: 'activity.light',
  moderate: 'activity.moderate',
  active: 'activity.active',
  very_active: 'activity.veryActive',
};

/**
 * Which units to open on: metric, always.
 *
 * This used to guess from the device's region and open on feet and pounds for
 * a US, Liberian or Burmese phone. The guess was wrong for the people actually
 * arriving: the ads run in France and Germany and deliberately target English
 * as well, so an expat whose phone is set to US English — or anyone who simply
 * keeps their phone in English — was handed two boxes and imperial units on
 * the screen that already loses more people than any other in the walk.
 *
 * The toggle is on the same screen and the answer is one tap away, so the cost
 * of opening on the wrong one is a tap; the cost of guessing was a worse first
 * impression for most of the traffic. Metric is also the one box rather than
 * two, which is the shorter road to a filled-in screen.
 */
const DEFAULT_UNITS: UnitSystem = 'metric';

export default function OnboardingScreen() {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const { authenticated, profile, adoptProfile } = useAuth();
  const { refresh: refreshOnboarding, draft, saveDraft, dropDraft, chooseSignIn } = useOnboarding();
  /*
   * The body step is the only one with a keyboard, and with one up the header
   * was leaving room for one of its two cards. `compact` on the step gives that
   * height back for as long as somebody is typing — see `Step`.
   */
  const typing = useKeyboardVisible();
  /* No session: answers go to the draft and the plan is worked out here. */
  const guest = !authenticated;
  /*
   * What the answers start from. A relaunch mid-walk restores the draft; so does
   * a signed-in account whose draft failed to upload at sign-in, which is sent
   * back here to finish rather than into the tabs with a generic target.
   */
  const seed = draft;

  const [phase, setPhase] = useState<Phase>('welcome');
  /** Position in `screens` — questions and teases together. */
  const [index, setIndex] = useState(0);
  /* Which way the next step should arrive from. Written on every move. */
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const [goal, setGoal] = useState<Goal | null>(seed?.goal ?? profile?.goal ?? null);
  const [sex, setSex] = useState<Sex | null>(seed?.sex ?? profile?.sex ?? null);
  const [birthDate, setBirthDate] = useState<string | null>(seed?.birth_date ?? profile?.birth_date ?? null);
  const [activity, setActivity] = useState<ActivityLevel | null>(
    seed?.activity_level ?? profile?.activity_level ?? null,
  );
  const [units, setUnits] = useState<UnitSystem>(seed?.units ?? profile?.units ?? DEFAULT_UNITS);

  /*
   * Height and weight are held as the strings that are actually in the boxes,
   * not as the metric numbers they become.
   *
   * The difference matters while somebody is typing: "1" on the way to "178" is
   * a 1 cm height, and a state that stored numbers would either reject it or
   * round-trip it back into the field as something the reader did not type.
   * The conversion happens once, at the bottom, where the values are read.
   */
  const startHeight = seed?.height_cm ?? profile?.height_cm ?? null;
  const [cm, setCm] = useState(() => (startHeight ? String(Math.round(startHeight)) : ''));
  const [feet, setFeet] = useState(() => (startHeight ? String(cmToFeetInches(startHeight).feet) : ''));
  const [inches, setInches] = useState(() => (startHeight ? String(cmToFeetInches(startHeight).inches) : ''));
  const [weight, setWeight] = useState(() =>
    seed?.weight_kg ? String(round1(toBodyWeight(seed.weight_kg, seed.units))) : '',
  );
  const [targetWeight, setTargetWeight] = useState<number | null>(seed?.target_weight_kg ?? null);
  /*
   * Whether they went past the goal weight rather than setting one.
   *
   * A flag beside the number rather than a null in it, because the two are
   * different facts and the screen needs both: `null` would mean the stepper
   * had nothing to draw when they pressed Back, and re-proposing a default at
   * that point would quietly un-skip the step. This way the control keeps its
   * position and the answer stays "none".
   */
  const [targetSkipped, setTargetSkipped] = useState(
    () => seed !== null && seed.goal !== 'maintain' && seed.target_weight_kg === null,
  );

  /*
   * Whether the figures in the body boxes are this app's suggestion rather than
   * an answer. See `TYPICAL`. Cleared by the first keystroke in any of them and
   * never set again, so a reader who empties a box is not handed a guess back.
   */
  const [provisional, setProvisional] = useState(false);
  const seeded = useRef(false);
  /*
   * Wraps a box's setter so the first keystroke in any of them retires the
   * suggestion in all of them — height and weight were proposed together and
   * correcting one is the reader taking the screen over.
   *
   * Deliberately not applied to the unit switch below, which sets the same
   * state with a converted figure: that is the app carrying an answer across,
   * not the reader giving one.
   */
  const edit = useCallback(
    (set: (next: string) => void) => (next: string) => {
      setProvisional(false);
      set(next);
    },
    [],
  );

  /* The body step's boxes, so each can hand the keyboard on to the next. */
  const heightInput = useRef<TextInput>(null);
  const inchesInput = useRef<TextInput>(null);
  const weightInput = useRef<TextInput>(null);

  const [targets, setTargets] = useState<Targets | null>(null);
  /** The maintenance the plan was worked out from, for the trajectory. */
  const [maintenance, setMaintenance] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  /** How many of the loader's three lines are true yet. */
  const [stages, setStages] = useState(0);

  const heightCm = units === 'imperial' ? imperialHeight(feet, inches) : metricHeight(cm);
  const weightKg = useMemo(() => {
    const entered = decimal(weight);
    return entered === null ? null : bodyWeightToKg(entered, units);
  }, [weight, units]);

  /*
   * The questions that will be asked, which is not a constant: somebody holding
   * their weight is not aiming at a different one, and a goal-weight screen for
   * them would be a question with no answer. The rail reads its total from this,
   * so the bar re-scales the moment "stay where I am" is picked — which is the
   * honest thing for it to do, since the walk genuinely just got shorter.
   */
  const steps = useMemo<StepId[]>(
    () => ['goal', 'sex', 'birth', 'body', ...(goal === 'maintain' ? [] : (['target'] as StepId[])), 'activity'],
    [goal],
  );
  /*
   * The fallback is unreachable — `steps` always has at least five entries and
   * `index` is clamped to it — and it is written down anyway, because the array
   * is built from state and a future question that turns out to be conditional
   * on two answers rather than one should fail by asking about a goal again
   * rather than by crashing on the first frame of somebody's account.
   */
  /*
   * The walk as drawn: the questions with the two teases slotted between them.
   * The rail counts questions only — a tease is the app talking, not asking —
   * so it reads the question number off `steps`, not off this.
   */
  const screens = useMemo<(StepId | TeaseId)[]>(
    () => steps.flatMap((id) => (TEASE_AFTER[id] ? [id, TEASE_AFTER[id]!] : [id])),
    [steps],
  );
  const current = screens[Math.min(index, screens.length - 1)] ?? 'goal';
  const teasing = current === 'teaseJournal' || current === 'teaseDay';
  const step: StepId = teasing
    ? (screens.slice(0, index).reverse().find((id): id is StepId => !id.startsWith('tease')) ?? 'goal')
    : (current as StepId);
  const questionNumber = steps.indexOf(step) + 1;

  /*
   * The first-run funnel (`lib/funnel.ts`): which screens a new install
   * reaches. Only for the walk before an account — a signed-in account being
   * sent back to finish setup is not a new install, and counting it would put
   * people who already converted back at the top of the funnel.
   */
  useEffect(() => {
    if (!guest) return;
    if (phase === 'welcome') reachedStep('welcome');
    /*
     * Teases are counted under their own names rather than the question behind
     * them. They are the only screens the walk used to pass through silently,
     * which made the gap between two questions the one place a drop could hide
     * — and on 2026-09-16 that is exactly where one was hiding.
     */
    else if (phase === 'questions') reachedStep(teasing ? (current as TeaseId) : step);
    else if (phase === 'plan') reachedStep('plan');
  }, [guest, phase, teasing, step, current]);

  /*
   * A goal weight nobody has moved yet, proposed from the weight they just gave.
   * Ten per cent down or five per cent up: both are a season's work rather than
   * a weekend's, which is the scale this app's weekly review is built to talk
   * about. It is a starting position for the stepper, not a recommendation, and
   * it is re-proposed whenever the weight or the goal changes underneath it.
   */
  /*
   * Keyed on what it was proposed for, so arriving with a saved goal weight — a
   * relaunch, or "Change my answers" — keeps it until the weight or the goal it
   * was set against actually changes.
   */
  const proposedFor = useRef(
    seed?.target_weight_kg != null ? `${round1(seed.weight_kg)}|${seed.goal}` : null,
  );
  useEffect(() => {
    if (weightKg === null || goal === null || goal === 'maintain') return;
    const key = `${round1(weightKg)}|${goal}`;
    if (proposedFor.current === key) return;
    proposedFor.current = key;
    /*
     * Rounded to the stepper's own step in the units on screen — a whole pound
     * or half a kilo — so the first figure shown is one the buttons could have
     * produced, not "166.4 lb".
     */
    const step = units === 'imperial' ? 1 : 0.5;
    const proposed = toBodyWeight(weightKg * (goal === 'lose' ? 0.9 : 1.05), units);
    setTargetWeight(round2(bodyWeightToKg(Math.round(proposed / step) * step, units)));
    // `units` is read, not watched: switching units is not a new proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKg, goal]);

  const age = birthDate === null ? null : ageFrom(birthDate);

  /** Whether the body step has been written in at all, in whichever units it is wearing. */
  const bodyTyped = [cm, feet, inches, weight].some((box) => box.trim() !== '');

  /*
   * The body step opens with the keyboard up and the caret in the height box.
   *
   * It is the only question in the walk that is typed rather than tapped, and
   * arriving at it there was nothing on screen saying so: two cards each
   * holding a grey dash, no caret anywhere, and a dead Continue that by design
   * says nothing until something has been typed (below). Every other question
   * is a card you press. Half of everybody who reached this one left without
   * entering a character.
   *
   * Focusing it answers the screen's only question before it is asked — the
   * keyboard is up, the first box is live, and `compact` has already given the
   * header's height to the two cards, so both are on screen from the first
   * frame rather than after a tap.
   *
   * Only while it is still blank. Coming back to it from the goal weight with
   * two figures already in place is a review, not a question, and `selectText-
   * OnFocus` would put a whole height under the next digit typed.
   */
  useEffect(() => {
    if (phase !== 'questions' || teasing || step !== 'body') return;
    if (seeded.current || bodyTyped) return;

    /*
     * Sex is question two and this is question four, so it is answered; the
     * guard is for the walk being resumed in some order this does not know
     * about. With nothing to suggest, the old behaviour is the right one — put
     * the caret in the first box and open the keypad, because then there really
     * is typing to do.
     */
    if (sex === null) {
      seeded.current = true;
      const timer = setTimeout(() => heightInput.current?.focus(), FOCUS_AFTER_MS);
      return () => clearTimeout(timer);
    }

    seeded.current = true;
    const typical = TYPICAL[sex];
    const { feet: f, inches: i } = cmToFeetInches(typical.heightCm);
    setCm(String(typical.heightCm));
    setFeet(String(f));
    setInches(String(i));
    setWeight(String(round1(toBodyWeight(typical.weightKg, units))));
    setProvisional(true);
    /*
     * No focus call, and that is half the fix rather than an omission. The
     * keypad is what buries the weight box, and a screen whose answer is
     * already in place has nothing to open it for. It comes up when a box is
     * tapped, which is when it is wanted.
     */
    return;
    // `bodyTyped` and `units` are read to decide whether to seed and in which
    // units, and deliberately not watched: `seeded` makes this run once, and
    // re-running on a keystroke or a unit switch is exactly what must not
    // happen — the Segmented control carries the values across itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, teasing, step, sex]);

  /** What is wrong with this step's answer, or null if nothing is. */
  const blocker = ((): string | null => {
    if (step === 'birth') {
      if (age === null) return null;
      if (age < AGE.min) return tr('ob.birthTooYoung');
      if (age > AGE.max) return tr('ob.birthImplausible');
    }
    /*
     * The only screen in the walk where an answer is typed, and the only one
     * whose Continue could go grey without saying why: a value out of range
     * names itself under its own box, but a box left empty — or holding
     * something no number could be read out of — said nothing at all. On
     * 2026-09-16 the funnel lost 85% of installs here.
     *
     * Only once something has been typed. Arriving at two empty boxes and being
     * told they are empty is nagging, not helping.
     */
    if (step === 'body' && bodyTyped && (heightCm === null || weightKg === null)) {
      return tr('ob.bodyMissing');
    }
    if (step === 'target' && weightKg !== null && targetWeight !== null) {
      if (goal === 'lose' && targetWeight >= weightKg) return tr('ob.targetMustBeLower');
      if (goal === 'gain' && targetWeight <= weightKg) return tr('ob.targetMustBeHigher');
    }
    return null;
  })();

  const answered =
    teasing ||
    (blocker === null &&
    ((step === 'goal' && goal !== null) ||
      (step === 'sex' && sex !== null) ||
      (step === 'birth' && birthDate !== null) ||
      (step === 'body' &&
        heightCm !== null &&
        heightCm >= HEIGHT_CM.min &&
        heightCm <= HEIGHT_CM.max &&
        weightKg !== null &&
        weightKg >= WEIGHT_KG.min &&
        weightKg <= WEIGHT_KG.max) ||
      (step === 'target' && targetWeight !== null) ||
      (step === 'activity' && activity !== null)));

  /**
   * The way past a question, for the questions that have one.
   *
   * Only two of the six do, and which two is not a matter of taste — it falls
   * out of `predictTdee`. Sex, date of birth, height and weight are the four
   * Mifflin-St Jeor is computed from: without any one of them the server hands
   * back `FALLBACK_TARGETS`, a number calculated for nobody, which is the exact
   * thing this screen exists to prevent. They cannot be skipped, and offering a
   * skip that produced a generic target anyway would be worse than not offering
   * one.
   *
   * The other two can. The goal weight is not in the calculation at all — it
   * only decides whether the app can say how far along you are — so skipping it
   * stores nothing. Activity is in the calculation but already has a documented
   * default: `predictTdee` reads `activity_level ?? 'moderate'`. So the skip
   * writes moderate rather than leaving a hole, which is both what the server
   * would have assumed and what keeps `missingProfileFields` empty — a skip
   * that left the column null would fail the gate and loop somebody back into
   * setup forever. The label says what is being assumed, because a skip that
   * silently answers for you is not a skip.
   */
  const skipFor = (which: StepId): { label: string; onPress: () => void } | undefined => {
    if (which === 'target') {
      return {
        label: tr('ob.skip'),
        onPress: () => {
          setTargetSkipped(true);
          forward();
        },
      };
    }
    if (which === 'activity') {
      return {
        label: tr('ob.activitySkip'),
        onPress: () => {
          setActivity('moderate');
          forward();
        },
      };
    }
    return undefined;
  };

  const back = useCallback(() => {
    setDirection('back');
    setIndex((i) => Math.max(0, i - 1));
    if (index === 0) setPhase('welcome');
  }, [index]);

  const forward = useCallback(() => {
    setDirection('forward');
    if (index + 1 < screens.length) {
      setIndex(index + 1);
      return;
    }
    setPhase('building');
  }, [index, screens.length]);

  /**
   * The one write this screen makes, and the order inside it is load-bearing.
   *
   * The weigh-in goes first because `PATCH /profile` recalculates the day's
   * targets from the profile *and the latest weight* — so a profile saved
   * before the weight exists computes a target against no weight at all, and
   * the plan screen would then show a figure that is corrected on the next
   * launch. Two round trips rather than one for the same reason: there is no
   * endpoint that takes both, and inventing one to save 200ms on a screen that
   * is deliberately spending 1.9s on an animation would be a poor trade.
   */
  const submit = useCallback(async () => {
    setFailed(false);
    setStages(0);

    if (guest) {
      /*
       * No account to write to, so the plan is worked out here with the same
       * shared arithmetic the server will run when the draft is uploaded — the
       * number on the reveal is the number the account will have. The beats are
       * paced rather than instant because there is no request to cover, and a
       * plan that appears the frame after the last answer reads as a constant.
       */
      if (sex === null || birthDate === null || heightCm === null || weightKg === null || goal === null) {
        setFailed(true);
        return;
      }
      const inputs = {
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        weight_kg: weightKg,
        activity_level: activity ?? 'moderate',
        goal,
      } as const;
      await saveDraft({
        goal,
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        weight_kg: weightKg,
        target_weight_kg: goal === 'maintain' || targetSkipped ? null : targetWeight,
        activity_level: activity ?? 'moderate',
        units,
        locale,
        completed_at: null,
      });
      for (let stage = 1; stage <= 3; stage++) {
        await pause(700);
        setStages(stage);
      }
      await pause(450);
      setMaintenance(predictTdee(inputs));
      setTargets(calculateTargets(inputs));
      setPhase('plan');
      return;
    }

    try {
      if (weightKg !== null) await api.logWeight(weightKg);
      setStages(1);
      const saved = await api.updateProfile({
        sex,
        birth_date: birthDate,
        height_cm: heightCm,
        goal,
        activity_level: activity,
        units,
        /*
         * Written even when it is unchanged, and this is the only place that
         * does it. A null `locale` is "nobody has ever asked", which is a state
         * setup exists to end — the welcome screen showed them the picker, so
         * whatever they are reading now is an answer whether or not they
         * touched it.
         */
        locale: profile?.locale ?? locale,
        target_weight_kg: goal === 'maintain' || targetSkipped ? null : targetWeight,
      });
      adoptProfile(saved);
      setStages(2);
      const day = await api.day();
      setStages(3);
      if (sex && birthDate && heightCm && weightKg) {
        setMaintenance(
          predictTdee({ sex, birth_date: birthDate, height_cm: heightCm, weight_kg: weightKg, activity_level: activity, goal }),
        );
      }
      await pause(400);
      setTargets(day.targets);
      // The server has the answers now; a leftover draft has nothing to add.
      await dropDraft();
      setPhase('plan');
    } catch {
      setFailed(true);
    }
  }, [guest, weightKg, sex, birthDate, heightCm, goal, activity, units, targetWeight, targetSkipped, locale, profile?.locale, adoptProfile, saveDraft, dropDraft]);

  /*
   * The daily reminder, answered on the plan screen and put into force by the
   * button that leaves it. `PlanReminder` has the argument for asking here at
   * all; this is the half of it that has to happen on the way out.
   *
   * Held in a ref rather than state because nothing renders from it: a switch
   * that re-rendered the plan on every flip would restart the count-up on the
   * target behind it.
   */
  const reminder = useRef<PlanReminderChoice | null>(null);
  const chooseReminder = useCallback((choice: PlanReminderChoice | null) => {
    reminder.current = choice;
  }, []);

  /**
   * Sets the reminder, if it was left on, before the walk ends.
   *
   * Awaited rather than fired off, and that is the whole shape of it: this is
   * where the OS permission dialog goes up, and it has to be answered while the
   * plan is still on screen — a dialog that arrives one frame into the tabs
   * belongs to no question the reader remembers being asked.
   *
   * Nothing here can stop the walk. A refusal at the dialog comes back as
   * `enabled: false` and is simply not counted; a throw is swallowed, because a
   * reminder that could not be scheduled is not a reason to strand somebody on
   * the last screen of setup with a plan they cannot get to.
   */
  const commitReminder = useCallback(async () => {
    const choice = reminder.current;
    if (!choice?.on) return;
    try {
      const stored = await loadReminders();
      const applied = await applyReminders(
        { ...stored, log: { enabled: true, hour: choice.hour, minute: choice.minute } },
        { requestPermissions: true },
      );
      if (!applied.log.enabled) return;
      /*
       * The same session, not the next launch — `ReminderInvite` has the full
       * reason. Somebody who says yes here and never opens the app again is
       * exactly who the server's one message is for, and the token that carries
       * it would otherwise be minted on a launch that never happens.
       */
      void registerForPush();
      reachedStep('reminder_on');
    } catch {
      // Scheduling failed. The walk is worth more than the reminder.
    }
  }, []);

  /*
   * The measurement question (`MeasureAsk`), between the button that leaves the
   * plan and the walk actually ending.
   *
   * The walk's own ending is parked in a ref and run from the sheet's
   * `onClosed`, not from the answer: the reminder's OS dialog and the swap to
   * the tabs both present something, and neither may start while this sheet is
   * still leaving — see `Sheet`'s note on UIKit refusing a presentation during
   * a dismissal.
   *
   * `onboarding_complete` goes after the answer, so it carries it: a yes is
   * counted, a no is only ever a cookieless ping. Asked once per install — a
   * second walk through setup, or a build with nothing to measure with, goes
   * straight through.
   */
  const [measuring, setMeasuring] = useState(false);
  const afterMeasure = useRef<(() => Promise<void>) | null>(null);
  const measureFirst = useCallback(async (then: () => Promise<void>) => {
    if (afterMeasure.current) return;
    if (analyticsAvailable && (await storedConsent()) === null) {
      afterMeasure.current = then;
      setMeasuring(true);
      return;
    }
    void logOnce('onboarding_complete');
    await then();
  }, []);
  const answerMeasure = useCallback((consent: Consent) => {
    setMeasuring(false);
    void setConsent(consent).then(() => logOnce('onboarding_complete'));
  }, []);
  const measured = useCallback(() => {
    const then = afterMeasure.current;
    afterMeasure.current = null;
    void then?.();
  }, []);

  /**
   * "Start logging", for somebody with no session. Marking the draft finished is
   * the whole action: the provider makes a guest session for it, uploads the
   * draft to that row, and the gate opens the app.
   */
  const savePlan = useCallback(async () => {
    if (!draft) return;
    reachedStep('save');
    await measureFirst(async () => {
      await commitReminder();
      await saveDraft({ ...draft, completed_at: new Date().toISOString() });
    });
  }, [draft, saveDraft, commitReminder, measureFirst]);

  /*
   * Fired by arriving at the building screen rather than by the button that
   * sends you there, so a retry re-runs it without a second code path. The ref
   * is what stops React's development double-invoke logging two weigh-ins.
   */
  const sending = useRef(false);
  useEffect(() => {
    if (phase !== 'building' || sending.current) return;
    sending.current = true;
    void submit().finally(() => {
      sending.current = false;
    });
  }, [phase, submit]);

  const end = useCallback(async () => {
    await commitReminder();
    /*
     * The gate reads the server's answer, not ours. Refreshing here is what
     * flips `needsSetup` false and lets `app/_layout.tsx` swap this screen for
     * the tabs — there is no `router.replace` because the guard does it, and an
     * imperative navigation racing a declarative one is how you get a frame of
     * the wrong screen.
     */
    await refreshOnboarding();
  }, [refreshOnboarding, commitReminder]);

  const finish = useCallback(async () => {
    await measureFirst(end);
  }, [measureFirst, end]);

  const projection =
    targets && goal !== 'maintain' && !targetSkipped
      ? projectionFor({ weightKg, targetKg: targetWeight, maintenance, targetKcal: targets.kcal, units })
      : null;

  if (phase === 'welcome') {
    return (
      <View style={styles.flex}>
        <Stage />
        <Welcome
          guest={guest}
          onStart={() => {
            if (guest) reachedStep('start');
            setDirection('forward');
            setPhase('questions');
          }}
          onSignIn={() => {
            reachedStep('existing');
            chooseSignIn(true);
          }}
        />
      </View>
    );
  }

  if (phase === 'building') {
    return (
      <View style={styles.flex}>
        <Stage />
        <Rail step={steps.length} total={steps.length} />
        {failed ? (
          <View style={[styles.centre, column]}>
            <Text style={[t.bodyBold, styles.centred, { color: colors.foreground }]}>
              {tr('ob.buildingFailed')}
            </Text>
            <GlowButton label={tr('ob.retry')} onPress={() => void submit()} style={styles.retry} />
          </View>
        ) : (
          <Building
            steps={[tr('ob.buildingStep1'), tr('ob.buildingStep2'), tr('ob.buildingStep3')]}
            done={stages}
            notes={[tr('ob.buildingNote1'), tr('ob.buildingNote2'), tr('ob.buildingNote3')]}
          />
        )}
      </View>
    );
  }

  if (phase === 'plan' && targets) {
    return (
      <View style={styles.flex}>
        <Stage />
        <Plan
          targets={targets}
          projection={projection}
          aside={<PlanReminder onChange={chooseReminder} />}
          footer={
            /*
             * Straight into the app (GUEST-ACCOUNTS.md). This used to be "Save my
             * plan" over a line about making an account, and the form behind it
             * is where paid installs stopped. Now the button starts the day: the
             * draft is marked finished, a guest session is made for it, and the
             * account is offered later, when it is worth something.
             */
            guest ? (
              <GlowButton label={tr('ob.planStart')} onPress={() => void savePlan()} />
            ) : (
              <Advance label={tr('ob.planStart')} onPress={() => void finish()} />
            )
          }
        />
        <MeasureAsk open={measuring} onAnswer={answerMeasure} onClosed={measured} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stage />
      <Rail step={questionNumber} total={steps.length} onBack={back} />

      <Step
        id={current}
        direction={direction}
        compact={typing}
        /* The birthday wheel is a scroller, and it cannot share a drag with the
           page underneath it. That step fits on a screen, so nothing is lost. */
        scrolls={teasing || step !== 'birth'}
        title={teasing ? tr(current === 'teaseJournal' ? 'ob.teaseJournalTitle' : 'ob.teaseDayTitle') : titleFor(step, tr)}
        body={teasing ? tr(current === 'teaseJournal' ? 'ob.teaseJournalBody' : 'ob.teaseDayBody') : bodyFor(step, tr)}
        footer={
          <Advance
            label={tr('ob.continue')}
            onPress={() => {
              // Continue on the goal weight is an answer: the value on screen,
              // whether or not it was skipped on an earlier pass.
              if (!teasing && step === 'target') setTargetSkipped(false);
              forward();
            }}
            disabled={!answered}
            hint={teasing ? null : blocker}
            skip={teasing ? undefined : skipFor(step)}
          />
        }
      >
        {current === 'teaseJournal' && <JournalTease />}
        {current === 'teaseDay' && <DayTease />}

        {!teasing && step === 'goal' && (
          <View style={styles.options}>
            {(['lose', 'maintain', 'gain'] as const).map((option) => (
              <OptionCard
                key={option}
                label={tr(GOAL_LABELS[option])}
                hint={tr(GOAL_HINTS[option])}
                selected={goal === option}
                onPress={() => setGoal(option)}
                icon={<GoalGlyph goal={option} color={colors.foreground} />}
              />
            ))}
          </View>
        )}

        {!teasing && step === 'sex' && (
          <View style={styles.options}>
            {(['female', 'male'] as const).map((option) => (
              <OptionCard
                key={option}
                label={tr(option === 'male' ? 'sex.male' : 'sex.female')}
                selected={sex === option}
                onPress={() => setSex(option)}
              />
            ))}
          </View>
        )}

        {!teasing && step === 'birth' && (
          <View style={styles.wheel}>
            {/*
              * Two wheels, because only one platform has one worth using.
              *
              * iOS renders `DateTimePicker` inline and it looks like part of the
              * screen. Android has no inline mode at all — the same component is
              * always a dialog — so this screen used to be a card whose only job
              * was to open a Material dialog: different colours, different type,
              * its own buttons, arriving over the top of the walk on the
              * question before the one that already loses the most people.
              * `DateWheel` is the same control drawn in this app's own ink.
              */}
            {Platform.OS === 'android' ? (
              <DateWheel
                value={birthDate}
                min={BIRTH_DATE_FLOOR}
                max={new Date()}
                locale={locale}
                label={tr('setup.birthDate')}
                onChange={setBirthDate}
              />
            ) : (
              <DateTimePicker
                value={birthDate ? new Date(`${birthDate}T12:00:00Z`) : new Date(1995, 0, 1)}
                mode="date"
                display="spinner"
                minimumDate={BIRTH_DATE_FLOOR}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  if (event.type === 'dismissed' || !date) return;
                  // Local parts rather than `toISOString`: the picker hands back
                  // local midnight, and in a negative offset that is yesterday in
                  // UTC — which is a birthday a day early, every time.
                  setBirthDate(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
                      date.getDate(),
                    ).padStart(2, '0')}`,
                  );
                }}
              />
            )}
            {age !== null && blocker === null && (
              <Text style={[t.bodySemibold, styles.centred, { color: colors.mutedForeground }]}>
                {tr('ob.birthAge')(age)}
              </Text>
            )}
          </View>
        )}

        {!teasing && step === 'body' && (
          <View>
            <Segmented
              value={units}
              onChange={(next) => {
                /*
                 * Carried across rather than cleared. Somebody who typed 178 and
                 * then realised they wanted feet has not changed their mind
                 * about their height, and handing them two empty boxes for the
                 * trouble is the rudest thing this screen could do.
                 */
                if (next === units) return;
                if (heightCm !== null) {
                  const { feet: f, inches: i } = cmToFeetInches(heightCm);
                  setFeet(String(f));
                  setInches(String(i));
                  setCm(String(Math.round(heightCm)));
                }
                if (weightKg !== null) setWeight(String(round1(toBodyWeight(weightKg, next))));
                setUnits(next);
              }}
              options={[
                { value: 'metric', label: tr('units.metric'), hint: 'kg · cm' },
                { value: 'imperial', label: tr('units.imperial'), hint: 'lb · ft' },
              ]}
            />

            <View style={styles.measures}>
              <Measure
                label={tr('ob.bodyHeight')}
                focusHint={
                  heightCm !== null && (heightCm < HEIGHT_CM.min || heightCm > HEIGHT_CM.max)
                    ? tr('ob.bodyHeightOff')
                    : null
                }
                parts={
                  units === 'imperial'
                    ? [
                        {
                          key: 'ft',
                          value: feet,
                          unit: 'ft',
                          provisional,
                          onChangeText: edit(setFeet),
                          maxLength: 1,
                          inputRef: heightInput,
                          returnKeyType: 'next',
                          onSubmitEditing: () => inchesInput.current?.focus(),
                        },
                        {
                          key: 'in',
                          value: inches,
                          unit: 'in',
                          provisional,
                          onChangeText: edit(setInches),
                          maxLength: 4,
                          inputRef: inchesInput,
                          returnKeyType: 'next',
                          onSubmitEditing: () => weightInput.current?.focus(),
                        },
                      ]
                    : [
                        {
                          key: 'cm',
                          value: cm,
                          unit: 'cm',
                          provisional,
                          onChangeText: edit(setCm),
                          maxLength: 5,
                          inputRef: heightInput,
                          returnKeyType: 'next',
                          onSubmitEditing: () => weightInput.current?.focus(),
                        },
                      ]
                }
              />

              <Measure
                label={tr('ob.bodyWeight')}
                focusHint={
                  weightKg !== null && (weightKg < WEIGHT_KG.min || weightKg > WEIGHT_KG.max)
                    ? tr('ob.bodyWeightOff')
                    : null
                }
                parts={[
                  {
                    key: 'weight',
                    value: weight,
                    unit: bodyWeightUnit(units),
                    provisional,
                    onChangeText: edit(setWeight),
                    maxLength: 5,
                    inputRef: weightInput,
                    returnKeyType: 'done',
                    onSubmitEditing: () => {
                      if (answered) forward();
                    },
                  },
                ]}
              />
            </View>
          </View>
        )}

        {!teasing && step === 'target' && weightKg !== null && targetWeight !== null && (
          <View style={styles.target}>
            <Stepper
              value={round1(toBodyWeight(targetWeight, units))}
              unit={bodyWeightUnit(units)}
              step={units === 'imperial' ? 1 : 0.5}
              min={round1(toBodyWeight(weightKg * (1 - GOAL_SPAN), units))}
              max={round1(toBodyWeight(weightKg * (1 + GOAL_SPAN), units))}
              onChange={(next) => {
                // Moving it is answering it, whatever was pressed last time.
                setTargetSkipped(false);
                // Two places, not one: a pound is 0.4536 kg, and a goal stored to
                // a tenth of a kilo reads back as 164.9 lb for the 165 pressed.
                setTargetWeight(round2(bodyWeightToKg(next, units)));
              }}
              caption={
                Math.abs(targetWeight - weightKg) < 0.05
                  ? tr('ob.targetSame')
                  : tr('ob.targetToGo')(
                      formatWeightDelta(Math.abs(targetWeight - weightKg), units, false),
                    )
              }
            />
          </View>
        )}

        {!teasing && step === 'activity' && (
          <View style={styles.options}>
            {ACTIVITY_LEVELS.map((option) => (
              <OptionCard
                key={option}
                label={tr(ACTIVITY_LABELS[option])}
                hint={tr(ACTIVITY_HINTS[option])}
                selected={activity === option}
                onPress={() => setActivity(option)}
              />
            ))}
          </View>
        )}
      </Step>
    </KeyboardAvoidingView>
  );
}

/**
 * The first screen, which asks nothing.
 *
 * It exists for two reasons and would not be worth a screen for either alone.
 * It sets an expectation — six questions, half a minute, changeable afterwards
 * — which is the single thing the old conversation could not do and the reason
 * people abandoned it. And it is where the language offer lives: this app is
 * written in five, the picker is otherwise on a settings screen a new account
 * never opens, and someone reading the wrong one has to be able to fix it
 * before being asked anything.
 */
function Welcome({
  guest,
  onStart,
  onSignIn,
}: {
  guest: boolean;
  onStart: () => void;
  onSignIn: () => void;
}) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  /*
   * The arrival is staggered, and it used to take a second and a half to
   * finish. The ring faded for 900ms, then the cast, the wordmark and the
   * sentence each for 700 more behind delays that ran out to 800 — so the
   * screen a paid install lands on spent most of its first two seconds
   * assembling itself, and the sentence saying what the next half-minute buys
   * was the last thing to arrive. A third of installs never pressed anything
   * here. The same stagger, at two thirds of the time, still reads as an
   * arrival and is done in under a second.
   */
  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.delay(delay).duration(460).reduceMotion(ReduceMotion.System);

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/*
        * The arrival. The logo ring, in three dimensions, turning in the light
        * with the macro dots in orbit; then the three dots again, standing
        * under it and saying hello (CAST.md); then the name; then the one
        * sentence about what the next half-minute buys. See `RingObject`.
        */}
      <View style={[styles.hero, column]}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(560)}>
          <RingObject size={152} />
        </Animated.View>
        <Animated.View entering={enter(90)} style={styles.cast}>
          <Trio size={52} moods={['idle', 'wave', 'idle']} gap={2} />
        </Animated.View>
        <Animated.View entering={enter(170)} style={styles.wordmark}>
          <Serif style={[type.hero, styles.centred, { color: colors.foreground }]}>Day *So* Far</Serif>
          <Text style={[t.eyebrow, styles.tagline, { color: colors.mutedForeground }]}>
            {tr('ob.wordmarkTagline')}
          </Text>
        </Animated.View>
        <Animated.View entering={enter(330)} style={styles.welcomeCopy}>
          <Serif style={[type.greeting, styles.centred, { color: colors.foreground }]}>{tr('ob.welcomeTitle')}</Serif>
          <Text style={[t.body, styles.centred, styles.welcomeBody, { color: colors.mutedForeground }]}>
            {tr('ob.welcomeBody')}
          </Text>
        </Animated.View>
      </View>

      {/*
        * The footer does not take part in the arrival.
        *
        * Everything above it is the app introducing itself and can afford to
        * assemble; this is the only thing on the screen anybody can press, and
        * it was the last to appear — invisible for 800ms and still moving at
        * 1.5s, on the screen where a third of paid installs stopped. A
        * Reanimated entrance animates opacity, not hit-testing, so the button
        * was live the whole time it could not be seen: somebody who tapped
        * where they expected it *did* start the walk, and everybody who waited
        * to be shown a button waited. It is on screen from the first frame now.
        */}
      <View style={[styles.welcomeFoot, column, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.language}>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {tr('setup.language')}
          </Text>
          <View style={styles.languageControl}>
            <LanguagePicker value={locale} onChange={setPreferredLocale} />
          </View>
        </View>

        <GlowButton label={tr('ob.welcomeStart')} onPress={onStart} />
        {/*
          * The way back for somebody who already has an account — and, until
          * 2026-09-24, a way *out* for a great many people who do not.
          *
          * It was set in the same size and weight as body text, in full
          * foreground, directly under the only other thing on the screen, and
          * 42 installs in twelve days tapped it. Fourteen accounts have ever
          * had an email address on them and eleven of those are test and review
          * logins, so almost none of those taps can have been somebody coming
          * back: they are people who read a screen with a button and a link and
          * concluded the app wants an account, which is the one thing the guest
          * walk exists to tell them it does not.
          *
          * So it is quiet now — footnote, muted, under the fold of the primary
          * button — and still a full tap target, because the person it is
          * actually for is reinstalling and must be able to find it. `signed_in`
          * in `FUNNEL_STEPS` is the other half of this change: whether the
          * remaining taps arrive anywhere is now a number rather than a guess.
          */}
        {guest && (
          <Pressable
            onPress={onSignIn}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [styles.haveAccount, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('ob.haveAccount')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A beat, for the loader that has no request to wait on. */
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const GOAL_LABELS: Record<Goal, StringKey> = {
  lose: 'ob.goalLose',
  maintain: 'ob.goalMaintain',
  gain: 'ob.goalGain',
};

const GOAL_HINTS: Record<Goal, StringKey> = {
  lose: 'ob.goalLoseHint',
  maintain: 'ob.goalMaintainHint',
  gain: 'ob.goalGainHint',
};

function titleFor(step: StepId, tr: ReturnType<typeof useT>): string {
  const titles: Record<StepId, StringKey> = {
    goal: 'ob.goalTitle',
    sex: 'ob.sexTitle',
    birth: 'ob.birthTitle',
    body: 'ob.bodyTitle',
    target: 'ob.targetTitle',
    activity: 'ob.activityTitle',
  };
  return tr(titles[step]);
}

function bodyFor(step: StepId, tr: ReturnType<typeof useT>): string {
  const bodies: Record<StepId, StringKey> = {
    goal: 'ob.goalBody',
    sex: 'ob.sexBody',
    birth: 'ob.birthBody',
    body: 'ob.bodyBody',
    target: 'ob.targetBody',
    activity: 'ob.activityBody',
  };
  return tr(bodies[step]);
}

/** The three arrows, on lucide's 24-unit grid. See `<Glyph>` for why inline. */
function GoalGlyph({ goal, color }: { goal: Goal; color: string }) {
  const props = {
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {goal === 'lose' && <Path d="M22 17l-8.5-8.5-5 5L2 7M16 17h6v-6" {...props} />}
      {goal === 'maintain' && <Path d="M3 9h18M3 15h18" {...props} />}
      {goal === 'gain' && <Path d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" {...props} />}
    </Svg>
  );
}

/**
 * A typed figure, or null.
 *
 * Commas as well as points, because a German keyboard's decimal key is a comma
 * and `Number('72,5')` is NaN — which would have read on screen as the app
 * refusing a perfectly ordinary weight.
 */
function decimal(text: string): number | null {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() === '' || Number.isNaN(value) ? null : value;
}

/** The centimetres box, read in centimetres — or in metres when that is plainly what was typed. */
function metricHeight(text: string): number | null {
  const value = decimal(text);
  if (value === null) return null;
  return value >= HEIGHT_M.min && value <= HEIGHT_M.max ? Math.round(value * 100) : value;
}

function imperialHeight(feet: string, inches: string): number | null {
  const f = decimal(feet);
  if (f === null) return null;
  return feetInchesToCm(f, decimal(inches) ?? 0);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Whole years, counted the way `ageFrom` on the server does. */
function ageFrom(birthDate: string): number | null {
  const born = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const months = now.getUTCMonth() - born.getUTCMonth();
  if (months < 0 || (months === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 20 },
  centred: { textAlign: 'center' },

  options: { gap: 14 },
  wheel: { gap: 12 },
  measures: { gap: 18 },
  target: { paddingTop: 12 },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  cast: { marginTop: -2, marginBottom: 14 },
  wordmark: { alignItems: 'center', gap: 2, marginTop: -6 },
  tagline: { letterSpacing: 3 },
  welcomeCopy: { alignItems: 'center', gap: 10, marginTop: 22 },
  welcomeBody: { maxWidth: 340 },
  welcomeFoot: { paddingHorizontal: 20, gap: 14 },
  language: { gap: 8 },
  languageControl: { alignSelf: 'stretch' },
  haveAccount: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },

  retry: { alignSelf: 'stretch' },
});
