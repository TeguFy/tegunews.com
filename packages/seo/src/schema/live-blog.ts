/**
 * `LiveBlogPosting` JSON-LD — for breaking news that updates over time.
 *
 * Use when an article is editorially marked as a live blog (you can wire this
 * up later via a `kind` column or a `breakingUntil` flag). Each update is a
 * `BlogPosting` inside `liveBlogUpdate` with its own published timestamp.
 */
export interface LiveBlogUpdate {
  headline: string
  body: string
  publishedAt: Date
}

export function generateLiveBlogSchema(input: {
  url: string
  headline: string
  description?: string
  coverageStart: Date
  coverageEnd?: Date
  updates: LiveBlogUpdate[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LiveBlogPosting',
    '@id': input.url,
    headline: input.headline,
    description: input.description,
    coverageStartTime: input.coverageStart.toISOString(),
    coverageEndTime: input.coverageEnd?.toISOString(),
    liveBlogUpdate: input.updates.map((u) => ({
      '@type': 'BlogPosting',
      headline: u.headline,
      articleBody: u.body,
      datePublished: u.publishedAt.toISOString(),
    })),
  }
}
