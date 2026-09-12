import { z } from 'zod';
import { Locale } from './locale.ts';

/**
 * The blog.
 *
 * A *topic* is a subject, decided once and in English because it is a note to
 * the person running the thing. A *post* is one language's answer to it, and
 * the distinction is load-bearing: posts are written from each locale's own
 * search results rather than translated from an English original, so two posts
 * under one topic may share nothing but the subject. See LANGUAGES.md, and
 * migration 051 for why the schema refuses to model a post as a translation of
 * another post.
 */

export const PostStatus = z.enum(['draft', 'published', 'binned']);
export type PostStatus = z.infer<typeof PostStatus>;

export const ContentTopic = z.object({
  id: z.string().uuid(),
  /** An internal English label. Never shown to a reader. */
  name: z.string(),
  /** What the topic covers, in enough detail to brief a writer who has only this. */
  brief: z.string(),
  created_at: z.string(),
});
export type ContentTopic = z.infer<typeof ContentTopic>;

export const ContentPost = z.object({
  id: z.string().uuid(),
  topic_id: z.string().uuid(),
  locale: Locale,
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  body_md: z.string(),
  /** The query this locale was written for, so a reviewer can see the intent. */
  keyword: z.string(),
  status: PostStatus,
  published_at: z.string().nullable(),
  model: z.string().nullable(),
  cost_usd: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ContentPost = z.infer<typeof ContentPost>;

/** A post as a reader's index sees it: no body, no provenance. */
export const PostCard = ContentPost.pick({
  slug: true,
  locale: true,
  title: true,
  description: true,
  published_at: true,
});
export type PostCard = z.infer<typeof PostCard>;

/**
 * One published post plus the other languages it exists in.
 *
 * `alternates` is what the page turns into `hreflang`, and it carries a slug
 * per locale because the slugs genuinely differ — that is the whole reason the
 * cluster cannot be computed from the URL.
 */
export const PublicPost = ContentPost.pick({
  slug: true,
  locale: true,
  title: true,
  description: true,
  body_md: true,
  published_at: true,
  updated_at: true,
}).extend({
  alternates: z.array(z.object({ locale: Locale, slug: z.string() })),
});
export type PublicPost = z.infer<typeof PublicPost>;

/** A topic and every post under it, for the admin list. */
export const TopicWithPosts = z.object({
  topic: ContentTopic,
  posts: z.array(ContentPost),
});
export type TopicWithPosts = z.infer<typeof TopicWithPosts>;

/**
 * The shape a model is asked to return for one post.
 *
 * `keyword` is required and comes back rather than going in, because the writer
 * picks it: the brief names a subject, and the model's job in that locale is to
 * decide what someone speaking it would actually type. That is the step a
 * translation pipeline skips.
 */
export const DraftedPost = z.object({
  keyword: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(90)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words joined by hyphens'),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(320),
  body_md: z.string().min(1),
});
export type DraftedPost = z.infer<typeof DraftedPost>;

/**
 * A topic the model proposed, before anybody has agreed to it.
 *
 * Not a `ContentTopic`: it has no id and no row. The suggestion step exists so
 * the list can be read and cut down before any of it becomes work — thirteen
 * articles is what agreeing to one of these costs.
 */
export const SuggestedTopic = z.object({
  name: z.string().min(1).max(200),
  brief: z.string().min(1).max(4000),
  /**
   * Why this one is worth writing, in a sentence. Purely for the person
   * choosing; it is never stored and never reaches a writer.
   */
  rationale: z.string().min(1).max(400),
  /**
   * How this differs from the nearest thing already considered.
   *
   * Asked for so the planner has to actually check rather than pattern-match a
   * plausible-looking list, and shown to the editor so the check is auditable.
   * Never stored and never reaches a writer.
   */
  distinct_from: z.string().min(1).max(400),
});
export type SuggestedTopic = z.infer<typeof SuggestedTopic>;
