'use client'

import { Check, GraduationCap, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SkillStatus } from './types'

const STYLE: Record<SkillStatus, { wrap: string; icon: React.ReactNode; label: string }> = {
  kann: {
    wrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: <Check className="h-4 w-4" strokeWidth={3} />,
    label: 'Kann',
  },
  lernt: {
    wrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    icon: <GraduationCap className="h-4 w-4" />,
    label: 'In Einarbeitung',
  },
  nein: {
    wrap: 'text-muted-foreground/30',
    icon: <Minus className="h-4 w-4" />,
    label: 'Kann noch nicht',
  },
}

interface SkillCellProps {
  status: SkillStatus
  editable: boolean
  pending?: boolean
  onCycle?: () => void
  ariaLabel: string
}

export function SkillCell({ status, editable, pending, onCycle, ariaLabel }: SkillCellProps) {
  const s = STYLE[status]
  const Comp = editable ? 'button' : 'div'

  return (
    <Comp
      {...(editable ? { type: 'button', onClick: onCycle, title: `${ariaLabel} — ${s.label} (klicken zum Ändern)` } : { title: `${ariaLabel} — ${s.label}` })}
      aria-label={`${ariaLabel}: ${s.label}`}
      className={cn(
        'mx-auto flex h-8 w-8 items-center justify-center rounded-md transition',
        s.wrap,
        editable && 'cursor-pointer hover:ring-2 hover:ring-ring/40 active:scale-95',
        pending && 'animate-pulse opacity-60',
      )}
    >
      {s.icon}
    </Comp>
  )
}
