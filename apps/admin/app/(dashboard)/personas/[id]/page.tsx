import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { agentPersonas } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { PersonaForm } from '@/components/personas/persona-form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditPersonaPage({ params }: Props) {
  const { id } = await params
  const db = await getDb()

  const [persona] = await db.select().from(agentPersonas).where(eq(agentPersonas.id, id))
  if (!persona) notFound()

  return (
    <>
      <PageHeader
        title={persona.displayName}
        description={
          <>
            <span className="font-mono text-xs">{persona.slug}</span>
            {!persona.active && (
              <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Disabled
              </span>
            )}
          </>
        }
      />
      <PersonaForm initial={persona} />
    </>
  )
}
