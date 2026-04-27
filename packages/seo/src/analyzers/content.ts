export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function countWords(content: string): number {
  const text = stripHtml(content)
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

export interface LinkCounts {
  internal: number
  external: number
}

export function extractLinks(html: string, siteOrigin: string): LinkCounts {
  let internal = 0
  let external = 0
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const href = match[1]
    if (href.startsWith('/') && !href.startsWith('//')) {
      internal++
    } else if (href.startsWith(siteOrigin)) {
      internal++
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      external++
    }
  }
  return { internal, external }
}

export interface Heading {
  level: number
  text: string
  id: string
}

export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  const re = /<h([1-6])(?:\s+([^>]*))?>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const level = Number(match[1])
    const attrs = match[2] || ''
    const text = stripHtml(match[3]).trim()
    const idMatch = attrs.match(/id=["']([^"']+)["']/)
    const id = idMatch ? idMatch[1] : slugify(text)
    headings.push({ level, text, id })
  }
  return headings
}

export function calculateKeywordDensity(content: string, keyword: string): number {
  if (!keyword) return 0
  const text = stripHtml(content).toLowerCase()
  const totalWords = text.split(/\s+/).filter(Boolean).length
  if (totalWords === 0) return 0

  const kw = keyword.toLowerCase()
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'g')
  const matches = text.match(re)
  const occurrences = matches ? matches.length : 0
  const kwWordCount = kw.split(/\s+/).length
  return (occurrences * kwWordCount / totalWords) * 100
}

export function calculateReadingTime(content: string, wpm = 220): number {
  const words = countWords(content)
  return Math.max(1, Math.ceil(words / wpm))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 80)
}
