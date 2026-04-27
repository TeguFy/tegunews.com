import bcrypt from 'bcryptjs'

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
  return bcrypt.hash(key, 12)
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash)
}
