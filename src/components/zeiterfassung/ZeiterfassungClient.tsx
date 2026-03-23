'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZeitDashboard } from './ZeitDashboard'
import { LiveUebersicht } from './LiveUebersicht'
import { StundenUebersicht } from './StundenUebersicht'
import { Schichtplanung } from './Schichtplanung'
import { ZeitKorrektur } from './ZeitKorrektur'
import { MitarbeiterVerwaltung } from './MitarbeiterVerwaltung'
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
        <TabsTrigger value="live">Live-Übersicht</TabsTrigger>
        <TabsTrigger value="stunden">Stundenauswertung</TabsTrigger>
        <TabsTrigger value="planung">Schichtplanung</TabsTrigger>
        <TabsTrigger value="korrektur">Zeitkorrektur</TabsTrigger>
        <TabsTrigger value="mitarbeiter">Mitarbeiter</TabsTrigger>
        <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        <ZeitDashboard />
      </TabsContent>

      <TabsContent value="live">
        <LiveUebersicht />
      </TabsContent>

      <TabsContent value="stunden">
        <StundenUebersicht />
      </TabsContent>

      <TabsContent value="planung">
        <Schichtplanung />
      </TabsContent>

      <TabsContent value="korrektur">
        <ZeitKorrektur />
      </TabsContent>

      <TabsContent value="mitarbeiter">
        <MitarbeiterVerwaltung />
      </TabsContent>

      <TabsContent value="einstellungen">
        <Einstellungen />
      </TabsContent>
    </Tabs>
  )
}
