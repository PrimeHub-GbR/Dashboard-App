'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { SelectableEmployee } from './EmpfaengerSelector'
import type { HistoryFilters } from '@/hooks/useKommunikation'

interface Props {
  employees: SelectableEmployee[]
  filters: HistoryFilters
  onChange: (filters: HistoryFilters) => void
}

export function HistorieFilterBar({ employees, filters, onChange }: Props) {
  const hasActiveFilters =
    !!filters.recipient_id ||
    !!filters.context ||
    !!filters.status ||
    !!filters.date_range

  const set = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) =>
    onChange({ ...filters, [key]: value, page: 1 })

  const reset = () =>
    onChange({ page: 1 })

  return (
    <div className="flex flex-wrap gap-2 px-6 py-4 border-b border-border items-center">
      {/* Empfänger */}
      <Select
        value={filters.recipient_id ?? 'all'}
        onValueChange={(v) => set('recipient_id', v === 'all' ? undefined : v)}
      >
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Empfänger" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Empfänger</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Kontext */}
      <Select
        value={filters.context || 'all'}
        onValueChange={(v) => set('context', (v === 'all' ? '' : v) as HistoryFilters['context'])}
      >
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Kontext" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Kontexte</SelectItem>
          <SelectItem value="manual">Manuell</SelectItem>
          <SelectItem value="aufgabe">Aufgabe</SelectItem>
          <SelectItem value="zeiterfassung">Zeiterfassung</SelectItem>
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={filters.status || 'all'}
        onValueChange={(v) => set('status', (v === 'all' ? '' : v) as HistoryFilters['status'])}
      >
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Status</SelectItem>
          <SelectItem value="sent">Gesendet</SelectItem>
          <SelectItem value="failed">Fehlgeschlagen</SelectItem>
          <SelectItem value="pending">Ausstehend</SelectItem>
        </SelectContent>
      </Select>

      {/* Zeitraum */}
      <Select
        value={filters.date_range || 'all'}
        onValueChange={(v) => set('date_range', (v === 'all' ? '' : v) as HistoryFilters['date_range'])}
      >
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Zeitraum" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">90 Tage</SelectItem>
          <SelectItem value="today">Heute</SelectItem>
          <SelectItem value="week">Diese Woche</SelectItem>
          <SelectItem value="month">Dieser Monat</SelectItem>
        </SelectContent>
      </Select>

      {/* Zurücksetzen */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" />
          Zurücksetzen
        </Button>
      )}
    </div>
  )
}
