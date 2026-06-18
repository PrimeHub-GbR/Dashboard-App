'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Reminder, RECURRENCE_LABELS, monthKey, monthLabelDE, dueStatusText,
} from '@/lib/manager'

interface ManagerCalendarProps {
  reminders: Reminder[]
  loading: boolean
}

interface MonthGroup {
  key: string
  label: string
  items: Reminder[]
}

export function ManagerCalendar({ reminders, loading }: ManagerCalendarProps) {
  const groups = useMemo<MonthGroup[]>(() => {
    const sorted = [...reminders].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    const map = new Map<string, MonthGroup>()
    for (const r of sorted) {
      const key = monthKey(r.next_due_date)
      if (!map.has(key)) {
        map.set(key, { key, label: monthLabelDE(r.next_due_date), items: [] })
      }
      map.get(key)!.items.push(r)
    }
    return Array.from(map.values())
  }, [reminders])

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Lädt…</p>
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Keine Termine vorhanden.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground capitalize">
            {group.label}
          </h3>
          <Card>
            <CardContent className="divide-y p-0">
              {group.items.map((r) => {
                const day = r.next_due_date.slice(8, 10)
                return (
                  <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-center">
                      <span className="text-base font-semibold leading-none">{day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{RECURRENCE_LABELS[r.recurrence]}</p>
                    </div>
                    {r.done ? (
                      <Badge variant="secondary">Erledigt</Badge>
                    ) : r.days_until < 0 ? (
                      <Badge variant="destructive">{dueStatusText(r)}</Badge>
                    ) : (
                      <Badge variant="outline">{dueStatusText(r)}</Badge>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
