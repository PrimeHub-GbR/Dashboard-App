'use client'

import { Task } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar } from 'lucide-react'

const PRIORITY_STYLES = {
  high: 'text-red-700 bg-red-50 border-red-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  low: 'text-green-700 bg-green-50 border-green-200',
}
const PRIORITY_LABELS = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }

const STATUS_STYLES = {
  todo: 'text-gray-600 bg-gray-100 border-gray-200',
  in_progress: 'text-blue-700 bg-blue-50 border-blue-200',
  in_review: 'text-purple-700 bg-purple-50 border-purple-200',
  done: 'text-green-700 bg-green-50 border-green-200',
  blocked: 'text-red-700 bg-red-50 border-red-200',
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
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4 text-2xl">
          ✓
        </div>
        <p className="text-muted-foreground text-sm">Keine Aufgaben gefunden</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Erstelle eine neue Aufgabe oder passe die Filter an</p>
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
    <div className="rounded-md border">
      <div className="divide-y">
        {tasks.map((task) => {
          const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
          const isDone = task.status === 'done'

          return (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors',
                isOverdue && !isDone && 'bg-red-50/50'
              )}
              onClick={() => onTaskClick(task)}
            >
              {/* Checkbox */}
              <Checkbox
                checked={isDone}
                onCheckedChange={async (checked) => {
                  if (checked && !isDone) await onComplete(task.id)
                }}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />

              {/* Titel */}
              <p className={cn(
                'flex-1 text-sm font-medium min-w-0 truncate',
                isDone ? 'line-through text-muted-foreground' : 'text-foreground'
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
                  isOverdue ? 'text-red-600 font-medium' : task.due_date === today ? 'text-amber-600' : 'text-muted-foreground'
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
                      className="h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: a.color }}
                    >
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {task.assignees.length > 3 && (
                    <span className="h-6 w-6 rounded-full border-2 border-white bg-muted flex items-center justify-center text-[9px] text-muted-foreground">
                      +{task.assignees.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
