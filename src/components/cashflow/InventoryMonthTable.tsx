'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { CashAccount, formatMonthLabel, formatMonthShort } from '@/lib/cashflow'
import {
  CashInventory,
  INVENTORY_FIELDS,
  INVENTORY_FIELD_META,
  InventoryField,
  InventoryMonthSummary,
  compareField,
  deltaColorClass,
  formatDeltaPct,
  formatInventoryDelta,
  formatInventoryValue,
  isAmazonAccount,
  summarizeInventory,
} from '@/lib/cashflow-inventory'
import { DeltaIcon, NoValue } from './InventoryDelta'

const ALL = '__all__'

interface Props {
  /** Alle Konten (auch inaktive) — für Namen, Farben, Filter */
  accounts: CashAccount[]
  inventory: CashInventory[]
}

export function InventoryMonthTable({ accounts, inventory }: Props) {
  const [filter, setFilter] = useState<string>(ALL)

  // Gewähltes Konto wurde gelöscht -> zurück auf „Alle“
  const effectiveFilter =
    filter !== ALL && !accounts.some((a) => a.id === filter) ? ALL : filter
  const accountId = effectiveFilter === ALL ? null : effectiveFilter

  // Alle Konten mit gespeicherten Lagerwerten, in sort_order. Das gewählte Konto
  // bleibt in der Liste, auch wenn seine Werte gerade geleert wurden.
  const filterAccounts = useMemo(() => {
    const ids = new Set(inventory.map((r) => r.account_id))
    if (accountId) ids.add(accountId)
    return accounts
      .filter((a) => ids.has(a.id))
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [accounts, inventory, accountId])
  const selected = accounts.find((a) => a.id === accountId)
  const filterName = selected ? selected.name : 'Alle Amazon-Konten'

  const summaries = useMemo(
    () => summarizeInventory(inventory, accountId),
    [inventory, accountId]
  )
  const isSum = accountId === null

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 lg:flex-row lg:items-center lg:justify-between">
        <CardTitle>Monatsvergleich Lager</CardTitle>
        <div className="w-full lg:w-64">
          <Label htmlFor="inventory-account-filter" className="sr-only">
            Konto
          </Label>
          <Select value={effectiveFilter} onValueChange={setFilter}>
            <SelectTrigger id="inventory-account-filter" className="w-full lg:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Amazon-Konten</SelectItem>
              {filterAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: acc.color }}
                      aria-hidden="true"
                    />
                    <span>{acc.name}</span>
                    {!acc.is_active ? (
                      <span className="text-muted-foreground">· inaktiv</span>
                    ) : !isAmazonAccount(acc) ? (
                      <span className="text-muted-foreground">· kein Amazon mehr</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[640px] xl:min-w-0">
          <TableCaption className="sr-only">
            Lagerbestand je Monat, {filterName}, mit Veränderung zum Vergleichsmonat
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-card xl:static">Monat</TableHead>
              {INVENTORY_FIELDS.map((f) => (
                <TableHead key={f} className="text-right">
                  {INVENTORY_FIELD_META[f].shortLabel}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Für dieses Konto sind keine Lagerwerte erfasst.
                </TableCell>
              </TableRow>
            ) : (
              summaries.map((s, i) => (
                <TableRow key={s.month}>
                  <TableCell className="sticky left-0 z-10 bg-card align-top font-medium xl:static">
                    {formatMonthLabel(s.month)}
                  </TableCell>
                  {INVENTORY_FIELDS.map((f) => (
                    <TableCell key={f} className="align-top">
                      <MonthCell summaries={summaries} index={i} field={f} bold={isSum} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

interface CellProps {
  summaries: InventoryMonthSummary[]
  index: number
  field: InventoryField
  bold: boolean
}

function MonthCell({ summaries, index, field, bold }: CellProps) {
  const { value, delta, pct, compareMonth, isGap } = compareField(summaries, index, field)
  return (
    <div className="flex flex-col items-end gap-0.5">
      {value === null ? (
        <NoValue />
      ) : (
        <span className={cn('tabular-nums', bold && 'font-semibold')}>
          {formatInventoryValue(field, value)}
        </span>
      )}
      {delta !== null && (
        <span className={cn('flex items-center gap-0.5 text-xs tabular-nums', deltaColorClass(delta))}>
          <DeltaIcon delta={delta} className="h-3 w-3 shrink-0" />
          <span className="sr-only">Veränderung </span>
          {formatInventoryDelta(field, delta)} · {formatDeltaPct(pct)}
        </span>
      )}
      {delta !== null && isGap && compareMonth && (
        <span className="text-xs text-muted-foreground">zu {formatMonthShort(compareMonth)}</span>
      )}
    </div>
  )
}
