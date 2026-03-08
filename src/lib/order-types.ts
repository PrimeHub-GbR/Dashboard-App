// PROJ-2: Order types for Bestellungs-Viewer

export interface Order {
  id: string
  order_number: string
  order_date: string | null
  supplier: string | null
  status: string | null
  notes: string | null
  ean: string | null
  title: string | null
  cost: number | null
  quantity: number | null
  total: number | null
  file_id: string | null
  file_name: string | null
  raw_data: Record<string, unknown>
  synced_at: string
  updated_at: string
}

export interface SyncLog {
  id: string
  workflow_key: string
  status: "success" | "error" | "running"
  synced_at: string
  rows_imported: number | null
  error_message: string | null
}

export type OrderSortField =
  | "order_number"
  | "order_date"
  | "supplier"
  | "status"
  | "synced_at"

export interface OrderFilters {
  search: string
  status: string | null
  supplier: string | null
  dateFrom: string | null
  dateTo: string | null
}

export const DEFAULT_FILTERS: OrderFilters = {
  search: "",
  status: null,
  supplier: null,
  dateFrom: null,
  dateTo: null,
}

export const ORDER_STATUS_OPTIONS = [
  "Offen",
  "In Bearbeitung",
  "Versendet",
  "Abgeschlossen",
  "Storniert",
] as const

export const PAGE_SIZE = 50

// Editable fields on the Order model
export const EDITABLE_FIELDS: (keyof Order)[] = ["status", "notes"]

// Pending cell edit before saving
export interface CellEdit {
  orderId: string
  field: keyof Order
  originalValue: string | null
  newValue: string
}
