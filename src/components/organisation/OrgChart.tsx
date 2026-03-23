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
 * Verbindungslinien-SVG zwischen zwei Ebenen.
 * Zeichnet eine horizontale Brücke über GF-Kacheln und eine
 * vertikale Linie zur Manager-Kachel darunter.
 */
function GfManagerConnector({ gfCount }: { gfCount: number }) {
  if (gfCount === 0) return null

  if (gfCount === 1) {
    // Einfache senkrechte Linie
    return <div className="w-px h-8 bg-border mx-auto" />
  }

  // Mehrere GFs: horizontale Brücke + Linie nach unten zur Mitte
  // Kachelbreite 176px (w-44) + Gap 24px (gap-6) = 200px pro GF
  const totalWidth = gfCount * 176 + (gfCount - 1) * 24
  const halfGfCard = 88 // halbe Kachelbreite

  return (
    <div className="flex flex-col items-center" style={{ width: totalWidth }}>
      <svg
        width={totalWidth}
        height={32}
        className="overflow-visible"
      >
        {/* Horizontale Linie von Mitte GF1 zu Mitte GF2 */}
        <line
          x1={halfGfCard}
          y1={0}
          x2={totalWidth - halfGfCard}
          y2={0}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
        {/* Senkrechte Linien an den GF-Kacheln */}
        {Array.from({ length: gfCount }).map((_, i) => (
          <line
            key={i}
            x1={halfGfCard + i * 200}
            y1={0}
            x2={halfGfCard + i * 200}
            y2={8}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        ))}
        {/* Vertikale Mittellinie nach unten */}
        <line
          x1={totalWidth / 2}
          y1={0}
          x2={totalWidth / 2}
          y2={32}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}

export function OrgChart({ members, userRole, managerOwnId, onRefresh }: OrgChartProps) {
  const [editMember, setEditMember] = useState<OrgMember | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addReportsTo, setAddReportsTo] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrgMember | null>(null)

  const gfs      = members.filter(m => m.position === 'geschaeftsfuehrer')
  const managers = members.filter(m => m.position === 'manager')
  const employees = members.filter(m => m.position === 'mitarbeiter')

  const visibleEmployees = userRole === 'manager'
    ? employees.filter(e => e.reports_to === managerOwnId)
    : employees

  function openEdit(member: OrgMember) {
    setEditMember(member)
    setEditOpen(true)
  }

  function openAddBelow(managerId: string) {
    setAddReportsTo(managerId)
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

  return (
    <div className="rounded-xl border bg-card p-6 space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Organigramm</h2>
        {userRole === 'admin' && (
          <Button size="sm" variant="outline" className="gap-1"
            onClick={() => { setAddReportsTo(null); setAddOpen(true) }}>
            <Plus className="h-3.5 w-3.5" />
            Neu
          </Button>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
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
                  onEdit={openEdit}
                  onDelete={userRole === 'admin' ? (m) => setDeleteTarget(m) : undefined}
                />
              ))}
            </div>
          )}

          {/* Verbindung GF → Manager (Brückenlinien bei mehreren GFs) */}
          {managers.length > 0 && gfs.length > 0 && (
            <GfManagerConnector gfCount={gfs.length} />
          )}

          {/* Ebene 2: Manager */}
          {managers.length > 0 && (
            <div className="flex gap-6 items-start">
              {managers.map((manager) => {
                const canAddBelow =
                  userRole === 'admin' ||
                  (userRole === 'manager' && manager.id === managerOwnId)
                return (
                  <OrgMemberCard
                    key={manager.id}
                    member={manager}
                    userRole={userRole}
                    managerOwnId={managerOwnId}
                    onEdit={openEdit}
                    onDelete={userRole === 'admin' ? (m) => setDeleteTarget(m) : undefined}
                    showAddBelow={canAddBelow}
                    onAddBelow={() => openAddBelow(manager.id)}
                  />
                )
              })}
            </div>
          )}

          {/* Verbindung Manager → Mitarbeiter */}
          {visibleEmployees.length > 0 && (
            <div className="flex flex-col items-center">
              <div className="w-px h-8 bg-border" />
              {visibleEmployees.length > 1 && (
                <svg
                  width={(visibleEmployees.length - 1) * 196}
                  height={1}
                  className="overflow-visible"
                >
                  <line
                    x1={0} y1={0}
                    x2={(visibleEmployees.length - 1) * 196} y2={0}
                    stroke="hsl(var(--border))" strokeWidth={1}
                  />
                </svg>
              )}
            </div>
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
                  onEdit={openEdit}
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
        defaultReportsTo={addReportsTo}
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
                <>
                  <strong>{deleteTarget.name}</strong> wird aus dem Organigramm entfernt.
                  Diese Aktion ist nicht rückgängig zu machen.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
