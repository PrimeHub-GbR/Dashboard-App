'use client'

import { useEffect, useMemo, useState } from 'react'
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

export function CashFlowClient() {
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [balances, setBalances] = useState<CashBalance[]>([])
  const [loading, setLoading] = useState(true)

  async function loadAll() {
    setLoading(true)
    try {
      const [accRes, balRes] = await Promise.all([
        fetch('/api/cashflow/accounts'),
        fetch('/api/cashflow/balances'),
      ])
      const accJson = await accRes.json()
      const balJson = await balRes.json()
      setAccounts(accJson.accounts ?? [])
      setBalances(balJson.balances ?? [])
    } finally {
      setLoading(false)
    }
  }

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

      <TabsContent value="overview">
        <CashFlowOverview accounts={accounts} balances={balances} months={months} />
      </TabsContent>

      <TabsContent value="entry">
        <CashFlowEntry
          accounts={accounts.filter((a) => a.is_active)}
          balances={balances}
          onChanged={loadAll}
        />
      </TabsContent>

      <TabsContent value="accounts">
        <CashFlowAccounts accounts={accounts} onChanged={loadAll} />
      </TabsContent>
    </Tabs>
  )
}
