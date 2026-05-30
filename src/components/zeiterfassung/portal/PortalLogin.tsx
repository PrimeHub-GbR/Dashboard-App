'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Delete, AlertTriangle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

interface EmployeeOption {
  id: string
  name: string
  color: string
  is_active?: boolean
}

interface LoggedInEmployee {
  id: string
  name: string
  color: string
  target_hours_per_month: number
  weekly_schedule: Record<string, number>
  privacy_accepted_at: string | null
}

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''

export function PortalLogin() {
  const router = useRouter()
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPrivacy, setPendingPrivacy] = useState<LoggedInEmployee | null>(null)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [acceptingPrivacy, setAcceptingPrivacy] = useState(false)

  useEffect(() => {
    // Bestehende Session prüfen
    const stored = sessionStorage.getItem('portal_session')
    if (stored) {
      try {
        const session = JSON.parse(stored) as { loginAt: number }
        if (Date.now() - session.loginAt < 8 * 60 * 60 * 1000) {
          router.replace('/portal/dashboard')
          return
        }
      } catch { /* ignore */ }
      sessionStorage.removeItem('portal_session')
    }

    // Mitarbeiterliste laden
    fetch('/api/zeiterfassung/employees')
      .then(r => r.json())
      .then((j: { employees: EmployeeOption[] }) => {
        setEmployees((j.employees ?? []).filter((e) => e.is_active !== false))
      })
      .catch(() => toast.error('Mitarbeiterliste konnte nicht geladen werden'))
  }, [router])

  function selectEmployee(emp: EmployeeOption) {
    setSelected(emp)
    setPin('')
    setError(null)
  }

  function appendDigit(d: string) {
    if (pin.length >= 8) return
    setPin(prev => prev + d)
    setError(null)
  }

  function deleteDigit() {
    setPin(prev => prev.slice(0, -1))
  }

  async function submit() {
    if (!selected || pin.length < 4) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/zeiterfassung/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-kiosk-token': KIOSK_TOKEN },
        body: JSON.stringify({ employee_id: selected.id, pin }),
      })
      const json = await res.json() as { employee?: LoggedInEmployee; error?: string }
      if (!res.ok || !json.employee) {
        setError(json.error ?? 'Falsche PIN')
        setPin('')
        return
      }
      // DSGVO-Check: noch nicht zugestimmt → Privacy-Dialog statt direkter Weiterleitung
      if (!json.employee.privacy_accepted_at) {
        setPendingPrivacy(json.employee)
        return
      }
      // Session in sessionStorage speichern
      sessionStorage.setItem('portal_session', JSON.stringify({
        ...json.employee,
        loginAt: Date.now(),
      }))
      router.push('/portal/dashboard')
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  async function confirmPrivacy() {
    if (!pendingPrivacy || !privacyChecked) return
    setAcceptingPrivacy(true)
    try {
      const res = await fetch('/api/zeiterfassung/portal/accept-privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-kiosk-token': KIOSK_TOKEN },
        body: JSON.stringify({ employee_id: pendingPrivacy.id }),
      })
      if (!res.ok) throw new Error()
      sessionStorage.setItem('portal_session', JSON.stringify({
        ...pendingPrivacy,
        privacy_accepted_at: new Date().toISOString(),
        loginAt: Date.now(),
      }))
      router.push('/portal/dashboard')
    } catch {
      toast.error('Bestätigung konnte nicht gespeichert werden')
    } finally {
      setAcceptingPrivacy(false)
    }
  }

  // Datenschutz-Dialog (Schritt 3, nur bei Erstanmeldung)
  if (pendingPrivacy) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-6 max-w-sm mx-auto">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full mx-auto mb-3 bg-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Datenschutz bestätigen</h1>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            Bitte bestätige die Verarbeitung deiner Arbeitszeit- und Planungsdaten,
            bevor du das Portal nutzt.
          </p>
        </div>

        <div className="w-full bg-card border rounded-2xl p-4 flex gap-3 items-start">
          <Checkbox
            id="privacy-accept"
            checked={privacyChecked}
            onCheckedChange={(v) => setPrivacyChecked(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="privacy-accept" className="text-sm leading-relaxed cursor-pointer select-none">
            Ich habe die <Link href="/portal/datenschutz" target="_blank" className="text-primary underline font-medium">Datenschutzerklärung</Link> gelesen
            und stimme der Verarbeitung meiner Daten zur Arbeitszeiterfassung und Wochenplanung zu.
          </label>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={confirmPrivacy}
            disabled={!privacyChecked || acceptingPrivacy}
            className="h-14 text-base font-semibold"
          >
            {acceptingPrivacy ? 'Speichert…' : 'Bestätigen und fortfahren'}
          </Button>
          <button
            onClick={() => { setPendingPrivacy(null); setPrivacyChecked(false); setSelected(null); setPin('') }}
            className="text-muted-foreground text-sm hover:text-foreground py-2"
            disabled={acceptingPrivacy}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  // PIN-Ansicht (Schritt 2)
  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-6 max-w-sm mx-auto">
        {/* Avatar */}
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl font-bold text-white shadow-lg"
            style={{ backgroundColor: selected.color }}
          >
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">{selected.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">PIN eingeben</p>
        </div>

        {/* PIN-Punkte */}
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < pin.length ? 'scale-110' : 'border-border'
              }`}
              style={i < pin.length ? { backgroundColor: selected.color, borderColor: selected.color } : {}}
            />
          ))}
        </div>

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-2 rounded-lg w-full justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => {
            if (key === '') return <div key={i} />
            if (key === '⌫') return (
              <button key={i} onClick={deleteDigit}
                className="h-16 rounded-2xl bg-muted flex items-center justify-center active:scale-95 transition-transform">
                <Delete className="w-6 h-6" />
              </button>
            )
            return (
              <button key={i} onClick={() => appendDigit(key)}
                className="h-16 rounded-2xl bg-muted hover:bg-muted/80 text-2xl font-semibold active:scale-95 transition-transform">
                {key}
              </button>
            )
          })}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={submit}
            disabled={pin.length < 4 || loading}
            className="h-14 text-base font-semibold"
            style={pin.length >= 4 ? { backgroundColor: selected.color } : {}}
          >
            {loading ? 'Anmelden…' : 'Anmelden'}
          </Button>
          <button onClick={() => { setSelected(null); setPin(''); setError(null) }}
            className="text-muted-foreground text-sm hover:text-foreground py-2">
            ← Andere Person wählen
          </button>
        </div>
      </div>
    )
  }

  // Mitarbeiter-Auswahl (Schritt 1)
  return (
    <div className="min-h-screen flex flex-col px-4 py-8 max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-baseline font-extrabold tracking-tight text-3xl select-none mb-1">
          <span className="text-foreground">Prime</span>
          <span style={{ color: '#1ad06a' }}>Hub</span>
        </div>
        <p className="text-muted-foreground text-sm">Wer bist du?</p>
      </div>

      {employees.length === 0 ? (
        <p className="text-center text-muted-foreground">Lade Mitarbeiterliste…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {employees.map(emp => (
            <button
              key={emp.id}
              onClick={() => selectEmployee(emp)}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl border bg-card hover:bg-accent active:scale-95 transition-all"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow"
                style={{ backgroundColor: emp.color }}
              >
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-sm text-center leading-tight">{emp.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
