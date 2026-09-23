import { z } from 'zod';
import { MODELS } from './client.ts';
import { createProvider, type AgentRequest } from './providers/index.ts';
import { FACTS, FORBIDDEN, TRIPWIRES } from './slides.ts';

/**
 * The meme writer.
 *
 * `slides.ts` writes slideshows: a hook and three beats that explain something,
 * set over a photograph. This writes the other format — one line of type over
 * one moving clip, and nothing explained at all.
 *
 * The two are not the same job and must not share a prompt. A slideshow earns
 * the swipe by being useful; a meme earns the stop by being recognisable. The
 * register that makes the first one good makes the second one an advert.
 *
 * The fact sheet, the prohibitions and the tripwires are imported rather than
 * restated. What the product is does not change with the format, and a second
 * copy of it would drift — the first version of this file had its own FACTS and
 * they disagreed about how many screens the app has within an hour.
 *
 * What it does not know, deliberately: which sounds or formats are trending.
 * That is not in any model's weights at a useful freshness, and a prompt
 * claiming otherwise produces last year's memes with confidence. The clip sets
 * carry the shot grammar and the panel's own numbers say what travelled.
 */

/**
 * The clip sets, which are shots and not subjects.
 *
 * `stock.ts`'s `evening` set learned this the hard way: described as "evenings,
 * laptops, gym bags" it returned a man in a jiu-jitsu gi, and the writer quite
 * reasonably picked it. A set has to mean one thing.
 *
 * These mean one *composition* each, because in this format the composition is
 * what does the work. Nobody watching knows who the person is and it lands
 * anyway, on the shape of the frame and the line over it — which is also why no
 * famous face is needed, and just as well, because film footage of one is
 * somebody else’s copyright.
 */
export const CLIP_SETS = ['defeated', 'kitchen', 'phone', 'street'] as const;

const VOICE = `
THE FORMAT

One clip. One line of type over it. No cuts, no explanation, no list.

The clip is somebody ordinary, filmed candidly and close — slumped at a table,
a hand at a counter, a face lit by a phone. Never a landscape with a small
person in it. The viewer does not know them and does not
need to. The feeling comes from the frame and from your line.

You are writing the line.

THE VOICE

  * lowercase throughout, including the first word
  * first person, or second person aimed at one reader. never "we", never "our
    users", never a brand speaking
  * a confession or a complaint, never a claim. "nobody told me tracking food
    would feel like homework" works. "the easiest way to track your meals" does
    not
  * dry. the joke is on you, never on the reader
  * no final full stop on the hook. it is a thought, not a sentence
  * one to three lines, broken with <br>. fourteen words at the very most,
    and shorter is better
  * no feature names in the hook. the sub may point at one, once
  * no emoji, no hashtags, no exclamation marks, no rhetorical questions aimed
    at the reader ("ever wondered...")

THE SUB

Optional, and it is the turn — the quiet second beat after the hook lands. Half
the length of the hook or less. It may name the app's actual behaviour, plainly:
"so i deleted the search box", "now i just say it out loud". Leave it out when
the hook is complete on its own.

GOOD

  hook: nobody told me<br>tracking food would<br>feel like homework
  sub:  so i deleted the search box

  hook: i knew what i ate<br>i just couldn't be bothered<br>to prove it
  sub:  (no sub — it is complete)

  hook: day 4 of pretending<br>i remember what lunch was

BAD, and why

  "Track your meals effortlessly with Day So Far!" — a brand talking, a claim,
  an exclamation mark, capitalised.
  "Ever wondered why you quit tracking?" — a question aimed at the reader.
  "3 reasons logging food is hard" — that is a slideshow, not a meme.
  "revolutionise your nutrition journey" — every word of this is banned.

CHOOSING A CLIP SET

  defeated — one person, still, close to camera, a feeling you can read on them.
            for resignation, giving up, being tired of your own habit. slumped at
            a table, head in hands, staring at nothing.
  kitchen — hands and counters, candid, mid-task. for the moment of eating or
            cooking, and for anything about the logging itself.
  phone   — a face or hands lit by a screen, at a table, on a sofa, in bed. for
            the friction, the search box, the nine-pm rebuild from memory.
  street  — walking, commuting, a city at dusk. for time passing, for months of
            this, for the ordinary day the meal sits inside.
`.trim();

const SYSTEM_PROMPT = `
You write short-form video captions for one app. Output JSON only.

${FACTS}

${FORBIDDEN}

${VOICE}

OUTPUT

A JSON array, nothing before or after it, no markdown fence. One object per
meme:

  {
    "key": "kebab-case-name",
    "clip": "defeated" | "kitchen" | "phone" | "street",
    "hook": "line one<br>line two",
    "sub": "the turn, or omit the field entirely"
  }
`.trim();

export const SuggestedMeme = z.object({
  key: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'key must be kebab-case'),
  clip: z.enum(CLIP_SETS),
  /** Fourteen words at most, broken with `<br>`; the renderer honours the breaks. */
  hook: z.string().min(8).max(110),
  sub: z.string().min(3).max(70).optional(),
});
export type SuggestedMeme = z.infer<typeof SuggestedMeme>;

function taskPrompt(count: number, avoid: string[], theme?: string): string {
  const seen = avoid.length
    ? `\n\nAlready made, so do not repeat the idea or the line shape:\n${avoid.map((h) => `  * ${h}`).join('\n')}`
    : '';
  const angle = theme
    ? `\n\nAll ${count} are on one subject: ${theme}\nStay inside the fact sheet. Come at it from a different feeling each time — resignation, irritation, relief, self-mockery. Do not write one meme ${count} times.`
    : `\nSpread them across the clip sets and across feelings. At least one that names no behaviour of the app at all.`;
  return `Write ${count} memes.${angle}${seen}`;
}

/**
 * The register tripwires, on top of the shared ones.
 *
 * `TRIPWIRES` in slides.ts catches what must never be said about the product.
 * These catch the thing this format fails at instead: sounding like marketing.
 * A model told to write lowercase and dry still reaches for "effortlessly" when
 * it wants a word, and one such word is the whole difference between a meme and
 * an advert.
 */
const REGISTER = [
  /\beffortless(ly)?\b/i,
  /\bseamless(ly)?\b/i,
  /\bjourney\b/i,
  /\bunlock\b/i,
  /\bsupercharge\b/i,
  /\bgame.?chang/i,
  /\brevolution/i,
  /\bever wondered\b/i,
  /\bsay goodbye to\b/i,
  /\bthe easiest way\b/i,
  /!/,
  /\p{Extended_Pictographic}/u,
];

/**
 * Why a meme is thrown away. Returns null when it is fine.
 *
 * Cheap, and a rejected meme costs nothing — the batch comes back one short,
 * which is visible in the output, rather than a card nobody can post appearing
 * in the panel.
 */
function screen(meme: SuggestedMeme): string | null {
  const text = `${meme.hook} ${meme.sub ?? ''}`;
  const flat = text.replace(/<br>/g, ' ');

  for (const rule of [...TRIPWIRES, ...REGISTER]) {
    const hit = flat.match(rule);
    if (hit) return `tripwire: ${JSON.stringify(hit[0])}`;
  }

  // Lowercase is the format, and a capital is the commonest way the register
  // slips. Proper nouns are not worth an exception — nothing in this voice
  // needs one.
  const letters = flat.replace(/[^A-Za-z]/g, '');
  if (letters && letters !== letters.toLowerCase()) {
    return `has capitals: ${JSON.stringify(flat.slice(0, 48))}`;
  }

  // The hook only. Counting the sub as well and calling the total "the hook"
  // rejected four of the first six, every one of them within the rule it was
  // supposedly breaking.
  const hookWords = meme.hook.replace(/<br>/g, ' ').trim().split(/\s+/).length;
  if (hookWords > 14) return `${hookWords} words in the hook — over fourteen reads as a paragraph`;
  const subWords = meme.sub ? meme.sub.trim().split(/\s+/).length : 0;
  if (subWords > 10) return `${subWords} words in the sub — it is a turn, not a second hook`;

  // Three lines is the ceiling the renderer's type size assumes; a fourth
  // overflows the safe area on a 9:16 frame rather than wrapping gracefully.
  const lines = meme.hook.split('<br>').length;
  if (lines > 3) return `${lines} lines — three is the most the frame holds`;

  return null;
}

export function parseMemes(text: string): SuggestedMeme[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('No JSON array in the model output');
  const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(raw)) throw new Error('Model output was not an array');

  const out: SuggestedMeme[] = [];
  for (const item of raw) {
    const parsed = SuggestedMeme.safeParse(item);
    // A malformed entry is dropped rather than failing the batch: five good
    // memes and one bad one is a useful run, and the count printed at the end
    // says how many survived.
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function suggestMemes(
  count = 6,
  avoid: string[] = [],
  theme?: string,
): Promise<{
  memes: SuggestedMeme[];
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

  // The 'anthropic' lane by name, not the deployment's lane: a batch of
  // marketing copy on Opus is a real bill on a metered key and nothing on a
  // subscription already being paid for. Same reasoning as slides.ts.
  const provider = createProvider(toolContext as never, 'anthropic');
  const authError = provider.checkAuth();
  if (authError) {
    throw new Error(
      `The meme writer runs on the Claude Code subscription and it is not signed in: ${authError}`,
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
    maxTurns: 4,
  };

  const outcome = await provider.run(request, null);
  if (outcome.error) throw new Error(outcome.error);

  const all = parseMemes(outcome.text);
  const memes: SuggestedMeme[] = [];
  const rejected: { key: string; why: string }[] = [];
  for (const meme of all) {
    const why = screen(meme);
    if (why) rejected.push({ key: meme.key, why });
    else memes.push(meme);
  }

  return { memes, rejected, model: outcome.model ?? null, costUsd: outcome.costUsd };
}
