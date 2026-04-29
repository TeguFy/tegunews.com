import { asc } from 'drizzle-orm'
import { categories } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { PostForm } from '@/components/posts/post-form'

export const dynamic = 'force-dynamic'

export default async function NewPostPage() {
  const db = await getDb()
  const cats = await db.select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.name))

  return (
    <>
      <PageHeader title="New article" description="Drafts publish only after the SEO gate passes." />
      <PostForm categories={cats} isCreate={true} />
    </>
  )
}
