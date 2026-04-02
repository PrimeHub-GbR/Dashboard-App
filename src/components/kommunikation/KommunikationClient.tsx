'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle } from 'lucide-react'
import { NachrichtFormular } from './NachrichtFormular'
import { VersandHistorie } from './VersandHistorie'
import type { SelectableEmployee } from './EmpfaengerSelector'

export function KommunikationClient() {
  const [employees, setEmployees] = useState<SelectableEmployee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [n8nUnconfigured, setN8nUnconfigured] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/organisation/members')
        if (!res.ok) return
        const data = await res.json() as {
          members: Array<{ id: string; name: string; phone?: string | null; is_active?: boolean }>
        }
        setEmployees(data.members.map((e) => ({
          id: e.id,
          name: e.name,
          phone: e.phone ?? null,
          is_active: e.is_active !== false,
        })))
      } finally {
        setLoadingEmployees(false)
      }
    }
    void load()
  }, [])

  // Check N8N config status on first load by calling a lightweight endpoint
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/kommunikation/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _check: true }),
        })
        if (res.status === 503) {
          setN8nUnconfigured(true)
        }
      } catch {
        // ignore
      }
    }
    void check()
  }, [])

  const handleMessageSent = () => {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      {/* N8N-Konfigurationsbanner */}
      {n8nUnconfigured && (
        <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800/30 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>WhatsApp nicht konfiguriert</strong> — N8N Webhook-URL fehlt. Nachrichten können nicht gesendet werden.
            Bitte <code className="text-xs">N8N_WHATSAPP_WEBHOOK_URL</code> in Vercel setzen.
          </AlertDescription>
        </Alert>
      )}

      {/* Desktop-Layout (ab lg) */}
      <div className="hidden lg:grid grid-cols-2 gap-6 items-start">
        {loadingEmployees ? (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-32 ml-auto" />
          </div>
        ) : (
          <NachrichtFormular employees={employees} onMessageSent={handleMessageSent} />
        )}
        <VersandHistorie employees={employees} refreshKey={refreshKey} />
      </div>

      {/* Mobile-Layout (unter lg) — Tabs */}
      <div className="lg:hidden">
        <Tabs defaultValue="nachricht">
          <TabsList className="w-full">
            <TabsTrigger value="nachricht" className="flex-1">Neue Nachricht</TabsTrigger>
            <TabsTrigger value="verlauf" className="flex-1">Verlauf</TabsTrigger>
          </TabsList>

          <TabsContent value="nachricht" className="mt-4">
            {loadingEmployees ? (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <NachrichtFormular employees={employees} onMessageSent={handleMessageSent} />
            )}
          </TabsContent>

          <TabsContent value="verlauf" className="mt-4">
            <VersandHistorie employees={employees} refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
