interface ResultCountProps {
  total: number
  page: number
  perPage: number
  /** Singular noun, e.g. "post". Pluralised by appending 's' unless `pluralNoun` is given. */
  noun: string
  pluralNoun?: string
  className?: string
}

/**
 * "Showing 1–20 of 137 posts" — small, muted, sits next to the per-page
 * selector. Server-rendered (no client state).
 */
export function ResultCount({
  total,
  page,
  perPage,
  noun,
  pluralNoun,
  className,
}: ResultCountProps) {
  if (total === 0) {
    return (
      <p className={`text-xs text-zinc-500 ${className ?? ''}`}>
        No {pluralNoun ?? `${noun}s`} found.
      </p>
    )
  }
  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, total)
  const word = total === 1 ? noun : pluralNoun ?? `${noun}s`
  return (
    <p className={`text-xs text-zinc-500 ${className ?? ''}`}>
      Showing <span className="tabular-nums text-zinc-700">{start.toLocaleString()}</span>–
      <span className="tabular-nums text-zinc-700">{end.toLocaleString()}</span> of{' '}
      <span className="tabular-nums text-zinc-700">{total.toLocaleString()}</span> {word}
    </p>
  )
}
