import type { Post, PostTranslation } from '@teguns/db'
import { SEO_LIMITS, SEO_PENALTIES } from '../constants'
import { calculateKeywordDensity, countWords } from './content'

export interface SeoIssue {
  severity: 'error' | 'warning'
  field: string
  message: string
  penalty: number
}

export interface SeoScoreResult {
  score: number
  issues: SeoIssue[]
  passes: boolean
}

export function scoreSeo(post: Post, tr: PostTranslation): SeoScoreResult {
  const issues: SeoIssue[] = []

  if (!post.featuredImage) {
    issues.push({ severity: 'error', field: 'featuredImage',
      message: 'Featured image is required', penalty: SEO_PENALTIES.missingFeaturedImage })
  }
  if (!post.featuredImageAlt) {
    issues.push({ severity: 'error', field: 'featuredImageAlt',
      message: 'Alt text for featured image is required', penalty: SEO_PENALTIES.missingFeaturedImageAlt })
  }

  if (!post.categoryId) {
    issues.push({ severity: 'error', field: 'categoryId',
      message: 'Category is required', penalty: SEO_PENALTIES.missingCategory })
  }

  if (!tr.focusKeyword) {
    issues.push({ severity: 'error', field: 'focusKeyword',
      message: 'Focus keyword is required', penalty: SEO_PENALTIES.missingFocusKeyword })
  } else {
    const kw = tr.focusKeyword.toLowerCase()
    const titleLower = (tr.title || '').toLowerCase()
    if (!titleLower.includes(kw)) {
      issues.push({ severity: 'warning', field: 'title',
        message: `Focus keyword "${tr.focusKeyword}" missing from title`, penalty: SEO_PENALTIES.keywordNotInTitle })
    }
    const first100 = tr.content.split(/\s+/).slice(0, 100).join(' ').toLowerCase()
    if (!first100.includes(kw)) {
      issues.push({ severity: 'warning', field: 'content',
        message: 'Focus keyword missing from first 100 words', penalty: SEO_PENALTIES.keywordNotInFirst100Words })
    }
    const density = calculateKeywordDensity(tr.content, tr.focusKeyword)
    if (density > SEO_LIMITS.keywordDensityMax) {
      issues.push({ severity: 'warning', field: 'content',
        message: `Keyword density ${density.toFixed(1)}% > ${SEO_LIMITS.keywordDensityMax}% (stuffing)`, penalty: SEO_PENALTIES.keywordStuffing })
    }
  }

  if (tr.seoTitle) {
    const len = tr.seoTitle.length
    if (len < SEO_LIMITS.seoTitleMin)
      issues.push({ severity: 'warning', field: 'seoTitle',
        message: `SEO title ${len} chars (min ${SEO_LIMITS.seoTitleMin})`, penalty: SEO_PENALTIES.seoTitleTooShort })
    if (len > SEO_LIMITS.seoTitleMax)
      issues.push({ severity: 'warning', field: 'seoTitle',
        message: `SEO title ${len} chars (max ${SEO_LIMITS.seoTitleMax})`, penalty: SEO_PENALTIES.seoTitleTooLong })
  } else {
    issues.push({ severity: 'error', field: 'seoTitle',
      message: 'SEO title required', penalty: SEO_PENALTIES.seoTitleTooShort })
  }

  if (tr.seoDesc) {
    const len = tr.seoDesc.length
    if (len < SEO_LIMITS.seoDescMin)
      issues.push({ severity: 'warning', field: 'seoDesc',
        message: `SEO description ${len} chars (min ${SEO_LIMITS.seoDescMin})`, penalty: SEO_PENALTIES.seoDescTooShort })
    if (len > SEO_LIMITS.seoDescMax)
      issues.push({ severity: 'warning', field: 'seoDesc',
        message: `SEO description ${len} chars (max ${SEO_LIMITS.seoDescMax})`, penalty: SEO_PENALTIES.seoDescTooLong })
  } else {
    issues.push({ severity: 'error', field: 'seoDesc',
      message: 'SEO description required', penalty: SEO_PENALTIES.seoDescTooShort })
  }

  const wc = countWords(tr.content)
  if (wc < SEO_LIMITS.contentMinWords) {
    issues.push({ severity: 'error', field: 'content',
      message: `Content ${wc} words (min ${SEO_LIMITS.contentMinWords})`, penalty: SEO_PENALTIES.thinContent })
  }

  if (post.internalLinksCount < SEO_LIMITS.internalLinksMin) {
    issues.push({ severity: 'warning', field: 'content',
      message: `Add at least ${SEO_LIMITS.internalLinksMin} internal link to another article`, penalty: SEO_PENALTIES.noInternalLinks })
  }

  const totalPenalty = issues.reduce((sum, i) => sum + i.penalty, 0)
  const score = Math.max(0, 100 - totalPenalty)
  const passes = !issues.some(i => i.severity === 'error')

  return { score, issues, passes }
}
