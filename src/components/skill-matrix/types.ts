export type SkillStatus = 'kann' | 'lernt' | 'nein'

export type Position = 'geschaeftsfuehrer' | 'manager' | 'mitarbeiter'

export type UserRole = 'admin' | 'manager' | 'staff'

export interface Employee {
  id: string
  name: string
  position: Position
  color: string
  is_active: boolean
}

export interface Skill {
  id: string
  name: string
  category: string
  sort_order: number
  is_active: boolean
}

export interface SkillEntry {
  employee_id: string
  skill_id: string
  status: 'kann' | 'lernt'
}

export interface MatrixData {
  employees: Employee[]
  skills: Skill[]
  entries: SkillEntry[]
}

export const POSITION_LABEL: Record<Position, string> = {
  geschaeftsfuehrer: 'Geschäftsführung',
  manager: 'Manager',
  mitarbeiter: 'Mitarbeiter',
}

export const POSITION_SHORT: Record<Position, string> = {
  geschaeftsfuehrer: 'GF',
  manager: 'MGR',
  mitarbeiter: 'MA',
}
