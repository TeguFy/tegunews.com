import { desc, eq } from 'drizzle-orm'
import { auditLog, users } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ user?: string; action?: string }>
}

export default async function AuditPage({ searchParams }: Props) {
  const sp = await searchParams
  const db = await getDb()

  // Single LEFT JOIN so we can show the actor's email next to the action.
  // Filter on user_id when caller passed `?user=<id>`; on action prefix when
  // `?action=post.` is supplied (lets you scope to a verb family).
  const baseSelect = db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      ipAddress: auditLog.ipAddress,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(100)

  const where = sp.user ? eq(auditLog.userId, sp.user) : undefined
  const rows = await (where ? baseSelect.where(where) : baseSelect)

  // Filter by action prefix client-side (the SQL LIKE would need a prepared
  // statement and the row count is already capped at 100).
  const actionFilter = sp.action
  const filtered = actionFilter
    ? rows.filter((r) => r.action.startsWith(actionFilter))
    : rows

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`Last ${filtered.length} state-changing actions${sp.user ? ` by ${sp.user.slice(0, 8)}…` : ''}${sp.action ? ` matching action prefix "${sp.action}"` : ''}.`}
      />

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
          No audit entries yet. Mutations through the API populate this table — try creating a post via the SDK.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">Run ID / metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((r) => {
                const md = r.metadata as Record<string, unknown> | null
                const runId = md?.runId as string | undefined
                return (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-600">
                      <time dateTime={r.createdAt.toISOString()}>
                        {r.createdAt.toLocaleString()}
                      </time>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.actorEmail ? (
                        <span title={r.actorEmail}>{r.actorName ?? r.actorEmail}</span>
                      ) : (
                        <span className="text-zinc-500">{r.userId ? `${r.userId.slice(0, 8)}…` : 'system'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5">{r.action}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">
                      {r.resourceType && r.resourceId ? `${r.resourceType}:${r.resourceId.slice(0, 8)}…` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">
                      {runId && <span className="font-mono">{runId}</span>}
                      {md && Object.keys(md).filter((k) => k !== 'runId').length > 0 && (
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">+meta</summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-zinc-50 p-2 text-[11px]">
                            {JSON.stringify(md, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
