'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Employee {
  id: string
  name: string
  color: string
}

interface Props {
  employees: Employee[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function AssigneeSelector({ employees, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  const selected = employees.filter((e) => selectedIds.includes(e.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-white/5 border-white/15 text-white/70 hover:bg-white/8 hover:text-white"
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected.length === 0 ? (
              <>
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm">Mitarbeiter zuweisen</span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 flex-wrap">
                {selected.map((e) => (
                  <span
                    key={e.id}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${e.color}25`, color: e.color, border: `1px solid ${e.color}40` }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: e.color }}
                    />
                    {e.name}
                  </span>
                ))}
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-white/30" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1 bg-[#0f1f16] border-white/15">
        {employees.length === 0 ? (
          <p className="p-3 text-sm text-white/40 text-center">Keine Mitarbeiter vorhanden</p>
        ) : (
          employees.map((e) => {
            const isSelected = selectedIds.includes(e.id)
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isSelected ? 'bg-white/8 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: e.color }}
                />
                <span className="flex-1 text-left">{e.name}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
