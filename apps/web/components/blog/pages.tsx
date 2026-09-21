import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { LOCALE_NAMES, type Locale } from '@ct/shared';
import { publicPost, publicPosts } from '@/lib/public-api';
import { blogIndexHreflang, blogIndexPath, blogPostPath, hreflangFor } from '@/lib/blog';
import { breadcrumbSchema, jsonLd } from '@/lib/schema';
import { OG_IMAGE, ORIGIN, clampDescription, withBrand } from '@/lib/seo';
import { ArticleBody } from '@/components/blog/ArticleBody';
import { PublicShell } from '@/components/PublicShell';
import { StoreLinks } from '@/components/landing/StoreLinks';
import { messagesFor } from '@/lib/i18n-server';

/**
 * The blog's two pages, written once and mounted twice.
 *
 * `/blog/...` and `/<locale>/blog/...` are different route trees in the App
 * Router and identical pages in every other respect, so the four files under
 * `app/` are four-line shims around these. Duplicating the implementation would
 * mean two places to forget the hreflang.
 */

// ---- The index --------------------------------------------------------------

export async function blogIndexMetadata(locale: Locale): Promise<Metadata> {
  const t = messagesFor(locale);
  const path = blogIndexPath(locale);
  /*
   * `blog.indexTitle` rather than `blog.title`.
   *
   * "Blog" is spelled identically in nine of the thirteen and "Блог" in three, so
   * `${t('blog.title')} — Day So Far` produced one title on nine pages and
   * another on three — twelve duplicates out of thirteen, and a seventeen-
   * character title carrying no query on every one of them. The heading on the
   * page stays `blog.title`, which is what a reader wants to see; the title tag
   * is answering a search and gets to say what the blog is about.
   */
  const title = withBrand(t('blog.indexTitle'));
  const description = t('blog.description');
  return {
    title,
    description,
    // Thirteen indexes that are exact equivalents of each other, and until now
    // the only cluster on the site with no hreflang at all: `/` and the twelve
    // locale homes carry fourteen links each, every post carries fourteen, and
    // these thirteen carried none.
    alternates: { canonical: path, languages: blogIndexHreflang() },
    openGraph: {
      title,
      description,
      url: path,
      locale,
      // The sitewide card. Declaring `openGraph` at all drops the inherited
      // file-based image, which is why thirteen indexes and ninety-one posts
      // were unfurling as bare links — see OG_IMAGE in lib/seo.ts.
      images: [OG_IMAGE],
    },
  };
}

export async function BlogIndex({ locale }: { locale: Locale }) {
  const posts = await publicPosts(locale);
  const t = messagesFor(locale);

  return (
    <PublicShell locale={locale} wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbSchema([
              { name: 'Day So Far', path: '/' },
              { name: t('blog.title'), path: blogIndexPath(locale) },
            ]),
          ),
        }}
      />
      {/*
        * What this page is a list of, said in the same shape `/cook/library`
        * already uses. Thirteen index pages carried nothing but the sitewide
        * Organization and WebSite nodes — no page type, and no statement that
        * the articles below are a collection rather than decoration.
        */}
      {posts.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: t('blog.indexTitle'),
              url: `${ORIGIN}${blogIndexPath(locale)}`,
              description: t('blog.description'),
              inLanguage: locale,
              isPartOf: { '@id': `${ORIGIN}/#website` },
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: posts.length,
                itemListElement: posts.map((post, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  url: `${ORIGIN}${blogPostPath(locale, post.slug)}`,
                  name: post.title,
                })),
              },
            }),
          }}
        />
      )}

      <h1 className="text-display text-balance">{t('blog.title')}</h1>
      <p className="text-body text-muted-foreground mt-3 max-w-2xl">{t('blog.description')}</p>

      {posts.length === 0 ? (
        <p className="text-body text-muted-foreground mt-10">{t('blog.empty')}</p>
      ) : (
        /* Two columns from `md` up. A single column of five entries on a wide
           screen is most of a screenful of nothing beside it. */
        <ul className="mt-10 grid gap-8 md:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={blogPostPath(locale, post.slug)} className="group block h-full">
                <h2 className="text-section-title text-balance underline-offset-4 group-hover:underline">
                  {post.title}
                </h2>
                <p className="text-body text-muted-foreground mt-2">{post.description}</p>
                {post.published_at && (
                  <time
                    dateTime={post.published_at}
                    className="text-footnote text-muted-foreground mt-2 block"
                  >
                    {new Date(post.published_at).toISOString().slice(0, 10)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}

// ---- One post ---------------------------------------------------------------

export async function blogPostMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const post = await publicPost(locale, slug);
  if (!post) return { title: 'Not found — Day So Far' };

  const path = blogPostPath(locale, slug);
  return {
    // The brand suffix only if the headline leaves room for it — see lib/seo.ts.
    // These are the titles it was truncating.
    title: withBrand(post.title),
    description: clampDescription(post.description),
    alternates: {
      canonical: path,
      // Built from the post's own alternates rather than from a path template:
      // the slugs differ per language because each was written in it, so there
      // is nothing to template. See lib/blog.ts.
      languages: hreflangFor(post.alternates, { locale, slug }),
    },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: path,
      locale,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      /*
       * The sitewide card, because no post has an image of its own.
       *
       * Not ideal — a generic card on ninety-one different articles — but the
       * alternative that was here is no card at all, which is what every share
       * of a post has looked like: a bare URL. A per-post image is the real fix
       * and it needs an asset pipeline, not a metadata change.
       */
      images: [OG_IMAGE],
    },
  };
}

export async function BlogPost({ locale, slug }: { locale: Locale; slug: string }) {
  const post = await publicPost(locale, slug);
  const t = messagesFor(locale);
  // A draft, a binned post and a slug that never existed are all the same thing
  // to a stranger: not here. The API refuses to serve an unpublished post at
  // all, so this covers every one of them.
  if (!post) notFound();

  const path = blogPostPath(locale, slug);
  const others = post.alternates.filter((a) => a.locale !== locale);

  return (
    <PublicShell locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.title,
            description: post.description,
            url: `${ORIGIN}${path}`,
            inLanguage: locale,
            ...(post.published_at ? { datePublished: post.published_at } : {}),
            dateModified: post.updated_at,
            // The organisation, not a person. Attributing a generated article
            // to a named human would be the one dishonest thing on the page.
            author: { '@id': `${ORIGIN}/#organization` },
            publisher: { '@id': `${ORIGIN}/#organization` },
            isPartOf: { '@id': `${ORIGIN}/#website` },
            mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}${path}` },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbSchema([
              { name: 'Day So Far', path: '/' },
              { name: t('blog.title'), path: blogIndexPath(locale) },
              { name: post.title, path },
            ]),
          ),
        }}
      />

      <article>
        <Link
          href={blogIndexPath(locale)}
          className="text-footnote text-muted-foreground inline-flex items-center gap-1.5 underline underline-offset-2"
        >
          <ArrowLeft size={14} />
          {t('blog.title')}
        </Link>

        <h1 className="text-display mt-5 text-balance">{post.title}</h1>
        {post.published_at && (
          <time
            dateTime={post.published_at}
            className="text-footnote text-muted-foreground mt-3 block"
          >
            {new Date(post.published_at).toISOString().slice(0, 10)}
          </time>
        )}

        <div className="mt-10">
          <ArticleBody markdown={post.body_md} />
        </div>

        {/*
          * The one thing a reader who liked the article might want next, said
          * once and without a banner. It is the only place on the page that
          * asks for anything.
          */}
        <aside className="border-hairline bg-card mt-14 rounded-[var(--radius)] border p-5">
          <p className="text-body font-semibold">Day So Far</p>
          <p className="text-footnote text-muted-foreground mt-1">{t('recipe.logItWithApp')}</p>
          <div className="mt-4">
            <StoreLinks />
          </div>
        </aside>

        {others.length > 0 && (
          /*
           * The same article in the other languages, as real links.
           *
           * `hreflang` in the head tells a crawler the cluster exists; this
           * tells a reader, and gives each translation an internal link it
           * would otherwise not have. Labelled in each language's own name,
           * because a reader who wants the Bulgarian one is looking for
           * "Български", not for "Bulgarian".
           */
          <nav className="border-hairline mt-10 border-t pt-6">
            <h2 className="text-footnote text-muted-foreground font-semibold">{t('blog.alsoIn')}</h2>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {others.map((alt) => (
                <li key={alt.locale}>
                  <Link
                    href={blogPostPath(alt.locale, alt.slug)}
                    hrefLang={alt.locale}
                    className="text-footnote underline underline-offset-2"
                  >
                    {LOCALE_NAMES[alt.locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </PublicShell>
  );
}
