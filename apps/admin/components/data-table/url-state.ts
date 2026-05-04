/**
 * URL-state helpers shared by every data-table client component.
 *
 * Why URL state, not React state:
 *   - Filters survive reload + share-by-link (key UX requirement).
 *   - Server components read `searchParams` directly; no client/server drift.
 *   - "Back" navigates filter history naturally.
 *
 * All mutators preserve unrelated params, drop empty values, and reset `page`
 * to 1 whenever a filter changes — paginating into a filtered view that you
 * then change is the most common state-bug source.
 */
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export type ParamUpdate = Record<string, string | null | undefined>

export function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * Apply a partial set of param updates. `null` / `undefined` / `''` removes
   * a key. Any change resets `page` to 1 unless the update itself sets `page`.
   */
  const update = useCallback(
    (
      patch: ParamUpdate,
      options?: { resetPage?: boolean; replace?: boolean },
    ) => {
      const next = new URLSearchParams(searchParams.toString())
      let touchedNonPage = false
      for (const [key, value] of Object.entries(patch)) {
        if (key !== 'page') touchedNonPage = true
        if (value == null || value === '') {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      }
      const resetPage = options?.resetPage ?? touchedNonPage
      if (resetPage && !('page' in patch)) {
        next.delete('page')
      }
      const qs = next.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      const navigate = options?.replace ?? true ? router.replace : router.push
      navigate(url, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  return { searchParams, pathname, update }
}

/** Read a single param with a fallback (server-side safe via plain object). */
export function readParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
  fallback = '',
): string {
  const v = sp[key]
  if (Array.isArray(v)) return v[0] ?? fallback
  return v ?? fallback
}

/** Read a positive integer param clamped to [min, max]. */
export function readIntParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = readParam(sp, key)
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

/** Comma-separated list param ("a,b,c"). Returns trimmed non-empty entries. */
export function readListParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const v = readParam(sp, key)
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
