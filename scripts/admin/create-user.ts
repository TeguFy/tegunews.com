#!/usr/bin/env tsx
/**
 * Provision a Better-Auth user with email + password.
 *
 * Two-step flow:
 *   1. POST /api/auth/sign-up/email — Better-Auth's own hashing path
 *      (scrypt-based; we tried bcrypt and it rejected the hash).
 *   2. SQL `UPDATE user SET role=...` — signup always uses the default
 *      role; we need 'admin' / 'editor' / 'author' explicitly.
 *
 * Auth for step 2 reuses the existing `wrangler login` session via
 * `wrangler d1 execute`, so no extra `CLOUDFLARE_API_TOKEN` needed.
 *
 * Usage:
 *   pnpm tsx scripts/admin/create-user.ts \
 *     --email admin@tegunews.com \
 *     --name 'Admin' \
 *     --role admin \
 *     [--password '...']    # omit → 24 random chars generated + printed
 *     [--remote]            # default: local; --remote targets prod
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Args {
  email: string
  name: string
  role: 'admin' | 'editor' | 'author' | 'commenter'
  password?: string
  remote: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { remote: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--email') { args.email = next; i++ }
    else if (a === '--name') { args.name = next; i++ }
    else if (a === '--role') { args.role = next as Args['role']; i++ }
    else if (a === '--password') { args.password = next; i++ }
    else if (a === '--remote') { args.remote = true }
  }
  if (!args.email) throw new Error('--email required')
  if (!args.name) throw new Error('--name required')
  if (!args.role) throw new Error('--role required (admin|editor|author|commenter)')
  if (!['admin', 'editor', 'author', 'commenter'].includes(args.role)) {
    throw new Error(`--role must be one of admin|editor|author|commenter, got "${args.role}"`)
  }
  return args as Args
}

function sqlString(s: string): string {
  if (/[\x00-\x08\x0B-\x1F\x7F]/.test(s)) {
    throw new Error('Control characters not allowed in input')
  }
  return `'${s.replace(/'/g, "''")}'`
}

function randomPassword(len = 24): string {
  const alpha = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_'
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < len; i++) out += alpha[buf[i] % alpha.length]
  return out
}

function execD1(sql: string, opts: { remote: boolean }): void {
  const sqlFile = join(tmpdir(), `tegunews-d1-${process.pid}-${Date.now()}.sql`)
  writeFileSync(sqlFile, sql, 'utf8')
  try {
    const flags = ['d1', 'execute', 'tegunews', '--file', sqlFile]
    if (opts.remote) flags.push('--remote')
    execFileSync('pnpm', ['exec', 'wrangler', ...flags], { stdio: ['ignore', 'inherit', 'inherit'] })
  } finally {
    try { unlinkSync(sqlFile) } catch { /* best-effort */ }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const password = args.password ?? randomPassword()

  const baseUrl = args.remote ? 'https://admin.tegunews.com' : 'http://localhost:3001'

  // Step 1 — sign up via Better-Auth's own endpoint. This path runs scrypt
  // (or whatever Better-Auth's current default hasher is) so the resulting
  // account row passes verification on sign-in.
  console.log(`→ POST ${baseUrl}/api/auth/sign-up/email`)
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better-Auth's CSRF gate rejects requests without an Origin header.
      // Setting it to the same baseUrl satisfies the check (same-origin).
      'Origin': baseUrl,
    },
    body: JSON.stringify({ email: args.email, password, name: args.name }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`Sign-up failed (${res.status}): ${bodyText}`)
  }

  // Step 2 — promote to target role. Default signup role is 'commenter';
  // we overwrite it here.
  if (args.role !== 'commenter') {
    const sql = `UPDATE user SET role = ${sqlString(args.role)} WHERE email = ${sqlString(args.email)};`
    execD1(sql, { remote: args.remote })
  }

  console.log('\n✓ User provisioned\n')
  console.log(`  email:    ${args.email}`)
  console.log(`  name:     ${args.name}`)
  console.log(`  role:     ${args.role}`)
  console.log(`\n  Password (capture this — not retrievable later):\n  ${password}\n`)
  console.log(`  Sign in:  ${baseUrl}/login\n`)
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
