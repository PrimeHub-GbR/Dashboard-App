'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coins } from 'lucide-react'
import type { BuchpreischeckSeller, BuchpreischeckRun } from '@/hooks/useBuchpreisbindung'
import { estimateMonthlyCost, actualCostFromBytes, EUR_PER_GB } from '@/lib/buchpreisbindung-cost'

interface Props {
  sellers: BuchpreischeckSeller[]
}

function fmtVolume(gb: number) {
  if (gb < 1) return `${(gb * 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
  return `${gb.toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`
}
function fmtEUR(eur: number) {
  return `${eur.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: eur < 1 ? 3 : 2 })} €`
}

export function CostSection({ sellers }: Props) {
  const [runs, setRuns] = useState<BuchpreischeckRun[]>([])

  useEffect(() => {
    let active = true
    fetch('/api/buchpreisbindung/runs')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active && Array.isArray(d)) setRuns(d) })
      .catch(() => {})
    return () => { active = false }
  }, [sellers.length])

  const estimate = estimateMonthlyCost(sellers)
  const activeCount = sellers.filter(s => s.is_active).length

  const now = new Date()
  const monthBytes = runs.reduce((sum, r) => {
    if (!r.proxy_bytes) return sum
    const d = new Date(r.created_at)
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      return sum + r.proxy_bytes
    }
    return sum
  }, 0)
  const actual = actualCostFromBytes(monthBytes)

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          DataImpulse-Kosten
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[11px] text-white/40">Geschätzt pro Monat</p>
            <p className="text-lg font-semibold text-white mt-0.5">{fmtEUR(estimate.eur)}</p>
            <p className="text-[11px] text-white/35">{fmtVolume(estimate.gb)} · {activeCount} aktive Händler</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[11px] text-white/40">Verbraucht (dieser Monat)</p>
            <p className="text-lg font-semibold text-white mt-0.5">{fmtEUR(actual.eur)}</p>
            <p className="text-[11px] text-white/35">{fmtVolume(actual.gb)} tatsächlich über Proxy</p>
          </div>
        </div>
        <p className="text-[11px] text-white/30 mt-3">
          Basis: ~{EUR_PER_GB.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/GB (DataImpulse). Die Schätzung beruht auf
          Zeitplan und Seitenzahl pro Händler; der tatsächliche Verbrauch wird aus den Läufen gemessen.
        </p>
      </CardContent>
    </Card>
  )
}
