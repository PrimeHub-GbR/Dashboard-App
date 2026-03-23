'use client'

import { Task } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react'

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
  task: Task
  onClick: (task: Task) => void
  compact?: boolean
}

export function AufgabeCard({ task, onClick, compact = false }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
  const isDueToday = task.due_date === today

  const formatDue = (due: string) => {
    const d = new Date(due)
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `${Math.abs(diff)}d überfällig`
    if (diff === 0) return 'Heute fällig'
    if (diff === 1) return 'Morgen fällig'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div
      onClick={() => onClick(task)}
      className={cn(
        'rounded-xl border bg-white/4 hover:bg-white/7 transition-all cursor-pointer group',
        task.status === 'done' ? 'border-white/8 opacity-60' : 'border-white/10',
        isOverdue && 'border-red-500/25 bg-red-500/5',
        compact ? 'p-3' : 'p-4'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        {task.status === 'done' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
        ) : (
          <div className={cn(
            'h-4 w-4 shrink-0 mt-0.5 rounded-full border-2',
            task.status === 'in_progress' ? 'border-blue-400' :
            task.status === 'blocked' ? 'border-red-400' :
            task.status === 'in_review' ? 'border-purple-400' :
            'border-white/30'
          )} />
        )}
        <p className={cn(
          'text-sm font-medium leading-snug flex-1',
          task.status === 'done' ? 'line-through text-white/40' : 'text-white/90'
        )}>
          {task.title}
        </p>
      </div>

      {/* Beschreibung (nur non-compact) */}
      {!compact && task.description && (
        <p className="text-xs text-white/40 mb-3 ml-6 line-clamp-2">{task.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 flex-wrap ml-6">
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0.5 font-medium', PRIORITY_STYLES[task.priority])}>
          {PRIORITY_LABELS[task.priority]}
        </Badge>

        {!compact && (
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0.5', STATUS_STYLES[task.status])}>
            {STATUS_LABELS[task.status]}
          </Badge>
        )}

        {task.due_date && (
          <span className={cn(
            'flex items-center gap-1 text-[10px]',
            isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-white/35'
          )}>
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
            {formatDue(task.due_date)}
          </span>
        )}

        {/* Assignee-Avatare */}
        {task.assignees.length > 0 && (
          <div className="ml-auto flex -space-x-1">
            {task.assignees.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.name}
                className="h-5 w-5 rounded-full border border-[#0f1f16] flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: a.color }}
              >
                {a.name.charAt(0).toUpperCase()}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="h-5 w-5 rounded-full border border-[#0f1f16] bg-white/10 flex items-center justify-center text-[9px] text-white/50">
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
