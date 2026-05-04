import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

interface Props {
  locale: string
  message?: string
  hint?: string
}

export async function EmptyState({ locale, message, hint }: Props) {
  const t = await getTranslations({ locale, namespace: 'listing' })
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto mb-6 size-12 rounded-full border border-border/70" aria-hidden />
      <p className="font-serif text-lg text-foreground">{message ?? t('empty')}</p>
      <p className="mt-2 text-sm text-muted-foreground">{hint ?? t('emptyHint')}</p>
      <Link
        href={`/${locale}`}
        className="mt-6 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('backHome')}
      </Link>
    </div>
  )
}
