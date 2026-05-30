import { PortalHeader } from '@/components/zeiterfassung/portal/PortalHeader'
import { PortalDashboard } from '@/components/zeiterfassung/portal/PortalDashboard'

export const metadata = { title: 'Übersicht — PrimeHub' }

export default function PortalDashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <PortalHeader />
      <PortalDashboard />
    </div>
  )
}
