import { asc, eq } from 'drizzle-orm'
import { categories, tags, posts, postTags } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { TaxonomyCreateForm } from '@/components/taxonomy/create-form'

export const dynamic = 'force-dynamic'

export default async function TaxonomyPage() {
  const db = await getDb()

  // Two-column layout: categories on the left, tags on the right.
  // For categories we also count published posts so editors see which
  // categories are heavily populated vs empty.
  const cats = await db.select().from(categories).orderBy(asc(categories.name))
  const tgs = await db.select().from(tags).orderBy(asc(tags.name))

  // Per-category post counts (single query — group by isn't supported by
  // drizzle's d1 driver in this version, so we do it client-side).
  const postsRows = await db
    .select({ categoryId: posts.categoryId })
    .from(posts)
    .where(eq(posts.status, 'published'))
  const catPostCount: Record<string, number> = {}
  for (const r of postsRows) {
    if (r.categoryId) catPostCount[r.categoryId] = (catPostCount[r.categoryId] ?? 0) + 1
  }

  // Tag attachment counts.
  const tagRows = await db.select({ tagId: postTags.tagId }).from(postTags)
  const tagPostCount: Record<string, number> = {}
  for (const r of tagRows) tagPostCount[r.tagId] = (tagPostCount[r.tagId] ?? 0) + 1

  return (
    <>
      <PageHeader
        title="Taxonomy"
        description={`${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} · ${tgs.length} tag${tgs.length === 1 ? '' : 's'}.`}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-700">Categories</h2>
          <div className="mb-3">
            <TaxonomyCreateForm kind="category" />
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <ul className="divide-y divide-zinc-100">
              {cats.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-50">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="font-mono text-xs text-zinc-500">/{c.slug}</p>
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {catPostCount[c.id] ?? 0} published
                  </span>
                </li>
              ))}
            </ul>
            {cats.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-500">
                No categories. Run{' '}
                <code className="rounded bg-zinc-100 px-1 py-0.5">scripts/seeds/0001_categories.sql</code>.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-700">Tags</h2>
          <div className="mb-3">
            <TaxonomyCreateForm kind="tag" />
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <ul className="divide-y divide-zinc-100">
              {tgs.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-50">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="font-mono text-xs text-zinc-500">/{t.slug}</p>
                  </div>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {tagPostCount[t.id] ?? 0} attached
                  </span>
                </li>
              ))}
            </ul>
            {tgs.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-500">
                No tags yet. Created on demand when SDK upserts an article with new tags.
              </p>
            )}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Create / edit / delete via the API:{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5">POST /api/admin/categories</code>,{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5">POST /api/admin/tags</code>.
      </p>
    </>
  )
}
