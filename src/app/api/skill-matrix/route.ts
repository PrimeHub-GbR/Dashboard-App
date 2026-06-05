import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/skill-matrix
// Lädt die komplette Matrix: Mitarbeiter, Skill-Katalog und Zuordnungen.
// Sichtbar für alle authentifizierten Nutzer.
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [employeesRes, skillsRes, entriesRes] = await Promise.all([
    service
      .from('employees')
      .select('id, name, position, color, is_active')
      .order('name'),
    service
      .from('skills')
      .select('id, name, category, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order'),
    service
      .from('employee_skills')
      .select('employee_id, skill_id, status'),
  ])

  if (employeesRes.error || skillsRes.error || entriesRes.error) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  // Reihenfolge: Geschäftsführer → Manager → Mitarbeiter, dann nach Name
  const rank: Record<string, number> = { geschaeftsfuehrer: 0, manager: 1, mitarbeiter: 2 }
  const employees = (employeesRes.data ?? [])
    .filter((e) => e.is_active)
    .sort((a, b) => (rank[a.position] ?? 9) - (rank[b.position] ?? 9) || a.name.localeCompare(b.name))

  return NextResponse.json({
    employees,
    skills: skillsRes.data ?? [],
    entries: entriesRes.data ?? [],
  })
}
