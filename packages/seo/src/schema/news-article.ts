import type { Post, PostTranslation } from '@teguns/db'

export interface NewsArticleSchemaInput {
  post: Post
  translation: PostTranslation
  locale: string
  baseUrl: string
  authorName: string
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
 */
export function generateNewsArticleSchema(input: NewsArticleSchemaInput) {
  const { post, translation, locale, baseUrl, authorName, publisherName = 'TeguNews', articleSection } = input
  const url = `${baseUrl}/${locale}/news/${translation.slug}`

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: translation.seoTitle ?? translation.title,
    description: translation.seoDesc,
    image: post.featuredImage ? [post.featuredImage] : undefined,
    datePublished: post.publishedAt ? post.publishedAt.toISOString() : undefined,
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Person', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: publisherName,
      logo: { '@type': 'ImageObject', url: `${baseUrl}/logo.png` },
    },
    articleSection,
    keywords: [translation.focusKeyword, ...(translation.relatedKeywords ?? [])].filter(Boolean).join(', '),
    inLanguage: locale,
    wordCount: translation.wordCount,
    timeRequired: post.readingTime ? `PT${post.readingTime}M` : undefined,
    isAccessibleForFree: true,
    commentCount: post.commentCount,
  }
}
