'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  CashAccount,
  CashBalance,
  formatEUR,
  formatEURShort,
  formatMonthLabel,
  formatMonthShort,
} from '@/lib/cashflow'

interface Props {
  accounts: CashAccount[]
  balances: CashBalance[]
  months: string[]
}

interface MonthRow {
  month: string
  total: number
  byAccount: Record<string, number>
  byProvider: Record<string, number>
}

export function CashFlowOverview({ accounts, balances, months }: Props) {
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active),
    [accounts]
  )
  const providers = useMemo(
    () => Array.from(new Set(activeAccounts.map((a) => a.provider))),
    [activeAccounts]
  )

  // Nur Monate behalten, die tatsächlich Daten haben (sortiert)
  const monthRows = useMemo<MonthRow[]>(() => {
    const balByMonth = new Map<string, CashBalance[]>()
    for (const b of balances) {
      if (!balByMonth.has(b.month)) balByMonth.set(b.month, [])
      balByMonth.get(b.month)!.push(b)
    }
    return months
      .filter((m) => balByMonth.has(m))
      .map((month) => {
        const rows = balByMonth.get(month) ?? []
        const byAccount: Record<string, number> = {}
        const byProvider: Record<string, number> = {}
        let total = 0
        for (const r of rows) {
          const acc = accounts.find((a) => a.id === r.account_id)
          if (!acc || !acc.is_active) continue
          byAccount[r.account_id] = Number(r.amount)
          byProvider[acc.provider] = (byProvider[acc.provider] ?? 0) + Number(r.amount)
          total += Number(r.amount)
        }
        return { month, total, byAccount, byProvider }
      })
  }, [months, balances, accounts])

  const latest = monthRows[monthRows.length - 1]
  const previous = monthRows[monthRows.length - 2]
  const diff = latest && previous ? latest.total - previous.total : null
  const diffPct =
    latest && previous && previous.total !== 0
      ? (diff! / previous.total) * 100
      : null

  const highest = monthRows.reduce<MonthRow | null>(
    (max, r) => (!max || r.total > max.total ? r : max),
    null
  )
  const lowest = monthRows.reduce<MonthRow | null>(
    (min, r) => (!min || r.total < min.total ? r : min),
    null
  )

  // Chart-Daten
  const trendData = monthRows.map((r) => ({
    label: formatMonthShort(r.month),
    total: r.total,
  }))

  const stackedData = monthRows.map((r) => {
    const row: Record<string, number | string> = { label: formatMonthShort(r.month) }
    for (const acc of activeAccounts) {
      row[acc.id] = r.byAccount[acc.id] ?? 0
    }
    return row
  })

  if (monthRows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Noch keine Daten erfasst</p>
            <p className="text-sm text-muted-foreground">
              Trage im Tab „Eingabe" die Barmittel für einen Monat ein — die
              Auswertung erscheint hier automatisch.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI-Karten */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Aktuelle Barmittel"
          value={latest ? formatEUR(latest.total) : '—'}
          sub={latest ? formatMonthLabel(latest.month) : undefined}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Veränderung zum Vormonat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {diff === null ? (
              <p className="text-2xl font-bold">—</p>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-2 text-2xl font-bold',
                  diff > 0 && 'text-green-600',
                  diff < 0 && 'text-red-600',
                  diff === 0 && 'text-muted-foreground'
                )}
              >
                {diff > 0 ? (
                  <ArrowUpRight className="h-6 w-6" />
                ) : diff < 0 ? (
                  <ArrowDownRight className="h-6 w-6" />
                ) : (
                  <Minus className="h-6 w-6" />
                )}
                {diff > 0 ? '+' : ''}
                {formatEUR(diff)}
              </div>
            )}
            {diffPct !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {diffPct > 0 ? '+' : ''}
                {diffPct.toFixed(1)} % gegenüber Vormonat
              </p>
            )}
          </CardContent>
        </Card>
        <KpiCard
          title="Höchster Stand"
          value={highest ? formatEUR(highest.total) : '—'}
          sub={highest ? formatMonthLabel(highest.month) : undefined}
        />
        <KpiCard
          title="Niedrigster Stand"
          value={lowest ? formatEUR(lowest.total) : '—'}
          sub={lowest ? formatMonthLabel(lowest.month) : undefined}
        />
      </div>

      {/* Trend-Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Gesamtbarmittel über die Zeit</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cf-total-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => formatEURShort(Number(v))}
                width={80}
              />
              <Tooltip
                formatter={(v) => [formatEUR(Number(v)), 'Gesamt']}
                labelClassName="font-medium"
                contentStyle={{ borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#cf-total-grad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gestapelte Aufschlüsselung nach Konto */}
      <Card>
        <CardHeader>
          <CardTitle>Aufschlüsselung nach Konto</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={stackedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => formatEURShort(Number(v))}
                width={80}
              />
              <Tooltip
                formatter={(v, key) => {
                  const acc = activeAccounts.find((a) => a.id === key)
                  return [formatEUR(Number(v)), acc ? `${acc.provider} · ${acc.name}` : String(key)]
                }}
                contentStyle={{ borderRadius: 8 }}
              />
              <Legend
                formatter={(key) => {
                  const acc = activeAccounts.find((a) => a.id === key)
                  return acc ? `${acc.provider} · ${acc.name}` : String(key)
                }}
                wrapperStyle={{ fontSize: 12 }}
              />
              {activeAccounts.map((acc) => (
                <Bar
                  key={acc.id}
                  dataKey={acc.id}
                  stackId="accounts"
                  fill={acc.color}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Veränderungstabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Monatsvergleich</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Monat</TableHead>
                {providers.map((p) => (
                  <TableHead key={p} className="text-right">
                    {p}
                  </TableHead>
                ))}
                <TableHead className="text-right">Gesamt</TableHead>
                <TableHead className="text-right">Δ Vormonat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthRows.map((r, i) => {
                const prev = monthRows[i - 1]
                const d = prev ? r.total - prev.total : null
                return (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">
                      {formatMonthLabel(r.month)}
                    </TableCell>
                    {providers.map((p) => (
                      <TableCell key={p} className="text-right tabular-nums">
                        {r.byProvider[p] ? formatEUR(r.byProvider[p]) : '—'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatEUR(r.total)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        d != null && d > 0 && 'text-green-600',
                        d != null && d < 0 && 'text-red-600',
                        (d == null || d === 0) && 'text-muted-foreground'
                      )}
                    >
                      {d == null ? '—' : `${d > 0 ? '+' : ''}${formatEUR(d)}`}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  title,
  value,
  sub,
}: {
  title: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
