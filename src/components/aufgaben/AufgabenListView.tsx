'use client'

import { Task } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar } from 'lucide-react'

const PRIORITY_STYLES = {
  high: 'text-red-400 bg-red-500/15 border-red-500/30',
  medium: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  low: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
}
const PRIORITY_LABELS = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }

const STATUS_STYLES = {
  todo: 'text-white/50 bg-white/8 border-white/15',
  in_progress: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  in_review: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  done: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  blocked: 'text-red-400 bg-red-500/15 border-red-500/30',
}
const STATUS_LABELS = {
  todo: 'Offen',
  in_progress: 'In Bearbeitung',
  in_review: 'In Review',
  done: 'Erledigt',
  blocked: 'Blockiert',
}

interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onComplete: (id: string) => Promise<boolean>
}

export function AufgabenListView({ tasks, onTaskClick, onComplete }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <span className="text-2xl">✓</span>
        </div>
        <p className="text-white/40 text-sm">Keine Aufgaben gefunden</p>
        <p className="text-white/25 text-xs mt-1">Erstelle eine neue Aufgabe oder passe die Filter an</p>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  const formatDue = (due: string) => {
    const d = new Date(due)
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `${Math.abs(diff)}d überfällig`
    if (diff === 0) return 'Heute'
    if (diff === 1) return 'Morgen'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="space-y-1.5">
      {tasks.map((task) => {
        const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
        const isDone = task.status === 'done'

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all cursor-pointer group',
              isDone ? 'bg-white/2 border-white/6 opacity-60' : 'bg-white/4 border-white/10 hover:bg-white/7',
              isOverdue && !isDone && 'border-red-500/20 bg-red-500/5'
            )}
            onClick={() => onTaskClick(task)}
          >
            {/* Checkbox */}
            <Checkbox
              checked={isDone}
              onCheckedChange={async (checked) => {
                if (checked && !isDone) {
                  await onComplete(task.id)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'shrink-0 border-white/20',
                isDone ? 'border-emerald-500 bg-emerald-500' : 'hover:border-white/40'
              )}
            />

            {/* Titel */}
            <p className={cn(
              'flex-1 text-sm font-medium min-w-0 truncate',
              isDone ? 'line-through text-white/35' : 'text-white/85'
            )}>
              {task.title}
            </p>

            {/* Priorität */}
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0 hidden sm:flex', PRIORITY_STYLES[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>

            {/* Status */}
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0 hidden md:flex', STATUS_STYLES[task.status])}>
              {STATUS_LABELS[task.status]}
            </Badge>

            {/* Fälligkeitsdatum */}
            {task.due_date && (
              <span className={cn(
                'flex items-center gap-1 text-xs shrink-0 hidden sm:flex',
                isOverdue ? 'text-red-400' : task.due_date === today ? 'text-amber-400' : 'text-white/35'
              )}>
                {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                {formatDue(task.due_date)}
              </span>
            )}

            {/* Assignees */}
            {task.assignees.length > 0 && (
              <div className="flex -space-x-1 shrink-0">
                {task.assignees.slice(0, 3).map((a) => (
                  <span
                    key={a.id}
                    title={a.name}
                    className="h-6 w-6 rounded-full border-2 border-[#0f1f16] flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                ))}
                {task.assignees.length > 3 && (
                  <span className="h-6 w-6 rounded-full border-2 border-[#0f1f16] bg-white/10 flex items-center justify-center text-[9px] text-white/50">
                    +{task.assignees.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
