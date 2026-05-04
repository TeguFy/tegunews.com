import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

interface Props {
  locale: string
  basePath: string
  /** Existing query params to preserve (e.g. sort, time). May contain `page`; ignored. */
  searchParams: Record<string, string | undefined>
  page: number
  pageCount: number
}

/**
 * Numbered pagination — real <a> anchors so links are crawlable & middle-clickable.
 * Page 1 is canonical (no ?page=1 in URL).
 * On mobile collapses to Prev / "Page n of N" / Next.
 */
export async function ArticlePagination({ locale, basePath, searchParams, page, pageCount }: Props) {
  if (pageCount <= 1) return null
  const t = await getTranslations({ locale, namespace: 'listing' })

  const hrefFor = (n: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page' || !v) continue
      sp.set(k, v)
    }
    if (n > 1) sp.set('page', String(n))
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const window = buildPageWindow(page, pageCount)

  return (
    <nav aria-label={t('pageLabel')} className="mt-16 flex items-center justify-center">
      {/* Mobile */}
      <div className="flex w-full items-center justify-between gap-3 md:hidden">
        <PageLink
          href={hrefFor(Math.max(1, page - 1))}
          disabled={page <= 1}
          label={t('previous')}
          aria-label={t('previous')}
        >
          <Arrow dir="left" />
          <span>{t('previous')}</span>
        </PageLink>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('page', { current: page, total: pageCount })}
        </span>
        <PageLink
          href={hrefFor(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          label={t('next')}
          aria-label={t('next')}
        >
          <span>{t('next')}</span>
          <Arrow dir="right" />
        </PageLink>
      </div>

      {/* Desktop */}
      <ul className="hidden items-center gap-1 md:flex">
        <li>
          <PageLink
            href={hrefFor(1)}
            disabled={page <= 1}
            label={t('first')}
            aria-label={t('first')}
            compact
          >
            <Arrow dir="left" double />
          </PageLink>
        </li>
        <li>
          <PageLink
            href={hrefFor(Math.max(1, page - 1))}
            disabled={page <= 1}
            label={t('previous')}
            aria-label={t('previous')}
            compact
          >
            <Arrow dir="left" />
          </PageLink>
        </li>
        {window.map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground/60">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-label={t('goToPage', { page: item })}
                aria-current={item === page ? 'page' : undefined}
                className={
                  item === page
                    ? 'inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium tabular-nums text-background'
                    : 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm tabular-nums text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
                }
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>
          <PageLink
            href={hrefFor(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
            label={t('next')}
            aria-label={t('next')}
            compact
          >
            <Arrow dir="right" />
          </PageLink>
        </li>
        <li>
          <PageLink
            href={hrefFor(pageCount)}
            disabled={page >= pageCount}
            label={t('last')}
            aria-label={t('last')}
            compact
          >
            <Arrow dir="right" double />
          </PageLink>
        </li>
      </ul>
    </nav>
  )
}

function PageLink({
  href,
  disabled,
  children,
  compact,
  ...rest
}: {
  href: string
  disabled?: boolean
  label: string
  compact?: boolean
  children: React.ReactNode
} & React.AriaAttributes) {
  const cls = compact
    ? 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
    : 'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30'
  if (disabled) {
    return (
      <span aria-disabled className={`${cls} pointer-events-none opacity-40`} {...rest}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  )
}

function Arrow({ dir, double = false }: { dir: 'left' | 'right'; double?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {double ? (
        dir === 'left' ? (
          <>
            <path d="m8 4-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m13 4-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <path d="m3 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m8 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )
      ) : dir === 'left' ? (
        <path d="m10 4-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

/**
 * Returns a sliding-window list of page numbers with 'gap' markers.
 * Always includes 1 and pageCount, plus a window around `current`.
 *
 * Examples (current/total):
 *   3/10  -> [1, 2, 3, 4, 5, gap, 10]
 *   7/10  -> [1, gap, 5, 6, 7, 8, 9, 10]
 *   5/5   -> [1, 2, 3, 4, 5]
 */
function buildPageWindow(current: number, total: number): Array<number | 'gap'> {
  const span = 1 // pages on each side of current
  const pages = new Set<number>([1, total])
  for (let i = current - span; i <= current + span; i++) {
    if (i >= 1 && i <= total) pages.add(i)
  }
  // Show neighbours of bounds for nicer-looking groups.
  if (total >= 2) pages.add(2)
  if (total >= 2) pages.add(total - 1)
  const sorted = Array.from(pages).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}
