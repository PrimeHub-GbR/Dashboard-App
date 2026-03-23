'use client'

import { Task } from '@/hooks/useAufgaben'
import { AufgabeCard } from './AufgabeCard'

const COLUMNS: { key: Task['status']; label: string; headerClass: string; bgClass: string }[] = [
  { key: 'todo', label: 'Offen', headerClass: 'text-gray-600', bgClass: 'bg-gray-50 border-gray-200' },
  { key: 'in_progress', label: 'In Bearbeitung', headerClass: 'text-blue-600', bgClass: 'bg-blue-50 border-blue-200' },
  { key: 'in_review', label: 'In Review', headerClass: 'text-purple-600', bgClass: 'bg-purple-50 border-purple-200' },
  { key: 'done', label: 'Erledigt', headerClass: 'text-green-600', bgClass: 'bg-green-50 border-green-200' },
]

const COUNT_BADGE_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-600',
  in_review: 'bg-purple-100 text-purple-600',
  done: 'bg-green-100 text-green-600',
}

interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

export function AufgabenKanbanView({ tasks, onTaskClick }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key)
        const today = new Date().toISOString().split('T')[0]
        const sorted = [
          ...colTasks.filter((t) => t.due_date && t.due_date < today),
          ...colTasks.filter((t) => !t.due_date || t.due_date >= today),
        ]

        return (
          <div key={col.key} className="flex flex-col gap-3">
            {/* Spalten-Header */}
            <div className="flex items-center justify-between px-1">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${col.headerClass}`}>
                {col.label}
              </h3>
              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${COUNT_BADGE_COLORS[col.key]}`}>
                {colTasks.length}
              </span>
            </div>

            {/* Task-Karten */}
            <div className={`min-h-[120px] rounded-lg border p-3 space-y-2 ${col.bgClass}`}>
              {sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Keine Aufgaben</p>
              ) : (
                sorted.map((task) => (
                  <AufgabeCard key={task.id} task={task} onClick={onTaskClick} compact />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
