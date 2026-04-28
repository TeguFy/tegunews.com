/**
 * Convenience wrapper around `logAction` from @teguns/auth — pulls
 * userId / IP / UA / `X-Agent-Run-Id` off the Hono context so route
 * handlers don't repeat that boilerplate.
 *
 * `X-Agent-Run-Id` lets a single agent invocation tag every audit row it
 * generates. The orchestrator chooses the value (UUID, job ID, anything);
 * we just store it. Query for "everything `wire-importer-2026-04-28-08:00`
 * did" by selecting `WHERE json_extract(metadata, '$.runId') = ?`.
 */
import type { Context } from 'hono'
import { logAction } from '@teguns/auth'
import type { ApiEnv } from './app'

export async function audit(
  c: Context<ApiEnv>,
  action: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const runId = c.req.header('x-agent-run-id') ?? undefined
  const ipAddress =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  await logAction(c.var.db, {
    userId: c.var.userId,
    action,
    // Convention: `<resourceType>.<verb>` — `post.publish`, `comment.moderate`.
    resourceType: action.split('.')[0],
    resourceId,
    ipAddress,
    userAgent: c.req.header('user-agent') ?? undefined,
    metadata: { ...metadata, ...(runId ? { runId } : {}) },
  })
}
