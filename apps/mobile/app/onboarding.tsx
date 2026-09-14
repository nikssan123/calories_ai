import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Glass } from '@/components/Glass';
import { GlowButton } from '@/components/GlowButton';
import { LanguagePicker } from '@/components/LanguagePicker';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Advance, Rail, Step } from '@/components/onboarding/Chrome';
import { Measure, Segmented, Stepper } from '@/components/onboarding/Inputs';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { Building, Plan, projectionFor } from '@/components/onboarding/Reveal';
import { Stage } from '@/components/onboarding/Stage';
import { DayTease, JournalTease } from '@/components/onboarding/Tease';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BIRTH_DATE_FLOOR } from '@/lib/birth-date';
import { setPreferredLocale, useLocale, useT, type StringKey } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';
import { column, type as t, useColors, useType } from '@/theme';
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
const WEIGHT_KG = { min: 30, max: 350 };
const AGE = { min: 13, max: 100 };

/** What the goal weight is allowed to be, either side of where they are. */
const GOAL_SPAN = 0.4;

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
 * Which units to open on.
 *
 * A guess from the device's region, and only ever a guess — the toggle is on
 * the same screen and the answer is one tap away. It is worth making because
 * the alternative is showing an American a height in centimetres on the one
 * screen where a wrong-looking number reads as the app not knowing what it is
 * doing. Three countries, which is genuinely the whole list.
 */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

function guessUnits(): UnitSystem {
  try {
    const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).region;
    return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export default function OnboardingScreen() {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const { authenticated, profile, adoptProfile } = useAuth();
  const { refresh: refreshOnboarding, draft, saveDraft, chooseSignIn } = useOnboarding();
  /* No session: answers go to the draft and the plan is worked out here. */
  const guest = !authenticated;
  /* What a relaunch mid-walk restores from, for somebody without an account. */
  const seed = guest ? draft : null;

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
  const [units, setUnits] = useState<UnitSystem>(seed?.units ?? profile?.units ?? guessUnits());

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
  const [targetSkipped, setTargetSkipped] = useState(false);

  const [targets, setTargets] = useState<Targets | null>(null);
  /** The maintenance the plan was worked out from, for the trajectory. */
  const [maintenance, setMaintenance] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  /** How many of the loader's three lines are true yet. */
  const [stages, setStages] = useState(0);
  /* Android's date dialog, open. It opens itself the first time the step shows. */
  const [picking, setPicking] = useState(birthDate === null);

  const heightCm = units === 'imperial' ? imperialHeight(feet, inches) : decimal(cm);
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
   * A goal weight nobody has moved yet, proposed from the weight they just gave.
   * Ten per cent down or five per cent up: both are a season's work rather than
   * a weekend's, which is the scale this app's weekly review is built to talk
   * about. It is a starting position for the stepper, not a recommendation, and
   * it is re-proposed whenever the weight or the goal changes underneath it.
   */
  useEffect(() => {
    if (weightKg === null || goal === null || goal === 'maintain') return;
    setTargetWeight(round1(weightKg * (goal === 'lose' ? 0.9 : 1.05)));
  }, [weightKg, goal]);

  const age = birthDate === null ? null : ageFrom(birthDate);

  /** What is wrong with this step's answer, or null if nothing is. */
  const blocker = ((): string | null => {
    if (step === 'birth') {
      if (age === null) return null;
      if (age < AGE.min) return tr('ob.birthTooYoung');
      if (age > AGE.max) return tr('ob.birthImplausible');
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
      setPhase('plan');
    } catch {
      setFailed(true);
    }
  }, [guest, weightKg, sex, birthDate, heightCm, goal, activity, units, targetWeight, targetSkipped, locale, profile?.locale, adoptProfile, saveDraft]);

  /**
   * "Save my plan", for somebody with no account. Marking the draft finished is
   * the whole action: the gate sees a plan waiting and brings up sign-up, and
   * the provider writes the draft to the account once there is one.
   */
  const savePlan = useCallback(async () => {
    if (!draft) return;
    await saveDraft({ ...draft, completed_at: new Date().toISOString() });
  }, [draft, saveDraft]);

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

  const finish = useCallback(async () => {
    /*
     * The gate reads the server's answer, not ours. Refreshing here is what
     * flips `needsSetup` false and lets `app/_layout.tsx` swap this screen for
     * the tabs — there is no `router.replace` because the guard does it, and an
     * imperative navigation racing a declarative one is how you get a frame of
     * the wrong screen.
     */
    await refreshOnboarding();
  }, [refreshOnboarding]);

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
            setDirection('forward');
            setPhase('questions');
          }}
          onSignIn={() => chooseSignIn(true)}
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
          footer={
            guest ? (
              <View style={styles.saveFoot}>
                <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
                  {tr('ob.planSaveHint')}
                </Text>
                <GlowButton label={tr('ob.planSave')} onPress={() => void savePlan()} />
              </View>
            ) : (
              <Advance label={tr('ob.planStart')} onPress={() => void finish()} />
            )
          }
        />
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
        title={teasing ? tr(current === 'teaseJournal' ? 'ob.teaseJournalTitle' : 'ob.teaseDayTitle') : titleFor(step, tr)}
        body={teasing ? tr(current === 'teaseJournal' ? 'ob.teaseJournalBody' : 'ob.teaseDayBody') : bodyFor(step, tr)}
        footer={
          <Advance
            label={tr('ob.continue')}
            onPress={forward}
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
              * Android's picker is a dialog, not a wheel on the page: it opens
              * once when mounted and, closed, leaves nothing behind to press. So
              * on Android the answer is drawn as a card that opens it again;
              * iOS keeps its inline spinner, which is already that card.
              */}
            {Platform.OS === 'android' && (
              <Glass strong radius={22} style={styles.dateCard}>
                <Pressable
                  onPress={() => setPicking(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.dateCardFace, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{tr('setup.birthDate')}</Text>
                  <Text style={[type.greeting, { color: birthDate ? colors.foreground : colors.mutedForeground }]}>
                    {birthDate
                      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
                          new Date(`${birthDate}T12:00:00Z`),
                        )
                      : '—'}
                  </Text>
                </Pressable>
              </Glass>
            )}
            {(Platform.OS === 'ios' || picking) && (
              <DateTimePicker
                value={birthDate ? new Date(`${birthDate}T12:00:00Z`) : new Date(1995, 0, 1)}
                mode="date"
                display="spinner"
                minimumDate={BIRTH_DATE_FLOOR}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  setPicking(false);
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
                        { key: 'ft', value: feet, unit: 'ft', onChangeText: setFeet, maxLength: 1 },
                        { key: 'in', value: inches, unit: 'in', onChangeText: setInches, maxLength: 4 },
                      ]
                    : [{ key: 'cm', value: cm, unit: 'cm', onChangeText: setCm, maxLength: 5 }]
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
                    onChangeText: setWeight,
                    maxLength: 5,
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
                setTargetWeight(round1(bodyWeightToKg(next, units)));
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
  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.delay(delay).duration(700).reduceMotion(ReduceMotion.System);

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/*
        * The arrival. The logo ring, in three dimensions, turning in the light
        * with the macro dots in orbit; then the name; then the one sentence
        * about what the next half-minute buys. See `RingObject`.
        */}
      <View style={[styles.hero, column]}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(900)}>
          <RingObject size={168} />
        </Animated.View>
        <Animated.View entering={enter(250)} style={styles.wordmark}>
          <Serif style={[type.hero, styles.centred, { color: colors.foreground }]}>Day *So* Far</Serif>
          <Text style={[t.eyebrow, styles.tagline, { color: colors.mutedForeground }]}>
            {tr('ob.wordmarkTagline')}
          </Text>
        </Animated.View>
        <Animated.View entering={enter(550)} style={styles.welcomeCopy}>
          <Serif style={[type.greeting, styles.centred, { color: colors.foreground }]}>{tr('ob.welcomeTitle')}</Serif>
          <Text style={[t.body, styles.centred, styles.welcomeBody, { color: colors.mutedForeground }]}>
            {tr('ob.welcomeBody')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={enter(800)} style={[styles.welcomeFoot, column, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.language}>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {tr('setup.language')}
          </Text>
          <View style={styles.languageControl}>
            <LanguagePicker value={locale} onChange={setPreferredLocale} />
          </View>
        </View>

        <GlowButton label={tr('ob.welcomeStart')} onPress={onStart} />
        {guest && (
          <Pressable
            onPress={onSignIn}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [styles.haveAccount, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={[t.bodySemibold, { color: colors.foreground }]}>{tr('ob.haveAccount')}</Text>
          </Pressable>
        )}
      </Animated.View>
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

function imperialHeight(feet: string, inches: string): number | null {
  const f = decimal(feet);
  if (f === null) return null;
  return feetInchesToCm(f, decimal(inches) ?? 0);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

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
  dateCard: { alignSelf: 'stretch' },
  dateCardFace: { paddingHorizontal: 18, paddingVertical: 16, gap: 4 },
  measures: { gap: 18 },
  target: { paddingTop: 12 },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  wordmark: { alignItems: 'center', gap: 2, marginTop: -6 },
  tagline: { letterSpacing: 3 },
  welcomeCopy: { alignItems: 'center', gap: 10, marginTop: 22 },
  welcomeBody: { maxWidth: 340 },
  welcomeFoot: { paddingHorizontal: 20, gap: 14 },
  language: { gap: 8 },
  languageControl: { alignSelf: 'stretch' },
  haveAccount: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  saveFoot: { gap: 10 },

  retry: { alignSelf: 'stretch' },
});
