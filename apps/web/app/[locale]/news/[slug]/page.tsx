import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import {
  generateNewsArticleSchema,
  generateBreadcrumbSchema,
  generatePostMetadata,
} from '@teguns/seo'
import { JsonLd } from '@/components/json-ld'
import { Comments } from '@/components/comments/comments'
import { ShareButtons } from '@/components/share-buttons'
import { ViewTracker } from '@/components/view-tracker'
import { fetchArticleBySlug, fetchRelatedArticles } from '@/lib/posts'
import { ArticleCard } from '@/components/article-card'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

// News articles revalidate hourly. Comments hydrate on the client so they stay
// fresh independently of the article HTML cache.
export const revalidate = 3600

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params
  const data = await fetchArticleBySlug(locale, slug)
  if (!data) return {}
  return generatePostMetadata({
    post: data.post,
    translation: data.translation,
    locale,
    baseUrl: BASE_URL,
    alternateTranslations: data.alternateTranslations,
  })
}

export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params
  const data = await fetchArticleBySlug(locale, slug)
  if (!data) notFound()

  const { post, translation, category } = data
  const t = await getTranslations({ locale, namespace: 'article' })

  const url = `${BASE_URL}/${locale}/news/${translation.slug}`
  const breadcrumb = generateBreadcrumbSchema([
    { name: 'Home', url: `${BASE_URL}/${locale}` },
    { name: 'News', url: `${BASE_URL}/${locale}/news` },
    ...(category ? [{ name: category.name, url: `${BASE_URL}/${locale}/category/${category.slug}` }] : []),
    { name: translation.title, url },
  ])
  const articleSchema = generateNewsArticleSchema({
    post,
    translation,
    locale,
    baseUrl: BASE_URL,
    authorName: post.authorName ?? 'TeguNews staff',
    articleSection: category?.name,
  })

  const related = category
    ? await fetchRelatedArticles(locale, category.id, post.id, 4)
    : []

  const isBreaking = post.breakingUntil && post.breakingUntil > new Date()

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={[articleSchema, breadcrumb]} />
      <ViewTracker postId={post.id} />

      <header className="text-center">
        {category && (
          <a
            href={`/${locale}/category/${category.slug}`}
            className="kicker text-primary hover:underline"
          >
            {category.name}
          </a>
        )}

        <h1 className="mt-3 font-serif text-[2.1rem] font-extrabold leading-[1.1] tracking-tight md:text-5xl">
          {translation.title}
        </h1>

        {translation.excerpt && (
          <p className="mx-auto mt-5 max-w-2xl font-serif text-lg italic leading-relaxed text-muted-foreground md:text-xl">
            {translation.excerpt}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {post.authorName && (
            <span className="font-medium text-foreground/80">{t('byAuthor', { name: post.authorName })}</span>
          )}
          {post.publishedAt && (
            <>
              <span aria-hidden className="text-border">•</span>
              <time dateTime={post.publishedAt.toISOString()}>
                {post.publishedAt.toLocaleDateString(locale, { dateStyle: 'long' })}
              </time>
            </>
          )}
          {post.readingTime && (
            <>
              <span aria-hidden className="text-border">•</span>
              <span>{t('readingTime', { minutes: post.readingTime })}</span>
            </>
          )}
          {isBreaking && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground">
              Breaking
            </span>
          )}
        </div>
      </header>

      <hr className="mx-auto mt-8 w-24 border-t-2 border-foreground/20" />

      {post.featuredImage && (
        <figure className="mt-10 overflow-hidden">
          <div className="relative aspect-video overflow-hidden rounded-xl">
            <Image
              src={post.featuredImage}
              alt={post.featuredImageAlt ?? translation.title}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
          {post.featuredImageCredit && (
            <figcaption className="mt-2 text-center text-xs italic text-muted-foreground">
              {post.featuredImageCredit}
            </figcaption>
          )}
        </figure>
      )}

      <div
        className="prose-news mt-10 max-w-none"
        dangerouslySetInnerHTML={{ __html: translation.content }}
      />

      <div className="mt-12 border-t border-border pt-6">
        <ShareButtons
          url={url}
          title={translation.title}
          summary={translation.excerpt ?? translation.seoDesc ?? undefined}
        />
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-border pt-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="kicker text-foreground/70">More from {category?.name ?? 'this section'}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {related.map((r) => (
              <ArticleCard key={r.id} locale={locale} article={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 border-t border-border pt-10">
        <Comments
          postId={post.id}
          locale={locale}
          commentsEnabled={post.commentsEnabled}
          initialCount={post.commentCount}
        />
      </section>
    </article>
  )
}
