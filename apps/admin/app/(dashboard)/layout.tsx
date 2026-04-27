import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createDb } from '@teguns/db'
import { validateSession, type SessionDb } from '@teguns/auth'
import { SidebarNav } from '@/components/sidebar-nav'
import { LogoutButton } from '@/components/logout-button'

export const dynamic = 'force-dynamic'

async function requireSession() {
  const c = await cookies()
  const token =
    c.get('tegunews_session')?.value ??
    c.get('better-auth.session_token')?.value ??
    c.get('__Secure-better-auth.session_token')?.value

  if (!token) redirect('/login')
  const sessionToken = token.split('.')[0]!

  let session: Awaited<ReturnType<typeof validateSession>> | null = null
  let cfContextAvailable = true
  try {
    const { env } = await getCloudflareContext()
    const db = createDb(env.DB) as unknown as SessionDb
    session = await validateSession(sessionToken, db)
  } catch {
    cfContextAvailable = false
  }

  if (!cfContextAvailable && process.env.NODE_ENV === 'production') redirect('/login')
  if (!cfContextAvailable) return null
  if (!session) redirect('/login')
  if (session.user.role === 'commenter') {
    // commenters have no admin surface — bounce them to the public site.
    redirect(process.env.WEB_APP_URL ?? '/')
  }

  return session
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const userLabel = session?.user?.email ?? null
  const userRole = session?.user?.role ?? null

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="flex">
        <aside className="sticky top-0 min-h-screen w-60 shrink-0 border-r border-zinc-200 bg-white p-4">
          <div className="mb-6 flex items-center gap-2 px-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-xs font-semibold text-white">
              N
            </div>
            <p className="font-semibold tracking-tight">TeguNews</p>
          </div>
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-3">
            <p className="text-xs text-muted-foreground">Newsroom Console</p>
            <div className="flex items-center gap-3 text-xs">
              {userLabel && (
                <div className="flex items-center gap-2">
                  {userRole && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-700">
                      {userRole}
                    </span>
                  )}
                  <span className="font-medium text-zinc-700">{userLabel}</span>
                </div>
              )}
              <div className="h-4 w-px bg-zinc-200" />
              <LogoutButton />
            </div>
          </header>
          <div className="mx-auto max-w-7xl p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
