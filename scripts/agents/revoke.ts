#!/usr/bin/env tsx
/**
 * Revoke an agent API key.
 *
 * Usage:
 *   pnpm tsx scripts/agents/revoke.ts --id <api_key_id>
 *   pnpm tsx scripts/agents/revoke.ts --name "Wire Service Importer"
 *
 * Add `--remote` to target production D1.
 *
 * Sets `revoked_at = unixepoch()` on the matching row(s). The auth middleware
 * rejects keys whose `revokedAt IS NOT NULL`, so the change takes effect on
 * the next request — no rollout window.
 *
 * `--name` matches by exact `name` (the human label given at create time).
 * If multiple keys share the name, all of them are revoked. Use `--id` for
 * surgical revocation.
 */

interface Args {
  id?: string
  name?: string
  remote: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { remote: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--id') { args.id = next; i++ }
    else if (a === '--name') { args.name = next; i++ }
    else if (a === '--remote') { args.remote = true }
  }
  if (!args.id && !args.name) throw new Error('--id or --name required')
  return args
}

async function execD1(sql: string, params: unknown[]): Promise<unknown> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !dbId || !token) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN must be set')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql, params }),
  })
  const data = (await res.json()) as { success: boolean; errors?: unknown[]; result?: Array<{ results?: unknown[] }> }
  if (!data.success) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`)
  }
  return data.result?.[0]?.results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Look up matching keys first so we can report what's being revoked.
  const matching = (await execD1(
    args.id
      ? `SELECT id, user_id, name FROM api_keys WHERE id = ? AND revoked_at IS NULL`
      : `SELECT id, user_id, name FROM api_keys WHERE name = ? AND revoked_at IS NULL`,
    [args.id ?? args.name],
  )) as Array<{ id: string; user_id: string; name: string }> | undefined

  if (!matching || matching.length === 0) {
    console.error('✗ No active key matched.')
    process.exit(1)
  }

  console.log(`Revoking ${matching.length} key(s):`)
  for (const m of matching) {
    console.log(`  - ${m.id} (user: ${m.user_id}, name: "${m.name}")`)
  }

  await execD1(
    args.id
      ? `UPDATE api_keys SET revoked_at = unixepoch() WHERE id = ? AND revoked_at IS NULL`
      : `UPDATE api_keys SET revoked_at = unixepoch() WHERE name = ? AND revoked_at IS NULL`,
    [args.id ?? args.name],
  )

  console.log('\n✓ Revoked. Effective on the next API request.')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
