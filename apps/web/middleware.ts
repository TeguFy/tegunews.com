/**
 * Edge middleware — light per-IP rate limit.
 *
 * AI bots + search engines bypass entirely. Everyone else (humans, RSS readers,
 * scripts) shares one 120-req/min bucket. Light friction, not a wall — runaway
 * scrapers slow down, real readers never notice.
 *
 * If abuse picks up, tighten by:
 *   - Lowering `RATE_LIMITER` limit in wrangler.jsonc (try 60/min)
 *   - Enabling Cloudflare → Security → Bots → Bot Fight Mode (no code change)
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { classifyUa } from '@/lib/scraper-detection'

interface RateLimiter {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>
}

interface ExtendedEnv {
  RATE_LIMITER?: RateLimiter
}

// Locale routing — next-intl's own middleware doesn't compose with Workers
// runtime, so we hand-roll a simple Accept-Language sniff + redirect.
const SUPPORTED_LOCALES = ['en', 'vi'] as const
const DEFAULT_LOCALE = 'en'

function pickLocale(acceptLanguage: string | null): string {
  if (!acceptLanguage) return DEFAULT_LOCALE
  // Cheap parse: take the highest-quality tag whose primary subtag we support.
  const tags = acceptLanguage.split(',').map((t) => t.split(';')[0].trim().toLowerCase())
  for (const tag of tags) {
    const primary = tag.split('-')[0]
    if (SUPPORTED_LOCALES.includes(primary as never)) return primary
  }
  return DEFAULT_LOCALE
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Root + bare path → redirect to locale-prefixed URL. 308 so the redirect
  // is cacheable + preserves method (POST to /something/api still goes to
  // /something/api on the locale segment, not here).
  if (path === '/' || path === '') {
    const locale = pickLocale(req.headers.get('accept-language'))
    const url = req.nextUrl.clone()
    url.pathname = `/${locale}`
    return NextResponse.redirect(url, 308)
  }

  // AI + search bots bypass rate limit. Verified Bots in the CF dashboard
  // is what actually keeps UA-spoofers honest.
  if (classifyUa(req.headers.get('user-agent') ?? '') === 'bot') {
    return NextResponse.next()
  }

  let env: ExtendedEnv
  try {
    env = (getCloudflareContext().env as unknown as ExtendedEnv)
  } catch {
    return NextResponse.next()  // local `next dev` without bindings
  }

  if (!env.RATE_LIMITER) return NextResponse.next()

  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anon'

  try {
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      })
    }
  } catch {
    // binding errored — fail open
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
