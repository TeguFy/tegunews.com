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
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={[articleSchema, breadcrumb]} />
      <ViewTracker postId={post.id} />

      {category && (
        <a
          href={`/${locale}/category/${category.slug}`}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-primary"
        >
          {category.name}
        </a>
      )}

      <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
        {translation.title}
      </h1>

      {translation.excerpt && (
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          {translation.excerpt}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
        {post.authorName && <span>{t('byAuthor', { name: post.authorName })}</span>}
        {post.publishedAt && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={post.publishedAt.toISOString()}>
              {post.publishedAt.toLocaleDateString(locale, { dateStyle: 'long' })}
            </time>
          </>
        )}
        {post.readingTime && (
          <>
            <span aria-hidden>·</span>
            <span>{t('readingTime', { minutes: post.readingTime })}</span>
          </>
        )}
        {isBreaking && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
            BREAKING
          </span>
        )}
      </div>

      <ShareButtons
        url={url}
        title={translation.title}
        summary={translation.excerpt ?? translation.seoDesc ?? undefined}
        className="mt-6"
      />

      <hr className="mt-6 border-border" />

      {post.featuredImage && (
        <figure className="mt-8 overflow-hidden rounded-lg">
          <div className="relative aspect-video">
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
            <figcaption className="mt-2 text-xs text-muted-foreground">
              {post.featuredImageCredit}
            </figcaption>
          )}
        </figure>
      )}

      <div
        className="prose-news mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: translation.content }}
      />

      <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
        <ShareButtons
          url={url}
          title={translation.title}
          summary={translation.excerpt ?? translation.seoDesc ?? undefined}
        />
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t pt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            More from {category?.name ?? 'this section'}
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {related.map((r) => (
              <ArticleCard key={r.id} locale={locale} article={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 border-t pt-8">
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
