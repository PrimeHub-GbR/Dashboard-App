'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Delete, AlertTriangle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface EmployeeOption {
  id: string
  name: string
  color: string
  is_active?: boolean
}

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''

export function PortalLogin() {
  const router = useRouter()
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const json = await res.json() as { employee?: { id: string; name: string; color: string; target_hours_per_month: number; weekly_schedule: Record<string, number> }; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Falsche PIN')
        setPin('')
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
        <Clock className="w-10 h-10 mx-auto mb-3 text-primary" />
        <h1 className="text-2xl font-bold">Mitarbeiter-Portal</h1>
        <p className="text-muted-foreground text-sm mt-1">Wer bist du?</p>
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
