/**
 * Output safety filter for LLM-generated comment text.
 *
 * The generator runs in privileged context (it inserts comments as the
 * persona's user, bypassing guest moderation). That makes it the single
 * most dangerous attack surface in the codebase: a prompt-injected article
 * could in principle make the LLM emit slurs, PII, link-farm text, or
 * brand-damaging content — and we'd publish it.
 *
 * This module is the last gate before insert. It returns either:
 *   - { ok: true, body } — safe; the generator inserts as-is.
 *   - { ok: false, reason } — discard the output entirely (no fallback to
 *     pending; we don't want to give an attacker a way to flood the
 *     moderation queue either).
 *
 * Rules are intentionally conservative — false positives (rejecting good
 * comments) cost us a missed seed; false negatives (accepting bad
 * comments) cost reader trust.
 */
export interface SafetyResult {
  ok: boolean
  reason?: string
  /** Sanitised body if ok=true. */
  body?: string
}

const MAX_LINKS = 1
const MAX_LENGTH = 1400
const MIN_LENGTH = 30

// Hard-block patterns. Non-exhaustive on purpose — safety here is "be
// boringly conservative", not "catch every possible slur". Editors review
// random samples of generated output via the audit log.
const BLOCKLIST_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(as an? (?:ai|language model|llm)|i am an? ai|i'?m an? ai)\b/i, reason: 'broke_character' },
  { re: /\b(?:click here|visit my|check out my|buy now|limited offer)\b/i, reason: 'spam_phrase' },
  { re: /\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/, reason: 'phone_number' },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, reason: 'email_address' },
  // Crude PII sniff — SSN-shaped sequences. Llama doesn't usually invent
  // these, but if a prompt-injected article tricks it, we don't want to
  // amplify.
  { re: /\b\d{3}-\d{2}-\d{4}\b/, reason: 'ssn_shaped' },
]

export function checkCommentSafety(raw: string): SafetyResult {
  const trimmed = raw.trim()
  if (trimmed.length < MIN_LENGTH) return { ok: false, reason: 'too_short' }
  if (trimmed.length > MAX_LENGTH) return { ok: false, reason: 'too_long' }

  for (const { re, reason } of BLOCKLIST_PATTERNS) {
    if (re.test(trimmed)) return { ok: false, reason }
  }

  const linkCount = (trimmed.match(/https?:\/\/\S+/g) ?? []).length
  if (linkCount > MAX_LINKS) return { ok: false, reason: 'too_many_links' }

  // Strip stray markdown fences the LLM sometimes wraps around output even
  // after JSON-mode prompting.
  const cleaned = trimmed
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^"+|"+$/g, '')
    .trim()

  return { ok: true, body: cleaned }
}

/**
 * Pulls the `comment` field out of a JSON-mode LLM response. Tolerates a
 * surprising amount of model misbehaviour (unfenced JSON, wrapped in
 * prose, double-encoded strings).
 */
export function extractCommentText(raw: string): string | null {
  const t = raw.trim()
  // Direct JSON parse first.
  try {
    const obj = JSON.parse(t)
    if (typeof obj?.comment === 'string') return obj.comment
  } catch {
    // fall through
  }
  // Strip markdown fence + retry.
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) {
    try {
      const obj = JSON.parse(fenced[1]!)
      if (typeof obj?.comment === 'string') return obj.comment
    } catch {
      // fall through
    }
  }
  // Last resort: regex out a "comment": "..." pair, tolerating escaped quotes.
  const m = t.match(/"comment"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (m) {
    try {
      return JSON.parse(`"${m[1]}"`)
    } catch {
      return m[1] ?? null
    }
  }
  // If nothing matched but the response looks like a plain comment, accept it.
  if (t.length > 0 && t.length < 2000 && !t.includes('{')) return t
  return null
}
