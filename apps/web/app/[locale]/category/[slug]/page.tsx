import { notFound } from 'next/navigation'
import { fetchArticlesByCategory } from '@/lib/posts'
import { ArticleCard } from '@/components/article-card'

export const revalidate = 600

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params
  const result = await fetchArticlesByCategory(locale, slug, 1)
  if (!result) return {}
  return {
    title: result.category.seoTitle ?? result.category.name,
    description: result.category.seoDesc ?? result.category.description,
  }
}

export default async function CategoryPage({ params }: Props) {
  const { locale, slug } = await params
  const result = await fetchArticlesByCategory(locale, slug)
  if (!result) notFound()

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 border-b border-border pb-8">
        <p className="kicker text-primary">Category</p>
        <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-tight md:text-5xl">
          {result.category.name}
        </h1>
        {result.category.description && (
          <p className="mt-3 max-w-2xl font-serif text-lg italic text-muted-foreground">
            {result.category.description}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {result.posts.map((p) => (
          <ArticleCard key={p.id} locale={locale} article={p} />
        ))}
      </div>
    </main>
  )
}
