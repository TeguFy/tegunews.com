/// <reference types="@cloudflare/workers-types" />

interface RateLimit {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>
}

declare global {
  interface CloudflareEnv {
    DB: D1Database
    MEDIA: R2Bucket
    CACHE: KVNamespace
    NEXT_INC_CACHE_KV: KVNamespace
    ANALYTICS_ENGINE?: AnalyticsEngineDataset
    // Per-IP rate limit — 120/min. Declared in wrangler.jsonc `ratelimits[]`.
    RATE_LIMITER: RateLimit
    NEXT_PUBLIC_APP_URL: string
    NEXT_PUBLIC_GA_MEASUREMENT_ID?: string
  }
}

export {}
