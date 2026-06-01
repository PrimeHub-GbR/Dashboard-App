'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CashAccount } from '@/lib/cashflow'

interface Props {
  accounts: CashAccount[]
  onChanged: () => void
}

interface FormState {
  id?: string
  provider: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  provider: '',
  name: '',
  color: '#22c55e',
  sort_order: 0,
  is_active: true,
}

export function CashFlowAccounts({ accounts, onChanged }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CashAccount | null>(null)

  function openCreate() {
    setForm({ ...EMPTY_FORM, sort_order: (accounts.length + 1) * 10 })
    setDialogOpen(true)
  }

  function openEdit(acc: CashAccount) {
    setForm({
      id: acc.id,
      provider: acc.provider,
      name: acc.name,
      color: acc.color,
      sort_order: acc.sort_order,
      is_active: acc.is_active,
    })
    setDialogOpen(true)
  }

  async function submit() {
    if (!form.provider.trim() || !form.name.trim()) {
      toast.error('Provider und Name sind erforderlich')
      return
    }
    setSubmitting(true)
    try {
      const url = form.id
        ? `/api/cashflow/accounts/${form.id}`
        : '/api/cashflow/accounts'
      const res = await fetch(url, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider.trim(),
          name: form.name.trim(),
          color: form.color,
          sort_order: form.sort_order,
          is_active: form.is_active,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Fehler')
      }
      toast.success(form.id ? 'Konto aktualisiert' : 'Konto angelegt')
      setDialogOpen(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/cashflow/accounts/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Konto gelöscht')
      onChanged()
    } catch {
      toast.error('Löschen fehlgeschlagen')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Konten verwalten</CardTitle>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Neues Konto
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-28 text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Noch keine Konten angelegt.
                </TableCell>
              </TableRow>
            )}
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell>
                  <span
                    className="block h-4 w-4 rounded-full"
                    style={{ backgroundColor: acc.color }}
                  />
                </TableCell>
                <TableCell className="font-medium">{acc.provider}</TableCell>
                <TableCell>{acc.name}</TableCell>
                <TableCell className="text-center">
                  {acc.is_active ? (
                    <Badge variant="secondary">Aktiv</Badge>
                  ) : (
                    <Badge variant="outline">Inaktiv</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(acc)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(acc)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Anlegen / Bearbeiten Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Konto bearbeiten' : 'Neues Konto'}</DialogTitle>
            <DialogDescription>
              Provider (z.B. Finom, Amazon) und Firma sowie Farbe für die Diagramme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-provider">Provider</Label>
              <Input
                id="cf-provider"
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="Finom"
                list="cf-provider-options"
              />
              <datalist id="cf-provider-options">
                {Array.from(new Set(accounts.map((a) => a.provider))).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">Firma</Label>
              <Input
                id="cf-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="PrimeHub"
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cf-color">Farbe</Label>
                <Input
                  id="cf-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-20 p-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-sort">Reihenfolge</Label>
                <Input
                  id="cf-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                  }
                  className="w-24"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="cf-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="cf-active">Aktiv (in Auswertung &amp; Eingabe sichtbar)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen Bestätigung */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konto löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  „{deleteTarget.provider} · {deleteTarget.name}" und{' '}
                  <strong>alle erfassten Monatsstände</strong> dieses Kontos werden
                  unwiderruflich gelöscht.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
