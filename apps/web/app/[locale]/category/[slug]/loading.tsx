export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      {/* Header skeleton */}
      <header className="mb-10 border-b border-border pb-8">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-10 w-2/3 animate-pulse rounded bg-muted md:h-12" />
        <div className="mt-4 h-5 w-1/2 animate-pulse rounded bg-muted/70" />
      </header>

      {/* Filter bar skeleton */}
      <div className="mb-8 flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex gap-6">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="hidden h-3 w-28 animate-pulse rounded bg-muted/60 md:block" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <article
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-background/50"
          >
            <div className="aspect-video animate-pulse bg-muted" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-muted/70" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted/70" />
              </div>
              <div className="pt-3">
                <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
