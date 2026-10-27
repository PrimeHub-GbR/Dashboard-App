'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CashAccount, formatMonthLabel, formatMonthShort } from '@/lib/cashflow'
import {
  INVENTORY_FIELDS,
  INVENTORY_FIELD_META,
  InventoryField,
  InventoryMonthSummary,
  compareField,
  deltaColorClass,
  formatDeltaPct,
  formatInventoryDelta,
  formatInventoryValue,
} from '@/lib/cashflow-inventory'
import { DeltaIcon } from './InventoryDelta'

interface Props {
  /** Monatssummen aller Konten, aufsteigend (mind. ein Eintrag) */
  summaries: InventoryMonthSummary[]
  /** Aktive Amazon-Konten (für „x von y Konten“) */
  activeAmazonAccounts: CashAccount[]
}

/** Text für Screenreader: Minuszeichen und Einheiten ausschreiben */
function spoken(text: string): string {
  return text
    .replace(/^\+/, 'plus ')
    .replace(/^−/, 'minus ')
    .replace(/^±/, '')
    .replace(' Stk.', ' Stück')
    .replace(' %', ' Prozent')
}

export function InventoryKpiCards({ summaries, activeAmazonAccounts }: Props) {
  const index = summaries.length - 1
  const latest = summaries[index]

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INVENTORY_FIELDS.map((field) => (
          <InventoryKpiCard
            key={field}
            field={field}
            summary={latest}
            comparison={compareField(summaries, index, field)}
            activeAmazonAccounts={activeAmazonAccounts}
          />
        ))}
      </div>
    </TooltipProvider>
  )
}

interface CardProps {
  field: InventoryField
  summary: InventoryMonthSummary
  comparison: ReturnType<typeof compareField>
  activeAmazonAccounts: CashAccount[]
}

function InventoryKpiCard({ field, summary, comparison, activeAmazonAccounts }: CardProps) {
  const meta = INVENTORY_FIELD_META[field]
  const { value, delta, pct, compareMonth, isGap } = comparison
  const monthLabel = formatMonthLabel(summary.month)

  const withValue = new Set(summary.accountIds[field])
  const total = activeAmazonAccounts.length
  const covered = activeAmazonAccounts.filter((a) => withValue.has(a.id)).length
  const missing = activeAmazonAccounts.filter((a) => !withValue.has(a.id)).map((a) => a.name)
  const showCoverage = total > 0 && covered < total

  const valueText = value !== null ? formatInventoryValue(field, value) : null
  const deltaText = delta !== null ? formatInventoryDelta(field, delta) : null
  const pctText = formatDeltaPct(pct)

  const ariaParts = [`${meta.label} ${monthLabel}: ${valueText ? spoken(valueText) : 'kein Wert'}`]
  if (deltaText && compareMonth) {
    ariaParts.push(`${spoken(deltaText)} zu ${formatMonthLabel(compareMonth)}`)
    ariaParts.push(pct !== null ? spoken(pctText) : 'Prozent nicht berechenbar')
  } else if (value !== null) {
    ariaParts.push('kein Vergleichsmonat')
  }
  if (showCoverage) ariaParts.push(`${covered} von ${total} Konten`)

  return (
    <Card aria-label={ariaParts.join(', ')} role="group" className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{meta.label}</CardTitle>
      </CardHeader>
      <CardContent>
        {valueText ? (
          <p className="break-words text-2xl font-bold tabular-nums">{valueText}</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-muted-foreground" aria-hidden="true">—</p>
            <p className="text-xs text-muted-foreground">Kein Wert für {monthLabel}</p>
          </>
        )}

        {valueText && deltaText && delta !== null ? (
          <>
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-sm font-medium tabular-nums',
                deltaColorClass(delta)
              )}
            >
              <DeltaIcon delta={delta} />
              {deltaText}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {pctText}
              {isGap && compareMonth ? ` · zu ${formatMonthShort(compareMonth)}` : ''}
            </p>
          </>
        ) : valueText ? (
          <p className="mt-1 text-xs text-muted-foreground">Kein Vergleichsmonat</p>
        ) : null}

        {showCoverage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="mt-2 inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge className="border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {covered} von {total} Konten
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>Fehlt: {missing.join(', ')}</TooltipContent>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  )
}
