import type { Metadata } from 'next'
import type { Post, PostTranslation } from '@teguns/db'

export interface PostMetadataInput {
  post: Post
  translation: PostTranslation
  locale: string
  baseUrl: string
  alternateTranslations: Array<{ locale: string; slug: string }>
  /** News articles always live under `/news` — kept as a parameter for future
   *  flexibility if you split off `/opinion`, `/sports` etc. */
  routePrefix?: string
  publisherName?: string
}

export function generatePostMetadata(input: PostMetadataInput): Metadata {
  const {
    post,
    translation,
    locale,
    baseUrl,
    alternateTranslations,
    routePrefix = 'news',
    publisherName = 'TeguNews',
  } = input
  const url = `${baseUrl}/${locale}/${routePrefix}/${translation.slug}`

  const languages: Record<string, string> = {}
  for (const alt of alternateTranslations) {
    languages[alt.locale] = `${baseUrl}/${alt.locale}/${routePrefix}/${alt.slug}`
  }
  languages['x-default'] = `${baseUrl}/en/${routePrefix}/${alternateTranslations.find(a => a.locale === 'en')?.slug ?? translation.slug}`

  return {
    title: translation.seoTitle ?? translation.title,
    description: translation.seoDesc ?? undefined,
    keywords: [translation.focusKeyword, ...(translation.relatedKeywords ?? [])].filter(Boolean) as string[],
    alternates: {
      canonical: translation.canonicalUrl ?? url,
      languages,
    },
    openGraph: {
      type: (translation.ogType as any) ?? 'article',
      url,
      title: translation.seoTitle ?? translation.title,
      description: translation.seoDesc ?? undefined,
      siteName: publisherName,
      locale,
      images: post.featuredImage ? [{
        url: translation.ogImage ?? post.featuredImage,
        alt: post.featuredImageAlt ?? translation.title,
        width: 1200, height: 630,
      }] : undefined,
      publishedTime: post.publishedAt ? post.publishedAt.toISOString() : undefined,
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.authorName ? [post.authorName] : undefined,
    },
    twitter: {
      card: (translation.twitterCard as any) ?? 'summary_large_image',
      title: translation.seoTitle ?? translation.title,
      description: translation.seoDesc ?? undefined,
      images: post.featuredImage ? [translation.ogImage ?? post.featuredImage] : undefined,
    },
    robots: translation.noIndex ? { index: false, follow: false } : { index: true, follow: true },
  }
}
