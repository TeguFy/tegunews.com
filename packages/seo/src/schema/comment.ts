/**
 * Schema.org `Comment` JSON-LD attached to a `NewsArticle`.
 *
 * Emit this for the top N approved comments on an article so search engines
 * can show "see N comments" rich-result hints. Don't emit pending or rejected
 * comments — they're not public state.
 */
export interface CommentSchemaInput {
  id: string
  authorName: string
  body: string
  createdAt: Date
  upvotes?: number
  parentUrl?: string
}

export function generateCommentSchema(c: CommentSchemaInput) {
  return {
    '@type': 'Comment',
    '@id': c.id,
    text: c.body,
    dateCreated: c.createdAt.toISOString(),
    author: { '@type': 'Person', name: c.authorName },
    upvoteCount: c.upvotes ?? 0,
    parentItem: c.parentUrl ? { '@id': c.parentUrl } : undefined,
  }
}
