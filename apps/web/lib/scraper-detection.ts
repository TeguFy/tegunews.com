/**
 * User-agent classification for the rate limiter.
 *
 * Two tiers:
 *   - `bot`     — AI training crawlers and search engines. Bypass rate limit
 *                 entirely. UA-based; rely on Cloudflare's "Verified Bots"
 *                 dashboard toggle for real spoof defence.
 *   - `default` — everything else (real browsers, RSS readers, scripts).
 *                 All share one generous per-IP bucket.
 *
 * Intentionally minimal. The goal is light friction against runaway
 * scrapers, not a fortress.
 */

export type UaTier = 'bot' | 'default'

const BOT_PATTERNS = [
  // AI training / search bots — welcome, not rate-limited
  'gptbot', 'oai-searchbot', 'chatgpt-user',
  'claudebot', 'claude-web', 'anthropic-ai',
  'google-extended', 'ccbot',
  'perplexitybot', 'youbot', 'cohere-ai',
  'meta-externalagent', 'bytespider', 'amazonbot', 'applebot-extended',
  'mistralai-user',
  // Search engines
  'googlebot', 'googleother',
  'bingbot', 'msnbot',
  'duckduckbot',
  'yandexbot',
  'baiduspider',
  'applebot/',
  'naverbot', 'yeti',
  'slurp',
]

export function classifyUa(uaRaw: string): UaTier {
  const ua = (uaRaw || '').toLowerCase()
  for (const needle of BOT_PATTERNS) {
    if (ua.includes(needle)) return 'bot'
  }
  return 'default'
}
