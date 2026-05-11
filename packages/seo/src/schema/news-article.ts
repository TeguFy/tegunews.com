import type { Post, PostTranslation } from '@teguns/db'

export interface NewsArticleSchemaInput {
  post: Post
  translation: PostTranslation
  locale: string
  baseUrl: string
  authorName: string
  /** Optional canonical URL for the author profile (Person.url + sameAs target). */
  authorUrl?: string
  publisherName?: string
  /** Section/category breadcrumb name, e.g. "Politics" or "Technology". */
  articleSection?: string
}

/**
 * Generates a Schema.org `NewsArticle` JSON-LD object.
 *
 * Differences from generic `Article`:
 *   - `@type: NewsArticle` for Google News eligibility
 *   - `articleSection` populated from the article's category
 *   - `dateline` derivable later if you start collecting filing location
 *   - `isAccessibleForFree: true` is set explicitly — required for News
 *     publishers who don't want their articles flagged as paywalled.
 *
 * Image is emitted as a full `ImageObject` with dimensions (1200×630 — the
 * OG canonical aspect). Google Discover and AI grounding APIs prefer
 * dimensioned image entries over bare URL strings.
 */
export function generateNewsArticleSchema(input: NewsArticleSchemaInput) {
  const {
    post,
    translation,
    locale,
    baseUrl,
    authorName,
    authorUrl,
    publisherName = 'TeguNews',
    articleSection,
  } = input
  const url = `${baseUrl}/${locale}/news/${translation.slug}`

  const image = post.featuredImage
    ? [{
        '@type': 'ImageObject',
        url: post.featuredImage,
        width: 1200,
        height: 630,
        caption: post.featuredImageAlt ?? translation.title,
      }]
    : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: translation.seoTitle ?? translation.title,
    description: translation.seoDesc ?? translation.excerpt ?? undefined,
    image,
    datePublished: post.publishedAt ? post.publishedAt.toISOString() : undefined,
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUrl ? { url: authorUrl, sameAs: [authorUrl] } : {}),
    },
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: publisherName,
      url: baseUrl,
      logo: { '@type': 'ImageObject', url: `${baseUrl}/logo.png`, width: 512, height: 512 },
    },
    isPartOf: { '@type': 'WebSite', '@id': `${baseUrl}/#website`, name: publisherName, url: baseUrl },
    articleSection,
    keywords: [translation.focusKeyword, ...(translation.relatedKeywords ?? [])].filter(Boolean).join(', ') || undefined,
    inLanguage: locale,
    wordCount: translation.wordCount,
    timeRequired: post.readingTime ? `PT${post.readingTime}M` : undefined,
    isAccessibleForFree: true,
    commentCount: post.commentCount,
  }
}
