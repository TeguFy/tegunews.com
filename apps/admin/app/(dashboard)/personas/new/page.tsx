import { PageHeader } from '@/components/page-header'
import { PersonaForm } from '@/components/personas/persona-form'

export const dynamic = 'force-dynamic'

export default function NewPersonaPage() {
  return (
    <>
      <PageHeader
        title="New persona"
        description="Define a virtual commenter. Comments authored by this persona are auto-disclosed."
      />
      <PersonaForm isCreate />
    </>
  )
}
