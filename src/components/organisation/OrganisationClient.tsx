'use client'

import { useCallback, useEffect, useState } from 'react'
import { OrgChart } from './OrgChart'
import { MitarbeiterVerwaltung } from '@/components/zeiterfassung/MitarbeiterVerwaltung'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { OrgMember, UserRole } from './types'

interface OrganisationClientProps {
  userRole: UserRole
}

export function OrganisationClient({ userRole }: OrganisationClientProps) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [managerOwnId, setManagerOwnId] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/organisation/members')
      if (!res.ok) throw new Error()
      const json = await res.json() as { members: OrgMember[] }
      setMembers(json.members)

      // Manager: eigene org_member.id ermitteln
      // Die API gibt auth_user_id zurück; wir brauchen die ID des Managers
      // Da wir keinen direkten User-Kontext haben, nutzen wir den Trick:
      // Der Manager hat ein org_member mit position='manager' und auth_user_id = aktuelle User-ID.
      // Wir fragen die Supabase-Session via /api/auth/me nicht ab — stattdessen
      // gibt der Manager-Eintrag seinen reports_to-ID über alle Mitarbeiter zurück.
      // Wir ermitteln die Manager-ID via POST /api/organisation/members/me oder
      // einfach: der erste Manager-Eintrag dessen auth_user_id zur Session passt.
      // Vereinfachung: wir rufen einen kleinen Endpunkt ab.
      if (userRole === 'manager') {
        const meRes = await fetch('/api/organisation/me')
        if (meRes.ok) {
          const meJson = await meRes.json() as { orgMemberId: string | null }
          setManagerOwnId(meJson.orgMemberId)
        }
      }
    } catch {
      // Fehler still ignorieren (User sieht leere Liste)
    } finally {
      setLoading(false)
    }
  }, [userRole])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  return (
    <div className="space-y-8">
      {/* Organigramm */}
      {loading ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="flex justify-center gap-6">
            <Skeleton className="h-40 w-44" />
            <Skeleton className="h-40 w-44" />
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-40 w-44" />
          </div>
        </div>
      ) : (
        <OrgChart
          members={members}
          userRole={userRole}
          managerOwnId={managerOwnId}
          onRefresh={loadMembers}
        />
      )}

      {/* Mitarbeiterverwaltung (Zeiterfassung) — nur für admin und manager */}
      {(userRole === 'admin' || userRole === 'manager') && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Zeiterfassung — Mitarbeiterverwaltung</h2>
            <p className="text-sm text-muted-foreground">
              Mitarbeiter für das Kiosk-Check-in-System verwalten (PIN, Sollstunden, Wochenplan).
            </p>
          </div>
          <MitarbeiterVerwaltung />
        </>
      )}
    </div>
  )
}
