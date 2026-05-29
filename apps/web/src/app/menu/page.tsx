import { redirect } from 'next/navigation'
import { getEffectiveOrganizationId, getSession } from '@iedora/product-menu/features/auth'
import { ONBOARDING_STEPS } from '@iedora/product-menu/features/menu-onboarding'
import LandingPage from './_components/landing/landing-page'

export default async function Home() {
  const session = await getSession()
  if (session) {
    const tenantId = await getEffectiveOrganizationId()
    if (!tenantId) redirect(ONBOARDING_STEPS.name.path)
    redirect('/menu/dashboard')
  }
  return <LandingPage />
}
