import type { Database } from '@teguns/db'
import { auditLog } from '@teguns/db'

export interface AuditEntry {
  userId: string | null
  action: string
  resourceType?: string
  resourceId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export async function logAction(
  db: Database,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    metadata: entry.metadata ?? null,
  })
}
