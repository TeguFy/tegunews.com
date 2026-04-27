import type { PostTranslation } from '@teguns/db'
import { SEO_LIMITS } from '../constants'
import { countWords, calculateKeywordDensity } from '../analyzers/content'
import type { ValidationError } from './post'

export function validateTranslationForPublish(tr: PostTranslation): ValidationError[] {
  const errors: ValidationError[] = []
  if (!tr.title || tr.title.length < SEO_LIMITS.titleMin)
    errors.push({ field: 'title', message: `Title min ${SEO_LIMITS.titleMin} chars` })
  if (tr.title && tr.title.length > SEO_LIMITS.titleMax)
    errors.push({ field: 'title', message: `Title max ${SEO_LIMITS.titleMax} chars` })
  if (!tr.slug || !/^[a-z0-9-]+$/.test(tr.slug))
    errors.push({ field: 'slug', message: 'Slug must be kebab-case' })
  if (tr.slug && tr.slug.length > SEO_LIMITS.slugMax)
    errors.push({ field: 'slug', message: `Slug max ${SEO_LIMITS.slugMax} chars` })

  if (!tr.seoTitle) errors.push({ field: 'seoTitle', message: 'SEO title required' })
  else {
    if (tr.seoTitle.length < SEO_LIMITS.seoTitleMin)
      errors.push({ field: 'seoTitle', message: `SEO title ${tr.seoTitle.length}/${SEO_LIMITS.seoTitleMin} min` })
    if (tr.seoTitle.length > SEO_LIMITS.seoTitleMax)
      errors.push({ field: 'seoTitle', message: `SEO title ${tr.seoTitle.length}/${SEO_LIMITS.seoTitleMax} max` })
  }

  if (!tr.seoDesc) errors.push({ field: 'seoDesc', message: 'SEO description required' })
  else {
    if (tr.seoDesc.length < SEO_LIMITS.seoDescMin)
      errors.push({ field: 'seoDesc', message: `SEO desc ${tr.seoDesc.length}/${SEO_LIMITS.seoDescMin} min` })
    if (tr.seoDesc.length > SEO_LIMITS.seoDescMax)
      errors.push({ field: 'seoDesc', message: `SEO desc ${tr.seoDesc.length}/${SEO_LIMITS.seoDescMax} max` })
  }

  if (!tr.focusKeyword) errors.push({ field: 'focusKeyword', message: 'Focus keyword required' })

  const wc = countWords(tr.content)
  if (wc < SEO_LIMITS.contentMinWords)
    errors.push({ field: 'content', message: `Content ${wc}/${SEO_LIMITS.contentMinWords} min words` })

  if (tr.focusKeyword) {
    const density = calculateKeywordDensity(tr.content, tr.focusKeyword)
    if (density > SEO_LIMITS.keywordDensityMax)
      errors.push({ field: 'content', message: `Keyword stuffing: ${density.toFixed(1)}% > ${SEO_LIMITS.keywordDensityMax}%` })
  }

  return errors
}
