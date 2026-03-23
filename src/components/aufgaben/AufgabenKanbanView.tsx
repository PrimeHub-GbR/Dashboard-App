'use client'

import { Task } from '@/hooks/useAufgaben'
import { AufgabeCard } from './AufgabeCard'

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'todo', label: 'Offen', color: 'border-white/20 bg-white/3' },
  { key: 'in_progress', label: 'In Bearbeitung', color: 'border-blue-500/25 bg-blue-500/5' },
  { key: 'in_review', label: 'In Review', color: 'border-purple-500/25 bg-purple-500/5' },
  { key: 'done', label: 'Erledigt', color: 'border-emerald-500/25 bg-emerald-500/5' },
]

const COLUMN_HEADER_COLORS: Record<string, string> = {
  todo: 'text-white/60',
  in_progress: 'text-blue-400',
  in_review: 'text-purple-400',
  done: 'text-emerald-400',
}

const COUNT_BADGE_COLORS: Record<string, string> = {
  todo: 'bg-white/10 text-white/40',
  in_progress: 'bg-blue-500/15 text-blue-400',
  in_review: 'bg-purple-500/15 text-purple-400',
  done: 'bg-emerald-500/15 text-emerald-400',
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
        // Überfällige Tasks oben
        const today = new Date().toISOString().split('T')[0]
        const sorted = [
          ...colTasks.filter((t) => t.due_date && t.due_date < today),
          ...colTasks.filter((t) => !t.due_date || t.due_date >= today),
        ]

        return (
          <div key={col.key} className="flex flex-col gap-3">
            {/* Spalten-Header */}
            <div className="flex items-center justify-between px-1">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${COLUMN_HEADER_COLORS[col.key]}`}>
                {col.label}
              </h3>
              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${COUNT_BADGE_COLORS[col.key]}`}>
                {colTasks.length}
              </span>
            </div>

            {/* Task-Karten */}
            <div className={`min-h-[120px] rounded-xl border p-3 space-y-2 ${col.color}`}>
              {sorted.length === 0 ? (
                <p className="text-[11px] text-white/20 text-center py-6">Keine Aufgaben</p>
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
