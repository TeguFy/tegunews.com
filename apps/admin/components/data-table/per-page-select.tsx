'use client'

import { useUrlState } from './url-state'

const OPTIONS = [10, 20, 50, 100] as const

interface PerPageSelectProps {
  /** Default value used when the URL has no `perPage`. */
  defaultValue?: number
  className?: string
}

export function PerPageSelect({
  defaultValue = 20,
  className,
}: PerPageSelectProps) {
  const { searchParams, update } = useUrlState()
  const current = Number.parseInt(
    searchParams.get('perPage') ?? String(defaultValue),
    10,
  )
  const value = OPTIONS.includes(current as (typeof OPTIONS)[number])
    ? current
    : defaultValue

  return (
    <label className={`flex items-center gap-1.5 text-xs text-zinc-600 ${className ?? ''}`}>
      <span>Rows</span>
      <select
        value={value}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10)
          update({
            perPage: next === defaultValue ? null : String(next),
            page: null,
          })
        }}
        className="rounded-md border border-zinc-200 bg-white py-1 pl-1.5 pr-6 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        aria-label="Rows per page"
      >
        {OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
