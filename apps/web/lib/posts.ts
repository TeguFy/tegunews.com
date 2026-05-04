import { eq, and, desc, asc, gte, like, or, ne, count, type SQL } from 'drizzle-orm'
import { posts, postTranslations, categories, tags, postTags } from '@teguns/db'
import { getDb } from './db'

export type ListingSort = 'latest' | 'oldest' | 'popular'
export type ListingTimeRange = 'all' | 'week' | 'month' | 'year'

export interface ListingQuery {
  locale: string
  page?: number
  perPage?: number
  sort?: ListingSort
  timeRange?: ListingTimeRange
}

const DAY_MS = 86_400_000

function timeRangeFloor(range: ListingTimeRange | undefined): Date | null {
  switch (range) {
    case 'week':
      return new Date(Date.now() - 7 * DAY_MS)
    case 'month':
      return new Date(Date.now() - 30 * DAY_MS)
    case 'year':
      return new Date(Date.now() - 365 * DAY_MS)
    default:
      return null
  }
}

function orderForSort(sort: ListingSort | undefined) {
  switch (sort) {
    case 'oldest':
      return [asc(posts.publishedAt)]
    case 'popular':
      // "Most read this week" — viewCount with recency tiebreaker.
      return [desc(posts.viewCount), desc(posts.publishedAt)]
    case 'latest':
    default:
      return [desc(posts.publishedAt)]
  }
}

interface ListingResult {
  rows: Awaited<ReturnType<typeof fetchRecentArticles>>
  total: number
  page: number
  perPage: number
  pageCount: number
}

async function runListing(
  filter: SQL | undefined,
  query: ListingQuery,
  joinPostTags?: { tagId: string },
): Promise<ListingResult> {
  const db = await getDb()
  const page = Math.max(1, query.page ?? 1)
  const perPage = query.perPage ?? 12
  const sort = query.sort ?? 'latest'

  const floor = timeRangeFloor(query.timeRange)
  const baseFilters: SQL[] = [eq(posts.status, 'published')]
  if (filter) baseFilters.push(filter)
  if (sort === 'popular') {
    // "Most read this week" — narrow the popularity window even when timeRange=all.
    const weekFloor = floor ?? new Date(Date.now() - 7 * DAY_MS)
    baseFilters.push(gte(posts.publishedAt, weekFloor))
  } else if (floor) {
    baseFilters.push(gte(posts.publishedAt, floor))
  }
  const where = and(...baseFilters)

  // Count
  const countQuery = joinPostTags
    ? db
        .select({ c: count() })
        .from(posts)
        .innerJoin(postTags, and(eq(postTags.postId, posts.id), eq(postTags.tagId, joinPostTags.tagId)))
        .innerJoin(
          postTranslations,
          and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, query.locale)),
        )
        .where(where)
    : db
        .select({ c: count() })
        .from(posts)
        .innerJoin(
          postTranslations,
          and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, query.locale)),
        )
        .where(where)

  const [{ c: total }] = await countQuery

  const offset = (page - 1) * perPage
  const rowsQuery = db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      featuredImageAlt: posts.featuredImageAlt,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
  const joined = joinPostTags
    ? rowsQuery.innerJoin(
        postTags,
        and(eq(postTags.postId, posts.id), eq(postTags.tagId, joinPostTags.tagId)),
      )
    : rowsQuery
  const rows = await joined
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, query.locale)),
    )
    .where(where)
    .orderBy(...orderForSort(sort))
    .limit(perPage)
    .offset(offset)

  const pageCount = Math.max(1, Math.ceil(total / perPage))
  return { rows, total, page, perPage, pageCount }
}

export async function fetchCategoryListing(
  categorySlug: string,
  query: ListingQuery,
): Promise<({ category: typeof categories.$inferSelect } & ListingResult) | null> {
  const db = await getDb()
  const [cat] = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1)
  if (!cat) return null
  const result = await runListing(eq(posts.categoryId, cat.id), query)
  return { category: cat, ...result }
}

export async function fetchArticleBySlug(locale: string, slug: string) {
  const db = await getDb()
  const [tr] = await db
    .select()
    .from(postTranslations)
    .where(and(eq(postTranslations.locale, locale), eq(postTranslations.slug, slug)))
    .limit(1)
  if (!tr) return null

  const [post] = await db.select().from(posts).where(eq(posts.id, tr.postId)).limit(1)
  if (!post || post.status !== 'published') return null

  const allTrs = await db
    .select({ locale: postTranslations.locale, slug: postTranslations.slug })
    .from(postTranslations)
    .where(eq(postTranslations.postId, tr.postId))

  let category = null
  if (post.categoryId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, post.categoryId)).limit(1)
    category = c ?? null
  }

  return { post, translation: tr, alternateTranslations: allTrs, category }
}

export async function fetchRecentArticles(locale: string, opts?: { limit?: number }) {
  const db = await getDb()
  const limit = opts?.limit ?? 12

  const rows = await db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      featuredImageAlt: posts.featuredImageAlt,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
    )
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)

  return rows
}

export async function fetchArticlesByCategory(locale: string, categorySlug: string, limit = 24) {
  const db = await getDb()
  const [cat] = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1)
  if (!cat) return null

  const rows = await db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      featuredImageAlt: posts.featuredImageAlt,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
    )
    .where(and(eq(posts.status, 'published'), eq(posts.categoryId, cat.id)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)

  return { category: cat, posts: rows }
}

export async function fetchArticlesByTag(locale: string, tagSlug: string, limit = 24) {
  const db = await getDb()
  const [tag] = await db.select().from(tags).where(eq(tags.slug, tagSlug)).limit(1)
  if (!tag) return null

  const rows = await db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      featuredImageAlt: posts.featuredImageAlt,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
    .innerJoin(postTags, eq(postTags.postId, posts.id))
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
    )
    .where(and(eq(posts.status, 'published'), eq(postTags.tagId, tag.id)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)

  return { tag, posts: rows }
}

export async function fetchRelatedArticles(
  locale: string,
  categoryId: string,
  excludeId: string,
  limit = 4,
) {
  const db = await getDb()
  return db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      featuredImageAlt: posts.featuredImageAlt,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
    )
    .where(
      and(
        eq(posts.status, 'published'),
        eq(posts.categoryId, categoryId),
        ne(posts.id, excludeId),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
}

export async function searchArticles(locale: string, q: string, limit = 30) {
  if (!q || q.trim().length < 2) return []
  const db = await getDb()
  const term = `%${q.trim().replace(/[%_]/g, '\\$&')}%`
  return db
    .select({
      id: posts.id,
      featuredImage: posts.featuredImage,
      publishedAt: posts.publishedAt,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      excerpt: postTranslations.excerpt,
    })
    .from(posts)
    .innerJoin(
      postTranslations,
      and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
    )
    .where(
      and(
        eq(posts.status, 'published'),
        or(
          like(postTranslations.title, term),
          like(postTranslations.excerpt, term),
          like(postTranslations.content, term),
        ),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
}
