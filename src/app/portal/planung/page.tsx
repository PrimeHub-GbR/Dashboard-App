import { PortalHeader } from '@/components/zeiterfassung/portal/PortalHeader'
import { PortalAvailability } from '@/components/zeiterfassung/portal/PortalAvailability'

export const metadata = { title: 'Wochenplanung — PrimeHub' }

export default function PortalPlanungPage() {
  return (
    <div className="min-h-screen bg-background">
      <PortalHeader />
      <PortalAvailability />
    </div>
  )
}
