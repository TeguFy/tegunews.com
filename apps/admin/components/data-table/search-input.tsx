'use client'

import { useEffect, useState } from 'react'
import { useUrlState } from './url-state'

interface SearchInputProps {
  /** URL param key — `q` by default. */
  paramKey?: string
  placeholder?: string
  /** Debounce delay in ms. */
  delay?: number
  /** Visual width hint. */
  className?: string
  /** Optional aria-label override. */
  label?: string
}

/**
 * Debounced search input bound to a URL param.
 *
 * Local state mirrors the input value for responsive typing; a timer pushes
 * the change to the URL after `delay` ms of inactivity. Submitting the form
 * (Enter) flushes immediately.
 */
export function SearchInput({
  paramKey = 'q',
  placeholder = 'Search…',
  delay = 300,
  className,
  label,
}: SearchInputProps) {
  const { searchParams, update } = useUrlState()
  const initial = searchParams.get(paramKey) ?? ''
  const [value, setValue] = useState(initial)

  // Sync from URL (e.g. when "Clear filters" wipes the param).
  useEffect(() => {
    setValue(searchParams.get(paramKey) ?? '')
  }, [searchParams, paramKey])

  // Debounced push.
  useEffect(() => {
    if (value === initial) return
    const id = window.setTimeout(() => {
      update({ [paramKey]: value || null })
    }, delay)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay, paramKey])

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        update({ [paramKey]: value || null })
      }}
      className={className}
    >
      <label className="relative block">
        <span className="sr-only">{label ?? placeholder}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue('')
              update({ [paramKey]: null })
            }}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </label>
    </form>
  )
}
