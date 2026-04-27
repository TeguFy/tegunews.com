export function generateCsrfToken(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0')
  }
  return out
}

export function validateCsrfToken(
  cookie: string | undefined,
  header: string | undefined,
): boolean {
  if (!cookie || !header) return false
  if (cookie.length !== header.length) return false

  let result = 0
  for (let i = 0; i < cookie.length; i++) {
    result |= cookie.charCodeAt(i) ^ header.charCodeAt(i)
  }
  return result === 0
}
