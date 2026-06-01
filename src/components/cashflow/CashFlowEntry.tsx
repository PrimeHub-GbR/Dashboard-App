'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CashAccount,
  CashBalance,
  currentMonthKey,
  formatEUR,
  formatMonthLabel,
} from '@/lib/cashflow'

interface Props {
  accounts: CashAccount[]
  balances: CashBalance[]
  onChanged: () => void
}

export function CashFlowEntry({ accounts, balances, onChanged }: Props) {
  // Auswählbare Monate: vorhandene + aktueller Monat
  const availableMonths = useMemo(() => {
    const set = new Set<string>(balances.map((b) => b.month))
    set.add(currentMonthKey())
    return Array.from(set).sort().reverse()
  }, [balances])

  const [month, setMonth] = useState<string>(
    availableMonths[0] ?? currentMonthKey()
  )
  const [newMonth, setNewMonth] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  // Bestehende Werte für den gewählten Monat
  const balanceForMonth = useMemo(() => {
    const map = new Map<string, CashBalance>()
    for (const b of balances) {
      if (b.month === month) map.set(b.account_id, b)
    }
    return map
  }, [balances, month])

  // Lokaler Eingabe-State (account_id -> string); wird bei Monatswechsel in den Handlern geleert
  const [draft, setDraft] = useState<Record<string, string>>({})

  const providers = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.provider))),
    [accounts]
  )

  function displayValue(acc: CashAccount): string {
    if (draft[acc.id] !== undefined) return draft[acc.id]
    const existing = balanceForMonth.get(acc.id)
    return existing ? String(existing.amount) : ''
  }

  const monthTotal = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      const raw = displayValue(acc).replace(',', '.')
      const n = parseFloat(raw)
      return sum + (isNaN(n) ? 0 : n)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, draft, balanceForMonth])

  async function save(acc: CashAccount) {
    const raw = (draft[acc.id] ?? '').trim()
    const existing = balanceForMonth.get(acc.id)

    // Unverändert -> nichts tun
    if (draft[acc.id] === undefined) return

    setSaving(acc.id)
    try {
      if (raw === '') {
        // Geleert -> vorhandenen Stand löschen
        if (existing) {
          const res = await fetch(`/api/cashflow/balances/${existing.id}`, {
            method: 'DELETE',
          })
          if (!res.ok) throw new Error()
          toast.success(`${acc.name}: Eintrag entfernt`)
          onChanged()
        }
        return
      }

      const amount = parseFloat(raw.replace(',', '.'))
      if (isNaN(amount) || amount < 0) {
        toast.error('Bitte einen gültigen Betrag eingeben')
        return
      }

      const res = await fetch('/api/cashflow/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: acc.id, month, amount }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${acc.name}: ${formatEUR(amount)} gespeichert`)
      onChanged()
    } catch {
      toast.error('Speichern fehlgeschlagen')
    } finally {
      setSaving(null)
    }
  }

  function addMonth() {
    if (!/^\d{4}-\d{2}$/.test(newMonth)) {
      toast.error('Bitte einen Monat wählen')
      return
    }
    const key = `${newMonth}-01`
    setMonth(key)
    setDraft({})
    setNewMonth('')
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Keine aktiven Konten. Lege im Tab „Konten" mindestens ein Konto an.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Monatsauswahl */}
      <Card>
        <CardHeader>
          <CardTitle>Monat wählen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Vorhandener Monat</Label>
            <Select value={month} onValueChange={(v) => { setMonth(v); setDraft({}) }}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Neuen Monat hinzufügen</Label>
            <div className="flex gap-2">
              <Input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="w-44"
              />
              <Button type="button" variant="outline" onClick={addMonth}>
                <Plus className="mr-1 h-4 w-4" /> Öffnen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Eingabe je Konto, gruppiert nach Provider */}
      <Card>
        <CardHeader>
          <CardTitle>Barmittel — {formatMonthLabel(month)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {providers.map((provider) => (
            <div key={provider} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {provider}
              </p>
              <div className="space-y-2">
                {accounts
                  .filter((a) => a.provider === provider)
                  .map((acc) => (
                    <div key={acc.id} className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: acc.color }}
                      />
                      <Label className="flex-1 text-sm font-normal">{acc.name}</Label>
                      <div className="relative w-48">
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={displayValue(acc)}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [acc.id]: e.target.value }))
                          }
                          onBlur={() => save(acc)}
                          className="pr-8 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          €
                        </span>
                        {saving === acc.id && (
                          <Check className="absolute -right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium">Gesamt {formatMonthLabel(month)}</span>
            <span className="text-lg font-bold tabular-nums">{formatEUR(monthTotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Werte werden automatisch gespeichert, sobald du das Feld verlässt. Ein
            leeres Feld entfernt den gespeicherten Stand.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
