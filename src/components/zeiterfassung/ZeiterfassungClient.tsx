'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZeitDashboard } from './ZeitDashboard'
import { Schichtplanung } from './Schichtplanung'
import { ZeitKorrektur } from './ZeitKorrektur'
import { EigeneZeiten } from './EigeneZeiten'
import { Einstellungen } from './Einstellungen'

interface Props {
  initialRole: 'admin' | 'staff'
}

export function ZeiterfassungClient({ initialRole }: Props) {
  if (initialRole === 'staff') {
    return <EigeneZeiten />
  }

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="planung">Schichtplanung</TabsTrigger>
        <TabsTrigger value="korrektur">Stempelzeiten</TabsTrigger>
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

      <TabsContent value="einstellungen">
        <Einstellungen />
      </TabsContent>
    </Tabs>
  )
}
