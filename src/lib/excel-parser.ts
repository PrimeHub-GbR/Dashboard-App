import * as XLSX from 'xlsx'

const COLUMN_MAP: Record<string, string> = {
  // EAN
  ean: 'ean',
  isbn: 'ean',
  barcode: 'ean',
  // Title
  title: 'title',
  titel: 'title',
  artikelbezeichnung: 'title',
  bezeichnung: 'title',
  artikel: 'title',
  // Cost
  cost: 'cost',
  preis: 'cost',
  einkaufspreis: 'cost',
  'vk-preis': 'cost',
  'ek-preis': 'cost',
  // Quantity
  kaufmenge: 'quantity',
  bestellmenge: 'quantity',
  menge: 'quantity',
  anzahl: 'quantity',
  qty: 'quantity',
  quantity: 'quantity',
  // Total
  'gesamt netto': 'total',
  gesamt_netto: 'total',
  gesamtnetto: 'total',
  zwischenwert: 'total',
  total: 'total',
  gesamt: 'total',
  summe: 'total',
  // Order number (optional)
  bestellnummer: 'order_number',
  auftragsnummer: 'order_number',
  'order number': 'order_number',
  'order no': 'order_number',
  order_number: 'order_number',
  // Date
  bestelldatum: 'order_date',
  datum: 'order_date',
  date: 'order_date',
  'order date': 'order_date',
  // Supplier
  lieferant: 'supplier',
  supplier: 'supplier',
  vendor: 'supplier',
  // Status
  status: 'status',
  // Notes
  notizen: 'notes',
  notiz: 'notes',
  bemerkung: 'notes',
  notes: 'notes',
  kommentar: 'notes',
}

export interface ParsedOrder {
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
  file_id: string
  file_name: string
  raw_data: Record<string, unknown>
}

export function parseExcel(
  buffer: Buffer,
  fallbackSupplier: string,
  fileId: string,
  fileName: string
): ParsedOrder[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const orders: ParsedOrder[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    if (rows.length < 2) continue

    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => cell !== null && cell !== '' && typeof cell === 'string')
    )
    if (headerRowIndex === -1) continue

    const headers = rows[headerRowIndex] as (string | null)[]
    const fieldMap = headers.map((h) => {
      if (h === null || h === undefined) return null
      return COLUMN_MAP[String(h).trim().toLowerCase()] ?? null
    })

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.every((cell) => cell === null || cell === '')) continue

      const raw_data: Record<string, unknown> = {}
      let order_number: string | null = null
      let order_date: string | null = null
      let supplier: string | null = null
      let status: string | null = null
      let notes: string | null = null
      let ean: string | null = null
      let title: string | null = null
      let cost: number | null = null
      let quantity: number | null = null
      let total: number | null = null

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j]
        const value = row[j]
        const field = fieldMap[j]

        if (header) raw_data[String(header)] = value
        if (value === null || value === '') continue

        switch (field) {
          case 'ean':
            ean = String(value).trim()
            break
          case 'title':
            title = String(value).trim()
            break
          case 'cost':
            cost = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
            if (isNaN(cost)) cost = null
            break
          case 'quantity':
            quantity = typeof value === 'number' ? Math.round(value) : parseInt(String(value))
            if (isNaN(quantity)) quantity = null
            break
          case 'total':
            total = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
            if (isNaN(total)) total = null
            break
          case 'order_number':
            order_number = String(value).trim()
            break
          case 'order_date':
            order_date = formatDate(value)
            break
          case 'supplier':
            supplier = String(value).trim()
            break
          case 'status':
            status = String(value).trim()
            break
          case 'notes':
            notes = String(value).trim()
            break
        }
      }

      if (!order_number) {
        const hasContent = row.some((v) => v !== null && v !== '')
        if (!hasContent) continue
        // Use fileId + row index for globally unique fallback key
        order_number = ean
          ? `${fileId}-${ean}`
          : `${fileId}-row${i}`
      }

      orders.push({
        order_number,
        order_date,
        supplier: supplier ?? fallbackSupplier,
        status,
        notes,
        ean,
        title,
        cost,
        quantity,
        total,
        file_id: fileId,
        file_name: fileName,
        raw_data,
      })
    }
  }

  return orders
}

function formatDate(value: unknown): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  const str = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  const germanMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (germanMatch) {
    const [, day, month, year] = germanMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const num = Number(str)
  if (!isNaN(num) && num > 1000) {
    const d = XLSX.SSF.parse_date_code(num)
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]

  return null
}
