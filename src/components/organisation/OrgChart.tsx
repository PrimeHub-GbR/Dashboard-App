'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { OrgMemberCard } from './OrgMemberCard'
import { EditMemberDialog } from './EditMemberDialog'
import { AddMemberDialog } from './AddMemberDialog'
import type { OrgMember, UserRole } from './types'

interface OrgChartProps {
  members: OrgMember[]
  userRole: UserRole
  managerOwnId?: string | null
  onRefresh: () => void
}

/**
 * SVG-Brücke: horizontale Linie über alle GF-Kacheln + senkrechte Mittellinie nach unten.
 * Kachelbreite 176px (w-44) + Gap 24px (gap-6) = 200px Abstand zwischen Mittelpunkten.
 */
function GfManagerConnector({ gfCount }: { gfCount: number }) {
  if (gfCount === 0) return null

  const cardWidth = 176
  const gap = 24
  const totalWidth = gfCount * cardWidth + (gfCount - 1) * gap
  const halfCard = cardWidth / 2
  const svgH = 40

  if (gfCount === 1) {
    return (
      <svg width={totalWidth} height={svgH} className="overflow-visible">
        <line x1={totalWidth / 2} y1={0} x2={totalWidth / 2} y2={svgH}
          stroke="hsl(var(--border))" strokeWidth={2} />
      </svg>
    )
  }

  // Mitte des ersten und letzten GF-Karte
  const x1 = halfCard
  const x2 = totalWidth - halfCard
  const midX = totalWidth / 2
  const bridgeY = 14  // Y-Position der horizontalen Brücke

  return (
    <svg width={totalWidth} height={svgH} className="overflow-visible">
      {/* Kurze Linien von jeder GF-Karte nach oben zur Brücke */}
      {Array.from({ length: gfCount }).map((_, i) => {
        const cx = halfCard + i * (cardWidth + gap)
        return (
          <line key={i} x1={cx} y1={0} x2={cx} y2={bridgeY}
            stroke="hsl(var(--border))" strokeWidth={2} />
        )
      })}
      {/* Horizontale Brückenlinie */}
      <line x1={x1} y1={bridgeY} x2={x2} y2={bridgeY}
        stroke="hsl(var(--border))" strokeWidth={2} />
      {/* Senkrechte Linie von der Mitte der Brücke nach unten */}
      <line x1={midX} y1={bridgeY} x2={midX} y2={svgH}
        stroke="hsl(var(--border))" strokeWidth={2} />
    </svg>
  )
}

/** Verbindungslinien von Manager zu mehreren Mitarbeitern */
function ManagerEmployeeConnector({ employeeCount }: { employeeCount: number }) {
  if (employeeCount === 0) return null
  const cardWidth = 176
  const gap = 16
  const totalWidth = employeeCount * cardWidth + (employeeCount - 1) * gap
  const halfCard = cardWidth / 2
  const svgH = 40
  const bridgeY = 26

  if (employeeCount === 1) {
    return (
      <svg width={totalWidth} height={svgH} className="overflow-visible">
        <line x1={totalWidth / 2} y1={0} x2={totalWidth / 2} y2={svgH}
          stroke="hsl(var(--border))" strokeWidth={2} />
      </svg>
    )
  }

  const midX = totalWidth / 2

  return (
    <svg width={totalWidth} height={svgH} className="overflow-visible">
      {/* Senkrechte Linie von Manager zur Brücke */}
      <line x1={midX} y1={0} x2={midX} y2={bridgeY}
        stroke="hsl(var(--border))" strokeWidth={2} />
      {/* Horizontale Brücke */}
      <line x1={halfCard} y1={bridgeY} x2={totalWidth - halfCard} y2={bridgeY}
        stroke="hsl(var(--border))" strokeWidth={2} />
      {/* Kurze Linien von Brücke zu jedem Mitarbeiter */}
      {Array.from({ length: employeeCount }).map((_, i) => {
        const cx = halfCard + i * (cardWidth + gap)
        return (
          <line key={i} x1={cx} y1={bridgeY} x2={cx} y2={svgH}
            stroke="hsl(var(--border))" strokeWidth={2} />
        )
      })}
    </svg>
  )
}

export function OrgChart({ members, userRole, managerOwnId, onRefresh }: OrgChartProps) {
  const [editMember, setEditMember] = useState<OrgMember | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addReportsTo, setAddReportsTo] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrgMember | null>(null)

  const gfs       = members.filter(m => m.position === 'geschaeftsfuehrer')
  const managers  = members.filter(m => m.position === 'manager')
  const employees = members.filter(m => m.position === 'mitarbeiter')

  // Manager sieht nur seine eigenen Mitarbeiter
  const visibleEmployees = userRole === 'manager'
    ? employees.filter(e => e.reports_to === managerOwnId)
    : employees

  // Erster Manager (für reports_to beim Hinzufügen durch Manager)
  const firstManager = managers[0]

  function openAdd() {
    // Manager fügt immer unter sich hinzu
    setAddReportsTo(userRole === 'manager' ? (managerOwnId ?? null) : null)
    setAddOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/organisation/members/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Mitglied gelöscht')
      onRefresh()
    } catch {
      toast.error('Löschen fehlgeschlagen')
    } finally {
      setDeleteTarget(null)
    }
  }

  const canAdd = userRole === 'admin' || userRole === 'manager'

  return (
    <div className="rounded-xl border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-base font-semibold">Organigramm</h2>
        {canAdd && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            {userRole === 'manager' ? 'Mitarbeiter hinzufügen' : 'Neu'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex flex-col items-center min-w-fit mx-auto">

          {/* Ebene 1: Geschäftsführer */}
          {gfs.length > 0 && (
            <div className="flex gap-6 items-start">
              {gfs.map((gf) => (
                <OrgMemberCard
                  key={gf.id}
                  member={gf}
                  userRole={userRole}
                  managerOwnId={managerOwnId}
                  onEdit={(m) => { setEditMember(m); setEditOpen(true) }}
                  onDelete={userRole === 'admin' ? (m) => setDeleteTarget(m) : undefined}
                />
              ))}
            </div>
          )}

          {/* GF → Manager Verbindung */}
          {managers.length > 0 && gfs.length > 0 && (
            <GfManagerConnector gfCount={gfs.length} />
          )}

          {/* Ebene 2: Manager */}
          {managers.length > 0 && (
            <div className="flex gap-6 items-start">
              {managers.map((manager) => (
                <OrgMemberCard
                  key={manager.id}
                  member={manager}
                  userRole={userRole}
                  managerOwnId={managerOwnId}
                  onEdit={(m) => { setEditMember(m); setEditOpen(true) }}
                  onDelete={userRole === 'admin' ? (m) => setDeleteTarget(m) : undefined}
                />
              ))}
            </div>
          )}

          {/* Manager → Mitarbeiter Verbindung */}
          {visibleEmployees.length > 0 && (
            <ManagerEmployeeConnector employeeCount={visibleEmployees.length} />
          )}

          {/* Ebene 3: Mitarbeiter */}
          {visibleEmployees.length > 0 && (
            <div className="flex gap-4 flex-wrap justify-center">
              {visibleEmployees.map((emp) => (
                <OrgMemberCard
                  key={emp.id}
                  member={emp}
                  userRole={userRole}
                  managerOwnId={managerOwnId}
                  onEdit={(m) => { setEditMember(m); setEditOpen(true) }}
                  onDelete={(m) => setDeleteTarget(m)}
                />
              ))}
            </div>
          )}

          {members.length === 0 && (
            <p className="text-sm text-muted-foreground py-8">
              Noch keine Mitglieder angelegt.
            </p>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <EditMemberDialog
        member={editMember}
        open={editOpen}
        onOpenChange={setEditOpen}
        userRole={userRole}
        onSaved={onRefresh}
      />

      {/* Add Dialog */}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        userRole={userRole}
        defaultReportsTo={addReportsTo ?? (userRole === 'manager' ? managerOwnId ?? null : firstManager?.id ?? null)}
        fixedPosition={userRole === 'manager' ? 'mitarbeiter' : undefined}
        availableParents={userRole === 'admin' ? [...gfs, ...managers] : undefined}
        onSaved={onRefresh}
      />

      {/* Delete Bestätigung */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitglied löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <><strong>{deleteTarget.name}</strong> wird aus dem Organigramm entfernt. Diese Aktion ist nicht rückgängig zu machen.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
