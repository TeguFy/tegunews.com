import Link from 'next/link'
import Image from 'next/image'

export interface ArticleCardData {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featuredImage: string | null
  featuredImageAlt: string | null
  featured: boolean
  breakingUntil: Date | null
  publishedAt: Date | null
  commentCount: number
}

interface Props {
  locale: string
  article: ArticleCardData
  variant?: 'default' | 'lede'
}

export function ArticleCard({ article, locale, variant = 'default' }: Props) {
  const href = `/${locale}/news/${article.slug}`
  const isLede = variant === 'lede'
  const isBreaking = article.breakingUntil ? article.breakingUntil > new Date() : false

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md ${isLede ? 'md:flex-row md:gap-6 md:rounded-xl md:border-0 md:shadow-none' : ''}`}
    >
      <Link href={href} className={`relative block aspect-video overflow-hidden bg-muted ${isLede ? 'md:aspect-[4/3] md:w-1/2' : ''}`}>
        {article.featuredImage ? (
          <Image
            src={article.featuredImage}
            alt={article.featuredImageAlt ?? article.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes={isLede ? '(max-width: 768px) 100vw, 600px' : '(max-width: 768px) 100vw, 400px'}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/40" />
        )}
        {isBreaking && (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
            BREAKING
          </span>
        )}
      </Link>

      <div className={`flex flex-1 flex-col p-4 ${isLede ? 'md:p-0' : ''}`}>
        <Link href={href} className="block">
          <h3 className={`font-bold leading-snug tracking-tight transition-colors group-hover:text-primary ${isLede ? 'text-2xl md:text-3xl' : 'text-base'}`}>
            {article.title}
          </h3>
        </Link>

        {article.excerpt && (
          <p className={`mt-2 text-sm text-muted-foreground ${isLede ? 'md:text-base' : ''} line-clamp-3`}>
            {article.excerpt}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {article.publishedAt && (
            <time dateTime={article.publishedAt.toISOString()}>
              {article.publishedAt.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            </time>
          )}
          {article.commentCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{article.commentCount} comments</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
