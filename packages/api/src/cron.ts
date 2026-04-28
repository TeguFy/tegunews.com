/**
 * Scheduled tasks runnable from a Cloudflare Worker `scheduled` handler.
 *
 * Wire into apps/admin's worker entry (or a dedicated cron worker) like:
 *
 *   export default {
 *     async scheduled(event, env, ctx) {
 *       const db = createDb(env.DB)
 *       await promoteScheduledPosts(db)
 *     },
 *   }
 *
 * Cron triggers in `wrangler.jsonc`:
 *
 *   "triggers": { "crons": ["* * * * *"] }   // every minute
 *
 * Idempotent: a row that's already past its `publishedAt` and still
 * `status='scheduled'` is updated atomically; re-running the same minute is
 * a no-op because the WHERE clause stops matching after the first run.
 */
import { and, eq, lte } from 'drizzle-orm'
import { posts } from '@teguns/db'
import type { Database } from '@teguns/db'

export interface CronResult {
  promoted: number
  scannedAt: string
}

export async function promoteScheduledPosts(db: Database): Promise<CronResult> {
  const now = new Date()
  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, 'scheduled'), lte(posts.publishedAt, now)))

  if (due.length === 0) return { promoted: 0, scannedAt: now.toISOString() }

  // Update each row individually so we keep `publishedAt` exactly as the
  // scheduler set it — only the status flips. (A single UPDATE WHERE would
  // also work; per-row keeps the door open for per-post side effects.)
  for (const row of due) {
    await db
      .update(posts)
      .set({ status: 'published', updatedAt: now })
      .where(and(eq(posts.id, row.id), eq(posts.status, 'scheduled')))
  }

  return { promoted: due.length, scannedAt: now.toISOString() }
}
