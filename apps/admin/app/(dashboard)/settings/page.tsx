import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from '@/components/settings/profile-form'
import { PasswordForm } from '@/components/settings/password-form'
import { getAdminSession } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getAdminSession()
  if (!session) redirect('/login')

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and account security. Site-wide settings live elsewhere."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ProfileForm
          initialName={session.user.name}
          email={session.user.email}
          role={session.user.role}
        />
        <PasswordForm />
      </div>
    </>
  )
}
