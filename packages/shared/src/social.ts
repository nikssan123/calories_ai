import { z } from 'zod';

/**
 * The social queue's wire contract.
 *
 * A candidate is one rendered image and the caption that goes with it, waiting
 * for a yes or a no. The panel shows the stack; approving one is what reaches
 * Buffer, and therefore a channel.
 *
 * Nothing here describes how the image was made. `scripts/content/post.mts`
 * renders it on a Mac and `scripts/content/queue.mts` uploads the result, so by
 * the time a candidate exists the composition question is already settled. What
 * is left is the only judgement a person is needed for: is this good enough to
 * put the app's name on.
 */

/**
 * `error` is a state and not just a column because Buffer can refuse an
 * approved post — a disconnected channel, a daily cap, an asset it could not
 * fetch — and that is not the same as a rejection. A rejection is a decision; an
 * error is a candidate that still wants one.
 */
export const SocialState = z.enum(['pending', 'approved', 'rejected', 'posted', 'error']);
export type SocialState = z.infer<typeof SocialState>;

/** A Buffer channel, as Buffer describes it. Never stored, only passed through. */
export const SocialChannel = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string(),
  avatar: z.string().nullable(),
  /** Buffer reports these per channel; a disconnected one cannot be posted to. */
  disconnected: z.boolean(),
});
export type SocialChannel = z.infer<typeof SocialChannel>;

export const SocialCandidate = z.object({
  id: z.string(),
  /** The post.mts key, e.g. `10-three-ways-1`. Shown so a slide's place in its slideshow is visible. */
  sourceKey: z.string(),
  caption: z.string(),
  /**
   * `/public/social/:id.png` on the API. A durable URL rather than a presigned
   * one: Buffer fetches the image when it publishes, which for a scheduled post
   * is days after anybody looked at this.
   */
  assetUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  state: SocialState,
  channelIds: z.array(z.string()),
  bufferIds: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  postedAt: z.string().nullable(),
});
export type SocialCandidate = z.infer<typeof SocialCandidate>;

/**
 * What the panel loads in one request: the stack to decide on, the channels to
 * decide for, and the counts — which are the only reason to render a number
 * anywhere in this panel, because the queue's depth is the thing that tells you
 * whether to go and render more.
 */
export const SocialQueue = z.object({
  pending: z.array(SocialCandidate),
  recent: z.array(SocialCandidate),
  channels: z.array(SocialChannel),
  counts: z.object({
    pending: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
    posted: z.number().int(),
    error: z.number().int(),
  }),
  /**
   * Buffer's own ceiling on scheduled posts, and how many are already there.
   * The free plan allows ten, so approving deep is not possible and the panel
   * has to say so rather than let Buffer refuse the eleventh.
   */
  scheduled: z.object({ used: z.number().int(), limit: z.number().int().nullable() }),
});
export type SocialQueue = z.infer<typeof SocialQueue>;

/**
 * A decision. `approve` carries the channels it is for; a rejection does not
 * need them, and neither takes a time — Buffer's own queue decides when, from
 * the posting schedule already configured per channel.
 */
export const SocialDecision = z.discriminatedUnion('verdict', [
  z.object({
    verdict: z.literal('approve'),
    channelIds: z.array(z.string()).min(1),
    /** Edited in the panel before approving; the stored caption is replaced. */
    caption: z.string().min(1).max(2200).optional(),
  }),
  z.object({ verdict: z.literal('reject') }),
]);
export type SocialDecision = z.infer<typeof SocialDecision>;

/**
 * What `queue.mts` sends per rendered image. The bytes arrive base64 because a
 * slide is a few hundred kilobytes and this runs from a laptop a handful of
 * times a week — the presigned-PUT dance that meal photos use exists to keep
 * megabytes off the event loop from thousands of phones, which is not this.
 */
export const SocialUpload = z.object({
  sourceKey: z.string().min(1).max(120),
  caption: z.string().min(1).max(2200),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mediaType: z.enum(['image/png', 'image/jpeg']),
  bytes: z.string().min(1),
});
export type SocialUpload = z.infer<typeof SocialUpload>;
