import { desc } from 'drizzle-orm'
import { media } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { MediaUploadForm } from '@/components/media/upload-form'

export const dynamic = 'force-dynamic'

export default async function MediaPage() {
  const db = await getDb()
  const rows = await db.select().from(media).orderBy(desc(media.createdAt)).limit(60)

  return (
    <>
      <PageHeader
        title="Media"
        description={`${rows.length} item${rows.length === 1 ? '' : 's'} in R2.`}
      />

      <div className="mb-6">
        <MediaUploadForm />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
          No media uploaded yet.{' '}
          <span className="block mt-2 text-xs">
            Use{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5">{'client.media.upload({ body, mimeType, altText })'}</code>{' '}
            from the agent SDK.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((m) => (
            <figure key={m.id} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <div className="aspect-square bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.altText ?? ''} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <figcaption className="p-2 text-xs">
                <p className="truncate font-mono text-zinc-700" title={m.r2Key}>{m.r2Key.split('/').pop()}</p>
                <p className="text-zinc-500">
                  {m.mimeType.replace('image/', '')} · {(m.size / 1024).toFixed(0)} KB
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  )
}
