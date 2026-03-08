"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ORDER_STATUS_OPTIONS } from "@/lib/order-types"
import type { Order } from "@/lib/order-types"

interface EditableCellProps {
  orderId: string
  field: keyof Order
  value: string | null
  displayValue: string
  isEdited: boolean
  isAdmin: boolean
  onEdit: (
    orderId: string,
    field: keyof Order,
    originalValue: string | null,
    newValue: string
  ) => void
}

export function EditableCell({
  orderId,
  field,
  value,
  displayValue,
  isEdited,
  isAdmin,
  onEdit,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(displayValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalValue(displayValue)
  }, [displayValue])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = useCallback(() => {
    if (!isAdmin) return
    setIsEditing(true)
    setLocalValue(displayValue)
  }, [isAdmin, displayValue])

  const handleConfirm = useCallback(
    (newVal: string) => {
      setIsEditing(false)
      onEdit(orderId, field, value, newVal)
    },
    [orderId, field, value, onEdit]
  )

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setLocalValue(displayValue)
  }, [displayValue])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleConfirm(localValue)
      } else if (e.key === "Escape") {
        handleCancel()
      }
    },
    [localValue, handleConfirm, handleCancel]
  )

  // Status field uses a Select dropdown
  if (isEditing && field === "status") {
    return (
      <Select
        value={localValue || ""}
        onValueChange={(val) => {
          handleConfirm(val)
        }}
        open
        onOpenChange={(open) => {
          if (!open) handleCancel()
        }}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Other editable fields use an Input
  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => handleConfirm(localValue)}
        className="h-8 text-xs"
        aria-label={`${field} bearbeiten`}
      />
    )
  }

  return (
    <div
      className={cn(
        "min-h-[2rem] flex items-center px-1 rounded text-sm",
        isAdmin && "cursor-pointer hover:bg-muted/50",
        isEdited && "bg-yellow-100 dark:bg-yellow-900/30"
      )}
      onClick={handleDoubleClick}
      title={isAdmin ? "Klick zum Bearbeiten" : undefined}
      role={isAdmin ? "button" : undefined}
      tabIndex={isAdmin ? 0 : undefined}
      onKeyDown={
        isAdmin
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleDoubleClick()
              }
            }
          : undefined
      }
      aria-label={
        isAdmin
          ? `${field}: ${displayValue || "leer"} - Klick zum Bearbeiten`
          : undefined
      }
    >
      <span className={cn(!displayValue && "text-muted-foreground italic")}>
        {displayValue || "-"}
      </span>
    </div>
  )
}
