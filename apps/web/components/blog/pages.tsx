import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LOCALE_NAMES, type Locale } from '@ct/shared';
import { publicPost, publicPosts } from '@/lib/public-api';
import { blogIndexPath, blogPostPath, hreflangFor } from '@/lib/blog';
import { breadcrumbSchema, jsonLd } from '@/lib/schema';
import { ORIGIN } from '@/lib/seo';
import { ArticleBody } from '@/components/blog/ArticleBody';
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
  const title = `${t('blog.title')} — Day So Far`;
  const description = t('blog.description');
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

export async function BlogIndex({ locale }: { locale: Locale }) {
  const posts = await publicPosts(locale);
  const t = messagesFor(locale);

  return (
    <div className="bg-background min-h-screen">
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
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <Link href="/" className="text-footnote text-muted-foreground underline underline-offset-2">
          Day So Far
        </Link>
        <h1 className="text-display mt-6 text-balance">{t('blog.title')}</h1>

        {posts.length === 0 ? (
          <p className="text-body text-muted-foreground mt-6">{t('blog.empty')}</p>
        ) : (
          <ul className="mt-10 space-y-8">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={blogPostPath(locale, post.slug)} className="group block">
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
      </div>
    </div>
  );
}

// ---- One post ---------------------------------------------------------------

export async function blogPostMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const post = await publicPost(locale, slug);
  if (!post) return { title: 'Not found — Day So Far' };

  const path = blogPostPath(locale, slug);
  return {
    title: `${post.title} — Day So Far`,
    description: post.description,
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
    <div className="bg-background min-h-screen">
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

      <article className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-6 sm:py-16">
        <Link
          href={blogIndexPath(locale)}
          className="text-footnote text-muted-foreground underline underline-offset-2"
        >
          {t('blog.title')}
        </Link>

        <h1 className="text-display mt-6 text-balance">{post.title}</h1>
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
          <nav className="border-border mt-14 border-t-2 pt-6">
            <h2 className="text-footnote text-muted-foreground font-semibold">
              {t('blog.alsoIn')}
            </h2>
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
    </div>
  );
}
