/**
 * Comment moderation policy.
 *
 * Decides the initial moderation `status` for a freshly-submitted comment.
 * Hybrid policy: editors auto-approve, trust-on-first-use for established
 * commenters, hard `spam` flag for obvious abuse, otherwise `pending`.
 */

export type ModerationStatus = 'pending' | 'approved' | 'spam' | 'rejected'

export interface CommentSignals {
  role: 'commenter' | 'author' | 'editor' | 'admin' | null
  approvedHistoryCount: number
  bodyLength: number
  linkCount: number
  spamScore: number | null   // 0..100 from external spam check, null if unchecked
  hasCaptcha: boolean
  /** Hidden-field bot trap. If a client filled it, it's a bot. */
  honeypotFilled: boolean
}

export const MAX_COMMENT_DEPTH = 5
export const MAX_COMMENT_LENGTH = 4000

/** Min approved-history count for trust-on-first-use auto-approval. */
const TRUST_THRESHOLD = 3
/** Spam if more than this many links — pure URL spam. */
const MAX_LINKS_BEFORE_SPAM = 2
/** Drop to spam at this external spam-score threshold. */
const SPAM_SCORE_CUTOFF = 80

export function classifyComment(signals: CommentSignals): ModerationStatus {
  // 1. Bot trap first — silent spam, never reach the queue.
  if (signals.honeypotFilled) return 'spam'

  // 2. Editors and admins are trusted authors.
  if (signals.role === 'admin' || signals.role === 'editor') return 'approved'

  // 3. Cheap structural spam heuristics.
  if (signals.linkCount > MAX_LINKS_BEFORE_SPAM) return 'spam'
  if (signals.spamScore !== null && signals.spamScore >= SPAM_SCORE_CUTOFF) return 'spam'

  // 4. Trust-on-first-use: established commenters skip the queue. Only
  //    counts authenticated users — guests can't accumulate history.
  if (signals.role && signals.approvedHistoryCount >= TRUST_THRESHOLD) {
    return 'approved'
  }

  // 5. Default: hold for editor review.
  return 'pending'
}

/**
 * Renders a comment body to safe HTML. Markdown subset only — no raw HTML, no
 * scripts. Links are auto-linkified and forced to `rel="ugc nofollow"`.
 *
 * The renderer is intentionally conservative — the comment field is the
 * highest-risk surface on the site for XSS. If you need richer formatting,
 * swap in `marked` + DOMPurify, but keep the rel="ugc nofollow" enforcement
 * because it is the only thing standing between you and SEO link-farms.
 */
export function renderCommentBody(input: string): { html: string; linkCount: number } {
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Paragraphs from blank lines.
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`)
    .join('')

  // Auto-linkify bare http(s) URLs.
  const URL_RE = /\bhttps?:\/\/[^\s<]+/g
  let linkCount = 0
  const html = paragraphs.replace(URL_RE, (m) => {
    linkCount += 1
    return `<a href="${m}" rel="ugc nofollow noopener" target="_blank">${m}</a>`
  })

  return { html, linkCount }
}

/**
 * SHA-256 hex digest. Used to derive a stable identifier for an email or IP
 * without storing the raw value.
 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
