import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createDb } from '@teguns/db'
import * as schema from '@teguns/db'

/**
 * Wires Better Auth against the Cloudflare D1 binding via the Drizzle adapter.
 * Default role for self-signup is `commenter` (read-only of the public site
 * plus the ability to post comments). Editors elevate users via the admin UI.
 */
export function createAuth(db: D1Database, baseURL: string) {
  const drizzleDb = createDb(db)
  return betterAuth({
    baseURL,
    database: drizzleAdapter(drizzleDb, {
      provider: 'sqlite',
      schema,
      usePlural: true,
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string' as const,
          defaultValue: 'commenter',
          input: false,
        },
        twoFactorEnabled: {
          type: 'boolean' as const,
          defaultValue: false,
          input: false,
        },
        twoFactorSecret: {
          type: 'string' as const,
          required: false,
          input: false,
        },
        twoFactorVerified: {
          type: 'boolean' as const,
          defaultValue: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
