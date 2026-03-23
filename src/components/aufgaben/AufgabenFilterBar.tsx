'use client'

import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { TaskFilters } from '@/hooks/useAufgaben'

interface Employee {
  id: string
  name: string
  color: string
}

interface Props {
  filters: TaskFilters
  employees: Employee[]
  onChange: (f: TaskFilters) => void
}

const ALL = '__all__'

export function AufgabenFilterBar({ filters, employees, onChange }: Props) {
  const set = (key: keyof TaskFilters, value: string) => {
    onChange({ ...filters, [key]: value === ALL ? '' : value })
  }

  const hasActiveFilters = !!(filters.status || filters.priority || filters.employee_id || filters.due_filter || filters.search)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Suche */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
        <Input
          value={filters.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Aufgaben suchen..."
          className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:border-emerald-500/50 h-9"
        />
      </div>

      {/* Status */}
      <Select value={filters.status || ALL} onValueChange={(v) => set('status', v)}>
        <SelectTrigger className="w-[140px] bg-white/5 border-white/15 text-white h-9 text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-[#0f1f16] border-white/15">
          <SelectItem value={ALL}>Alle Status</SelectItem>
          <SelectItem value="todo">Offen</SelectItem>
          <SelectItem value="in_progress">In Bearbeitung</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="done">Erledigt</SelectItem>
          <SelectItem value="blocked">Blockiert</SelectItem>
        </SelectContent>
      </Select>

      {/* Priorität */}
      <Select value={filters.priority || ALL} onValueChange={(v) => set('priority', v)}>
        <SelectTrigger className="w-[130px] bg-white/5 border-white/15 text-white h-9 text-sm">
          <SelectValue placeholder="Priorität" />
        </SelectTrigger>
        <SelectContent className="bg-[#0f1f16] border-white/15">
          <SelectItem value={ALL}>Alle Prioritäten</SelectItem>
          <SelectItem value="high">Hoch</SelectItem>
          <SelectItem value="medium">Mittel</SelectItem>
          <SelectItem value="low">Niedrig</SelectItem>
        </SelectContent>
      </Select>

      {/* Fälligkeit */}
      <Select value={filters.due_filter || ALL} onValueChange={(v) => set('due_filter', v)}>
        <SelectTrigger className="w-[140px] bg-white/5 border-white/15 text-white h-9 text-sm">
          <SelectValue placeholder="Fälligkeit" />
        </SelectTrigger>
        <SelectContent className="bg-[#0f1f16] border-white/15">
          <SelectItem value={ALL}>Alle Daten</SelectItem>
          <SelectItem value="overdue">Überfällig</SelectItem>
          <SelectItem value="today">Heute fällig</SelectItem>
          <SelectItem value="week">Diese Woche</SelectItem>
        </SelectContent>
      </Select>

      {/* Mitarbeiter */}
      {employees.length > 0 && (
        <Select value={filters.employee_id || ALL} onValueChange={(v) => set('employee_id', v)}>
          <SelectTrigger className="w-[150px] bg-white/5 border-white/15 text-white h-9 text-sm">
            <SelectValue placeholder="Mitarbeiter" />
          </SelectTrigger>
          <SelectContent className="bg-[#0f1f16] border-white/15">
            <SelectItem value={ALL}>Alle Mitarbeiter</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Filter zurücksetzen */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          className="h-9 px-3 text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Filter zurücksetzen
        </Button>
      )}
    </div>
  )
}
