'use client'

import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Search, X, ChevronDown } from 'lucide-react'
import { TaskFilters } from '@/hooks/useAufgaben'
import { useOrgNodes, buildFlatList } from '@/hooks/useOrgNodes'

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Offen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Erledigt' },
  { value: 'blocked', label: 'Blockiert' },
] as const

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
  const { nodes } = useOrgNodes()
  const flatNodes = buildFlatList(nodes)

  const set = (key: keyof TaskFilters, value: string) => {
    onChange({ ...filters, [key]: value === ALL ? '' : value })
  }

  // Status: Mehrfachauswahl als kommaseparierte Liste in filters.status
  const selectedStatuses = (filters.status ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const toggleStatus = (value: string) => {
    const next = new Set(selectedStatuses)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...filters, status: Array.from(next).join(',') })
  }
  const statusLabel =
    selectedStatuses.length === 0
      ? 'Alle Status'
      : selectedStatuses.length === 1
        ? (STATUS_OPTIONS.find((o) => o.value === selectedStatuses[0])?.label ?? '1 Status')
        : `${selectedStatuses.length} Status`

  const hasActiveFilters = !!(filters.status || filters.priority || filters.employee_id || filters.due_filter || filters.search || filters.org_node_id)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Suche */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filters.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Aufgaben suchen..."
          className="pl-9 h-9"
        />
      </div>

      {/* Status — Mehrfachauswahl */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-[150px] h-9 justify-between text-sm font-normal"
          >
            <span className="truncate">{statusLabel}</span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px]">
          <DropdownMenuItem
            onClick={() => onChange({ ...filters, status: '' })}
            className="text-muted-foreground"
          >
            Alle Status
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={selectedStatuses.includes(o.value)}
              onCheckedChange={() => toggleStatus(o.value)}
              onSelect={(e) => e.preventDefault()}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priorität */}
      <Select value={filters.priority || ALL} onValueChange={(v) => set('priority', v)}>
        <SelectTrigger className="w-[130px] h-9 text-sm">
          <SelectValue placeholder="Priorität" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Prioritäten</SelectItem>
          <SelectItem value="high">Hoch</SelectItem>
          <SelectItem value="medium">Mittel</SelectItem>
          <SelectItem value="low">Niedrig</SelectItem>
        </SelectContent>
      </Select>

      {/* Fälligkeit */}
      <Select value={filters.due_filter || ALL} onValueChange={(v) => set('due_filter', v)}>
        <SelectTrigger className="w-[140px] h-9 text-sm">
          <SelectValue placeholder="Fälligkeit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Daten</SelectItem>
          <SelectItem value="overdue">Überfällig</SelectItem>
          <SelectItem value="today">Heute fällig</SelectItem>
          <SelectItem value="week">Diese Woche</SelectItem>
        </SelectContent>
      </Select>

      {/* Mitarbeiter */}
      {employees.length > 0 && (
        <Select value={filters.employee_id || ALL} onValueChange={(v) => set('employee_id', v)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Mitarbeiter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Mitarbeiter</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Bereich */}
      {flatNodes.length > 0 && (
        <Select value={filters.org_node_id || ALL} onValueChange={(v) => set('org_node_id', v)}>
          <SelectTrigger className="w-[170px] h-9 text-sm">
            <SelectValue placeholder="Bereich" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Bereiche</SelectItem>
            {flatNodes.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {'  '.repeat(n.depth)}{n.depth > 0 ? '└ ' : ''}{n.label}
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
          className="h-9 px-3 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Zurücksetzen
        </Button>
      )}
    </div>
  )
}
