import type { Post } from '@teguns/db'
import { SEO_LIMITS } from '../constants'

export interface ValidationError {
  field: string
  message: string
}

export function validatePostForPublish(post: Post): ValidationError[] {
  const errors: ValidationError[] = []
  if (!post.featuredImage) errors.push({ field: 'featuredImage', message: 'Featured image required' })
  if (!post.featuredImageAlt) errors.push({ field: 'featuredImageAlt', message: 'Alt text required' })
  if (post.featuredImageAlt && post.featuredImageAlt.length > SEO_LIMITS.altTextMax)
    errors.push({ field: 'featuredImageAlt', message: `Alt text > ${SEO_LIMITS.altTextMax} chars` })
  if (!post.categoryId) errors.push({ field: 'categoryId', message: 'Category required' })
  return errors
}
