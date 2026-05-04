'use client'

import { useUrlState } from './url-state'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFilterProps {
  paramKey: string
  options: SelectOption[]
  /** Label shown above (or as the implicit "All" option label prefix). */
  label: string
  /** Value treated as "no filter". Defaults to '' (param removed). */
  allValue?: string
  /** Label for the "no filter" option. */
  allLabel?: string
  className?: string
}

/**
 * Single-select dropdown bound to a URL param.
 *
 * Selecting `allValue` removes the param from the URL — keeps share links tidy
 * and ensures the server component sees exactly one canonical "no filter"
 * state.
 */
export function SelectFilter({
  paramKey,
  options,
  label,
  allValue = '',
  allLabel = 'All',
  className,
}: SelectFilterProps) {
  const { searchParams, update } = useUrlState()
  const value = searchParams.get(paramKey) ?? ''

  return (
    <label className={`flex items-center gap-1.5 text-sm ${className ?? ''}`}>
      <span className="sr-only">{label}</span>
      <span className="hidden text-xs font-medium text-zinc-500 lg:inline">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => update({ [paramKey]: e.target.value || null })}
        className="rounded-md border border-zinc-200 bg-white py-1.5 pl-2.5 pr-8 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
      >
        <option value={allValue}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
