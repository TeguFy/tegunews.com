'use client'

import { useUrlState } from './url-state'

export interface ActiveFilter {
  /** Chip label, e.g. "Status: Published". */
  label: string
  /** Param keys to clear when the chip is dismissed. Most chips clear one. */
  paramKeys: string[]
  /**
   * Optional value to remove from a comma-separated list param. When set,
   * dismissing the chip removes only this entry (used for multi-select chips).
   */
  removeValueFrom?: { paramKey: string; value: string }
}

interface ActiveFiltersProps {
  filters: ActiveFilter[]
  /** Param keys reset by "Clear all". `page` and `perPage` are preserved. */
  clearKeys: string[]
}

/**
 * Removable chip strip below the toolbar. Renders nothing when empty so the
 * page doesn't reserve space when no filters are active.
 */
export function ActiveFilters({ filters, clearKeys }: ActiveFiltersProps) {
  const { searchParams, update } = useUrlState()
  if (filters.length === 0) return null

  function remove(f: ActiveFilter) {
    if (f.removeValueFrom) {
      const { paramKey, value } = f.removeValueFrom
      const current = (searchParams.get(paramKey) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const next = current.filter((v) => v !== value)
      update({ [paramKey]: next.length ? next.join(',') : null })
      return
    }
    const patch: Record<string, null> = {}
    for (const k of f.paramKeys) patch[k] = null
    update(patch)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {filters.map((f, i) => (
        <button
          key={`${f.label}-${i}`}
          type="button"
          onClick={() => remove(f)}
          className="group inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 py-0.5 pl-2.5 pr-1 text-xs text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
          aria-label={`Remove filter ${f.label}`}
        >
          <span>{f.label}</span>
          <span
            aria-hidden="true"
            className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 group-hover:bg-zinc-200 group-hover:text-zinc-700"
          >
            ×
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          const patch: Record<string, null> = {}
          for (const k of clearKeys) patch[k] = null
          update(patch)
        }}
        className="ml-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}
