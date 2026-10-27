'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Package, RotateCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CashAccount, formatMonthLabel, formatMonthShort } from '@/lib/cashflow'
import {
  CashInventory,
  INVENTORY_FIELDS,
  INVENTORY_FIELD_META,
  InventoryField,
  InventoryUpsertRequest,
  InventoryUpsertResponse,
  extractApiError,
  formatInputValue,
  formatInventoryValue,
  inventoryEntryAccounts,
  normalizeInventoryRow,
  parseInventoryInput,
} from '@/lib/cashflow-inventory'
import { FieldStatus, InventoryEntryRow, InventoryFieldState } from './InventoryEntryRow'

interface Props {
  /** Gewählter Monat 'YYYY-MM-01' (gleich wie Barmittel-Karte) */
  month: string
  /** Konten (aktive); die Karte filtert selbst auf Provider Amazon */
  accounts: CashAccount[]
  inventory: CashInventory[]
  loading: boolean
  error: boolean
  onRetry: () => void
  /**
   * Nach erfolgreichem Speichern: nur dieses eine Feld in den lokalen Stand
   * übernehmen (kein globales Neuladen).
   */
  onFieldSaved: (
    accountId: string,
    month: string,
    field: InventoryField,
    value: number | null,
    serverRow: CashInventory | null
  ) => void
}

const GRID =
  'xl:grid xl:items-start xl:gap-x-3 xl:gap-y-1 xl:grid-cols-[minmax(9rem,1fr)_repeat(4,minmax(8.5rem,11rem))]'

const SERVER_ERROR = 'Nicht gespeichert. Feld erneut verlassen, um es nochmal zu versuchen.'

/** Fehler mit nutzerlesbarer (deutscher) Meldung */
class SaveError extends Error {}

function fieldKey(accountId: string, field: InventoryField) {
  return `${accountId}:${field}`
}

export function InventoryEntryCard({
  month,
  accounts,
  inventory,
  loading,
  error,
  onRetry,
  onFieldSaved,
}: Props) {
  const amazonAccounts = useMemo(() => inventoryEntryAccounts(accounts), [accounts])

  const rowByAccount = useMemo(() => {
    const map = new Map<string, CashInventory>()
    for (const r of inventory) if (r.month === month) map.set(r.account_id, r)
    return map
  }, [inventory, month])

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState<Record<string, FieldStatus>>({})
  const [announcement, setAnnouncement] = useState('')
  const seqRef = useRef<Record<string, number>>({})
  const inflightRef = useRef<Record<string, string | undefined>>({})
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({})

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const list of Object.values(timers)) list.forEach(clearTimeout)
    }
  }, [])

  function stored(accountId: string, field: InventoryField): number | null {
    return rowByAccount.get(accountId)?.[field] ?? null
  }

  function setStatus(key: string, status: FieldStatus) {
    setStatuses((s) => ({ ...s, [key]: status }))
  }

  function clearTimers(key: string) {
    timersRef.current[key]?.forEach(clearTimeout)
    timersRef.current[key] = []
  }

  function setError(key: string, msg: string | null) {
    setErrors((e) => {
      if (msg === null) {
        if (!(key in e)) return e
        const next = { ...e }
        delete next[key]
        return next
      }
      return { ...e, [key]: msg }
    })
  }

  function dropDraft(key: string, onlyIf?: string) {
    setDrafts((d) => {
      if (!(key in d)) return d
      if (onlyIf !== undefined && d[key] !== onlyIf) return d
      const next = { ...d }
      delete next[key]
      return next
    })
  }

  function handleChange(acc: CashAccount, field: InventoryField, text: string) {
    setDrafts((d) => ({ ...d, [fieldKey(acc.id, field)]: text }))
  }

  function handleRevert(acc: CashAccount, field: InventoryField) {
    const key = fieldKey(acc.id, field)
    dropDraft(key)
    setError(key, null)
    if (statuses[key] === 'error') setStatus(key, 'idle')
  }

  async function handleCommit(acc: CashAccount, field: InventoryField) {
    const key = fieldKey(acc.id, field)
    const text = drafts[key]
    if (text === undefined) return // nichts geändert

    const meta = INVENTORY_FIELD_META[field]
    const current = stored(acc.id, field)
    const parsed = parseInventoryInput(text, field)

    if (!parsed.ok) {
      setError(
        key,
        current !== null
          ? `${parsed.error}. Gespeichert bleibt: ${formatInventoryValue(field, current)}`
          : parsed.error
      )
      clearTimers(key)
      setStatus(key, 'idle')
      return
    }

    // Unverändert -> kein Request, Anzeige normalisieren. Läuft für dieses Feld noch ein
    // Request mit einem anderen Wert, muss der gespeicherte Wert trotzdem zurückgeschrieben
    // werden, sonst gewinnt die ältere Eingabe.
    if (parsed.value === current && inflightRef.current[key] === undefined) {
      dropDraft(key)
      setError(key, null)
      if (statuses[key] === 'error') setStatus(key, 'idle')
      return
    }

    // Derselbe Text wird gerade gespeichert (z. B. Enter, dann Blur) -> kein Doppel-Request
    if (inflightRef.current[key] === text) return

    const seq = (seqRef.current[key] ?? 0) + 1
    seqRef.current[key] = seq
    clearTimers(key)
    setError(key, null)
    setStatus(key, 'saving')
    inflightRef.current[key] = text

    const body: InventoryUpsertRequest = { account_id: acc.id, month, [field]: parsed.value }

    try {
      const res = await fetch('/api/cashflow/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const apiMsg = res.status === 400 ? extractApiError(json) ?? 'Wert ungültig' : null
        throw new SaveError(apiMsg ?? SERVER_ERROR)
      }

      const data = (json ?? {}) as Partial<InventoryUpsertResponse>
      const serverRow =
        data.inventory && typeof data.inventory === 'object'
          ? normalizeInventoryRow(data.inventory as unknown as Record<string, unknown>)
          : null
      const savedValue = serverRow ? serverRow[field] : null

      // Ein neuerer Request für dasselbe Feld läuft -> diese Antwort ist überholt
      if (seqRef.current[key] !== seq) return
      inflightRef.current[key] = undefined
      onFieldSaved(acc.id, month, field, savedValue, serverRow)
      dropDraft(key, text)
      setStatus(key, 'saved')
      setAnnouncement(
        `${acc.name}: ${meta.shortLabel} ${savedValue === null ? 'entfernt' : 'gespeichert'}`
      )
      timersRef.current[key] = [
        setTimeout(() => setStatus(key, 'faded'), 2000),
        setTimeout(() => setStatus(key, 'idle'), 2200),
      ]
    } catch (err) {
      if (seqRef.current[key] !== seq) return
      inflightRef.current[key] = undefined
      // Netzfehler (TypeError o. ä.) -> Standardmeldung, nie englischer Browsertext
      const msg = err instanceof SaveError ? err.message : SERVER_ERROR
      setStatus(key, 'error')
      setError(key, msg)
      toast.error(`Speichern fehlgeschlagen — ${acc.name}: ${meta.shortLabel}`)
    }
  }

  function fieldState(acc: CashAccount, field: InventoryField): InventoryFieldState {
    const key = fieldKey(acc.id, field)
    return {
      text: drafts[key] ?? formatInputValue(field, stored(acc.id, field)),
      status: statuses[key] ?? 'idle',
      error: errors[key] ?? null,
    }
  }

  // Live-Summe: gespeicherte Werte + gültige Entwürfe
  const { totals, hasInvalid } = useMemo(() => {
    const totals: Record<InventoryField, number | null> = {
      units: null,
      purchase_value: null,
      potential_revenue: null,
      potential_profit: null,
    }
    let hasInvalid = false
    for (const acc of amazonAccounts) {
      const row = rowByAccount.get(acc.id)
      for (const f of INVENTORY_FIELDS) {
        const draft = drafts[fieldKey(acc.id, f)]
        let v: number | null = row?.[f] ?? null
        if (draft !== undefined) {
          const p = parseInventoryInput(draft, f)
          if (p.ok) v = p.value
          else hasInvalid = true
        }
        if (v !== null) totals[f] = Math.round(((totals[f] ?? 0) + v) * 100) / 100
      }
    }
    return { totals, hasInvalid }
  }, [amazonAccounts, rowByAccount, drafts])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lagerbestand — {formatMonthLabel(month)}</CardTitle>
        <CardDescription>Amazon-Konten · Gesamtwerte zum Monatsende, nicht pro Stück</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {amazonAccounts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Noch kein Amazon-Konto. Lege im Tab „Konten“ ein Amazon-Konto an, dann erscheint es
              hier automatisch.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Lagerbestand wird geladen">
            {amazonAccounts.map((a) => (
              <Skeleton key={a.id} className="h-9 w-full" />
            ))}
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <AlertDescription>
                Lagerbestand konnte nicht geladen werden. Die Barmittel kannst du trotzdem
                eintragen.
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="shrink-0 self-start text-foreground sm:self-center"
              >
                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Erneut laden
              </Button>
            </div>
          </Alert>
        ) : (
          <>
            <div className={`space-y-3 xl:space-y-0 ${GRID}`}>
              {/* Kopfzeile (nur Desktop) */}
              <div className="hidden xl:contents" aria-hidden="true">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Konto
                </span>
                {INVENTORY_FIELDS.map((f) => (
                  <span
                    key={f}
                    className="pr-6 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {INVENTORY_FIELD_META[f].shortLabel}
                  </span>
                ))}
              </div>

              {amazonAccounts.map((acc) => (
                <InventoryEntryRow
                  key={acc.id}
                  account={acc}
                  fields={{
                    units: fieldState(acc, 'units'),
                    purchase_value: fieldState(acc, 'purchase_value'),
                    potential_revenue: fieldState(acc, 'potential_revenue'),
                    potential_profit: fieldState(acc, 'potential_profit'),
                  }}
                  onChange={(f, t) => handleChange(acc, f, t)}
                  onCommit={(f) => handleCommit(acc, f)}
                  onRevert={(f) => handleRevert(acc, f)}
                />
              ))}
            </div>

            <InventorySumRow month={month} totals={totals} hasInvalid={hasInvalid} />

            <p className="text-xs text-muted-foreground">
              Werte werden automatisch gespeichert, sobald du das Feld verlässt. Ein leeres Feld
              entfernt nur diesen einen Wert.
            </p>
          </>
        )}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </CardContent>
    </Card>
  )
}

interface SumProps {
  month: string
  totals: Record<InventoryField, number | null>
  hasInvalid: boolean
}

function SumValue({ field, value }: { field: InventoryField; value: number | null }) {
  return (
    <>
      <span className="sr-only">Summe {INVENTORY_FIELD_META[field].shortLabel}: </span>
      {value === null ? (
        <span className="text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">kein Wert</span>
        </span>
      ) : (
        formatInventoryValue(field, value)
      )}
    </>
  )
}

function InventorySumRow({ month, totals, hasInvalid }: SumProps) {
  const title = `Summe ${formatMonthShort(month)}`
  const invalidNote = hasInvalid && (
    <p className="text-xs text-muted-foreground">Ungültige Eingaben sind nicht mitgezählt.</p>
  )
  return (
    <>
      {/* Desktop: gleiche Raster-Vorlage wie die Kontozeilen */}
      <div className="hidden xl:block">
        <div className={`${GRID} mt-1 border-t pt-3`}>
          <span className="text-sm font-medium">{title}</span>
          {INVENTORY_FIELDS.map((f) => (
            <span key={f} className="pr-[2.875rem] text-right font-semibold tabular-nums">
              <SumValue field={f} value={totals[f]} />
            </span>
          ))}
        </div>
        {invalidNote && <div className="mt-1">{invalidNote}</div>}
      </div>

      {/* Mobil: eigener Block */}
      <div className="space-y-3 rounded-lg bg-muted/50 p-4 xl:hidden">
        <p className="text-sm font-medium">{title}</p>
        <div className="grid grid-cols-2 gap-3">
          {INVENTORY_FIELDS.map((f) => (
            <div key={f} className="min-w-0">
              <p className="text-xs text-muted-foreground" aria-hidden="true">
                {INVENTORY_FIELD_META[f].shortLabel}
              </p>
              <p className="break-words font-semibold tabular-nums">
                <SumValue field={f} value={totals[f]} />
              </p>
            </div>
          ))}
        </div>
        {invalidNote}
      </div>
    </>
  )
}
