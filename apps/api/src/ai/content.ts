import {
  DraftedPost,
  LOCALE_ENGLISH_NAMES,
  SuggestedTopic,
  type ContentTopic,
  type Locale,
} from '@ct/shared';
import { z } from 'zod';
import { MODELS } from './client.ts';
import { createProvider, type AgentRequest } from './providers/index.ts';

/**
 * Writing one blog post, in one language.
 *
 * Two decisions are baked in here and both are the point of the thing.
 *
 * **It runs on the subscription lane, by name.** `createProvider` defaults to
 * whatever lane the deployment is on — production is on the metered API — and
 * this asks for `'anthropic'` explicitly instead. Thirteen long-form posts a
 * topic on Opus is a real bill on a metered key and nothing on a subscription
 * that is already being paid for, and unlike a journal turn there is no user
 * whose lane this could belong to. If the subscription is not signed in, the
 * run fails and says so rather than quietly falling through to the meter.
 *
 * **Each language is written, not translated.** There is no English original in
 * this file. Every locale gets the same brief and is asked to decide for itself
 * what someone speaking that language would actually type into Google, then
 * write for that. "Калории в баница" has no English counterpart, and a pipeline
 * that translated en into bg would never produce it — it would produce a
 * Bulgarian-shaped article about croissants. See LANGUAGES.md.
 */

/** No tools and no journal. A writer needs neither. */
const NO_TOOLS: AgentRequest['tools'] = [];

const SYSTEM_PROMPT = `You write for the blog of Day So Far, a calorie-tracking app.

WHAT THE PRODUCT IS
Day So Far replaces food-database search with plain language: you describe a
meal in a sentence and it estimates the calories and macros. You can also
photograph a plate, scan a barcode, or reuse a previous meal. Its daily target
is not a fixed formula — it learns what you actually burn by comparing what you
logged against what the scale did, over a fortnight.

WHAT YOU ARE WRITING
One article, for one language, aimed at one search query. It must be worth
reading by someone who never installs the app. An article that is a brochure
with a headline on it is a failure even if every sentence is true.

HOW TO WRITE IT
- Answer the question in the first two sentences. Not "in this article we will
  explore" — the answer, immediately, in a form somebody could quote.
- Be concrete. Real numbers, real foods, real portions. "A medium banana is
  about 105 kcal" beats "fruit contains natural sugars".
- Short paragraphs. Sub-headings that are the questions people ask, not nouns.
- 700-1200 words. Long enough to be complete, short enough to have been edited.
- British or American spelling as the language demands; for English, British.

HONESTY RULES — these override everything above
- This is a health-adjacent subject and the app produces estimates, not
  measurements. Never imply precision the product does not have.
- Never give medical advice, never address a named condition, never suggest a
  calorie target for an individual, and never write anything aimed at someone
  trying to eat as little as possible.
- Do not invent studies, statistics, or citations. If you would need a source
  you do not have, write the sentence without the number.
- Nutrition figures should be the ordinary published ones. Round them and say
  "about".
- Mention the product at most twice, and only where it genuinely answers the
  reader's problem. Never in the first paragraph. No call to action beyond a
  plain sentence.

FORMAT
Markdown. No H1 — the page renders the title itself. Start at "##".
No front matter, no code fences around the whole thing, no images.`;

function taskPrompt(topic: ContentTopic, locale: Locale): string {
  const language = LOCALE_ENGLISH_NAMES[locale];
  return `Write one article in ${language}.

SUBJECT
${topic.name}

BRIEF
${topic.brief}

FIRST, CHOOSE THE QUERY
Decide what a ${language} speaker would actually type into Google to arrive at
this subject. Not a translation of an English phrase — the words that language
really uses, including its own foods and its own units where they differ. If
the natural ${language} query is narrower or wider than the brief, follow the
query: the brief names a subject, and you are choosing the article.

THEN WRITE IT
Everything — the query, the slug, the title, the description and the whole body
— in ${language}. The slug is the exception in form only: transliterate it to
plain lowercase ASCII words joined by hyphens, because it has to survive being a
URL. Keep it short and keep it meaningful in ${language}.

Reply with nothing but a single JSON object:

{
  "keyword": "the query you chose, in ${language}",
  "slug": "ascii-hyphenated-slug",
  "title": "the article title, in ${language}, under 70 characters",
  "description": "one sentence that earns a click from a result list, in ${language}, under 155 characters",
  "body_md": "the article, markdown, starting at ##"
}`;
}

export interface DraftResult {
  post: DraftedPost;
  model: string | null;
  costUsd: number;
}

/**
 * Draft one post. Throws rather than returning a partial: a half-written
 * article is not worth storing, and the caller is a queue that can try again.
 */
export async function draftPost(topic: ContentTopic, locale: Locale): Promise<DraftResult> {
  /*
   * A tool context with no user in it.
   *
   * Every other caller builds this from `getUserContext`, because every other
   * turn belongs to somebody. This one belongs to the site. The empty `userId`
   * is safe only because `tools` is empty and `readOnly` is true — there is no
   * tool here that could go looking for the account it names.
   */
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
      `The content pipeline runs on the Claude Code subscription and it is not signed in: ${authError}`,
    );
  }

  const request: AgentRequest = {
    kind: 'content',
    model: MODELS.content,
    // The house style is byte-identical for all thirteen posts of a topic and
    // every topic after it, so it is the whole cacheable prefix. The brief and
    // the language ride in the user turn.
    staticSystemPrompt: SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: taskPrompt(topic, locale),
    photo: null,
    tools: NO_TOOLS,
    toolNames: [],
    history: [],
    readOnly: true,
    toolset: 'journal',
    /*
     * Four, for a job that makes one request and needs no tools at all.
     *
     * A turn is not a message here — the Agent SDK counts its own steps, and on
     * a reasoning model the thinking that precedes the answer spends them. At 1
     * this returned "Reached maximum number of turns" instead of a topic list.
     * Four is slack, not budget: there is nothing for it to loop on.
     */
    maxTurns: 4,
  };

  const outcome = await provider.run(request, null);
  if (outcome.error) throw new Error(outcome.error);

  return {
    post: parseDraft(outcome.text),
    model: outcome.model ?? null,
    costUsd: outcome.costUsd,
  };
}

/**
 * Pull the JSON object out of whatever came back.
 *
 * Models fence JSON in markdown about as often as they do not, and a post is
 * expensive enough to be worth one lenient parse rather than a retry. Anything
 * past that is a real failure and throws.
 */
export function parseDraft(text: string): DraftedPost {
  const result = DraftedPost.safeParse(extractJson(text));
  if (!result.success) {
    throw new Error(`The writer's JSON is the wrong shape: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

/** The first `{` to the last `}`, fence or no fence, preamble or none. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The model did not return JSON.');

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error('The model returned something that is not valid JSON.');
  }
}

// ---- Choosing what to write about -------------------------------------------

const TOPIC_SYSTEM_PROMPT = `You plan the editorial calendar for the blog of Day
So Far, a calorie-tracking app where you describe a meal in plain language
instead of searching a food database. It also learns your real maintenance
intake from what you log against what the scale does, rather than trusting a
formula.

Your job is to propose subjects worth writing about. A good one:

- Answers a question people genuinely type into a search engine. Not a theme —
  a question. "Why did my weight go up overnight" is a subject; "Nutrition and
  wellness" is not.
- Can be answered well by someone who understands food logging and arithmetic,
  without clinical expertise and without citing studies.
- Is something this product has a real perspective on. The best subjects are the
  ones where the honest answer is more interesting than the popular one.
- Is not a brochure. If the only way to answer it is "use our app", it is a bad
  subject.

Avoid, always:
- Anything requiring medical advice, or aimed at a named condition.
- Anything aimed at eating as little as possible, or at rapid weight loss.
- Subjects that need invented statistics or studies to be worth reading.
- Near-duplicates of each other, or of what already exists.

Each subject will be written thirteen times, once per language, and each
language chooses its own search query from your brief. So the brief must
describe the *substance* — what to cover, what angle, what to avoid — and must
not prescribe an English phrasing, an English example, or a specific title.`;

function topicTaskPrompt(existing: string[], count: number): string {
  const already =
    existing.length > 0
      ? `\n\nALREADY COVERED — do not propose these again, or anything that would\nsubstantially overlap them:\n${existing.map((n) => `- ${n}`).join('\n')}`
      : '';

  return `Propose ${count} subjects.${already}

For each, give:
- "name": the subject as an internal label, in English, under 90 characters.
- "brief": 3-6 sentences describing what the article should cover, what angle to
  take, and anything to avoid. Substance only — no English phrasings to reuse,
  no title, no keyword.
- "rationale": one sentence on why this is worth writing, for the person
  deciding whether to commission it.

Reply with nothing but a single JSON object:

{ "topics": [ { "name": "...", "brief": "...", "rationale": "..." } ] }`;
}

/**
 * Ask for subjects rather than being handed them.
 *
 * Same lane and the same reasoning as `draftPost`: this is the site's own work,
 * not anybody's turn, so it runs on the subscription whatever the deployment is
 * on. Nothing here is written to the database — a suggestion is a list to read
 * and cut down, and agreeing to one of these is agreeing to thirteen articles.
 */
export async function suggestTopics(
  existing: string[],
  count = 8,
): Promise<{ topics: SuggestedTopic[]; model: string | null; costUsd: number }> {
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
      `The content pipeline runs on the Claude Code subscription and it is not signed in: ${authError}`,
    );
  }

  const request: AgentRequest = {
    kind: 'content',
    model: MODELS.content,
    staticSystemPrompt: TOPIC_SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: topicTaskPrompt(existing, count),
    photo: null,
    tools: NO_TOOLS,
    toolNames: [],
    history: [],
    readOnly: true,
    toolset: 'journal',
    /*
     * Four, for a job that makes one request and needs no tools at all.
     *
     * A turn is not a message here — the Agent SDK counts its own steps, and on
     * a reasoning model the thinking that precedes the answer spends them. At 1
     * this returned "Reached maximum number of turns" instead of a topic list.
     * Four is slack, not budget: there is nothing for it to loop on.
     */
    maxTurns: 4,
  };

  const outcome = await provider.run(request, null);
  if (outcome.error) throw new Error(outcome.error);

  return {
    topics: parseTopics(outcome.text),
    model: outcome.model ?? null,
    costUsd: outcome.costUsd,
  };
}

export function parseTopics(text: string): SuggestedTopic[] {
  const parsed = extractJson(text);
  const result = z.object({ topics: z.array(SuggestedTopic).min(1) }).safeParse(parsed);
  if (!result.success) {
    throw new Error(`The planner's JSON is the wrong shape: ${result.error.issues[0]?.message}`);
  }
  return result.data.topics;
}
