'use client'

/**
 * Fire-and-forget view tracker. Pings `/api/track/view` once per article
 * mount. Idempotent within a single page load (StrictMode + double-mount in
 * dev) via a ref, but NOT across reloads — that's by design: each reload
 * counts as a fresh view. The edge rate-limiter (per-IP) keeps individual
 * visitors from inflating the counter.
 */
import { useEffect, useRef } from 'react'

export function ViewTracker({ postId }: { postId: string }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    // Use keepalive so the fetch isn't cancelled if the user navigates away
    // before the response arrives.
    fetch('/api/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
      keepalive: true,
    }).catch(() => { /* tracker is best-effort */ })
  }, [postId])

  return null
}
