import { logout } from '@/app/actions/logout'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        Sign out
      </button>
    </form>
  )
}
