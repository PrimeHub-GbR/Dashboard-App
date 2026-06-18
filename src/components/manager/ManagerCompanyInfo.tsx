'use client'

import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CompanyInfo } from '@/lib/manager'
import { CompanyInfoDialog } from './CompanyInfoDialog'

interface ManagerCompanyInfoProps {
  info: CompanyInfo[]
  loading: boolean
  onChanged: () => void
}

const EMPTY_PLACEHOLDER = '— (noch nicht hinterlegt)'

export function ManagerCompanyInfo({ info, loading, onChanged }: ManagerCompanyInfoProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyInfo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompanyInfo | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, CompanyInfo[]>()
    const sorted = [...info].sort((a, b) => a.sort_order - b.sort_order)
    for (const i of sorted) {
      const cat = (i.category && i.category.trim()) || 'Allgemein'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(i)
    }
    return Array.from(map.entries())
  }, [info])

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(i: CompanyInfo) {
    setEditing(i)
    setDialogOpen(true)
  }

  async function handleCopy(i: CompanyInfo) {
    if (!i.value) return
    try {
      await navigator.clipboard.writeText(i.value)
      toast.success('Kopiert')
    } catch {
      toast.error('Kopieren nicht möglich')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      const res = await fetch(`/api/manager/company-info/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Löschen fehlgeschlagen')
        return
      }
      toast.success('Eintrag gelöscht')
      setDeleteTarget(null)
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {info.length} {info.length === 1 ? 'Eintrag' : 'Einträge'}
        </p>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Neuer Eintrag
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Lädt…</p>
      ) : info.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Noch keine Firmeninfos hinterlegt.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <Card>
                <CardContent className="divide-y p-0">
                  {items.map((i) => {
                    const hasValue = !!(i.value && i.value.trim())
                    return (
                      <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{i.label}</p>
                          <p className={`text-sm ${hasValue ? 'font-medium' : 'italic text-muted-foreground'} whitespace-pre-wrap break-words`}>
                            {hasValue ? i.value : EMPTY_PLACEHOLDER}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopy(i)}
                            disabled={!hasValue}
                            title="Kopieren"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(i)}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(i)}
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <CompanyInfoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        info={editing}
        onSaved={onChanged}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `„${deleteTarget.label}" wird dauerhaft entfernt.` : ''} Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={busyId === deleteTarget?.id}
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
