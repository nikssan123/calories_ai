import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

/**
 * Saying what you ate, instead of typing it.
 *
 * The direction is worth being exact about, because the other one is a
 * different package with a confusingly similar name: this is speech *to* text.
 * Nothing here ever speaks. The microphone produces the same string the
 * keyboard would have produced, the composer sends it down the same
 * `chatStream` every typed meal takes, and nothing downstream can tell which
 * one it was. Voice is an input method here, not a mode — there is no voice
 * screen, no transcript to manage, and no second code path to keep honest.
 *
 * **The recogniser is the phone's own**, through Android's `SpeechRecognizer`.
 * That is the load-bearing decision, and it buys three things at once:
 *
 * - No audio reaches this project's servers, so there is no new processor to
 *   name in `/privacy` §4 and nothing new to declare as collected.
 * - It costs nothing per sentence — on a journal turn that already blends to
 *   about 6.6c before anybody has said a word.
 * - It can run with no signal, which is the same argument `lib/outbox.ts`
 *   makes for the queue. A meal dictated in a basement gym is a meal logged in
 *   a basement gym.
 *
 * The last one is a *preference*, not a promise, and `start` below is shaped
 * around that: Android will otherwise hand the audio to Google's network
 * recogniser, so on-device is asked for first and the network is where this
 * falls back to rather than where it starts.
 *
 * `RECORD_AUDIO` has been declared in `app.json` and unused since the app was
 * built, which `PLAY_LISTING.md` §6 says to delete unless voice ships in the
 * same release. This is that release, and the permission is now honest.
 */

/**
 * Whether this phone can do it at all.
 *
 * False on an Android build with no recognition service installed — which is
 * most non-Google ROMs, some enterprise images, and a surprising number of
 * cheap devices in exactly the markets `PLAY_LISTING.md` §7 lists. The
 * composer hides the control entirely rather than offering a button that can
 * only ever apologise.
 *
 * Wrapped because it is a native call on a module that may have failed to
 * load; there is no version of this worth a red screen over.
 */
export function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Whether the phone can recognise without sending the audio anywhere. */
function onDeviceAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

/**
 * On-device recognition was offered and refused, so stop offering it.
 *
 * `supportsOnDeviceRecognition` answers for the *recogniser*, not for the
 * language: a Pixel with no English pack downloaded says yes and then refuses
 * the request with `language-not-supported`. That refusal is only discoverable
 * by asking, so the first attempt of a session pays for it — about 300ms and a
 * discarded recogniser session — and every attempt after it goes straight to
 * the path that works.
 *
 * Module-level, and deliberately not persisted: a pack downloaded later in the
 * week should be picked up the next time the app starts, and the cost of being
 * wrong in that direction is one wasted attempt.
 */
let onDeviceRefused = false;

/**
 * What language to listen for.
 *
 * The app has no locale of its own yet — `LANGUAGES.md` is still a plan — so
 * the only honest answer is the one the phone is already set to, and it is the
 * right answer anyway: somebody whose phone is in Bulgarian is going to say
 * "две яйца и филия хляб", and the recogniser has to be told that before they
 * say it, not after. Hermes ships a complete `Intl`, so this costs no
 * dependency and no native call.
 *
 * When a profile locale does land, this is the one line that has to learn
 * about it.
 */
function deviceLanguage(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.length >= 2 ? locale : 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * What to say when it does not work, in the composer rather than in a toast —
 * the message is about the field it is under, which is the rule `Toast.tsx`
 * states and then declines to break for itself.
 */
const PROBLEMS: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'no-speech': "Didn't catch that — try again, or type it.",
  network: 'Speech needs a signal on this phone. Type it and it still counts.',
  'audio-capture': 'The microphone is busy. Type it, or try again in a moment.',
  'service-not-allowed': "This phone can't do speech right now — type it instead.",
  'language-not-supported': "This phone has no speech pack for your language yet — type it instead.",
};

const GENERIC = "That didn't work — type it instead.";
const DENIED = 'Day So Far needs the microphone to hear a meal.';
const DENIED_FOR_GOOD = 'Microphone access is off. Turn it on in Settings to talk to the journal.';

export interface Dictation {
  /** The phone can do this. False hides the control rather than disabling it. */
  supported: boolean;
  listening: boolean;
  /** Why the last attempt came to nothing, when it is worth saying. */
  problem: string | null;
  start: () => void;
  stop: () => void;
  /** Somebody answered the problem by typing instead. Stop saying it. */
  dismiss: () => void;
}

/**
 * One microphone, wired to whatever is holding the text.
 *
 * `onTranscript` is called with the *whole* utterance every time the recogniser
 * revises it, not with the words since the last call, which is what makes the
 * merge in the composer a replacement rather than an append — a recogniser that
 * changes its mind about a word it heard four words ago is the normal case, not
 * the exception.
 *
 * **Interim results are the source of truth, and no final is ever waited for.**
 * Android in continuous mode has a live bug where `stop()` raises `client`
 * instead of delivering the last result, and the phrasing of this app's whole
 * pitch is one long sentence, which is the exact shape that hits it. Since
 * every interim has already been written into the composer, the failure mode
 * of that bug here is *nothing at all* — the words are already in the box, the
 * error arrives with `heard` set, and it is swallowed.
 *
 * Continuous mode is also what mutes Android's start/stop beep: it moves the
 * recogniser onto a custom audio source instead of the system one. A beep would
 * be the loudest thing this app has ever done.
 */
export function useDictation(onTranscript: (transcript: string) => void): Dictation {
  const [supported] = useState(recognitionAvailable);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Anything at all came back this session, so a late error is not worth reporting. */
  const heard = useRef(false);
  /** This attempt asked to stay on the device, so a refusal can be retried once. */
  const local = useRef(false);
  /** Whether the retry has been spent. */
  const retried = useRef(false);
  const live = useRef(false);
  /**
   * A session has been abandoned mid-retry, and the `end` it is about to emit
   * is not about the session now running.
   *
   * Android emits the refusal and the closing event of the first attempt
   * *around* the start of the second, in no fixed order — traced on a Pixel 8
   * emulator as `start, error, end, start` on one run and with the `end` last
   * on another. Taking that `end` at face value leaves the button showing a
   * microphone that is, in fact, open and listening, which is the one state
   * this component must never be in.
   */
  const superseded = useRef(false);

  const report = useRef(onTranscript);
  useEffect(() => {
    report.current = onTranscript;
  }, [onTranscript]);

  const launch = useCallback((allowOnDevice: boolean) => {
    local.current = allowOnDevice && !onDeviceRefused && onDeviceAvailable();
    ExpoSpeechRecognitionModule.start({
      lang: deviceLanguage(),
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: local.current,
      // Android only honours this with on-device recognition, and it is the
      // difference between "two eggs toast and some cheese" and a sentence the
      // model can read the clauses of.
      addsPunctuation: true,
    });
  }, []);

  useSpeechRecognitionEvent('start', () => {
    live.current = true;
    superseded.current = false;
    setListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    // The close of a session that has already been replaced. The retry either
    // has started or is about to, and it owns the button now.
    if (superseded.current) {
      superseded.current = false;
      return;
    }
    live.current = false;
    setListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) return;
    heard.current = true;
    report.current(transcript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    live.current = false;
    // The words are already in the composer. Whatever went wrong went wrong
    // after the only part that mattered.
    if (heard.current) return;

    /*
     * The one refusal worth arguing with. Asking for on-device recognition on
     * a phone that has the recogniser but not the language pack is refused
     * outright, and the reader did nothing wrong and has no way to know — so
     * the same sentence is offered to the network recogniser once, and only
     * the second refusal is theirs to hear.
     */
    const packMissing =
      event.error === 'language-not-supported' || event.error === 'service-not-allowed';
    if (packMissing && local.current && !retried.current) {
      retried.current = true;
      onDeviceRefused = true;
      superseded.current = true;
      try {
        launch(false);
        return;
      } catch {
        superseded.current = false;
        // Fall through to the message.
      }
    }

    setListening(false);
    setProblem(PROBLEMS[event.error] ?? GENERIC);
  });

  const start = useCallback(() => {
    void (async () => {
      setProblem(null);
      heard.current = false;
      retried.current = false;
      try {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) {
          setProblem(permission.canAskAgain ? DENIED : DENIED_FOR_GOOD);
          return;
        }
        launch(true);
      } catch {
        setProblem(GENERIC);
      }
    })();
  }, [launch]);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // `end` may never arrive after this; the state below is what the button reads.
    }
    live.current = false;
    setListening(false);
  }, []);

  // A composer that unmounts mid-sentence — a tab switch, a sign-out — must not
  // leave the microphone open behind it.
  useEffect(
    () => () => {
      if (!live.current) return;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Nothing to do about it from a teardown.
      }
    },
    [],
  );

  const dismiss = useCallback(() => setProblem(null), []);

  return { supported, listening, problem, start, stop, dismiss };
}
