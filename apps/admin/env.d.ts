declare global {
  interface CloudflareEnv {
    DB: D1Database
    MEDIA: R2Bucket
    CACHE: KVNamespace
    AI: Ai
    NEXT_PUBLIC_APP_URL?: string
    WEB_APP_URL?: string
    /** When 'true', publishing an article auto-triggers AI conversation seeding. */
    AUTO_GENERATE_CONVERSATIONS?: string
  }
}

export {}
