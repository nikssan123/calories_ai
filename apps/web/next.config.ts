import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // The shared packages ship TypeScript source rather than build output.
  transpilePackages: ['@ct/shared', '@ct/api-client'],
  // Self-contained server bundle for the container image.
  output: 'standalone',
  // pnpm workspaces symlink into the repo root, so tracing has to start there
  // or the standalone build misses @ct/shared and @ct/api-client.
  outputFileTracingRoot: path.join(here, '../..'),
  /*
   * Don't announce the framework and its major version on every response.
   *
   * `x-powered-by: Next.js` is free reconnaissance — it tells anyone scanning
   * which CVE list to read. Nothing in the stack reads the header.
   */
  poweredByHeader: false,

  /*
   * Which user agents get their metadata in `<head>` rather than streamed.
   *
   * Next decides per request. `shouldServeStreamingMetadata()` tests the UA
   * against this pattern and, on a match, blocks the render until
   * `generateMetadata` resolves so the title, description and canonical land in
   * the head; everything else gets them flushed into the body, tens of
   * kilobytes down. `/blog` and `/cook/library` are still `force-dynamic` — they
   * have no dynamic segment, so the `generateStaticParams() => []` fix that
   * repaired the three `[slug]` routes cannot apply to them — and on those two
   * pages the decision is still live.
   *
   * Next's default list is the whole reason this is here. It contains `Bingbot`,
   * `applebot`, `Twitterbot`, `Slackbot` and the pattern `Google-[\w-]+` — which
   * matches `Google-InspectionTool`, the agent behind Search Console's URL
   * Inspection, and does **not** match plain `Googlebot`. So the tool said those
   * two pages were perfect while the crawler that indexes them saw a bare head,
   * as did GPTBot, ClaudeBot, PerplexityBot and CCBot.
   *
   * The value REPLACES the default rather than extending it
   * (`new RegExp(htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING, 'i')` in
   * `next/dist/server/lib/streaming-metadata.js`), so the default is restated
   * here in full before the additions. Copied from
   * `next/dist/shared/lib/router/utils/is-bot.js` at 15.5.23 — if Next's list
   * grows, this one has to be re-copied, which is the cost of the key.
   *
   * The trade for a matching agent is a slower first byte on a dynamic page,
   * because the render waits for the metadata. For a crawler that is the right
   * trade: a page whose title arrives 75 KB into the body is worse than a page
   * that took another 100 ms.
   */
  htmlLimitedBots: new RegExp(
    [
      // Next.js 15.5.23's own list, verbatim.
      String.raw`[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot`,
      String.raw`baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview`,
      String.raw`redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit`,
      String.raw`facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp`,
      String.raw`SkypeUriPreview|Yeti|googleweblight`,
      // The crawler the default misses, and the AI crawlers robots.txt invites.
      String.raw`Googlebot|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web`,
      String.raw`anthropic-ai|PerplexityBot|CCBot|Amazonbot|meta-externalagent`,
    ].join('|'),
  ),
};

export default config;
