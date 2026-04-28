'use client'

/**
 * Social share buttons for article pages.
 *
 * Renders explicit per-network buttons (Facebook, X, LinkedIn, Telegram, Email,
 * Copy link) plus a native Share button on mobile that opens the OS share
 * sheet — that's how Zalo, Messenger, and other locale-specific networks get
 * reached without us hard-coding their URL schemes.
 *
 * The static URLs use HTTP intent links that don't need a network SDK or
 * tracking pixel — keeps the page free of third-party scripts.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  url: string
  title: string
  /** Optional one-line summary used by email + LinkedIn. Falls back to title. */
  summary?: string
  className?: string
}

export function ShareButtons({ url, title, summary, className }: Props) {
  const t = useTranslations('share')
  const [copied, setCopied] = useState(false)
  const [hasNativeShare, setHasNativeShare] = useState(false)

  useEffect(() => {
    setHasNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const enc = encodeURIComponent
  const desc = summary ?? title
  const intents = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    x:        `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    telegram: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
    email:    `mailto:?subject=${enc(title)}&body=${enc(`${desc}\n\n${url}`)}`,
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard.writeText can fail in older browsers — fall back to prompt
      window.prompt(t('copy'), url)
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ url, title, text: desc })
    } catch {
      // User cancelled — silent
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1 text-muted-foreground ${className ?? ''}`}
      role="group"
      aria-label={t('label')}
    >
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider">{t('label')}</span>

      <ShareLink href={intents.facebook} label={t('facebook')}><IconFacebook /></ShareLink>
      <ShareLink href={intents.x}        label={t('x')}>       <IconX /></ShareLink>
      <ShareLink href={intents.linkedin} label={t('linkedin')}><IconLinkedIn /></ShareLink>
      <ShareLink href={intents.telegram} label={t('telegram')}><IconTelegram /></ShareLink>
      <ShareLink href={intents.email}    label={t('email')} sameTab><IconEmail /></ShareLink>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? t('copied') : t('copy')}
        title={copied ? t('copied') : t('copy')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <IconCheck /> : <IconLink />}
      </button>

      {hasNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          aria-label={t('native')}
          title={t('native')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-foreground/70 transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <IconShare />
        </button>
      )}
    </div>
  )
}

function ShareLink({
  href, label, children, sameTab = false,
}: { href: string; label: string; children: React.ReactNode; sameTab?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target={sameTab ? undefined : '_blank'}
      rel="noopener noreferrer"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────
// Inline SVG (no extra deps). 16×16, currentColor.

function IconFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95Z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.358-7.014L4.6 22H1.342l8.025-9.16L1 2h7.014l4.847 6.41L18.244 2Zm-1.2 18h1.873L7.04 4H5.04l12.005 16Z" />
    </svg>
  )
}
function IconLinkedIn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.5 17v-7H6v7h2.5ZM7.25 8.6a1.45 1.45 0 1 1 0-2.9 1.45 1.45 0 0 1 0 2.9ZM18 17v-3.85c0-2.06-1.1-3.02-2.55-3.02-1.18 0-1.7.65-2 1.1V10H11v7h2.45v-3.7c0-.97.18-1.91 1.39-1.91 1.18 0 1.21 1.1 1.21 1.97V17H18Z" />
    </svg>
  )
}
function IconTelegram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.78 15.27 9.4 19.6c.55 0 .79-.24 1.08-.52l2.6-2.49 5.4 3.95c.99.55 1.7.26 1.96-.92l3.55-16.66c.32-1.46-.53-2.04-1.5-1.68L1.5 9.32C.07 9.88.1 10.66 1.27 11l4.94 1.54 11.46-7.22c.54-.36 1.03-.16.63.2L9.78 15.27Z" />
    </svg>
  )
}
function IconEmail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}
function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66L11 7" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66L13 17" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}
