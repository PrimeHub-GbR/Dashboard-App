'use client'

import { CheckCircle2, Clock, Loader2, Timer, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { JobStatus } from '@/lib/job-types'

interface StatusBadgeProps {
  status: JobStatus
}

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string; Icon: React.ElementType }
> = {
  pending: {
    label: 'Ausstehend',
    variant: 'secondary',
    className: '',
    Icon: Clock,
  },
  running: {
    label: 'Läuft',
    variant: 'default',
    className: 'animate-pulse',
    Icon: Loader2,
  },
  success: {
    label: 'Erfolgreich',
    variant: 'default',
    className: 'bg-green-500 text-white hover:bg-green-500',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Fehlgeschlagen',
    variant: 'destructive',
    className: '',
    Icon: XCircle,
  },
  timeout: {
    label: 'Timeout',
    variant: 'outline',
    className: 'text-orange-600 border-orange-400',
    Icon: Timer,
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, variant, className, Icon } = STATUS_CONFIG[status]

  return (
    <Badge variant={variant} className={`gap-1 ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}
