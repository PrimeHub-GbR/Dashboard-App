'use client'

import type { KeyboardEvent } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CashAccount } from '@/lib/cashflow'
import {
  INVENTORY_FIELDS,
  INVENTORY_FIELD_META,
  InventoryField,
} from '@/lib/cashflow-inventory'

export type FieldStatus = 'idle' | 'saving' | 'saved' | 'faded' | 'error'

export interface InventoryFieldState {
  /** Angezeigter Text (Entwurf oder normalisierter gespeicherter Wert) */
  text: string
  status: FieldStatus
  /** Fehlermeldung (ungültig oder Serverfehler) */
  error: string | null
}

interface Props {
  account: CashAccount
  fields: Record<InventoryField, InventoryFieldState>
  onChange: (field: InventoryField, text: string) => void
  onCommit: (field: InventoryField) => void
  onRevert: (field: InventoryField) => void
}

/**
 * Eine Konto-Zeile der Lager-Eingabe. Ein Markup für beide Ansichten:
 * mobil eine Karte (Felder 1-spaltig, ab `sm` 2×2), ab `xl` per `xl:contents` Teil des Rasters der Karte.
 */
export function InventoryEntryRow({ account, fields, onChange, onCommit, onRevert }: Props) {
  return (
    <div className="space-y-3 rounded-lg border p-4 xl:contents">
      <div
        className="flex min-w-0 items-center gap-2 xl:h-9 xl:py-0"
        title={account.name}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: account.color }}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-medium xl:font-normal">{account.name}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:contents">
        {INVENTORY_FIELDS.map((field) => (
          <InventoryFieldInput
            key={field}
            account={account}
            field={field}
            state={fields[field]}
            onChange={(t) => onChange(field, t)}
            onCommit={() => onCommit(field)}
            onRevert={() => onRevert(field)}
          />
        ))}
      </div>
    </div>
  )
}

interface FieldProps {
  account: CashAccount
  field: InventoryField
  state: InventoryFieldState
  onChange: (text: string) => void
  onCommit: () => void
  onRevert: () => void
}

function InventoryFieldInput({ account, field, state, onChange, onCommit, onRevert }: FieldProps) {
  const meta = INVENTORY_FIELD_META[field]
  const fieldId = `inv-${account.id}-${field}`
  const errorId = `${fieldId}-error`
  const invalid = state.error !== null

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onRevert()
    }
  }

  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={fieldId} className="text-xs font-normal text-muted-foreground xl:sr-only">
        {meta.shortLabel}
        <span className="sr-only"> – {account.name}</span>
      </Label>
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Input
            id={fieldId}
            value={state.text}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={onKeyDown}
            inputMode={meta.kind === 'units' ? 'numeric' : meta.allowNegative ? 'text' : 'decimal'}
            placeholder="—"
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={cn(
              'h-9 pr-10 text-right tabular-nums',
              invalid && 'border-destructive focus-visible:ring-destructive'
            )}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {meta.kind === 'units' ? 'Stk.' : '€'}
          </span>
        </div>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
          {state.status === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : invalid ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : state.status === 'saved' || state.status === 'faded' ? (
            <Check
              className={cn(
                'h-4 w-4 text-green-700 transition-opacity duration-200 dark:text-green-400',
                state.status === 'faded' ? 'opacity-0' : 'opacity-100'
              )}
            />
          ) : null}
        </span>
      </div>
      {invalid && (
        <p id={errorId} className="pr-[1.375rem] text-xs text-destructive">
          {state.error}
        </p>
      )}
    </div>
  )
}
