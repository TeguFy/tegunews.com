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

export async function middleware(req: NextRequest) {
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
