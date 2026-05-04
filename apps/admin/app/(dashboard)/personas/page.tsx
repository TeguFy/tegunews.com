/**
 * AI Persona directory.
 *
 * Tab strip filters by active state; toolbar adds search + tone/leaning
 * filters + sort + pagination. Card grid below renders persona summaries.
 * Server-rendered — list filtering is a navigation action, not a client refetch.
 */
import Link from 'next/link'
import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm'
import { agentPersonas } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import {
  SearchInput,
  SelectFilter,
  MultiSelectFilter,
  ActiveFilters,
  Pagination,
  PerPageSelect,
  ResultCount,
  type ActiveFilter,
} from '@/components/data-table'

export const dynamic = 'force-dynamic'

type StatusTab = 'all' | 'active' | 'disabled'
const TABS: StatusTab[] = ['all', 'active', 'disabled']
const TONES = ['formal', 'casual', 'sarcastic', 'enthusiastic', 'analytical', 'skeptical'] as const
const LEANINGS = ['left', 'center-left', 'center', 'center-right', 'right', 'apolitical'] as const
const SORT_KEYS = ['updatedAt', 'createdAt', 'displayName'] as const
type SortKey = (typeof SORT_KEYS)[number]

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}
function readList(v: string | string[] | undefined): string[] {
  const raw = readStr(v)
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export default async function PersonasPage({ searchParams }: Props) {
  const sp = await searchParams
  const status: StatusTab = (TABS as string[]).includes(readStr(sp.status))
    ? (readStr(sp.status) as StatusTab)
    : 'all'
  const tones = readList(sp.tone).filter((t) => (TONES as readonly string[]).includes(t))
  const leanings = readList(sp.leaning).filter((l) => (LEANINGS as readonly string[]).includes(l))
  const q = readStr(sp.q).trim()
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(readStr(sp.sort))
    ? (readStr(sp.sort) as SortKey)
    : 'updatedAt'
  const dir: 'asc' | 'desc' = readStr(sp.dir) === 'asc' ? 'asc' : 'desc'
  const perPage = Math.min(Math.max(Number.parseInt(readStr(sp.perPage) || '20', 10) || 20, 10), 100)
  const page = Math.max(Number.parseInt(readStr(sp.page) || '1', 10) || 1, 1)

  const db = await getDb()

  const conds: Array<ReturnType<typeof eq>> = []
  if (status === 'active') conds.push(eq(agentPersonas.active, true))
  if (status === 'disabled') conds.push(eq(agentPersonas.active, false))
  if (tones.length > 0) {
    const orExpr = or(...tones.map((t) => eq(agentPersonas.tone, t as (typeof TONES)[number])))
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  if (leanings.length > 0) {
    const orExpr = or(...leanings.map((l) => eq(agentPersonas.politicalLeaning, l as (typeof LEANINGS)[number])))
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  if (q) {
    const needle = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const orExpr = or(
      like(agentPersonas.displayName, needle),
      like(agentPersonas.slug, needle),
      like(agentPersonas.bio, needle),
    )
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  const whereExpr = conds.length ? and(...conds) : undefined

  const sortCol =
    sort === 'createdAt' ? agentPersonas.createdAt
      : sort === 'displayName' ? agentPersonas.displayName
      : agentPersonas.updatedAt
  const orderExpr = dir === 'asc' ? asc(sortCol) : desc(sortCol)

  const baseQuery = db.select().from(agentPersonas)
  const rows = whereExpr
    ? await baseQuery.where(whereExpr).orderBy(orderExpr).limit(perPage).offset((page - 1) * perPage)
    : await baseQuery.orderBy(orderExpr).limit(perPage).offset((page - 1) * perPage)

  const countBase = db.select({ c: sql<number>`COUNT(*)` }).from(agentPersonas)
  const [totalRow] = whereExpr ? await countBase.where(whereExpr) : await countBase
  const total = totalRow?.c ?? 0

  // Tab counts ignore other filters — pure status depth.
  const tabCounts: Record<StatusTab, number> = { all: 0, active: 0, disabled: 0 }
  const [allRow] = await db.select({ c: count() }).from(agentPersonas)
  tabCounts.all = allRow?.c ?? 0
  const [activeRow] = await db.select({ c: count() }).from(agentPersonas).where(eq(agentPersonas.active, true))
  tabCounts.active = activeRow?.c ?? 0
  tabCounts.disabled = tabCounts.all - tabCounts.active

  const active: ActiveFilter[] = []
  if (q) active.push({ label: `Search: "${q}"`, paramKeys: ['q'] })
  for (const t of tones) {
    active.push({ label: `Tone: ${t}`, paramKeys: ['tone'], removeValueFrom: { paramKey: 'tone', value: t } })
  }
  for (const l of leanings) {
    active.push({ label: `Leaning: ${l}`, paramKeys: ['leaning'], removeValueFrom: { paramKey: 'leaning', value: l } })
  }

  return (
    <>
      <PageHeader
        title="AI Personas"
        description="Virtual commenter identities. Generated comments are auto-disclosed with a 🤖 badge."
        actions={
          <Link
            href="/personas/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            + New persona
          </Link>
        }
      />

      <nav className="mb-4 flex gap-2 border-b border-zinc-200 text-sm">
        {TABS.map((t) => {
          const isActive = t === status
          const params = new URLSearchParams()
          for (const [k, v] of Object.entries(sp)) {
            if (k === 'status' || k === 'page') continue
            const val = readStr(v)
            if (val) params.set(k, val)
          }
          if (t !== 'all') params.set('status', t)
          const qs = params.toString()
          return (
            <Link
              key={t}
              href={qs ? `/personas?${qs}` : '/personas'}
              className={`-mb-px border-b-2 px-3 py-2 capitalize transition-colors ${
                isActive
                  ? 'border-zinc-900 font-semibold text-zinc-900'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {t}
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs">{tabCounts[t]}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search name, slug, or bio…" className="min-w-[220px] flex-1 sm:flex-none sm:w-72" />
        <MultiSelectFilter
          paramKey="tone"
          label="Tone"
          options={TONES.map((t) => ({ value: t, label: t }))}
          placeholder="Any tone"
        />
        <MultiSelectFilter
          paramKey="leaning"
          label="Leaning"
          options={LEANINGS.map((l) => ({ value: l, label: l }))}
          placeholder="Any leaning"
        />
        <SelectFilter
          paramKey="sort"
          label="Sort"
          options={[
            { value: 'updatedAt', label: 'Recently updated' },
            { value: 'createdAt', label: 'Recently created' },
            { value: 'displayName', label: 'Name (A–Z)' },
          ]}
          allLabel="Default"
        />
        <div className="ml-auto flex items-center gap-3">
          <ResultCount total={total} page={page} perPage={perPage} noun="persona" />
          <PerPageSelect />
        </div>
      </div>

      <ActiveFilters filters={active} clearKeys={['q', 'tone', 'leaning']} />

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-muted-foreground">
          {active.length > 0
            ? 'No personas match these filters.'
            : 'No personas yet. Create one to start seeding AI-driven discussion.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <PersonaCard key={p.id} persona={p} />
            ))}
          </ul>
          <Pagination page={page} perPage={perPage} total={total} searchParams={sp} />
        </>
      )}
    </>
  )
}

function PersonaCard({
  persona: p,
}: {
  persona: {
    id: string
    slug: string
    displayName: string
    avatarUrl: string | null
    bio: string | null
    personalityTraits: string[]
    tone: string
    politicalLeaning: string | null
    active: boolean
  }
}) {
  const traits = p.personalityTraits ?? []
  const visibleTraits = traits.slice(0, 3)
  const hiddenCount = Math.max(0, traits.length - visibleTraits.length)

  return (
    <li
      className={`rounded-md border border-zinc-200 bg-white p-4 transition-opacity ${
        p.active ? '' : 'opacity-60'
      }`}
    >
      <header className="mb-3 flex items-start gap-3">
        <Avatar url={p.avatarUrl} name={p.displayName} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-900">{p.displayName}</h3>
          <p className="truncate font-mono text-xs text-zinc-500">{p.slug}</p>
        </div>
        {!p.active && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Disabled
          </span>
        )}
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium uppercase tracking-wider text-zinc-700">
          {p.tone}
        </span>
        {p.politicalLeaning && (
          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-medium uppercase tracking-wider text-zinc-700">
            <span className={`h-1.5 w-1.5 rounded-full ${leaningDot(p.politicalLeaning)}`} />
            {p.politicalLeaning}
          </span>
        )}
      </div>

      {p.bio && (
        <p className="mb-3 line-clamp-2 text-sm text-zinc-600">{p.bio}</p>
      )}

      {(visibleTraits.length > 0 || hiddenCount > 0) && (
        <div className="mb-3 flex flex-wrap gap-1">
          {visibleTraits.map((t) => (
            <span
              key={t}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800"
            >
              {t}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}

      <footer className="flex justify-end">
        <Link
          href={`/personas/${p.id}`}
          className="text-xs font-semibold text-zinc-700 hover:text-zinc-900"
        >
          Edit →
        </Link>
      </footer>
    </li>
  )
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-zinc-200 object-cover"
      />
    )
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700">
      {initial}
    </div>
  )
}

function leaningDot(leaning: string): string {
  switch (leaning) {
    case 'left':
      return 'bg-blue-600'
    case 'center-left':
      return 'bg-sky-400'
    case 'center':
      return 'bg-zinc-400'
    case 'center-right':
      return 'bg-orange-400'
    case 'right':
      return 'bg-red-600'
    case 'apolitical':
      return 'bg-emerald-500'
    default:
      return 'bg-zinc-300'
  }
}
