/**
 * Cron worker — runs scheduled tasks for tegunews.
 *
 * Plain Cloudflare Worker (no Next.js). Scheduled-only — there's no fetch
 * handler, so the worker has no public surface. All work is triggered by
 * cron expressions in `wrangler.jsonc`.
 *
 * Tasks:
 *   - promoteScheduledPosts — flips `scheduled` rows to `published` once
 *     `publishedAt` has passed. Runs every minute.
 *
 * Add new tasks by importing them from `@teguns/api/cron` (or wherever) and
 * dispatching here based on `event.cron`. Multiple cron schedules can fire
 * the same handler; switch on `event.cron` to route.
 */
import { promoteScheduledPosts } from '@teguns/api/cron'
import { createDb } from '@teguns/db'

interface Env {
  DB: D1Database
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB)

    // Single task today — but the switch makes adding a daily / weekly job
    // (e.g. "expire-breakingUntil flags", "rotate api-key salts") trivial.
    switch (event.cron) {
      case '* * * * *': {
        const result = await promoteScheduledPosts(db)
        // Workers logs (`wrangler tail tegunews-cron`) pick this up.
        // Structured JSON makes audit_log-style filtering cheap.
        if (result.promoted > 0) {
          console.log(JSON.stringify({ event: 'cron.promote_scheduled', ...result }))
        }
        break
      }
      default:
        console.warn(JSON.stringify({ event: 'cron.unknown_schedule', cron: event.cron }))
    }

    // Cloudflare requires us to acknowledge async work explicitly. waitUntil
    // is a no-op here because we awaited above, but keeping it as a hook for
    // future fire-and-forget tasks (e.g. webhook firehose).
    void ctx
  },
}
