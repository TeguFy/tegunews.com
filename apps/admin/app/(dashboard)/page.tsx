import { count, eq } from 'drizzle-orm'
import { posts, comments } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const db = await getDb()
  const [pubRow] = await db.select({ c: count() }).from(posts).where(eq(posts.status, 'published'))
  const [draftRow] = await db.select({ c: count() }).from(posts).where(eq(posts.status, 'draft'))
  const [pendRow] = await db.select({ c: count() }).from(comments).where(eq(comments.status, 'pending'))

  const stats = [
    { label: 'Published', value: pubRow?.c ?? 0, href: '/posts?status=published' },
    { label: 'Drafts', value: draftRow?.c ?? 0, href: '/posts?status=draft' },
    { label: 'Comments awaiting review', value: pendRow?.c ?? 0, href: '/comments?status=pending' },
  ]

  return (
    <>
      <PageHeader title="Dashboard" description="Newsroom overview" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <a key={s.label} href={s.href} className="rounded-lg border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-sm">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{s.value}</p>
          </a>
        ))}
      </div>
    </>
  )
}
