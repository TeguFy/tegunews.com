'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export interface FilterDropdownOption<V extends string> {
  value: V
  label: string
}

interface Props<V extends string> {
  label: string
  paramKey: string
  basePath: string
  defaultValue: V
  current: V
  options: FilterDropdownOption<V>[]
}

/**
 * Quiet inline filter. Renders a label + current value as a button; opens
 * a small list of links. Each option is a real <a> so deep-linking, middle-click,
 * and crawl all work — the dropdown is only an interaction layer on top.
 */
export function FilterDropdown<V extends string>({
  label,
  paramKey,
  basePath,
  defaultValue,
  current,
  options,
}: Props<V>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const currentLabel = options.find((o) => o.value === current)?.label ?? options[0].label

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function hrefFor(value: V) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '')
    if (value === defaultValue) sp.delete(paramKey)
    else sp.set(paramKey, value)
    // Reset pagination when filters change.
    sp.delete('page')
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <div ref={ref} className="relative inline-flex items-baseline gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
      >
        {currentLabel}
        <Caret className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-2 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-background py-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
        >
          {options.map((opt) => {
            const isActive = opt.value === current
            return (
              <li key={opt.value} role="option" aria-selected={isActive}>
                <Link
                  href={hrefFor(opt.value)}
                  scroll={false}
                  className={`flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-muted ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                  onClick={() => setOpen(false)}
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="size-3.5 text-primary" />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Caret({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
