/**
 * Comment moderation policy.
 *
 * Decides the initial moderation `status` for a freshly-submitted comment.
 * Returning `'approved'` makes the comment immediately visible. Returning
 * `'pending'` puts it in the editor queue.
 *
 * The signal set you have to work with:
 *   - role         — null for guests, otherwise 'commenter' | 'author' | 'editor' | 'admin'
 *   - approvedHistoryCount — # of previously-approved comments by this user
 *   - bodyLength   — pre-render character count
 *   - linkCount    — number of <a href> tags in the rendered HTML
 *   - spamScore    — 0..100 from your spam check (Akismet-like), or null if unchecked
 *   - hasCaptcha   — whether the request carried a verified hCaptcha/Turnstile token
 *
 * The default policy below errs on the side of caution (queue everything from
 * guests). Tune this to match your audience and editorial bandwidth.
 */

export type ModerationStatus = 'pending' | 'approved' | 'spam' | 'rejected'

export interface CommentSignals {
  role: 'commenter' | 'author' | 'editor' | 'admin' | null
  approvedHistoryCount: number
  bodyLength: number
  linkCount: number
  spamScore: number | null
  hasCaptcha: boolean
}

export const MAX_COMMENT_DEPTH = 5
export const MAX_COMMENT_LENGTH = 4000

/**
 * TODO(human): implement the initial-status policy.
 *
 * Tradeoffs to consider:
 *   1. Strict (queue everything) — safest; community must wait, editors do all the work.
 *   2. Trust-on-first-use      — auto-approve once a user has N approved comments.
 *      Cheap, intuitive, but a single approved spammer becomes harder to detect.
 *   3. Spam-score-gated         — auto-approve when score < threshold AND no links.
 *      Only works if you have COMMENT_SPAM_API_KEY wired up.
 *   4. Privileged-only auto    — only editors/admins skip moderation. Cleanest
 *      for small sites; queue is the unit of editorial control.
 *
 * Whatever you pick, return one of: 'pending' | 'approved' | 'spam'.
 * (Don't return 'rejected' here — that is an editorial action, not an
 * automatic state.) Mark obviously-bad submissions ('spam') so they don't
 * pollute the moderation queue.
 *
 * Suggested default if you want to ship now: 'pending' for everything except
 * editors/admins. Replace this stub before opening comments to readers.
 */
export function classifyComment(signals: CommentSignals): ModerationStatus {
  if (signals.role === 'admin' || signals.role === 'editor') return 'approved'
  // Stub: hold for review. See TODO(human) above for the policy decision.
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
