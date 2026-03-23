export type OrgPosition = 'geschaeftsfuehrer' | 'manager' | 'mitarbeiter'

export const POSITION_LABELS: Record<OrgPosition, string> = {
  geschaeftsfuehrer: 'Geschäftsführer',
  manager: 'Manager',
  mitarbeiter: 'Mitarbeiter',
}

export type WeekSchedule = {
  mon: number; tue: number; wed: number; thu: number
  fri: number; sat: number; sun: number
}

/** Entspricht der employees-Tabelle (nur org-relevante Felder) */
export interface OrgMember {
  id: string
  name: string
  position: OrgPosition
  reports_to: string | null
  /** Array aller Vorgesetzten-IDs (für Organigramm-Linien) */
  reports_to_ids: string[]
  birth_date: string | null
  work_address: string | null
  home_address: string | null
  auth_user_id: string | null
  color: string
  is_active: boolean
  target_hours_per_month: number
  weekly_schedule: WeekSchedule
  display_order?: number
}

export type UserRole = 'admin' | 'manager' | 'staff'

/** Initialen aus Name ableiten (z.B. "Mohammed Ozdorf" → "MO") */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
