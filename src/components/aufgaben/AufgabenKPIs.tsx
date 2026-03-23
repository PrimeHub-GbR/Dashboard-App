'use client'

import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Circle, AlertTriangle, ListTodo, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPIs {
  total: number
  done: number
  open: number
  overdue: number
  rate: number
}

export function AufgabenKPIs({ kpis }: { kpis: KPIs }) {
  const cards = [
    {
      label: 'Gesamt',
      value: kpis.total,
      icon: ListTodo,
      color: 'text-white/70',
      bg: 'bg-white/5',
      border: 'border-white/10',
    },
    {
      label: 'Erledigt',
      value: kpis.done,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Offen',
      value: kpis.open,
      icon: Circle,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Überfällig',
      value: kpis.overdue,
      icon: AlertTriangle,
      color: kpis.overdue > 0 ? 'text-red-400' : 'text-white/40',
      bg: kpis.overdue > 0 ? 'bg-red-500/10' : 'bg-white/5',
      border: kpis.overdue > 0 ? 'border-red-500/20' : 'border-white/10',
    },
    {
      label: 'Abschlussrate',
      value: `${kpis.rate}%`,
      icon: TrendingUp,
      color: kpis.rate >= 70 ? 'text-emerald-400' : kpis.rate >= 40 ? 'text-amber-400' : 'text-red-400',
      bg: kpis.rate >= 70 ? 'bg-emerald-500/10' : kpis.rate >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10',
      border: kpis.rate >= 70 ? 'border-emerald-500/20' : kpis.rate >= 40 ? 'border-amber-500/20' : 'border-red-500/20',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className={cn('border', c.bg, c.border, 'bg-transparent')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={cn('h-4 w-4 shrink-0', c.color)} />
              <span className="text-[11px] text-white/40 uppercase tracking-wide font-medium">{c.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
