'use client'

import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Circle, AlertTriangle, ListTodo, TrendingUp } from 'lucide-react'

interface KPIs {
  total: number
  done: number
  open: number
  overdue: number
  rate: number
}

export function AufgabenKPIs({ kpis }: { kpis: KPIs }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Gesamt</p>
              <p className="text-2xl font-bold tracking-tight">{kpis.total}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <ListTodo className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Erledigt</p>
              <p className="text-2xl font-bold tracking-tight text-green-600">{kpis.done}</p>
            </div>
            <div className="p-2 rounded-lg bg-green-50">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Offen</p>
              <p className="text-2xl font-bold tracking-tight text-blue-600">{kpis.open}</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50">
              <Circle className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Überfällig</p>
              <p className={`text-2xl font-bold tracking-tight ${kpis.overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                {kpis.overdue}
              </p>
            </div>
            <div className={`p-2 rounded-lg ${kpis.overdue > 0 ? 'bg-red-50' : 'bg-muted'}`}>
              <AlertTriangle className={`w-5 h-5 ${kpis.overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Abschlussrate</p>
              <p className={`text-2xl font-bold tracking-tight ${
                kpis.rate >= 70 ? 'text-green-600' : kpis.rate >= 40 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {kpis.rate}%
              </p>
            </div>
            <div className={`p-2 rounded-lg ${kpis.rate >= 70 ? 'bg-green-50' : kpis.rate >= 40 ? 'bg-amber-50' : 'bg-red-50'}`}>
              <TrendingUp className={`w-5 h-5 ${kpis.rate >= 70 ? 'text-green-600' : kpis.rate >= 40 ? 'text-amber-600' : 'text-red-600'}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
