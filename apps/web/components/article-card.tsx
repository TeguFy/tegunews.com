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
      className={`group flex flex-col ${
        isLede
          ? 'md:flex-row md:items-stretch md:gap-8'
          : 'overflow-hidden rounded-xl border border-border bg-background/50 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-background hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]'
      }`}
    >
      <Link
        href={href}
        className={`relative block overflow-hidden bg-muted ${
          isLede ? 'aspect-[4/3] rounded-xl md:w-[58%]' : 'aspect-video'
        }`}
      >
        {article.featuredImage ? (
          <Image
            src={article.featuredImage}
            alt={article.featuredImageAlt ?? article.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            sizes={isLede ? '(max-width: 768px) 100vw, 720px' : '(max-width: 768px) 100vw, 400px'}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/30" />
        )}
        {isBreaking && (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-sm">
            Breaking
          </span>
        )}
      </Link>

      <div className={`flex flex-1 flex-col ${isLede ? 'pt-5 md:pt-2' : 'p-5'}`}>
        <Link href={href} className="block">
          <h3
            className={`font-serif font-bold leading-[1.18] tracking-tight text-foreground transition-colors group-hover:text-primary ${
              isLede ? 'text-[1.7rem] md:text-[2.25rem]' : 'text-xl'
            }`}
          >
            {article.title}
          </h3>
        </Link>

        {article.excerpt && (
          <p
            className={`mt-3 leading-relaxed text-muted-foreground line-clamp-3 ${
              isLede ? 'text-base md:text-lg' : 'text-sm'
            }`}
          >
            {article.excerpt}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          {article.publishedAt && (
            <time dateTime={article.publishedAt.toISOString()} className="font-medium">
              {article.publishedAt.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            </time>
          )}
          {article.commentCount > 0 && (
            <>
              <span aria-hidden className="text-border">•</span>
              <span className="inline-flex items-center gap-1">
                <CommentGlyph className="size-3" />
                {article.commentCount}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function CommentGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7l-3 2v-2a3 3 0 0 1-2-3V5Z" strokeLinejoin="round" />
    </svg>
  )
}
