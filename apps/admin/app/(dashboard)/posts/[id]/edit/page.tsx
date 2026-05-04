import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { categories, posts, postTranslations } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { PostForm } from '@/components/posts/post-form'
import { PostActions } from '@/components/posts/post-actions'
import { PostDiscussionPanel } from '@/components/posts/post-discussion-panel'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ locale?: string }>
}

export default async function EditPostPage({ params, searchParams }: Props) {
  const { id } = await params
  const { locale: localeParam } = await searchParams
  const db = await getDb()

  const [post] = await db.select().from(posts).where(eq(posts.id, id))
  if (!post) notFound()

  const allTrs = await db
    .select()
    .from(postTranslations)
    .where(eq(postTranslations.postId, id))

  // Pick the translation matching the locale query param, or the first one,
  // or fall through to undefined (post has no translations yet — rare).
  const tr = allTrs.find((t) => t.locale === localeParam) ?? allTrs[0]

  const cats = await db.select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.name))

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit article
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status:{' '}
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              post.status === 'published' ? 'bg-emerald-100 text-emerald-800' :
              post.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
              'bg-zinc-100 text-zinc-700'
            }`}>{post.status}</span>
            {' · '}Version {post.version}
            {post.publishedAt && <> · published {post.publishedAt.toLocaleString()}</>}
            {post.viewCount > 0 && <> · {post.viewCount.toLocaleString()} views</>}
            {post.commentCount > 0 && <> · {post.commentCount} comments</>}
          </p>
          {allTrs.length > 1 && (
            <nav className="mt-3 flex gap-2 text-xs">
              <span className="text-zinc-500">Translations:</span>
              {allTrs.map((t) => (
                <Link
                  key={t.locale}
                  href={`/posts/${id}/edit?locale=${t.locale}`}
                  className={`rounded px-2 py-0.5 font-mono uppercase tracking-wider ${
                    t.locale === tr?.locale ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {t.locale}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <PostActions postId={id} status={post.status} defaultLocale={tr?.locale ?? 'en'} />
      </div>

      {!tr ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This post has no translations. Use the SDK to add one:{' '}
          <code className="rounded bg-white px-1 py-0.5">PUT /api/admin/posts/by-slug/&#123;locale&#125;/&#123;slug&#125;</code>
        </div>
      ) : (
        <>
          <PostDiscussionPanel postId={id} locale={tr.locale} />
          <PostForm
          isCreate={false}
          categories={cats}
          initial={{
            id,
            locale: tr.locale,
            slug: tr.slug,
            title: tr.title,
            content: tr.content,
            excerpt: tr.excerpt ?? undefined,
            seoTitle: tr.seoTitle ?? undefined,
            seoDesc: tr.seoDesc ?? undefined,
            focusKeyword: tr.focusKeyword ?? undefined,
            featuredImage: post.featuredImage ?? undefined,
            featuredImageAlt: post.featuredImageAlt ?? undefined,
            featuredImageCredit: post.featuredImageCredit ?? undefined,
            categoryId: post.categoryId ?? undefined,
            featured: post.featured,
            commentsEnabled: post.commentsEnabled,
            bylineDisclosure: (post.bylineDisclosure as never) ?? undefined,
          }}
        />
        </>
      )}
    </>
  )
}
