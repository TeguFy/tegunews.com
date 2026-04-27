import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Props { locale: string }

export function Footer({ locale }: Props) {
  const t = useTranslations('footer')
  const tSite = useTranslations('site')
  const base = `/${locale}`
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <p className="font-extrabold tracking-tight">{tSite('name')}</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t('company')}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link href={`${base}/about`} className="hover:text-foreground">{t('about')}</Link></li>
              <li><Link href={`${base}/contact`} className="hover:text-foreground">{t('contact')}</Link></li>
              <li><Link href={`${base}/corrections`} className="hover:text-foreground">{t('corrections')}</Link></li>
              <li><Link href={`${base}/ethics`} className="hover:text-foreground">{t('ethics')}</Link></li>
              <li><Link href="/feed.xml" className="hover:text-foreground">{t('rss')}</Link></li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t('legal')}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link href={`${base}/privacy`} className="hover:text-foreground">{t('privacy')}</Link></li>
              <li><Link href={`${base}/terms`} className="hover:text-foreground">{t('terms')}</Link></li>
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          © {year} {tSite('name')}. {t('rights')}
        </p>
      </div>
    </footer>
  )
}
