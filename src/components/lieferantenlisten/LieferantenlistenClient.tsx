'use client'

import { useState } from 'react'
import { Package, Mail, Calendar, Download, RefreshCw } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

const LIEFERANTEN = [
  {
    key: 'blank',
    label: 'Blank',
    description: 'Lieferantenlisten von Blank — automatisch per E-Mail aktualisiert.',
    color: 'text-slate-300',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  },
  {
    key: 'a43-kulturgut',
    label: 'A43-Kulturgut',
    description: 'Lieferantenlisten von A43-Kulturgut — automatisch per E-Mail aktualisiert.',
    color: 'text-violet-300',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  {
    key: 'avus',
    label: 'Avus',
    description: 'Lieferantenlisten von Avus — automatisch per E-Mail aktualisiert.',
    color: 'text-rose-300',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  },
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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/8 border border-white/10">
          <Package className="h-5 w-5 text-white/60" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Lieferantenlisten</h1>
          <p className="text-sm text-white/50">
            Automatisch per E-Mail aktualisierte Listen — sortiert nach Eingang
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/8 px-4 py-3">
        <Mail className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-300/80">
          Sobald eine E-Mail mit Lieferantenliste eingeht, verarbeitet N8N die Datei automatisch
          und stellt sie hier mit Eingangsdatum bereit.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/6 border border-white/10 p-1">
          {LIEFERANTEN.map((l) => (
            <TabsTrigger
              key={l.key}
              value={l.key}
              className="data-[state=active]:bg-white/12 data-[state=active]:text-white text-white/50"
            >
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {LIEFERANTEN.map((lieferant) => {
          const entries = MOCK_DATA[lieferant.key] ?? []
          return (
            <TabsContent key={lieferant.key} value={lieferant.key} className="mt-4">
              <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
                {/* Tab Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                  <div>
                    <h2 className="text-sm font-semibold text-white">{lieferant.label}</h2>
                    <p className="text-xs text-white/45 mt-0.5">{lieferant.description}</p>
                  </div>
                  <Badge className={`text-[10px] border ${lieferant.badgeClass}`}>
                    {entries.length} {entries.length === 1 ? 'Datei' : 'Dateien'}
                  </Badge>
                </div>

                {/* Table */}
                {entries.length === 0 ? (
                  <EmptyState lieferant={lieferant.label} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-left">
                        <th className="px-5 py-3 text-[11px] font-medium text-white/35 uppercase tracking-wider">Dateiname</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-white/35 uppercase tracking-wider">E-Mail von</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-white/35 uppercase tracking-wider">Eingegangen</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-white/35 uppercase tracking-wider">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, i) => (
                        <tr key={entry.id} className={i % 2 === 0 ? 'bg-white/2' : ''}>
                          <td className="px-5 py-3 text-white/80 font-mono text-xs">{entry.filename}</td>
                          <td className="px-5 py-3 text-white/50 text-xs">{entry.email_from}</td>
                          <td className="px-5 py-3 text-white/50 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3 w-3" />
                              {new Date(entry.received_at).toLocaleString('de-DE', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <button className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
                              <Download className="h-3 w-3" />
                              Download
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/6">
        <RefreshCw className="h-5 w-5 text-white/30" />
      </div>
      <div>
        <p className="text-sm font-medium text-white/50">Noch keine Listen vorhanden</p>
        <p className="mt-1 text-xs text-white/30">
          Sobald eine E-Mail von {lieferant} eingeht, erscheint die Liste hier automatisch.
        </p>
      </div>
    </div>
  )
}
