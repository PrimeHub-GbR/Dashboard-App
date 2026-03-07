"use client"

import { useState } from "react"
import { Link2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useEanAsinMap } from "@/hooks/useEanAsinMap"

interface EanAsinMapManagerProps {
  onMappingChange?: () => void
}

export function EanAsinMapManager({ onMappingChange }: EanAsinMapManagerProps) {
  const { mappings, isLoading, error, addMapping, deleteMapping } = useEanAsinMap()
  const [ean, setEan] = useState("")
  const [asin, setAsin] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setIsSaving(true)
    const err = await addMapping(ean.trim(), asin.trim().toUpperCase())
    if (err) {
      setFormError(err)
    } else {
      setEan("")
      setAsin("")
      onMappingChange?.()
    }
    setIsSaving(false)
  }

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return
    setDeleteError(null)
    setDeletingId(confirmDeleteId)
    setConfirmDeleteId(null)
    const err = await deleteMapping(confirmDeleteId)
    if (err) setDeleteError(err)
    else onMappingChange?.()
    setDeletingId(null)
  }

  return (
    <>
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="mr-2 h-4 w-4" />
          EAN → ASIN
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>EAN → ASIN Mapping verwalten</DialogTitle>
        </DialogHeader>

        {/* Add form */}
        <form onSubmit={handleAdd} className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="map-ean" className="text-xs">EAN</Label>
            <Input
              id="map-ean"
              placeholder="z.B. 4012345678901"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              className="font-mono"
              required
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="map-asin" className="text-xs">ASIN</Label>
            <Input
              id="map-asin"
              placeholder="z.B. B08XYZ12345"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              className="font-mono uppercase"
              required
            />
          </div>
          <Button type="submit" disabled={isSaving} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Hinzufügen
          </Button>
        </form>

        {formError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-sm">{formError}</AlertDescription>
          </Alert>
        )}

        {deleteError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-sm">{deleteError}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Mappings table */}
        <div className="overflow-auto flex-1 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EAN</TableHead>
                <TableHead>ASIN</TableHead>
                <TableHead>Hinzugefügt</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {[0, 1, 2, 3].map((j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-20 text-center text-muted-foreground"
                  >
                    Noch keine Mappings vorhanden
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.ean}</TableCell>
                    <TableCell className="font-mono text-sm">{m.asin}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteId(m.id)}
                        disabled={deletingId === m.id}
                        aria-label="Mapping löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          {mappings.length} Mapping{mappings.length !== 1 ? "s" : ""}
        </p>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mapping löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Diese Aktion kann nicht rückgängig gemacht werden. Das EAN → ASIN Mapping wird dauerhaft gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
