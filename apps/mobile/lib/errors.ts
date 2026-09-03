import { ApiError, NetworkError } from '@ct/api-client';

/**
 * What to put on the screen when something failed.
 *
 * Every screen in this app used to render `(e as Error).message` — about forty
 * call sites, all of them assuming the thing they caught had been written by a
 * person. Two of the three kinds are; the third is the platform, and on Android
 * the platform says:
 *
 *     fetch failed: java.net.ConnectException: Failed to connect to /10.0.2.2:4000
 *
 * That was the sign-in screen, in red, on any phone with no signal — and on
 * Today, Progress, Cook, Exercise, History, the plan screen and the barcode
 * scanner, each in its own words, all of them a Java stack trace. An app that
 * advertises working offline cannot answer a tunnel with the name of a Java
 * exception class. It reads as broken because it is indistinguishable from
 * broken.
 *
 * So the three kinds are separated here, once, and every call site asks this
 * instead:
 *
 * - **`NetworkError`** — the request never reached the API. That is not a
 *   fault, it is a location, and it is the one case where the app knows exactly
 *   what to say and roughly when it will stop being true.
 * - **`ApiError`** — the server understood and refused, in a sentence it wrote
 *   for a reader. Passed through untouched; it is better than anything that
 *   could be substituted for it.
 * - **`AppError`** — this app's own refusal, written the same way. Passed
 *   through for the same reason as an `ApiError`.
 * - **Anything else** — a bug, a native module, a parse. There is nothing here
 *   a reader can act on and the raw text is a leak, so it becomes the one
 *   generic sentence in the app. `cause` on the error still carries the
 *   original for anyone with a debugger.
 */
type Translate = (key: 'common.offline' | 'common.unexpected') => string;

/**
 * A failure this app raised on purpose, in words meant to be read.
 *
 * The marker exists because `messageOf` has to decide whether a message is
 * showable, and `Error` alone does not say. A plain `throw new Error("I
 * couldn't read that as a recipe.")` and a `TypeError` from a bug are the same
 * type carrying opposite intentions, and only one of them belongs on screen.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function messageOf(error: unknown, tr: Translate): string {
  if (error instanceof NetworkError) return tr('common.offline');
  if (error instanceof ApiError) return error.message;
  if (error instanceof AppError) return error.message;
  return tr('common.unexpected');
}
