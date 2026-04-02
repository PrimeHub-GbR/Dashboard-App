'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectableEmployee {
  id: string
  name: string
  phone?: string | null
  is_active?: boolean
}

interface Props {
  employees: SelectableEmployee[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function EmpfaengerSelector({ employees, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)

  const activeEmployees = employees.filter((e) => e.is_active !== false)

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const removeChip = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selected.filter((s) => s !== id))
  }

  const selectedEmployees = activeEmployees.filter((e) => selected.includes(e.id))

  return (
    <Popover open={open && !disabled} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between min-h-10 h-auto flex-wrap gap-1.5 px-3 py-2 font-normal',
            disabled && 'opacity-50 pointer-events-none'
          )}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1.5 flex-1">
            {selectedEmployees.length === 0 ? (
              <span className="text-muted-foreground">Empfänger auswählen…</span>
            ) : (
              selectedEmployees.map((emp) => (
                <Badge
                  key={emp.id}
                  variant="secondary"
                  className="flex items-center gap-1 text-xs animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  {emp.name}
                  <button
                    type="button"
                    onClick={(e) => removeChip(emp.id, e)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                    aria-label={`${emp.name} entfernen`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Mitarbeiter suchen…" />
          <CommandList>
            <CommandEmpty>Kein Mitarbeiter gefunden.</CommandEmpty>
            <CommandGroup>
              {activeEmployees.map((emp) => {
                const hasPhone = !!emp.phone
                const isSelected = selected.includes(emp.id)
                return (
                  <CommandItem
                    key={emp.id}
                    value={emp.name}
                    disabled={!hasPhone}
                    onSelect={() => hasPhone && toggle(emp.id)}
                    className={cn(
                      'flex items-center justify-between',
                      !hasPhone && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors',
                          isSelected ? 'bg-primary/10' : 'opacity-50'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary" />}
                      </div>
                      <span className="text-sm">{emp.name}</span>
                      {!hasPhone && (
                        <span className="text-xs text-muted-foreground">(kein Telefon)</span>
                      )}
                    </div>
                    {hasPhone && emp.phone && (
                      <span className="text-xs text-muted-foreground ml-2">{emp.phone}</span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
