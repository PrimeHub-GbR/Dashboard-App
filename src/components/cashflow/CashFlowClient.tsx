'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CashAccount,
  CashBalance,
  currentMonthKey,
} from '@/lib/cashflow'
import { CashFlowOverview } from './CashFlowOverview'
import { CashFlowEntry } from './CashFlowEntry'
import { CashFlowAccounts } from './CashFlowAccounts'
import { InventoryOverview } from './InventoryOverview'
import {
  CashInventory,
  InventoryField,
  mergeInventoryField,
  normalizeInventoryRow,
} from '@/lib/cashflow-inventory'

/** Lädt die Lagerzeilen. Wirft bei HTTP-/Netz-/Formatfehler. */
async function fetchInventory(): Promise<CashInventory[]> {
  const res = await fetch('/api/cashflow/inventory')
  if (!res.ok) throw new Error(`inventory ${res.status}`)
  const json = await res.json()
  if (!json || !Array.isArray(json.inventory)) throw new Error('inventory format')
  return (json.inventory as Record<string, unknown>[]).map(normalizeInventoryRow)
}

export function CashFlowClient() {
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [balances, setBalances] = useState<CashBalance[]>([])
  const [loading, setLoading] = useState(true)
  // Lager strikt getrennt: eigener Stand, eigener Fehler, eigenes Neuladen
  const [inventory, setInventory] = useState<CashInventory[]>([])
  const [inventoryError, setInventoryError] = useState(false)
  const [inventoryLoading, setInventoryLoading] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      // Drei Abrufe parallel; ein Lager-Fehler blockiert die Barmittel nie
      const [accRes, balRes, invRes] = await Promise.allSettled([
        fetch('/api/cashflow/accounts').then((r) => r.json()),
        fetch('/api/cashflow/balances').then((r) => r.json()),
        fetchInventory(),
      ])
      if (accRes.status === 'fulfilled') setAccounts(accRes.value?.accounts ?? [])
      if (balRes.status === 'fulfilled') setBalances(balRes.value?.balances ?? [])
      if (invRes.status === 'fulfilled') {
        setInventory(invRes.value)
        setInventoryError(false)
      } else {
        setInventoryError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // „Erneut laden“: nur die Lagerdaten, nicht die Barmittel
  async function reloadInventory() {
    setInventoryLoading(true)
    try {
      setInventory(await fetchInventory())
      setInventoryError(false)
    } catch {
      setInventoryError(true)
    } finally {
      setInventoryLoading(false)
    }
  }

  // Nach dem Speichern eines Lagerfelds: nur dieses Feld lokal übernehmen
  const handleInventorySaved = useCallback(
    (
      accountId: string,
      month: string,
      field: InventoryField,
      value: number | null,
      serverRow: CashInventory | null
    ) => {
      setInventory((rows) => mergeInventoryField(rows, accountId, month, field, value, serverRow))
    },
    []
  )

  useEffect(() => {
    loadAll()
  }, [])

  // Alle Monate, die Daten haben, plus aktueller Monat — aufsteigend sortiert
  const months = useMemo(() => {
    const set = new Set<string>(balances.map((b) => b.month))
    set.add(currentMonthKey())
    return Array.from(set).sort()
  }, [balances])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="entry">Eingabe</TabsTrigger>
        <TabsTrigger value="accounts">Konten</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <CashFlowOverview accounts={accounts} balances={balances} months={months} />
        <InventoryOverview
          accounts={accounts}
          balances={balances}
          inventory={inventory}
          loading={inventoryLoading}
          error={inventoryError}
          onRetry={reloadInventory}
        />
      </TabsContent>

      <TabsContent value="entry">
        <CashFlowEntry
          accounts={accounts.filter((a) => a.is_active)}
          balances={balances}
          onChanged={loadAll}
          inventory={inventory}
          inventoryLoading={inventoryLoading}
          inventoryError={inventoryError}
          onInventoryRetry={reloadInventory}
          onInventorySaved={handleInventorySaved}
        />
      </TabsContent>

      <TabsContent value="accounts">
        <CashFlowAccounts accounts={accounts} onChanged={loadAll} />
      </TabsContent>
    </Tabs>
  )
}
