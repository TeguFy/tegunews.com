import { redirect } from 'next/navigation'
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm'
import { users } from '@teguns/db'
import { getDb } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-session'
import { PageHeader } from '@/components/page-header'
import { UserRoleSelect } from '@/components/users/user-role-select'
import {
  SearchInput,
  MultiSelectFilter,
  ActiveFilters,
  Pagination,
  PerPageSelect,
  ResultCount,
  SortableHeader,
  type ActiveFilter,
} from '@/components/data-table'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ROLES = ['admin', 'editor', 'author', 'agent', 'commenter'] as const
const SORT_KEYS = ['createdAt', 'name', 'email', 'role'] as const
type SortKey = (typeof SORT_KEYS)[number]

function readStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}
function readList(v: string | string[] | undefined): string[] {
  const raw = readStr(v)
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export default async function UsersPage({ searchParams }: Props) {
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

  const sp = await searchParams
  const q = readStr(sp.q).trim()
  const roleFilter = readList(sp.role).filter((r) => (ROLES as readonly string[]).includes(r))
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(readStr(sp.sort))
    ? (readStr(sp.sort) as SortKey)
    : 'createdAt'
  const dir: 'asc' | 'desc' = readStr(sp.dir) === 'asc' ? 'asc' : 'desc'
  const perPage = Math.min(Math.max(Number.parseInt(readStr(sp.perPage) || '20', 10) || 20, 10), 100)
  const page = Math.max(Number.parseInt(readStr(sp.page) || '1', 10) || 1, 1)

  const db = await getDb()

  const conds: Array<ReturnType<typeof eq>> = []
  if (roleFilter.length > 0) {
    const orRoles = or(...roleFilter.map((r) => eq(users.role, r)))
    if (orRoles) conds.push(orRoles as unknown as ReturnType<typeof eq>)
  }
  if (q) {
    const needle = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const orExpr = or(like(users.name, needle), like(users.email, needle))
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  const whereExpr = conds.length ? and(...conds) : undefined

  const sortCol =
    sort === 'name' ? users.name
      : sort === 'email' ? users.email
      : sort === 'role' ? users.role
      : users.createdAt
  const orderExpr = dir === 'asc' ? asc(sortCol) : desc(sortCol)

  const baseQuery = db.select().from(users)
  const rows = whereExpr
    ? await baseQuery.where(whereExpr).orderBy(orderExpr).limit(perPage).offset((page - 1) * perPage)
    : await baseQuery.orderBy(orderExpr).limit(perPage).offset((page - 1) * perPage)

  const countBase = db.select({ c: sql<number>`COUNT(*)` }).from(users)
  const [totalRow] = whereExpr ? await countBase.where(whereExpr) : await countBase
  const total = totalRow?.c ?? 0

  // Tally across all users (independent of filters) for the page-header summary.
  const allRows = await db.select({ role: users.role }).from(users)
  const tally: Record<string, number> = {}
  for (const u of allRows) tally[u.role] = (tally[u.role] ?? 0) + 1

  const active: ActiveFilter[] = []
  if (q) active.push({ label: `Search: "${q}"`, paramKeys: ['q'] })
  for (const r of roleFilter) {
    active.push({
      label: `Role: ${r}`,
      paramKeys: ['role'],
      removeValueFrom: { paramKey: 'role', value: r },
    })
  }

  return (
    <>
      <PageHeader
        title="Users"
        description={`${allRows.length} total — ${Object.entries(tally).map(([r, n]) => `${n} ${r}`).join(', ')}.`}
      />

      <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        New users are created via{' '}
        <code className="rounded bg-white px-1 py-0.5">scripts/admin/create-user.ts</code>.
        No public sign-up exposed.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search name or email…" className="min-w-[220px] flex-1 sm:flex-none sm:w-72" />
        <MultiSelectFilter
          paramKey="role"
          label="Role"
          options={ROLES.map((r) => ({ value: r, label: r }))}
          placeholder="Any role"
        />
        <div className="ml-auto flex items-center gap-3">
          <ResultCount total={total} page={page} perPage={perPage} noun="user" />
          <PerPageSelect />
        </div>
      </div>

      <ActiveFilters filters={active} clearKeys={['q', 'role']} />

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
          {active.length > 0 ? 'No users match these filters.' : 'No users yet.'}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-600">
                <tr>
                  <SortableHeader sortKey="name" label="Name" activeKey={sort} activeDir={dir} defaultDir="asc" searchParams={sp} />
                  <SortableHeader sortKey="email" label="Email" activeKey={sort} activeDir={dir} defaultDir="asc" searchParams={sp} />
                  <SortableHeader sortKey="role" label="Role" activeKey={sort} activeDir={dir} defaultDir="asc" searchParams={sp} />
                  <SortableHeader sortKey="createdAt" label="Created" activeKey={sort} activeDir={dir} searchParams={sp} />
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
          <Pagination page={page} perPage={perPage} total={total} searchParams={sp} />
        </>
      )}
    </>
  )
}
