'use client'

import { useMemo } from 'react'
import { AlertCircle, Package, RotateCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CashAccount, CashBalance, formatMonthLabel } from '@/lib/cashflow'
import {
  CashInventory,
  inventoryEntryAccounts,
  summarizeInventory,
} from '@/lib/cashflow-inventory'
import { InventoryKpiCards } from './InventoryKpiCards'
import { CashVsInventoryChart } from './CashVsInventoryChart'
import { InventoryMonthTable } from './InventoryMonthTable'

interface Props {
  /** Alle Konten (auch inaktive) */
  accounts: CashAccount[]
  balances: CashBalance[]
  inventory: CashInventory[]
  loading: boolean
  error: boolean
  onRetry: () => void
}

export function InventoryOverview({
  accounts,
  balances,
  inventory,
  loading,
  error,
  onRetry,
}: Props) {
  const summaries = useMemo(() => summarizeInventory(inventory), [inventory])
  const activeAmazon = useMemo(() => inventoryEntryAccounts(accounts), [accounts])
  const latest = summaries[summaries.length - 1]
  const showData = !loading && !error && summaries.length > 0

  return (
    <>
      <Separator className="my-2" />
      <section aria-labelledby="inventory-heading" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="inventory-heading" className="flex items-center gap-2 text-lg font-medium">
              <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Lagerbestand
            </h2>
            <p className="text-sm text-muted-foreground">
              Amazon-Konten · wird nicht mit den Barmitteln verrechnet
            </p>
          </div>
          {showData && latest && (
            <Badge variant="secondary">Stand: {formatMonthLabel(latest.month)}</Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Lagerbestand wird geladen">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-80" />
            <Skeleton className="h-64" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <AlertTitle>Lagerbestand konnte nicht geladen werden</AlertTitle>
                <AlertDescription>Die Barmittel sind davon nicht betroffen.</AlertDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="shrink-0 self-start text-foreground sm:self-center"
              >
                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Erneut laden
              </Button>
            </div>
          </Alert>
        ) : summaries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">Noch kein Lagerbestand erfasst</p>
                <p className="text-sm text-muted-foreground">
                  {activeAmazon.length === 0
                    ? 'Lege zuerst im Tab „Konten“ ein Amazon-Konto an.'
                    : 'Trage im Tab „Eingabe“ unter „Lagerbestand“ die Werte deiner Amazon-Konten ein. Die Auswertung erscheint hier automatisch.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <InventoryKpiCards summaries={summaries} activeAmazonAccounts={activeAmazon} />
            <CashVsInventoryChart accounts={accounts} balances={balances} summaries={summaries} />
            <InventoryMonthTable accounts={accounts} inventory={inventory} />
          </>
        )}
      </section>
    </>
  )
}
