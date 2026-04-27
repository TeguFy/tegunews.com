import { eq, and, desc, like, or, ne } from 'drizzle-orm'
import { posts, postTranslations, categories, tags, postTags } from '@teguns/db'
import { getDb } from './db'

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
