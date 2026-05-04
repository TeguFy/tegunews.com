import Link from 'next/link'

interface PaginationProps {
  page: number
  perPage: number
  total: number
  /**
   * Current full search params (URL-encoded `URLSearchParams` snapshot, or a
   * plain query object). Used to build links that preserve filters.
   */
  searchParams: Record<string, string | string[] | undefined>
  className?: string
}

/**
 * Numbered pagination with ellipses, prev/next, keyboard-friendly. Renders
 * server-side; each cell is an `<a>` (`Link`) so middle-click and right-click
 * "open in new tab" work as expected.
 *
 * On viewports < sm we collapse to "Prev · Page X of Y · Next" because the
 * full numeric strip is too cramped on phones.
 */
export function Pagination({
  page,
  perPage,
  total,
  searchParams,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null
  const safePage = Math.min(Math.max(page, 1), totalPages)

  function hrefFor(target: number): string {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null) continue
      if (Array.isArray(v)) {
        if (v[0] != null) next.set(k, v[0])
      } else {
        next.set(k, v)
      }
    }
    if (target <= 1) next.delete('page')
    else next.set('page', String(target))
    const qs = next.toString()
    return qs ? `?${qs}` : '?'
  }

  const items = pageItems(safePage, totalPages)

  const prevDisabled = safePage <= 1
  const nextDisabled = safePage >= totalPages

  return (
    <nav
      aria-label="Pagination"
      className={`mt-4 flex items-center justify-between gap-3 ${className ?? ''}`}
    >
      {/* Mobile compact */}
      <div className="flex w-full items-center justify-between gap-2 sm:hidden">
        <PageLink
          href={hrefFor(safePage - 1)}
          disabled={prevDisabled}
          ariaLabel="Previous page"
        >
          ← Prev
        </PageLink>
        <span className="text-xs text-zinc-600">
          Page <span className="tabular-nums text-zinc-900">{safePage}</span> of{' '}
          <span className="tabular-nums text-zinc-900">{totalPages}</span>
        </span>
        <PageLink
          href={hrefFor(safePage + 1)}
          disabled={nextDisabled}
          ariaLabel="Next page"
        >
          Next →
        </PageLink>
      </div>

      {/* Desktop: full strip */}
      <div className="hidden w-full items-center justify-end gap-1 sm:flex">
        <PageLink
          href={hrefFor(safePage - 1)}
          disabled={prevDisabled}
          ariaLabel="Previous page"
        >
          ← Prev
        </PageLink>
        {items.map((it, idx) =>
          it === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              aria-hidden="true"
              className="px-2 text-zinc-400"
            >
              …
            </span>
          ) : (
            <PageLink
              key={it}
              href={hrefFor(it)}
              ariaLabel={`Page ${it}`}
              ariaCurrent={it === safePage ? 'page' : undefined}
              active={it === safePage}
            >
              {it}
            </PageLink>
          ),
        )}
        <PageLink
          href={hrefFor(safePage + 1)}
          disabled={nextDisabled}
          ariaLabel="Next page"
        >
          Next →
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({
  href,
  disabled,
  active,
  ariaLabel,
  ariaCurrent,
  children,
}: {
  href: string
  disabled?: boolean
  active?: boolean
  ariaLabel: string
  ariaCurrent?: 'page'
  children: React.ReactNode
}) {
  const cls = [
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
    active
      ? 'border border-zinc-900 bg-zinc-900 text-white'
      : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50',
    disabled ? 'pointer-events-none opacity-40' : '',
  ].join(' ')
  if (disabled) {
    return (
      <span aria-disabled="true" className={cls} aria-label={ariaLabel}>
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={cls}
      scroll={false}
    >
      {children}
    </Link>
  )
}

/**
 * Build the page-strip items: always include first + last, the current page
 * and its neighbours, with `'ellipsis'` markers between gaps. Caps total items
 * at ~7 on desktop.
 */
function pageItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const items: Array<number | 'ellipsis'> = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) items.push('ellipsis')
  for (let i = left; i <= right; i++) items.push(i)
  if (right < total - 1) items.push('ellipsis')
  items.push(total)
  return items
}
