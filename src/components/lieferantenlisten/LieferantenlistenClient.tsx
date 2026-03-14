'use client'

import { useState } from 'react'
import { Mail, Calendar, Download, Inbox } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'

const LIEFERANTEN = [
  { key: 'blank',        label: 'Blank' },
  { key: 'a43-kulturgut', label: 'A43-Kulturgut' },
  { key: 'avus',         label: 'Avus' },
]

interface ListEntry {
  id: string
  filename: string
  received_at: string
  email_from: string
}

// Placeholder — wird später via API befüllt
const MOCK_DATA: Record<string, ListEntry[]> = {
  blank: [],
  'a43-kulturgut': [],
  avus: [],
}

export function LieferantenlistenClient() {
  const [activeTab, setActiveTab] = useState('blank')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Lieferantenlisten</h1>
        <p className="text-muted-foreground mt-1">
          Automatisch per E-Mail aktualisierte Listen — sortiert nach Eingang
        </p>
      </div>

      {/* Info Banner */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          Sobald eine E-Mail mit Lieferantenliste eingeht, verarbeitet N8N die Datei automatisch
          und stellt sie hier mit Eingangsdatum bereit.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {LIEFERANTEN.map((l) => (
            <TabsTrigger key={l.key} value={l.key}>
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {LIEFERANTEN.map((lieferant) => {
          const entries = MOCK_DATA[lieferant.key] ?? []
          return (
            <TabsContent key={lieferant.key} value={lieferant.key} className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                    {lieferant.label} ({entries.length})
                  </h2>
                  <Badge variant={entries.length > 0 ? 'default' : 'secondary'}>
                    {entries.length} {entries.length === 1 ? 'Datei' : 'Dateien'}
                  </Badge>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dateiname</TableHead>
                        <TableHead>E-Mail von</TableHead>
                        <TableHead>Eingegangen</TableHead>
                        <TableHead className="text-center">Download</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <EmptyState lieferant={lieferant.label} />
                          </TableCell>
                        </TableRow>
                      ) : (
                        entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">{entry.filename}</TableCell>
                            <TableCell className="text-muted-foreground">{entry.email_from}</TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(entry.received_at).toLocaleString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button variant="ghost" size="sm" className="gap-1.5">
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

function EmptyState({ lieferant }: { lieferant: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">Noch keine Listen vorhanden</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobald eine E-Mail von <span className="font-medium">{lieferant}</span> eingeht, erscheint die Liste hier automatisch.
        </p>
      </div>
    </div>
  )
}
