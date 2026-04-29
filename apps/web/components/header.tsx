import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export function Header({ locale }: Props) {
  const t = useTranslations('nav')
  const tSite = useTranslations('site')
  const base = `/${locale}`

  const links = [
    { href: `${base}/category/world`, label: t('world') },
    { href: `${base}/category/tech`, label: t('tech') },
    { href: `${base}/category/business`, label: t('business') },
    { href: `${base}/category/opinion`, label: t('opinion') },
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <DateStrip locale={locale} />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href={base}
          className="font-serif text-2xl font-extrabold leading-none tracking-tight md:text-[1.75rem]"
        >
          {tSite('name')}
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative text-foreground/75 transition-colors hover:text-foreground after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-primary after:transition-all hover:after:w-full"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <form
          method="get"
          action={`${base}/search`}
          className="hidden md:flex"
          role="search"
        >
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder={t('search')}
              aria-label={t('search')}
              className="h-9 w-48 rounded-full border border-border bg-muted/40 pl-8 pr-3 text-sm transition focus:w-60 focus:border-foreground/30 focus:bg-background focus:outline-none"
            />
          </div>
        </form>
      </div>
    </header>
  )
}

function DateStrip({ locale }: { locale: string }) {
  const today = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <div className="hidden border-b border-border/60 bg-muted/30 md:block">
      <div className="mx-auto flex h-7 max-w-6xl items-center justify-between px-4 text-[11px] text-muted-foreground">
        <span className="kicker">{today}</span>
        <span className="kicker tracking-[0.22em]">EN · VI</span>
      </div>
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="7" cy="7" r="5" />
      <path d="m11 11 3 3" strokeLinecap="round" />
    </svg>
  )
}
