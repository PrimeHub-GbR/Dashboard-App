'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Settings2, Check, GraduationCap, Minus, Filter, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { SkillCell } from './SkillCell'
import { ManageSkillsDialog } from './ManageSkillsDialog'
import {
  type Employee, type Skill, type SkillEntry, type SkillStatus,
  type UserRole, POSITION_SHORT, POSITION_LABEL,
} from './types'

const CYCLE: Record<SkillStatus, SkillStatus> = { nein: 'lernt', lernt: 'kann', kann: 'nein' }

function entryKey(employeeId: string, skillId: string) {
  return `${employeeId}:${skillId}`
}

export function SkillMatrixClient({ userRole }: { userRole: UserRole }) {
  const canEdit = userRole === 'admin' || userRole === 'manager'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [statusMap, setStatusMap] = useState<Map<string, SkillStatus>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Eingeklappte Kategorien aus localStorage wiederherstellen
  useEffect(() => {
    try {
      const raw = localStorage.getItem('skill-matrix-collapsed')
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
    } catch { /* ignore */ }
  }, [])

  const persistCollapsed = useCallback((next: Set<string>) => {
    setCollapsed(next)
    try { localStorage.setItem('skill-matrix-collapsed', JSON.stringify([...next])) } catch { /* ignore */ }
  }, [])

  const toggleCategory = useCallback((category: string) => {
    persistCollapsed((() => {
      const next = new Set(collapsed)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })())
  }, [collapsed, persistCollapsed])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/skill-matrix')
      if (!res.ok) throw new Error()
      const json = await res.json() as { employees: Employee[]; skills: Skill[]; entries: SkillEntry[] }
      setEmployees(json.employees)
      setSkills(json.skills)
      const m = new Map<string, SkillStatus>()
      for (const e of json.entries) m.set(entryKey(e.employee_id, e.skill_id), e.status)
      setStatusMap(m)
    } catch {
      toast.error('Skill-Matrix konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const getStatus = useCallback(
    (employeeId: string, skillId: string): SkillStatus =>
      statusMap.get(entryKey(employeeId, skillId)) ?? 'nein',
    [statusMap],
  )

  async function cycle(employee: Employee, skill: Skill) {
    const key = entryKey(employee.id, skill.id)
    const current = statusMap.get(key) ?? 'nein'
    const next = CYCLE[current]

    // Optimistic update
    setStatusMap((prev) => {
      const m = new Map(prev)
      if (next === 'nein') m.delete(key)
      else m.set(key, next)
      return m
    })
    setPending((prev) => new Set(prev).add(key))

    try {
      const res = await fetch('/api/skill-matrix/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id, skill_id: skill.id, status: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert
      setStatusMap((prev) => {
        const m = new Map(prev)
        if (current === 'nein') m.delete(key)
        else m.set(key, current)
        return m
      })
      toast.error('Konnte nicht gespeichert werden')
    } finally {
      setPending((prev) => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
    }
  }

  // Skills nach Kategorie gruppieren, gefiltert nach Suche
  const groupedSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = skills
    if (q) filtered = skills.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    const map = new Map<string, Skill[]>()
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    return Array.from(map.entries())
  }, [skills, search])

  // Statistik pro Mitarbeiter: Anzahl "kann"
  const kannCount = useCallback(
    (employeeId: string) =>
      skills.reduce((acc, s) => acc + (getStatus(employeeId, s.id) === 'kann' ? 1 : 0), 0),
    [skills, getStatus],
  )

  // Reihe anzeigen? (bei "nur Lücken" nur Skills, die nicht alle können)
  const showRow = useCallback(
    (skillId: string) => {
      if (!onlyGaps) return true
      return employees.some((e) => getStatus(e.id, skillId) !== 'kann')
    },
    [onlyGaps, employees, getStatus],
  )

  const totalSkills = skills.length

  // Eine Kategorie ist "flach", wenn sie genau einen Skill mit gleichem Namen hat
  // → wird als einzelne Zeile gerendert (ohne Gruppen-Überschrift, nicht einklappbar)
  const isFlatCategory = useCallback(
    (category: string, items: Skill[]) => items.length === 1 && items[0].name === category,
    [],
  )

  // Nur echte Gruppen (Software etc.) sind einklappbar
  const collapsibleCategories = useMemo(() => {
    const byCat = new Map<string, Skill[]>()
    for (const s of skills) {
      if (!byCat.has(s.category)) byCat.set(s.category, [])
      byCat.get(s.category)!.push(s)
    }
    return [...byCat.entries()]
      .filter(([cat, items]) => !(items.length === 1 && items[0].name === cat))
      .map(([cat]) => cat)
  }, [skills])
  const allCollapsed = collapsibleCategories.length > 0 && collapsibleCategories.every((c) => collapsed.has(c))
  const toggleAll = () => persistCollapsed(allCollapsed ? new Set() : new Set(collapsibleCategories))

  const renderSkillRow = (skill: Skill, indent = false) => (
    <tr key={skill.id} className="group hover:bg-muted/30">
      <td className={cn(
        'sticky left-0 z-10 border-b border-r bg-background px-3 py-1.5 group-hover:bg-muted/30',
        indent && 'pl-8',
      )}>
        {skill.name}
      </td>
      {employees.map((e) => {
        const key = entryKey(e.id, skill.id)
        return (
          <td key={e.id} className="border-b px-1 py-1 text-center">
            <SkillCell
              status={getStatus(e.id, skill.id)}
              editable={canEdit}
              pending={pending.has(key)}
              onCycle={() => cycle(e, skill)}
              ariaLabel={`${e.name} · ${skill.name}`}
            />
          </td>
        )
      })}
    </tr>
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        Keine aktiven Mitarbeiter gefunden. Lege zuerst im Tab „Organisation" Mitarbeiter an.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Skill suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          {collapsibleCategories.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {allCollapsed
                ? <><ChevronsUpDown className="mr-1.5 h-4 w-4" />Gruppen ausklappen</>
                : <><ChevronsDownUp className="mr-1.5 h-4 w-4" />Gruppen einklappen</>}
            </Button>
          )}
          <Button
            variant={onlyGaps ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOnlyGaps((v) => !v)}
          >
            <Filter className="mr-1.5 h-4 w-4" />
            Nur Lücken
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Skills verwalten
            </Button>
          )}
        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
          Kann
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400"><GraduationCap className="h-3.5 w-3.5" /></span>
          In Einarbeitung
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/30"><Minus className="h-3.5 w-3.5" /></span>
          Kann noch nicht
        </span>
        {canEdit && <span className="text-xs italic">· Zelle anklicken zum Ändern</span>}
      </div>

      {/* Matrix */}
      <div className="overflow-auto rounded-lg border" style={{ maxHeight: '72vh' }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[220px] border-b border-r bg-muted/95 px-3 py-2 text-left font-semibold backdrop-blur">
                Tätigkeit
              </th>
              {employees.map((e) => (
                <th
                  key={e.id}
                  className="sticky top-0 z-20 min-w-[88px] border-b bg-muted/95 px-2 py-2 text-center align-bottom font-medium backdrop-blur"
                  title={`${e.name} — ${POSITION_LABEL[e.position]}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                      <span className="max-w-[80px] truncate text-xs">{e.name}</span>
                    </span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                      {POSITION_SHORT[e.position]}
                    </Badge>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {kannCount(e.id)}/{totalSkills}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedSkills.map(([category, items]) => {
              const visible = items.filter((s) => showRow(s.id))
              if (visible.length === 0) return null

              // Flache Kategorie (z.B. "3D-Druck") → einzelne bewertbare Zeile
              if (isFlatCategory(category, items)) {
                return renderSkillRow(visible[0])
              }

              // Echte Gruppe (z.B. "Software") → einklappbare Überschrift + Unterpunkte
              const isCollapsed = collapsed.has(category)
              return (
                <FragmentGroup key={category}>
                  <tr>
                    <td
                      colSpan={employees.length + 1}
                      onClick={() => toggleCategory(category)}
                      className="sticky left-0 z-10 cursor-pointer select-none border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-1.5">
                        {isCollapsed
                          ? <ChevronRight className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                        {category}
                        <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                          ({visible.length})
                        </span>
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed && visible.map((skill) => renderSkillRow(skill, true))}
                </FragmentGroup>
              )
            })}
          </tbody>
        </table>
      </div>

      {groupedSkills.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Keine Skills gefunden.</p>
      )}

      <ManageSkillsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        skills={skills}
        onChanged={load}
      />
    </div>
  )
}

// Hilfs-Wrapper: erlaubt mehrere <tr> ohne zusätzliches DOM-Element
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
