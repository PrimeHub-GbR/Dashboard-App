'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coins } from 'lucide-react'
import type { BuchpreischeckSeller, BuchpreischeckRun } from '@/hooks/useBuchpreisbindung'
import { estimateMonthlyCost, actualCostFromCredits, USD_PER_1000_CREDITS } from '@/lib/buchpreisbindung-cost'

interface Props {
  sellers: BuchpreischeckSeller[]
}

function fmtCredits(c: number) {
  return `${Math.round(c).toLocaleString('de-DE')} Credits`
}
function fmtUSD(usd: number) {
  return `$${usd.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 3 : 2 })}`
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
  const monthCredits = runs.reduce((sum, r) => {
    if (!r.scrapeops_credits) return sum
    const d = new Date(r.created_at)
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      return sum + r.scrapeops_credits
    }
    return sum
  }, 0)
  const actual = actualCostFromCredits(monthCredits)

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          ScrapeOps-Kosten
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[11px] text-white/40">Geschätzt pro Monat</p>
            <p className="text-lg font-semibold text-white mt-0.5">{fmtUSD(estimate.usd)}</p>
            <p className="text-[11px] text-white/35">{fmtCredits(estimate.credits)} · {activeCount} aktive Händler</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[11px] text-white/40">Verbraucht (dieser Monat)</p>
            <p className="text-lg font-semibold text-white mt-0.5">{fmtUSD(actual.usd)}</p>
            <p className="text-[11px] text-white/35">{fmtCredits(actual.credits)} tatsächlich</p>
          </div>
        </div>
        <p className="text-[11px] text-white/30 mt-3">
          Basis: ScrapeOps ~{USD_PER_1000_CREDITS.toLocaleString('de-DE', { minimumFractionDigits: 2 })} $/1.000 Credits (Starter-Plan),
          1 Credit pro Seitenabruf. Free-Plan: 1.000 Credits/Monat gratis. Die Schätzung beruht auf Zeitplan
          und Trefferzahl pro Händler; der tatsächliche Verbrauch wird aus den Läufen gemessen.
        </p>
      </CardContent>
    </Card>
  )
}
