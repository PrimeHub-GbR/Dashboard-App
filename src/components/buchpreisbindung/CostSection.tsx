'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coins, RefreshCw } from 'lucide-react'
import type { BuchpreischeckSeller } from '@/hooks/useBuchpreisbindung'

interface Props {
  sellers: BuchpreischeckSeller[]
}

interface Usage {
  planCredits: number
  usedCredits: number
  remainingCredits: number
  concurrency: number
  renewalDate: string | null
}

function fmtCredits(c: number) {
  return Math.round(c).toLocaleString('de-DE')
}

export function CostSection(_props: Props) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/buchpreisbindung/scrapeops-usage', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || 'Abfrage fehlgeschlagen')
        }
        return r.json()
      })
      .then((d: Usage) => { setUsage(d); setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const pct = usage && usage.planCredits > 0
    ? Math.min(100, Math.round((usage.remainingCredits / usage.planCredits) * 100))
    : 0

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            ScrapeOps-Token
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="text-white/40 hover:text-white/80 transition disabled:opacity-40"
            title="Aktualisieren"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-[13px] text-red-300/80">{error}</p>
        ) : !usage ? (
          <p className="text-[13px] text-white/40">Lade Kontostand…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                <p className="text-[11px] text-white/40">Verbleibend</p>
                <p className="text-lg font-semibold text-emerald-300 mt-0.5">{fmtCredits(usage.remainingCredits)}</p>
                <p className="text-[11px] text-white/35">Token verfügbar</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                <p className="text-[11px] text-white/40">Initial (Plan)</p>
                <p className="text-lg font-semibold text-white mt-0.5">{fmtCredits(usage.planCredits)}</p>
                <p className="text-[11px] text-white/35">{fmtCredits(usage.usedCredits)} verbraucht</p>
              </div>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400/80 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-white/30 mt-2">
              {pct}% verbleibend · {usage.concurrency} gleichzeitige Verbindung{usage.concurrency === 1 ? '' : 'en'}
              {usage.renewalDate ? ` · Verlängerung ${usage.renewalDate}` : ''} · live aus ScrapeOps
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
