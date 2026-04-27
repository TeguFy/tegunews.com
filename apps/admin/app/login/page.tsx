/**
 * Login page — placeholder. Wire up your Better Auth client here, or implement
 * your preferred sign-in flow. The admin uses session cookies (see
 * apps/admin/lib/admin-session.ts) — Better Auth's email+password flow already
 * sets the cookie this codebase reads.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        TODO: wire up Better Auth's `signIn.email` client call here.
      </p>
    </main>
  )
}
