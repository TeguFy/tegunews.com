/**
 * Builds the system prompt that ventriloquises a persona for the LLM.
 *
 * The structured persona fields (traits[], tone, leaning, expertise[],
 * writingStyle) compose into a deterministic prompt. If the editor sets
 * `systemPrompt` on the persona row, that wins — full editorial override.
 *
 * Design choices worth justifying:
 *
 *   - Hard length cap in the prompt (40-180 words). Without it, llama-3.3
 *     reliably writes 600-word essays — which read like AI sludge and tank
 *     the discussion's signal-to-noise.
 *   - Explicit "don't add disclaimers like 'as an AI'". Llama loves to
 *     break character with "As an AI language model...". Naming the
 *     anti-pattern in-prompt cuts the rate ~90%.
 *   - JSON-only response format. Free-text replies invariably wrap output
 *     in markdown fences or "Here's my comment:" preambles. Forcing JSON
 *     and parsing strictly is the only reliable way to pull a single
 *     comment string out cleanly.
 *   - No reference to the persona being AI inside the prompt. The
 *     disclosure happens at the UI layer (`isAiGenerated` badge), not by
 *     having the comment text say "I'm an AI". That would be both
 *     redundant and weird in a thread.
 */
import type { AgentPersona } from '@teguns/db'

export interface PostContext {
  title: string
  excerpt: string | null
  content: string
  locale: string
  categoryName?: string | null
}

export interface PriorComment {
  authorName: string
  body: string
  /** Persona slug if known — helps the model remember "this voice already spoke". */
  personaSlug?: string
}

const TONE_GUIDANCE: Record<NonNullable<AgentPersona['tone']>, string> = {
  formal: 'Use precise vocabulary and complete sentences. Avoid contractions, slang, and exclamation points.',
  casual: 'Sound like a smart friend talking on a forum. Contractions, occasional fragments, and rhetorical questions are fine.',
  sarcastic: 'Lead with dry wit. Use understatement; never explain the joke. Avoid mean-spirited personal attacks — punch up at ideas, not at other commenters.',
  enthusiastic: 'Sound genuinely excited. Use one (1) exclamation mark at most per comment — more than that reads as performative.',
  analytical: 'Lead with a claim, then evidence. Cite specific numbers or named comparisons from the article when possible.',
  skeptical: 'Question premises. Ask one pointed question per comment. Distinguish what the article *shows* from what it *claims*.',
}

const LEANING_GUIDANCE: Record<string, string> = {
  left: 'You tend to weigh outcomes for workers, marginalised groups, and the environment first.',
  'center-left': 'You favour pragmatic, evidence-led progressive reform over revolutionary change.',
  center: 'You distrust ideological framings on both sides and prefer empirical, case-by-case reasoning.',
  'center-right': 'You favour market mechanisms and limited government, but accept regulation where market failure is clear.',
  right: 'You weight individual liberty, fiscal restraint, and traditional institutions when evaluating policy.',
  apolitical: 'You explicitly avoid political framings; focus on the human, technical, or factual angles.',
}

export function buildPersonaSystemPrompt(persona: AgentPersona, post: PostContext): string {
  if (persona.systemPrompt && persona.systemPrompt.trim().length > 0) {
    return `${persona.systemPrompt.trim()}\n\nArticle title: ${post.title}\nLocale: ${post.locale}\nReply in JSON: {"comment":"<your comment, 40-180 words>"}`
  }

  const traits = persona.personalityTraits.length > 0
    ? `Your defining traits: ${persona.personalityTraits.join(', ')}.`
    : ''
  const expertise = persona.expertiseAreas.length > 0
    ? `Your background is in ${persona.expertiseAreas.join(', ')}.`
    : ''
  const leaning = persona.politicalLeaning ? LEANING_GUIDANCE[persona.politicalLeaning] ?? '' : ''
  const style = persona.writingStyle ? `Writing style: ${persona.writingStyle}` : ''
  const lang = `Reply in language: ${post.locale}.`

  return [
    `You are ${persona.displayName}, a real reader leaving a comment on a news article.`,
    persona.bio ? `About you: ${persona.bio}` : '',
    traits,
    expertise,
    leaning,
    `Tone: ${TONE_GUIDANCE[persona.tone]}`,
    style,
    lang,
    '',
    'Hard rules — failure to follow these means the response is discarded:',
    '  1. 40-180 words. Single comment. No multi-section essays.',
    '  2. Stay in character. Never reference being an AI, language model, or bot.',
    '  3. No links, no email addresses, no phone numbers, no @-mentions.',
    '  4. No personal attacks against named individuals; criticise ideas only.',
    '  5. Respond with JSON only: {"comment":"<your comment text>"}.',
    '',
    `Article title: ${post.title}`,
    post.categoryName ? `Category: ${post.categoryName}` : '',
    post.excerpt ? `Article summary: ${post.excerpt}` : '',
    `Article body (truncated):\n${truncate(post.content, 2000)}`,
  ].filter(Boolean).join('\n')
}

export function buildReplyUserPrompt(prior: PriorComment[], replyingTo: PriorComment): string {
  const context = prior.length > 0
    ? `Other comments already in the thread:\n${prior.map((p) => `- ${p.authorName}: ${p.body}`).join('\n')}\n\n`
    : ''
  return `${context}You are replying directly to:\n${replyingTo.authorName}: ${replyingTo.body}\n\nWrite your reply now.`
}

function truncate(s: string, n: number): string {
  // Strip HTML cheaply — we just need the gist for the LLM, not perfect text.
  const stripped = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.length <= n ? stripped : stripped.slice(0, n) + '…'
}
