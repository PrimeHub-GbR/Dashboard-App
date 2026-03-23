'use client'

import { Lock, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { OrgMember, UserRole } from './types'
import { POSITION_LABELS, getInitials } from './types'

interface OrgMemberCardProps {
  member: OrgMember
  userRole: UserRole
  managerOwnId?: string | null
  onEdit: (member: OrgMember) => void
  onDelete?: (member: OrgMember) => void
}

function canEdit(member: OrgMember, userRole: UserRole, managerOwnId?: string | null): boolean {
  if (userRole === 'admin') return true
  if (userRole === 'manager') {
    return member.position === 'mitarbeiter' && member.reports_to === managerOwnId
  }
  return false
}

function canDelete(member: OrgMember, userRole: UserRole, managerOwnId?: string | null): boolean {
  if (userRole === 'admin') return true
  if (userRole === 'manager') {
    return member.position === 'mitarbeiter' && member.reports_to === managerOwnId
  }
  return false
}

const POSITION_BORDER: Record<string, string> = {
  geschaeftsfuehrer: 'border-yellow-500/50 bg-yellow-500/10',
  manager:           'border-blue-500/50 bg-blue-500/10',
  mitarbeiter:       'border-green-500/30 bg-green-500/5',
}

const AVATAR_BG: Record<string, string> = {
  geschaeftsfuehrer: 'bg-yellow-500/20 text-yellow-300',
  manager:           'bg-blue-500/20 text-blue-300',
  mitarbeiter:       'bg-green-500/20 text-green-300',
}

export function OrgMemberCard({
  member,
  userRole,
  managerOwnId,
  onEdit,
  onDelete,
}: OrgMemberCardProps) {
  const editable = canEdit(member, userRole, managerOwnId)
  const deletable = canDelete(member, userRole, managerOwnId)
  const isLocked = !editable

  // Name in zwei Zeilen aufteilen: erster Teil = Vorname(n), letzter = Nachname
  const parts = member.name.trim().split(/\s+/)
  const lastName = parts.length > 1 ? parts[parts.length - 1] : ''
  const firstName = parts.slice(0, parts.length > 1 ? -1 : 1).join(' ')

  const showKioskDot = member.position !== 'geschaeftsfuehrer'

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col items-center gap-2">
        <Card
          className={cn(
            'w-44 border-2 transition-all duration-200 relative group',
            POSITION_BORDER[member.position],
            editable && 'cursor-pointer hover:scale-105 hover:shadow-lg',
            isLocked && 'opacity-90'
          )}
          onClick={editable ? () => onEdit(member) : undefined}
        >
          <CardContent className="p-4 flex flex-col items-center gap-3">
            {/* Kiosk-Status Dot (oben rechts) */}
            {showKioskDot && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'absolute top-2 left-2 h-2.5 w-2.5 rounded-full',
                      member.is_active ? 'bg-green-500' : 'bg-red-500'
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {member.is_active ? 'Für Kiosk aktiv' : 'Für Kiosk inaktiv'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Avatar */}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold',
                AVATAR_BG[member.position]
              )}
            >
              {getInitials(member.name)}
            </div>

            {/* Name */}
            <div className="text-center">
              <p className="text-sm font-semibold leading-tight text-foreground">{firstName}</p>
              {lastName && (
                <p className="text-sm font-semibold leading-tight text-foreground">{lastName}</p>
              )}
            </div>

            {/* Position */}
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {POSITION_LABELS[member.position]}
            </span>

            {/* Sollstunden (nur für Mitarbeiter / Manager) */}
            {showKioskDot && (
              <span className="text-[11px] text-muted-foreground">
                {member.target_hours_per_month}h / Monat
              </span>
            )}

            {/* Action Icons */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2">
              {isLocked ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); onEdit(member) }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {deletable && onDelete && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(member) }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </TooltipProvider>
  )
}
