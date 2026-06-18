'use client'

import { Task, formatCompletedAt } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react'

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
  task: Task
  onClick: (task: Task) => void
  compact?: boolean
}

export function AufgabeCard({ task, onClick, compact = false }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'

  const formatDue = (due: string) => {
    const d = new Date(due)
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `${Math.abs(diff)}d überfällig`
    if (diff === 0) return 'Heute fällig'
    if (diff === 1) return 'Morgen'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div
      onClick={() => onClick(task)}
      className={cn(
        'rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer',
        isOverdue && 'border-red-200 bg-red-50/50',
        task.status === 'done' && 'opacity-60',
        compact ? 'p-3' : 'p-4'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        {task.status === 'done' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
        ) : (
          <div className={cn(
            'h-4 w-4 shrink-0 mt-0.5 rounded-full border-2',
            task.status === 'in_progress' ? 'border-blue-500' :
            task.status === 'blocked' ? 'border-red-500' :
            task.status === 'in_review' ? 'border-purple-500' :
            'border-gray-300'
          )} />
        )}
        <p className={cn(
          'text-sm font-medium leading-snug flex-1',
          task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
        )}>
          {isOverdue && (
            <span className="text-red-600 font-extrabold mr-1.5">!</span>
          )}
          {task.title}
        </p>
      </div>

      {!compact && task.description && (
        <p className="text-xs text-muted-foreground mb-3 ml-6 line-clamp-2">{task.description}</p>
      )}

      {/* Erledigt-Zeitstempel */}
      {task.status === 'done' && task.completed_at && (
        <p className="text-[11px] text-green-700 mb-2 ml-6 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Erledigt {formatCompletedAt(task.completed_at)}
          {task.completed_by_name && ` · ${task.completed_by_name}`}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 flex-wrap ml-6">
        {!compact && (
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', STATUS_STYLES[task.status])}>
            {STATUS_LABELS[task.status]}
          </Badge>
        )}

        {task.due_date && (
          <span className={cn(
            'flex items-center gap-1 text-[10px]',
            isOverdue ? 'text-red-600 font-medium' : task.due_date === today ? 'text-amber-600' : 'text-muted-foreground'
          )}>
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
            {formatDue(task.due_date)}
          </span>
        )}

        {task.assignees.length > 0 && (
          <div className="ml-auto flex items-center gap-x-2.5 gap-y-1 flex-wrap justify-end">
            {task.assignees.slice(0, 3).map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: a.color }}
                />
                <span className="font-medium text-foreground/80 whitespace-nowrap">{a.name}</span>
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="text-[11px] text-muted-foreground">+{task.assignees.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
