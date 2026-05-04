'use client'

import { useEffect, useRef, useState } from 'react'
import { useUrlState, readListParam } from './url-state'
import type { SelectOption } from './select-filter'

interface MultiSelectFilterProps {
  paramKey: string
  options: SelectOption[]
  label: string
  className?: string
  /** Placeholder shown when nothing selected. */
  placeholder?: string
}

/**
 * Chip-style multi-select bound to a URL param (comma-joined).
 *
 * Implementation note: a native popover (HTMLDetailsElement) keeps this
 * lightweight — no @radix-ui dep. The trigger button shows the chip list of
 * selected values + count. Clicking outside closes the panel.
 */
export function MultiSelectFilter({
  paramKey,
  options,
  label,
  className,
  placeholder = 'Any',
}: MultiSelectFilterProps) {
  const { searchParams, update } = useUrlState()
  const selected = readListParam(
    Object.fromEntries(searchParams.entries()),
    paramKey,
  )
  const selectedSet = new Set(selected)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function toggle(value: string) {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    update({ [paramKey]: next.size ? Array.from(next).join(',') : null })
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`

  return (
    <div ref={ref} className={`relative text-sm ${className ?? ''}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white py-1.5 pl-2.5 pr-2 text-sm text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
      >
        <span className="hidden text-xs font-medium text-zinc-500 lg:inline">
          {label}:
        </span>
        <span className="text-zinc-700">{summary}</span>
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-zinc-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg"
        >
          {options.length === 0 && (
            <p className="px-2 py-2 text-xs text-zinc-500">No options.</p>
          )}
          {options.map((o) => {
            const checked = selectedSet.has(o.value)
            return (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-2 focus:ring-zinc-300"
                />
                <span className="truncate text-zinc-800">{o.label}</span>
              </label>
            )
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => update({ [paramKey]: null })}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  )
}
