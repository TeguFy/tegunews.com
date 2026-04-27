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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={base} className="text-lg font-extrabold tracking-tight">
          {tSite('name')}
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
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
          <input
            type="search"
            name="q"
            placeholder={t('search')}
            aria-label={t('search')}
            className="h-8 w-44 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
      </div>
    </header>
  )
}
