import { z } from 'zod';
import { MODELS } from './client.ts';
import { createProvider, type AgentRequest } from './providers/index.ts';

/**
 * Writing slideshows for the social queue.
 *
 * Sibling of `content.ts`, which writes the blog. Same lane, same reason — it
 * asks for `'anthropic'` by name so a batch of marketing copy runs on the
 * subscription rather than the metered key, and there is no user whose lane it
 * could belong to. Billed as `content_plan`: this is choosing what to say, not
 * writing an article, and `ai_usage` already accepts that kind (064).
 *
 * The output is not a post. It is a slideshow definition — a hook and three
 * beats — which `scripts/content/suggest.mts` writes to `content/slides/`,
 * `post.mts` renders onto a photograph, and a person then approves or rejects
 * in the panel. Nothing here reaches a channel.
 *
 * ## Why the fact sheet exists
 *
 * Fastlane generated a four-slide carousel for this app on 2026-09-23 whose
 * third habit was "share the log before your next check-in" — the coach
 * product, which is shipped but is not being marketed, and which nobody had
 * asked it to mention. It came from its own read of the website. That is the
 * failure mode of a brand profile scraped rather than stated: it is complete,
 * so the model treats everything in it as fair game.
 *
 * So the grounding here is a written list, and the prompt says plainly that
 * anything not on it does not exist. The list is short on purpose. Adding to it
 * is how the coach slide happens again.
 */

/**
 * What the app does, as the model is allowed to describe it.
 *
 * Every line is defensible against `content/raw/app-tour.mp4` — the 25s capture
 * that the rendered slides sit beside — and against PLAY_LISTING.md's rule that
 * nothing is claimed the app cannot do.
 */
export const FACTS = `
Day So Far is a calorie and macro tracker. Say what you ate in plain language
and it works out the numbers. Four screens, and that is the whole app.

JOURNAL — one question, "What have you eaten today?", and three ways to answer:
  * type a sentence ("chicken burrito bowl with guac")
  * hold the mic and say it out loud
  * photograph the plate
  The app's own line for this is "No forms, nothing to search for." There is no
  food database to search and no quantity fields to fill in.

TODAY — a calorie ring against a target, the three macros (protein, carbs,
  fat), and a Diet Quality card underneath showing four more numbers: fibre,
  sodium, saturated fat and sugar.

PROGRESS — achievements, a weight trend, calories per day.

HISTORY — a month calendar with each day's totals, scrollable back.

TONE — a solo developer who built this over six months of evenings because
  every other tracker made logging feel like data entry. First person. Dry, not
  chirpy. Never "revolutionary", never "game-changing", never an emoji.
`.trim();

/**
 * And what it must not say. Stated as prohibitions rather than left to the fact
 * sheet's silence, because a model filling a gap is the whole problem.
 */
export const FORBIDDEN = `
NEVER mention, imply or allude to:
  * coaches, coaching, sharing logs with anyone, or check-ins. The coach product
    exists and is deliberately not being marketed.
  * barcode scanning. It is real but it is not in the footage these slides sit
    beside, so a viewer cannot see it.
  * any competitor by name, and any price or subscription claim. "MyFitnessPal
    wanted $20 a month" invites "so is this free?" under every post, and it is
    not free.
  * weight lost, results achieved, or any outcome. There are no users to have
    achieved anything yet, and the numbers on screen are seeded test data.
  * any feature not in the fact sheet. Meal planning, recipes, fasting,
    reminders, streaks, water tracking, exercise — if it is not above, it does
    not exist.
  * a specific calorie figure attached to a specific food. The slide is rendered
    over a stock photograph of somebody else's meal, so any number would be
    fiction.
`.trim();

/**
 * The grammar, which is the part worth being pedantic about.
 *
 * Measured off what carries on TikTok and Reels right now: a hook that does not
 * resolve itself, and three beats per slide where the parenthetical lowers the
 * stakes before the claim lands. The previous set of hooks in this repo were
 * eleven taglines — every line answered its own question, so there was no
 * reason to keep watching.
 */
const SYSTEM_PROMPT = `
You write short-form slideshows for one app. Output JSON only.

${FACTS}

${FORBIDDEN}

## The shape

A slideshow is a cover plus exactly three beat slides.

The COVER is a hook, and a hook is an unfinished sentence. Four things earn a
hook its place; the best have three:
  * A COUNT — "3 ways", "4 numbers". It tells the viewer what they are
    committing to, which is why they commit.
  * A WORKING ADJECTIVE — not "simple" or "easy". One that promises something
    not already known: "in order of laziness" beats "easy".
  * A PAYOFF — what they get for staying.
  * AN OPEN END — a colon, or a sentence that stops early.
Test: if a viewer could screenshot the hook and have the whole idea, it is a
caption, not a hook. Rewrite it.

If the hook states a count, the three beats must pay that exact count off. Do
not write "5 things" and give three.

Each BEAT has three parts, in this order:
  * aside — a short parenthetical, lower case, in brackets. Reassurance, an
    admission, or a joke at the app's expense. It lowers the stakes.
  * claim — numbered when the hook counts. The thing being said. Six words or
    fewer where possible.
  * reason — one sentence on why it is true. Not a second claim. Under 110
    characters.

## Registers

Vary them across a batch. Do not write five slideshows in the same voice:
  * build-in-public — first person, what shipped and what got cut.
  * relatable — about the viewer's evening, not about the app. These can mention
    no feature at all, and are often the best ones.
  * feature, obliquely — the app named once, late, inside an instruction rather
    than as a call to action.

## Output

{"slideshows":[{"key":"...","stock":"...","hook":"...","beats":[{"aside":"...","claim":"...","reason":"..."},...]}]}

  key    kebab-case, 2-4 words, no number prefix. e.g. "nine-pm-rebuild".
  stock  which photo set grounds it — one of: meals, counter, market, evening.
         meals = plates and people eating. counter = kitchens and prep.
         market = shops and produce. evening = the kitchen after dark, fridge open.
  hook   may contain one <br> to control the line break. Nothing else.

No prose outside the JSON. No markdown fence.
`.trim();

export const SuggestedSlideshow = z.object({
  key: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'key must be kebab-case'),
  stock: z.enum(['meals', 'counter', 'market', 'evening']),
  hook: z.string().min(8).max(120),
  beats: z
    .array(
      z.object({
        aside: z.string().min(3).max(80).optional(),
        claim: z.string().min(3).max(60),
        reason: z.string().min(3).max(160).optional(),
      }),
    )
    .length(3),
});
export type SuggestedSlideshow = z.infer<typeof SuggestedSlideshow>;

function taskPrompt(count: number, avoid: string[], theme?: string): string {
  const seen = avoid.length
    ? `\n\nAlready made, so do not repeat the idea or the hook shape:\n${avoid.map((k) => `  * ${k}`).join('\n')}`
    : '';
  /*
   * A theme narrows the subject and nothing else. The fact sheet and the
   * prohibitions still bind — a theme is not permission to reach past them,
   * which is the failure a free-text steer invites.
   */
  const angle = theme
    ? `\n\nAll ${count} are on one subject: ${theme}\nStay inside the fact sheet. Approach it from a different direction in each — the friction it removes, what it replaced, what it feels like to use, who gave up on tracking before it. Do not write the same slideshow with the words moved around.`
    : '\nVary the register across them — at least one that mentions no feature at all.';
  return `Write ${count} slideshows.${angle}${seen}`;
}

/**
 * The banned words a fact sheet cannot catch.
 *
 * A prompt asking for no emoji still gets one occasionally, and a model told
 * not to mention coaching will still reach for "check-in" when it wants a word
 * for the end of a week. Checking after the fact is cheap, and a rejected
 * slideshow costs nothing — the batch simply comes back one short, which is
 * visible, rather than the panel showing a slide nobody can post.
 */
export const TRIPWIRES = [
  /\bcoach(es|ing)?\b/i,
  /\bcheck-?in\b/i,
  /\bbarcode\b/i,
  /\bmyfitnesspal\b/i,
  /\bcal ai\b/i,
  /\blost \d+\s*(kg|lb|pounds)\b/i,
  /\bgame.?chang/i,
  /\brevolutionar/i,
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
];

export function screen(show: SuggestedSlideshow): string | null {
  const text = [show.hook, ...show.beats.flatMap((b) => [b.aside, b.claim, b.reason])]
    .filter(Boolean)
    .join(' ');
  for (const pattern of TRIPWIRES) {
    if (pattern.test(text)) return `tripped ${pattern}`;
  }
  // A hook that counts has to be paid off. The prompt says so; this is the
  // check, because it is the one error that makes a slideshow unpostable rather
  // than merely weak.
  const counted = /\b([2-9])\b/.exec(show.hook);
  if (counted && Number(counted[1]) !== show.beats.length) {
    return `hook promises ${counted[1]} and there are ${show.beats.length} beats`;
  }
  return null;
}

export function parseSlideshows(text: string): SuggestedSlideshow[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in the model output');
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  const result = z
    .object({ slideshows: z.array(SuggestedSlideshow).min(1) })
    .safeParse(parsed);
  if (!result.success) {
    throw new Error(`The writer's JSON is the wrong shape: ${result.error.issues[0]?.message}`);
  }
  return result.data.slideshows;
}

export async function suggestSlideshows(
  count = 5,
  avoid: string[] = [],
  theme?: string,
): Promise<{
  slideshows: SuggestedSlideshow[];
  rejected: { key: string; why: string }[];
  model: string | null;
  costUsd: number;
}> {
  const toolContext = {
    userId: '',
    ctx: { timezone: 'UTC', dayStartHour: 0 },
    now: new Date(),
    photoId: null,
    actions: [],
    units: 'metric' as const,
  };

  const provider = createProvider(toolContext as never, 'anthropic');
  const authError = provider.checkAuth();
  if (authError) {
    throw new Error(
      `The slideshow writer runs on the Claude Code subscription and it is not signed in: ${authError}`,
    );
  }

  const request: AgentRequest = {
    kind: 'content_plan',
    model: MODELS.content_plan,
    staticSystemPrompt: SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: taskPrompt(count, avoid, theme),
    photo: null,
    tools: [],
    toolNames: [],
    history: [],
    readOnly: true,
    toolset: 'journal',
    // Four, matching suggestTopics: one request, no tools, and on a reasoning
    // model the thinking before the answer spends turns of its own.
    maxTurns: 4,
  };

  const outcome = await provider.run(request, null);
  if (outcome.error) throw new Error(outcome.error);

  const all = parseSlideshows(outcome.text);
  const slideshows: SuggestedSlideshow[] = [];
  const rejected: { key: string; why: string }[] = [];
  for (const show of all) {
    const why = screen(show);
    if (why) rejected.push({ key: show.key, why });
    else slideshows.push(show);
  }

  return { slideshows, rejected, model: outcome.model ?? null, costUsd: outcome.costUsd };
}
