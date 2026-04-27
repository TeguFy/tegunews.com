declare global {
  interface CloudflareEnv {
    DB: D1Database
    MEDIA: R2Bucket
    CACHE: KVNamespace
    NEXT_PUBLIC_APP_URL?: string
    WEB_APP_URL?: string
  }
}

export {}
