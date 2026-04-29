import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'
import { users } from '@teguns/db'
import { getDb } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-session'
import { PageHeader } from '@/components/page-header'
import { UserRoleSelect } from '@/components/users/user-role-select'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await getAdminSession()
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') {
    return (
      <>
        <PageHeader title="Users" />
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Admin role required to view users.
        </div>
      </>
    )
  }

  const db = await getDb()
  const rows = await db.select().from(users).orderBy(desc(users.createdAt))

  const tally: Record<string, number> = {}
  for (const u of rows) tally[u.role] = (tally[u.role] ?? 0) + 1

  return (
    <>
      <PageHeader
        title="Users"
        description={`${rows.length} total — ${Object.entries(tally).map(([r, n]) => `${n} ${r}`).join(', ')}.`}
      />

      <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        New users are created via{' '}
        <code className="rounded bg-white px-1 py-0.5">scripts/admin/create-user.ts</code>.
        No public sign-up exposed.
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Created</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5 font-medium text-zinc-900">{u.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">{u.email}</td>
                <td className="px-4 py-2.5">
                  <UserRoleSelect userId={u.id} currentRole={u.role} disabled={u.id === session.userId} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">
                  {u.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {u.id === session.userId && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">you</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
