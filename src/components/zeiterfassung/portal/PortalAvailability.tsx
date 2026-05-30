'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Save, ChevronLeft, ChevronRight, Info, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const SESSION_TTL = 8 * 60 * 60 * 1000

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type Day = typeof DAYS[number]

const DAY_LABEL_DE: Record<Day, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

interface DayTime { from: string; to: string }
type Availability = Record<Day, DayTime | null>

interface Submission {
  id: string
  week_start: string
  availability: Availability
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

interface PortalSession {
  id: string
  name: string
  color: string
  loginAt: number
}

function defaultAvailability(): Availability {
  return {
    mon: { from: '09:00', to: '17:00' },
    tue: { from: '09:00', to: '17:00' },
    wed: { from: '09:00', to: '17:00' },
    thu: { from: '09:00', to: '17:00' },
    fri: { from: '09:00', to: '17:00' },
    sat: null,
    sun: null,
  }
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
  return `${fmt(monday)} – ${fmt(sunday)}`
}

function getCalendarWeek(monday: Date): number {
  const d = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function isDeadlineMissed(targetMonday: Date, now: Date): boolean {
  // Frist: Freitag 18:00 vor der targetMonday-Woche
  const friday = new Date(targetMonday)
  friday.setDate(targetMonday.getDate() - 3)
  friday.setHours(18, 0, 0, 0)
  return now > friday && now < targetMonday
}

export function PortalAvailability() {
  const router = useRouter()
  const [session, setSession] = useState<PortalSession | null>(null)
  const [weekIndex, setWeekIndex] = useState(0)
  const [availability, setAvailability] = useState<Availability>(defaultAvailability())
  const [note, setNote] = useState('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Verfügbare Wochen: laufende KW + nächste 4
  const weekOptions = useMemo(() => {
    const baseMonday = getMondayOfWeek(new Date())
    return Array.from({ length: 5 }, (_, i) => addWeeks(baseMonday, i))
  }, [])

  const currentMonday = weekOptions[weekIndex]
  const currentWeekStart = formatYmd(currentMonday)

  // Session prüfen
  useEffect(() => {
    const stored = sessionStorage.getItem('portal_session')
    if (!stored) { router.replace('/portal'); return }
    try {
      const s = JSON.parse(stored) as PortalSession
      if (Date.now() - s.loginAt > SESSION_TTL) {
        sessionStorage.removeItem('portal_session')
        router.replace('/portal')
        return
      }
      setSession(s)
    } catch {
      router.replace('/portal')
    }
  }, [router])

  // Abgaben laden
  const loadSubmissions = useCallback(async (employeeId: string) => {
    setLoading(true)
    try {
      const baseMonday = getMondayOfWeek(new Date())
      const res = await fetch(
        `/api/zeiterfassung/portal/availability?employee_id=${employeeId}&from=${formatYmd(baseMonday)}`,
        { headers: { 'x-kiosk-token': KIOSK_TOKEN } }
      )
      if (!res.ok) throw new Error()
      const json = await res.json() as { submissions: Submission[] }
      setSubmissions(json.submissions ?? [])
    } catch {
      toast.error('Abgaben konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) loadSubmissions(session.id)
  }, [session, loadSubmissions])

  // Beim Wochenwechsel: bestehende Abgabe oder Defaults laden
  useEffect(() => {
    const existing = submissions.find(s => s.week_start === currentWeekStart)
    if (existing) {
      setAvailability(existing.availability)
      setNote(existing.note ?? '')
    } else {
      setAvailability(defaultAvailability())
      setNote('')
    }
  }, [currentWeekStart, submissions])

  function toggleDay(day: Day) {
    setAvailability(prev => ({
      ...prev,
      [day]: prev[day] === null ? { from: '09:00', to: '17:00' } : null,
    }))
  }

  function setDayTime(day: Day, field: 'from' | 'to', value: string) {
    setAvailability(prev => {
      const current = prev[day]
      if (!current) return prev
      return { ...prev, [day]: { ...current, [field]: value } }
    })
  }

  async function save() {
    if (!session) return
    setSaving(true)
    try {
      const res = await fetch('/api/zeiterfassung/portal/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-kiosk-token': KIOSK_TOKEN },
        body: JSON.stringify({
          employee_id: session.id,
          week_start: currentWeekStart,
          availability,
          note: note.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: unknown }
        throw new Error(typeof json.error === 'string' ? json.error : 'Fehler beim Speichern')
      }
      toast.success('Wochenplanung gespeichert')
      await loadSubmissions(session.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  if (!session) return null

  const currentSubmission = submissions.find(s => s.week_start === currentWeekStart)
  const deadlineMissed = isDeadlineMissed(currentMonday, new Date())
  const kw = getCalendarWeek(currentMonday)

  return (
    <div className="px-4 pt-4 pb-20 space-y-4 max-w-lg mx-auto">

      {/* Hinweis-Banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-3 flex gap-2 text-sm">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium leading-tight">Abgabe bis Freitag 18:00 Uhr für die folgende Woche.</p>
            <p className="text-muted-foreground text-xs leading-tight">
              Du kannst auch mehrere Wochen im Voraus eintragen.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Wochen-Stepper */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={weekIndex === 0}
            onClick={() => setWeekIndex(i => Math.max(0, i - 1))}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">KW {kw}</p>
            <p className="font-semibold text-sm">{formatWeekLabel(currentMonday)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={weekIndex >= weekOptions.length - 1}
            onClick={() => setWeekIndex(i => Math.min(weekOptions.length - 1, i + 1))}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </CardContent>
      </Card>

      {/* Status-Badge */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {currentSubmission ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="w-3 h-3" />
              Abgegeben
            </Badge>
          ) : (
            <Badge variant="outline">Noch nicht abgegeben</Badge>
          )}
          {deadlineMissed && (
            <Badge variant="destructive">Frist überschritten</Badge>
          )}
        </div>
      </div>

      {/* Tage */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-2">
          {DAYS.map(day => {
            const avail = availability[day]
            const isAvail = avail !== null
            return (
              <Card key={day}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={isAvail}
                      onCheckedChange={() => toggleDay(day)}
                      id={`switch-${day}`}
                    />
                    <label
                      htmlFor={`switch-${day}`}
                      className="flex-1 font-medium text-sm cursor-pointer select-none"
                    >
                      {DAY_LABEL_DE[day]}
                    </label>
                    {!isAvail && (
                      <span className="text-xs text-muted-foreground">nicht verfügbar</span>
                    )}
                  </div>
                  {isAvail && avail && (
                    <div className="mt-3 grid grid-cols-2 gap-2 pl-12">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">von</p>
                        <input
                          type="time"
                          value={avail.from}
                          onChange={e => setDayTime(day, 'from', e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">bis</p>
                        <input
                          type="time"
                          value={avail.to}
                          onChange={e => setDayTime(day, 'to', e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Notiz */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Notiz (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="z. B. Arzttermin am Dienstag, lieber kein Frühdienst…"
            rows={3}
            maxLength={500}
            className="resize-none text-sm"
          />
        </CardContent>
      </Card>

      {/* Speichern */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background border-t">
        <Button
          onClick={save}
          disabled={saving}
          className="w-full h-12 text-base font-semibold gap-2"
          style={{ backgroundColor: session.color }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Speichert…' : currentSubmission ? 'Aktualisieren' : 'Abgeben'}
        </Button>
      </div>

    </div>
  )
}
