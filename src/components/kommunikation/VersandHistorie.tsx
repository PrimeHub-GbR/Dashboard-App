'use client'

import { useState, useEffect, useCallback } from 'react'
import { HistorieFilterBar } from './HistorieFilterBar'
import { HistorieTabelle } from './HistorieTabelle'
import { useKommunikationHistory, type HistoryFilters } from '@/hooks/useKommunikation'
import type { SelectableEmployee } from './EmpfaengerSelector'

interface Props {
  employees: SelectableEmployee[]
  refreshKey?: number
}

export function VersandHistorie({ employees, refreshKey }: Props) {
  const [filters, setFilters] = useState<HistoryFilters>({ page: 1 })
  const { logs, total, loading, error, refresh } = useKommunikationHistory(filters)

  // Beim ersten Laden und bei Filteränderungen Daten laden
  useEffect(() => {
    refresh(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, refreshKey])

  const handleFilterChange = useCallback((newFilters: HistoryFilters) => {
    setFilters(newFilters)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({ page: 1 })
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h2 className="text-lg font-medium text-foreground">Versandhistorie</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {!loading && `${total} Eintrag${total !== 1 ? 'räge' : ''}`}
        </span>
      </div>

      {/* Filter */}
      <HistorieFilterBar
        employees={employees}
        filters={filters}
        onChange={handleFilterChange}
      />

      {/* Tabelle */}
      <HistorieTabelle
        logs={logs}
        total={total}
        loading={loading}
        error={error}
        filters={filters}
        onFilterChange={handleFilterChange}
        onRetry={() => refresh(filters)}
        onResetFilters={resetFilters}
      />
    </div>
  )
}
