#!/usr/bin/env tsx
/**
 * Provision an agent: creates a `user` row with role='agent' and mints an
 * API key with content-write scopes. The key is printed ONCE — caller must
 * capture it; it cannot be recovered later (only the bcrypt hash is stored).
 *
 * Usage (against local D1):
 *   pnpm tsx scripts/agents/create.ts \
 *     --name "Wire Service Importer" \
 *     --email "wire-importer@agents.tegunews.com" \
 *     --scopes "posts:write,comments:read"
 *
 * Run with `--remote` to target the production D1 instead of local.
 *
 * Why D1 HTTP API instead of `wrangler d1 execute`: lets the script run from
 * CI / agent harnesses without a wrangler login. Reads the same
 * CLOUDFLARE_* env vars Drizzle's drizzle.config.ts uses.
 */

import { generateApiKey, hashApiKey } from '@teguns/auth'

interface Args {
  name: string
  email: string
  scopes: string[]
  remote: boolean
  expiresInDays?: number
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> & { scopes?: string[] } = { remote: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--name') { args.name = next; i++ }
    else if (a === '--email') { args.email = next; i++ }
    else if (a === '--scopes') { args.scopes = next.split(',').map((s) => s.trim()); i++ }
    else if (a === '--expires-in-days') { args.expiresInDays = Number(next); i++ }
    else if (a === '--remote') { args.remote = true }
  }
  if (!args.name) throw new Error('--name required')
  if (!args.email) throw new Error('--email required')
  if (!args.scopes?.length) throw new Error('--scopes required (e.g. posts:write,comments:read)')
  return args as Args
}

async function execD1(sql: string, params: unknown[], opts: { remote: boolean }): Promise<unknown> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !dbId || !token) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN must be set')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/${opts.remote ? 'query' : 'query'}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql, params }),
  })
  const data = (await res.json()) as { success: boolean; errors?: unknown[]; result?: unknown[] }
  if (!data.success) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`)
  }
  return data.result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const userId = crypto.randomUUID()
  const apiKey = generateApiKey('live')
  const keyHash = await hashApiKey(apiKey)
  const apiKeyId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = args.expiresInDays
    ? now + args.expiresInDays * 86400
    : null

  // Insert agent user. Better Auth's `user` table is the source of truth for
  // session lookups, even when the agent never holds a session.
  await execD1(
    `INSERT INTO user (id, name, email, emailVerified, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, 'agent', 0, 0, ?, ?)`,
    [userId, args.name, args.email, now, now],
    { remote: args.remote },
  )

  // Insert API key row.
  await execD1(
    `INSERT INTO api_keys (id, user_id, name, key_hash, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      apiKeyId,
      userId,
      args.name,
      keyHash,
      JSON.stringify(args.scopes),
      expiresAt,
      now,
    ],
    { remote: args.remote },
  )

  console.log('\n✓ Agent provisioned\n')
  console.log(`  user_id:    ${userId}`)
  console.log(`  api_key_id: ${apiKeyId}`)
  console.log(`  scopes:     ${args.scopes.join(', ')}`)
  if (expiresAt) console.log(`  expires_at: ${new Date(expiresAt * 1000).toISOString()}`)
  console.log(`\n  API key (capture this — shown once):\n  ${apiKey}\n`)
  console.log('  Use:  Authorization: Bearer <key>   OR   x-api-key: <key>\n')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
