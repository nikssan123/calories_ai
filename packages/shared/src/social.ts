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
 * A slideshow, as one decision.
 *
 * Slides are stored one row each — `10-three-ways-0` through `-3` — and that is
 * right, because each is a separate image with its own asset. But a slideshow
 * is not four posts. It is one carousel that is read by swiping, and the first
 * build of this posted each slide separately: four Instagram feed posts where
 * there should have been one, with the format's entire mechanism removed.
 *
 * So the row is the unit of storage and the group is the unit of decision. The
 * group key is the source key with its trailing index removed, and the slides
 * are ordered by that index — which is also the carousel's order, so the cover
 * has to be first and `Buffer`'s `assets` array is built straight from it.
 */
export const SocialSlide = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  assetUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  /**
   * `image/png` or `video/mp4`, carried so the panel can put carousels and
   * meme videos on separate tabs. Derivable from the url's extension, and that
   * is exactly the kind of inference that is right until somebody adds jpeg.
   */
  mediaType: z.string(),
});
export type SocialSlide = z.infer<typeof SocialSlide>;

export const SocialGroup = z.object({
  /** `10-three-ways`, the source key without its trailing `-<index>`. */
  key: z.string(),
  /**
   * The caption for the whole carousel, which is the cover slide's. The other
   * slides' captions are kept on their rows and are not posted anywhere — a
   * carousel has one body, and the per-slide lines are notes for whoever is
   * deciding.
   */
  caption: z.string(),
  slides: z.array(SocialSlide).min(1),
  state: SocialState,
  channelIds: z.array(z.string()),
  bufferIds: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type SocialGroup = z.infer<typeof SocialGroup>;

/**
 * What the panel loads in one request: the stack to decide on, the channels to
 * decide for, and the counts — which are the only reason to render a number
 * anywhere in this panel, because the queue's depth is the thing that tells you
 * whether to go and render more.
 */
export const SocialQueue = z.object({
  pending: z.array(SocialGroup),
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
    /** Edited in the panel before approving; the cover row's caption is replaced. */
    caption: z.string().min(1).max(2200).optional(),
    /**
     * Hashtags, without the `#`, appended to the caption per service.
     *
     * Stored on the decision rather than in the caption because the number that
     * belongs on a post differs by platform — Instagram and TikTok take a
     * handful, X has 280 characters to spend and a tag costs the same as words.
     * `HASHTAG_LIMITS` in `services/social.ts` does the trimming.
     */
    hashtags: z.array(z.string().regex(/^[A-Za-z0-9_]{2,40}$/)).max(12).optional(),
    /**
     * Hand it to the phone instead of publishing it.
     *
     * Buffer calls this a notification post: at the slot time it pushes to the
     * Buffer mobile app, and the post is finished in Instagram or TikTok by
     * hand. That is a worse deal for a carousel, where the decision is already
     * made, and the only deal available for anything that wants a trending
     * sound.
     *
     * Buffer's API can search the Instagram audio library — `trendingInstagramAudio`
     * and two siblings — and has no field anywhere to attach a track: every
     * per-service metadata input was checked, and Instagram's carries
     * `firstComment`, `geolocation`, `isAiGenerated`, `link`, `shouldShareToFeed`,
     * `stickerFields` and `type`. So audio baked into an MP4 is the only audio
     * this pipeline can deliver on its own, and a real meme sound baked in is
     * muted or pulled by rights detection. Handing the clip to the native
     * editor is how the track stays licensed.
     *
     * Needs the Buffer mobile app installed, and notifications enabled for the
     * channel in Buffer's own settings — neither is something this can check.
     */
    reminder: z.boolean().optional(),
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
  /**
   * `video/mp4` is one post with one asset, never a carousel — see
   * `scripts/content/video.mts`, which stitches a slideshow's slides into a
   * single vertical MP4 because a native carousel only reaches existing
   * followers while a video goes into the recommendation surfaces.
   */
  mediaType: z.enum(['image/png', 'image/jpeg', 'video/mp4']),
  bytes: z.string().min(1),
});
export type SocialUpload = z.infer<typeof SocialUpload>;

/**
 * How a posted carousel actually did.
 *
 * The missing half of this panel. Approving got tidier, and until these numbers
 * exist nothing about it got more *measurable* — which was the original
 * complaint about the whole channel, and `CONTENT_ENGINE.md` §7 asked for
 * exactly this file before any of the tooling existed.
 *
 * Metrics come from Buffer rather than from each platform's own API, for the
 * same reason the posting does: one credential, one shape, and no per-network
 * auditing. The cost is Buffer's own lag — `metricsUpdatedAt` says when it last
 * looked, and a post published an hour ago will usually read zero.
 */
export const SocialMetric = z.object({
  /** Buffer's `PostMetricType`: views, likes, comments, reach, saves, shares… */
  name: z.string(),
  value: z.number(),
  unit: z.string(),
});
export type SocialMetric = z.infer<typeof SocialMetric>;

export const SocialPosted = z.object({
  /** The slideshow key — `10-three-ways`. */
  key: z.string(),
  caption: z.string(),
  /** The hook, which is the cover slide's claim and the thing being tested. */
  slides: z.number().int(),
  channels: z.array(
    z.object({
      postId: z.string(),
      service: z.string(),
      /** Buffer's own status: `scheduled`, `sent`, `error`. */
      status: z.string(),
      sentAt: z.string().nullable(),
      dueAt: z.string().nullable(),
      metrics: z.array(SocialMetric),
      metricsUpdatedAt: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
});
export type SocialPosted = z.infer<typeof SocialPosted>;

/**
 * Buffer's queue, as Buffer holds it.
 *
 * Everything above describes *our* rows. This describes Buffer's, and the two
 * are not the same set — which is the confusion this type exists to end. A row
 * in `social_queue` reads `state = 'posted'` the moment Buffer accepts it,
 * days before it reaches anybody, and the account also holds posts this queue
 * never made: the `content/social/` back catalogue went out through Buffer's
 * own composer and is invisible here. Asking our table what published gives
 * the wrong answer twice over.
 *
 * So this is read straight from Buffer on every load and stored nowhere. The
 * source key is matched back through `buffer_ids` where there is one, and its
 * absence is information worth rendering: a post with no key came from
 * somewhere else.
 */
export const SocialSlot = z.object({
  /** Buffer's `DayOfWeek`: `mon` … `sun`. */
  day: z.string(),
  /** `HH:MM` in the channel's own timezone, which is the channel's, not ours. */
  times: z.array(z.string()),
  paused: z.boolean(),
});
export type SocialSlot = z.infer<typeof SocialSlot>;

export const SocialBufferPost = z.object({
  id: z.string(),
  channelId: z.string(),
  service: z.string(),
  /** Buffer's own: `scheduled`, `draft`, `sending`, `sent`, `error`. */
  status: z.string(),
  dueAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  /** The caption as Buffer holds it — hashtags already appended, per service. */
  text: z.string(),
  assets: z.number().int(),
  /** `image`, `video` or `document`; a carousel is several `image` assets. */
  mediaType: z.string().nullable(),
  /**
   * `10-three-ways` where this came from the panel, and `null` where it did
   * not. Not decoration: five of the account's sent posts are singles from the
   * old back catalogue, and a queue view that quietly folded them in with the
   * carousels would misreport what this pipeline has actually shipped.
   */
  sourceKey: z.string().nullable(),
  /**
   * Scheduled to an explicit time rather than taken from the channel's slots.
   * Worth flagging, because such a post ignores the posting schedule and is
   * therefore the one that can land somewhere nobody intended.
   */
  custom: z.boolean(),
  /**
   * True when Buffer will notify the phone instead of publishing this itself —
   * `schedulingType: 'notification'`.
   *
   * Carried because it is the difference between "this goes out" and "you post
   * this", and nothing else in the row implies it. The queue view first tried
   * to infer it from `custom`, which is a different question entirely and
   * labelled every automatic post a reminder.
   */
  reminder: z.boolean(),
});
export type SocialBufferPost = z.infer<typeof SocialBufferPost>;

export const SocialBufferChannel = z.object({
  id: z.string(),
  service: z.string(),
  name: z.string(),
  /** The channel's own timezone, which is what its slot times are in. */
  timezone: z.string(),
  /** How many scheduled posts this channel is holding, against the plan's cap. */
  scheduled: z.number().int(),
  limit: z.number().int().nullable(),
  /** Buffer's weekly posting goal, if one is set. */
  goal: z.number().int().nullable(),
  /** When it posts. Readable over Buffer's API; settable only in Buffer's UI. */
  slots: z.array(SocialSlot),
});
export type SocialBufferChannel = z.infer<typeof SocialBufferChannel>;

export const SocialBufferQueue = z.object({
  channels: z.array(SocialBufferChannel),
  /** Waiting to go out, soonest first. */
  upcoming: z.array(SocialBufferPost),
  /** Already out, most recent first. Capped — this is a check, not an archive. */
  published: z.array(SocialBufferPost),
  /**
   * Null where Buffer could not be reached or is unconfigured, so the panel can
   * say which of the two it is looking at instead of rendering an empty queue
   * as an empty queue.
   */
  fetchedAt: z.string().nullable(),
});
export type SocialBufferQueue = z.infer<typeof SocialBufferQueue>;
