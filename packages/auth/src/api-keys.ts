/**
 * API key hashing uses SHA-256 via the Web Crypto API (available in both
 * Node.js and Cloudflare Workers). We deliberately avoid bcrypt here because
 * Workers have a tight CPU budget (~50ms) and bcrypt at any useful cost factor
 * blows through it on every authenticated request.
 *
 * Security trade-off: SHA-256 is fast, so a leaked hash DB is more brute-
 * forceable than bcrypt. We mitigate this by:
 *   1. Keys are 32 random bytes from crypto.getRandomValues — 192 bits of
 *      entropy. Brute-forcing a 192-bit key space is computationally infeasible
 *      regardless of hash speed.
 *   2. Keys are never stored in plaintext; only the hex digest is persisted.
 *   3. Keys are scoped and short-lived (expires_at enforced at query time).
 */
import { Buffer } from 'node:buffer'

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export type ApiKeyEnv = 'live' | 'test'

export function generateApiKey(env: ApiKeyEnv = 'live'): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  let body = ''
  for (let i = 0; i < buf.length; i++) {
    body += ALPHABET[buf[i] % ALPHABET.length]
  }
  return `tgn_${env}_${body}`
}

export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Buffer.from(digest).toString('hex')
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  // Support legacy bcrypt hashes (start with '$2') during migration window.
  if (hash.startsWith('$2')) {
    const { default: bcrypt } = await import('bcryptjs')
    return bcrypt.compare(key, hash)
  }
  const expected = await hashApiKey(key)
  return expected === hash
}
