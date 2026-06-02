// Einheitliches Modell für das Notification-Center.
// Mehrere Quellen (Profil-Änderungen, Zeiterfassung, Überstunden) werden zur
// Ladezeit zu dieser gemeinsamen Form aggregiert.

export type NotificationSource = 'profile' | 'zeit_stale' | 'zeit_review' | 'overtime' | 'task_done'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface AppNotification {
  /** Stabiler, eindeutiger Schlüssel, z. B. "profile:<id>", "ztstale:<entryId>", "overtime:<empId>:<YYYY-MM>" */
  key: string
  source: NotificationSource
  severity: NotificationSeverity
  title: string
  body: string
  employee: { id: string; name: string; color: string } | null
  /** ISO-Timestamp für Sortierung */
  created_at: string
  /** Deep-Link-Ziel (interner Pfad) oder null wenn keine Navigation */
  link: string | null
  acknowledged: boolean
}

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}
