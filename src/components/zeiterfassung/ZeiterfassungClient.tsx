'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZeitDashboard } from './ZeitDashboard'
import { Schichtplanung } from './Schichtplanung'
import { ZeitKorrektur } from './ZeitKorrektur'
import { PauschaleStunden } from './PauschaleStunden'
import { EigeneZeiten } from './EigeneZeiten'
import { Einstellungen } from './Einstellungen'

interface Props {
  initialRole: 'admin' | 'staff'
  kioskRegisterUrl: string | null
}

const VALID_TABS = ['dashboard', 'planung', 'korrektur', 'pauschal', 'einstellungen']

export function ZeiterfassungClient({ initialRole, kioskRegisterUrl }: Props) {
  const [tab, setTab] = useState('dashboard')

  // Deep-Link: ?tab=korrektur o.ä. (z. B. aus dem Notification-Center)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && VALID_TABS.includes(t)) setTab(t)
  }, [])

  if (initialRole === 'staff') {
    return <EigeneZeiten />
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="planung">Schichtplanung</TabsTrigger>
        <TabsTrigger value="korrektur">Stempelzeiten</TabsTrigger>
        <TabsTrigger value="pauschal">Pauschale Stunden</TabsTrigger>
        <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        <ZeitDashboard />
      </TabsContent>

      <TabsContent value="planung">
        <Schichtplanung />
      </TabsContent>

      <TabsContent value="korrektur">
        <ZeitKorrektur />
      </TabsContent>

      <TabsContent value="pauschal">
        <PauschaleStunden />
      </TabsContent>

      <TabsContent value="einstellungen">
        <Einstellungen kioskRegisterUrl={kioskRegisterUrl} />
      </TabsContent>
    </Tabs>
  )
}
