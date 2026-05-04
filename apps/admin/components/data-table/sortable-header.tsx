import Link from 'next/link'

interface SortableHeaderProps {
  /** URL param value, e.g. `updatedAt`. */
  sortKey: string
  /** Visible label. */
  label: string
  /** The currently active sort key (from `searchParams.sort`). */
  activeKey?: string
  /** Active direction. */
  activeDir?: 'asc' | 'desc'
  /** Default direction when this column is first clicked. */
  defaultDir?: 'asc' | 'desc'
  /** Current full search params snapshot — preserved across the link. */
  searchParams: Record<string, string | string[] | undefined>
  /** Optional cell extra classes (text alignment etc.). */
  className?: string
  /** Right-align the indicator (for numeric columns). */
  align?: 'left' | 'right'
}

/**
 * Table header cell with sort indicator. Click toggles direction; clicking a
 * different column resets to that column's `defaultDir`.
 *
 * Renders as a server-side `<Link>` so the page navigation flows through
 * `searchParams` like every other filter.
 */
export function SortableHeader({
  sortKey,
  label,
  activeKey,
  activeDir,
  defaultDir = 'desc',
  searchParams,
  className,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = activeKey === sortKey
  const nextDir: 'asc' | 'desc' = isActive
    ? activeDir === 'asc'
      ? 'desc'
      : 'asc'
    : defaultDir

  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      if (v[0] != null) next.set(k, v[0])
    } else {
      next.set(k, v)
    }
  }
  next.set('sort', sortKey)
  next.set('dir', nextDir)
  next.delete('page')
  const href = `?${next.toString()}`

  const arrow = isActive ? (activeDir === 'asc' ? '↑' : '↓') : ''

  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-${align} ${className ?? ''}`}
      aria-sort={
        isActive
          ? activeDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <Link
        href={href}
        scroll={false}
        className={`group inline-flex items-center gap-1 ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${isActive ? 'text-zinc-900' : 'text-zinc-600 hover:text-zinc-900'}`}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] tabular-nums ${
            isActive ? 'text-zinc-900' : 'text-zinc-300 group-hover:text-zinc-500'
          }`}
        >
          {arrow || '↕'}
        </span>
      </Link>
    </th>
  )
}
