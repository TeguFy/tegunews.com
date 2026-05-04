'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem { href: string; label: string }
interface NavSection { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  { title: 'Overview', items: [{ href: '/', label: 'Dashboard' }] },
  {
    title: 'Content',
    items: [
      { href: '/posts', label: 'Articles' },
      { href: '/comments', label: 'Comments' },
      { href: '/media', label: 'Media' },
      { href: '/taxonomy', label: 'Taxonomy' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/users', label: 'Users' },
      { href: '/audit', label: 'Audit Log' },
      { href: '/settings', label: 'Settings' },
    ],
  },
  {
    title: 'AI',
    items: [{ href: '/personas', label: 'Personas' }],
  },
]

export function SidebarNav() {
  const pathname = usePathname()
  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
