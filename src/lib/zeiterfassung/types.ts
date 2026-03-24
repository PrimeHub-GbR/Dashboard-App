export interface WeeklySchedule {
  mon: number
  tue: number
  wed: number
  thu: number
  fri: number
  sat: number
  sun: number
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0,
}

export const WEEKDAY_LABELS: Record<keyof WeeklySchedule, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

export interface Employee {
  id: string
  name: string
  pin: string        // nur intern / nicht an Client gesendet
  pin_is_set: boolean
  color: string
  is_active: boolean
  target_hours_per_month: number
  weekly_schedule: WeeklySchedule
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  employee_id: string
  checked_in_at: string       // UTC ISO
  checked_out_at: string | null
  break_minutes: number
  auth_method: 'pin' | 'fingerprint'
  note: string | null
  corrected_by: string | null
  corrected_at: string | null
  created_at: string
  updated_at: string
  // Joined
  employee?: Pick<Employee, 'id' | 'name' | 'color'>
}

export interface ShiftPlan {
  id: string
  employee_id: string
  shift_date: string          // YYYY-MM-DD
  start_time: string          // HH:mm
  end_time: string            // HH:mm
  note: string | null
  created_by: string | null
  created_at: string
  // Joined
  employee?: Pick<Employee, 'id' | 'name' | 'color'>
}

export interface TimeTrackingSettings {
  id: string
  overtime_threshold_hours: number
  break_trigger_hours: number
  n8n_webhook_url: string | null
  notification_enabled: boolean
  kiosk_pin_length: number
  created_at: string
  updated_at: string
}

export interface MonthStats {
  employee_id: string
  employee_name: string
  employee_color: string
  target_hours_per_month: number
  total_work_minutes: number
  total_break_minutes: number
  net_work_minutes: number       // total_work_minutes - total_break_minutes
  target_minutes: number         // target_hours_per_month * 60
  overtime_minutes: number       // positiv = Überstunden, negativ = Minusstunden
  entry_count: number
}

export interface LiveCheckin {
  entry_id: string
  employee_id: string
  employee_name: string
  employee_color: string
  checked_in_at: string          // UTC ISO
  duration_minutes: number       // now() - checked_in_at in Minuten
  arbzg_warning: boolean         // true wenn >= 360 min eingestempelt
}

export interface KioskCheckinResult {
  type: 'checkin' | 'checkout'
  entry_id: string
  employee_name: string
  employee_color: string
  checked_in_at: string
  checked_out_at?: string
  gross_minutes?: number
  break_minutes?: number
  net_minutes?: number
  auth_method?: 'pin' | 'fingerprint'
}
