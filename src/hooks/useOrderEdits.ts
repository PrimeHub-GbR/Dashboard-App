"use client"

import { useCallback, useState } from "react"
import type { CellEdit, Order } from "@/lib/order-types"

interface UseOrderEditsReturn {
  pendingEdits: Map<string, CellEdit>
  hasPendingEdits: boolean
  editCell: (orderId: string, field: keyof Order, originalValue: string | null, newValue: string) => void
  discardEdit: (orderId: string, field: keyof Order) => void
  discardAll: () => void
  saveAll: () => Promise<boolean>
  isSaving: boolean
  saveError: string | null
  getEditedValue: (orderId: string, field: keyof Order) => string | undefined
  isEdited: (orderId: string, field: keyof Order) => boolean
}

function editKey(orderId: string, field: keyof Order): string {
  return `${orderId}::${field}`
}

export function useOrderEdits(): UseOrderEditsReturn {
  const [pendingEdits, setPendingEdits] = useState<Map<string, CellEdit>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const editCell = useCallback(
    (orderId: string, field: keyof Order, originalValue: string | null, newValue: string) => {
      setPendingEdits((prev) => {
        const next = new Map(prev)
        const key = editKey(orderId, field)

        // If editing back to original value, remove the edit
        if (newValue === (originalValue ?? "")) {
          next.delete(key)
        } else {
          next.set(key, { orderId, field, originalValue, newValue })
        }

        return next
      })
    },
    []
  )

  const discardEdit = useCallback((orderId: string, field: keyof Order) => {
    setPendingEdits((prev) => {
      const next = new Map(prev)
      next.delete(editKey(orderId, field))
      return next
    })
  }, [])

  const discardAll = useCallback(() => {
    setPendingEdits(new Map())
  }, [])

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (pendingEdits.size === 0) return true

    setIsSaving(true)
    setSaveError(null)

    try {
      // Group edits by orderId
      const editsByOrder = new Map<string, Record<string, string>>()

      for (const edit of pendingEdits.values()) {
        const existing = editsByOrder.get(edit.orderId) ?? {}
        existing[edit.field] = edit.newValue
        editsByOrder.set(edit.orderId, existing)
      }

      // Execute updates in parallel via API route (server-side Zod validation)
      const updates = Array.from(editsByOrder.entries()).map(
        async ([orderId, fields]) => {
          const response = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          })

          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(
              body.error ?? `Fehler beim Speichern von Bestellung ${orderId}`
            )
          }
        }
      )

      await Promise.all(updates)

      // Clear pending edits on success
      setPendingEdits(new Map())
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Aenderungen konnten nicht gespeichert werden"
      setSaveError(message)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [pendingEdits])

  const getEditedValue = useCallback(
    (orderId: string, field: keyof Order): string | undefined => {
      return pendingEdits.get(editKey(orderId, field))?.newValue
    },
    [pendingEdits]
  )

  const isEdited = useCallback(
    (orderId: string, field: keyof Order): boolean => {
      return pendingEdits.has(editKey(orderId, field))
    },
    [pendingEdits]
  )

  return {
    pendingEdits,
    hasPendingEdits: pendingEdits.size > 0,
    editCell,
    discardEdit,
    discardAll,
    saveAll,
    isSaving,
    saveError,
    getEditedValue,
    isEdited,
  }
}
