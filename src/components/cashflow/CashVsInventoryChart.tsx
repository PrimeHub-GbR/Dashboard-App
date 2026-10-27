'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  CashAccount,
  CashBalance,
  formatEUR,
  formatEURShort,
  formatMonthLabel,
  formatMonthShort,
} from '@/lib/cashflow'
import { InventoryMonthSummary, cashTotalsByMonth } from '@/lib/cashflow-inventory'

interface Props {
  accounts: CashAccount[]
  balances: CashBalance[]
  /** Monatssummen Lager (alle Konten), aufsteigend */
  summaries: InventoryMonthSummary[]
}

type SeriesKey = 'cash' | 'inventory' | 'net'

interface ChartRow {
  month: string
  label: string
  cash: number | null
  inventory: number | null
  net: number | null
}

const SERIES: { key: SeriesKey; name: string; color: string; dash?: string }[] = [
  { key: 'cash', name: 'Barmittel', color: '#22c55e' },
  { key: 'inventory', name: 'Lager-EK', color: '#f59e0b' },
  { key: 'net', name: 'Gesamtvermögen', color: '#3b82f6', dash: '5 4' },
]

export function CashVsInventoryChart({ accounts, balances, summaries }: Props) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set())

  const data = useMemo<ChartRow[]>(() => {
    const cash = cashTotalsByMonth(accounts, balances)
    const inv = new Map<string, number>()
    for (const s of summaries) {
      if (s.values.purchase_value !== null) inv.set(s.month, s.values.purchase_value)
    }
    const months = Array.from(new Set([...cash.keys(), ...inv.keys()])).sort()
    return months.map((month) => {
      const c = cash.has(month) ? cash.get(month)! : null
      const i = inv.has(month) ? inv.get(month)! : null
      return {
        month,
        label: formatMonthShort(month),
        cash: c,
        inventory: i,
        net: c !== null && i !== null ? Math.round((c + i) * 100) / 100 : null,
      }
    })
  }, [accounts, balances, summaries])

  const hasPurchase = data.some((d) => d.inventory !== null)
  const last = data[data.length - 1]
  const ariaLabel = last
    ? `Liniendiagramm Barmittel vs. Lager-Einkaufspreis. ${formatMonthLabel(last.month)}: ` +
      `Barmittel ${last.cash !== null ? formatEUR(last.cash) : 'kein Wert'}, ` +
      `Lager-EK ${last.inventory !== null ? formatEUR(last.inventory) : 'kein Wert'}, ` +
      `Gesamtvermögen ${last.net !== null ? formatEUR(last.net) : 'kein Wert'}.`
    : 'Liniendiagramm Barmittel vs. Lager-Einkaufspreis ohne Daten.'

  function toggle(key: SeriesKey) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barmittel vs. Lager (EK)</CardTitle>
        <CardDescription>Fließt Geld ins Lager oder kommt es zurück?</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={ariaLabel} className="h-[260px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => formatEURShort(Number(v))}
                width={80}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
                onClick={(entry) => {
                  const key = (entry as { dataKey?: unknown }).dataKey
                  if (key === 'cash' || key === 'inventory' || key === 'net') toggle(key)
                }}
                formatter={(value, entry) => {
                  const key = (entry as { dataKey?: unknown }).dataKey as SeriesKey
                  return (
                    <span className={cn(hidden.has(key) && 'opacity-40')}>{String(value)}</span>
                  )
                }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash}
                  connectNulls={false}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  hide={hidden.has(s.key)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Gesamtvermögen = Barmittel + Lager-EK, nur in Monaten mit beiden Werten. Wird nicht
          gespeichert.
          {!hasPurchase && ' Noch kein Einkaufspreis erfasst.'}
        </p>
      </CardContent>
    </Card>
  )
}

interface TooltipContentProps {
  active?: boolean
  payload?: { payload?: ChartRow }[]
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{formatMonthLabel(row.month)}</p>
      <ul className="space-y-0.5">
        {SERIES.map((s) => {
          const v = row[s.key]
          return (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                {s.name}
              </span>
              <span className={cn('tabular-nums', v === null && 'text-muted-foreground')}>
                {v === null ? 'kein Wert' : formatEUR(v)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
