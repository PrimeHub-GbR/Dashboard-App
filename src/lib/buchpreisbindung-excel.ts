import ExcelJS from 'exceljs'

export interface BuchpreischeckExcelRun {
  amazon_seller_id: string
  triggered_by: string | null
  total_items: number | null
  violations_count: number | null
  scrapeops_credits: number | null
  started_at: string
  completed_at: string | null
}

export interface BuchpreischeckExcelSeller {
  seller_name: string | null
  amazon_seller_id: string
}

export interface BuchpreischeckExcelItem {
  isbn13: string
  asin: string | null
  title: string | null
  amazon_price: number | string | null
  vlb_price: number | string | null
  amazon_url: string | null
  is_compliant: boolean | null
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtDateTimeBerlin(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—'
  const sec = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')} Min`
}

function triggerLabel(t: string | null): string {
  if (t === 'manual') return 'manuell'
  if (t === 'scheduler') return 'automatisch (Scheduler)'
  return t ?? '—'
}

async function fetchDonutPng(okCount: number, violations: number, noVlb: number): Promise<Buffer | null> {
  const config = {
    type: 'doughnut',
    data: {
      labels: ['OK', 'Verstoß', 'Kein VLB-Preis'],
      datasets: [{
        data: [okCount, violations, noVlb],
        backgroundColor: ['#22c55e', '#ef4444', '#facc15'],
        borderWidth: 0,
      }],
    },
    options: {
      cutoutPercentage: 55,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 14 } } },
        title: { display: true, text: 'Compliance-Status', font: { size: 18, weight: 'bold' } },
        datalabels: {
          color: '#fff',
          font: { size: 13, weight: 'bold' },
          formatter: '(v) => v > 0 ? v : ""',
        },
      },
    },
  }
  const url = `https://quickchart.io/chart?bkg=white&w=520&h=340&format=png&c=${encodeURIComponent(JSON.stringify(config))}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  } catch {
    return null
  }
}

export async function buildBuchpreischeckExcel(
  run: BuchpreischeckExcelRun,
  seller: BuchpreischeckExcelSeller,
  items: BuchpreischeckExcelItem[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PrimeHub Dashboard'
  wb.created = new Date()

  // Kennzahlen
  const okCount = items.filter(i => i.is_compliant === true).length
  const violationsCount = items.filter(i => i.is_compliant === false).length
  const noVlbCount = items.filter(i => i.is_compliant === null).length
  const total = items.length
  const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)} %` : '0,0 %'

  const violationSum = items
    .filter(i => i.is_compliant === false)
    .reduce((s, i) => {
      const a = num(i.amazon_price)
      const v = num(i.vlb_price)
      return a != null && v != null ? s + Math.max(0, v - a) : s
    }, 0)

  const sellerLabel = seller.seller_name?.trim() || seller.amazon_seller_id
  const datumStr = fmtDateTimeBerlin(run.started_at)

  // =====================================================
  // Blatt 1: Auswertung
  // =====================================================
  const ws = wb.addWorksheet('Auswertung', {
    views: [{ showGridLines: false }],
  })
  ws.columns = [
    { width: 24 }, { width: 22 }, { width: 4 }, { width: 26 }, { width: 22 }, { width: 4 },
  ]

  // Titel
  ws.mergeCells('A1:F1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'Buchpreisbindungs-Prüfung'
  titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF111827' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34

  // Untertitel: Händler + Datum
  ws.mergeCells('A2:F2')
  const subCell = ws.getCell('A2')
  subCell.value = `${sellerLabel} · ${datumStr}`
  subCell.font = { size: 12, color: { argb: 'FF6B7280' } }
  subCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  // Section-Header
  const sectionHeader = (range: string, text: string) => {
    ws.mergeCells(range)
    const c = ws.getCell(range.split(':')[0])
    c.value = text
    c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1E14' } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(parseInt(range.match(/\d+/)![0], 10)).height = 22
  }
  sectionHeader('A4:B4', 'Stammdaten')
  sectionHeader('D4:E4', 'Kennzahlen')

  // Helfer: Key/Value-Zeile
  const kv = (keyCell: string, valueCell: string, key: string, value: string | number, opts?: { bold?: boolean, color?: string }) => {
    const k = ws.getCell(keyCell)
    k.value = key
    k.font = { size: 11, color: { argb: 'FF6B7280' } }
    k.alignment = { horizontal: 'left', vertical: 'middle' }
    const v = ws.getCell(valueCell)
    v.value = value
    v.font = { size: 11, bold: opts?.bold ?? false, color: { argb: opts?.color ?? 'FF111827' } }
    v.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  // Stammdaten
  kv('A5', 'B5', 'Händler:', seller.seller_name?.trim() || '—', { bold: true })
  kv('A6', 'B6', 'Amazon-Händler-ID:', seller.amazon_seller_id)
  kv('A7', 'B7', 'Prüfdatum:', datumStr)
  kv('A8', 'B8', 'Prüfdauer:', fmtDuration(run.started_at, run.completed_at))
  kv('A9', 'B9', 'Ausgelöst durch:', triggerLabel(run.triggered_by))

  // Kennzahlen
  kv('D5', 'E5', 'Gesamt geprüfte Titel:', total, { bold: true })
  kv('D6', 'E6', '✅ OK:', `${okCount} (${pct(okCount)})`, { color: 'FF15803D' })
  kv('D7', 'E7', '❌ Verstöße:', `${violationsCount} (${pct(violationsCount)})`, { color: 'FFB91C1C', bold: violationsCount > 0 })
  kv('D8', 'E8', '⚠️ Kein VLB-Preis:', `${noVlbCount} (${pct(noVlbCount)})`, { color: 'FFB45309' })
  const violationSumStr = violationSum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  kv('D9', 'E9', 'Verstoß-Summe:', violationSumStr, { color: 'FFB91C1C', bold: violationSum > 0 })

  // Boxen-Outline
  const box = (range: string) => {
    const [from, to] = range.split(':')
    const fromCol = from.charCodeAt(0) - 64
    const fromRow = parseInt(from.slice(1), 10)
    const toCol = to.charCodeAt(0) - 64
    const toRow = parseInt(to.slice(1), 10)
    const thin = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
    for (let r = fromRow; r <= toRow; r++) {
      for (let c = fromCol; c <= toCol; c++) {
        const cell = ws.getCell(r, c)
        const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) }
        if (r === fromRow) b.top = thin
        if (r === toRow) b.bottom = thin
        if (c === fromCol) b.left = thin
        if (c === toCol) b.right = thin
        cell.border = b as ExcelJS.Borders
      }
    }
  }
  box('A4:B9')
  box('D4:E9')

  // Donut-Chart (QuickChart PNG) — horizontal mittig in A:F
  // Spaltenbreiten: A=24, B=22, C=4, D=26, E=22, F=4 → in Pixel (~ width*7 + 5 Padding)
  // → gesamt ~744 px Inhaltsbereich; Chart 520 px → Links-Abstand (744-520)/2 ~ 112 px.
  // ExcelJS interpretiert fractional `col` mit nur 240k EMU/Einheit (~25 px max), daher
  // setzen wir nativeCol/nativeColOff direkt (1 px = 9525 EMU → 112 px ~ 1.067.000 EMU).
  const CHART_LEFT_OFFSET_EMU = 112 * 9525
  const donutBuf = await fetchDonutPng(okCount, violationsCount, noVlbCount)
  if (donutBuf) {
    const imgId = wb.addImage({
      base64: `data:image/png;base64,${donutBuf.toString('base64')}`,
      extension: 'png',
    })
    ws.addImage(imgId, {
      tl: {
        nativeCol: 0,
        nativeColOff: CHART_LEFT_OFFSET_EMU,
        nativeRow: 11,
        nativeRowOff: 0,
      } as unknown as ExcelJS.Anchor,
      ext: { width: 520, height: 340 },
    })
    // Platz reservieren (Zeilen-Höhe für Chart-Bereich)
    for (let r = 12; r <= 28; r++) ws.getRow(r).height = 18
  } else {
    ws.mergeCells('A12:F18')
    const fb = ws.getCell('A12')
    fb.value = 'Chart konnte nicht geladen werden.'
    fb.font = { italic: true, color: { argb: 'FF9CA3AF' } }
    fb.alignment = { horizontal: 'center', vertical: 'middle' }
  }

  // Hinweis (statt Footer): Repricer + Datenqualität
  const noteFromRow = 30
  const noteToRow = 32
  ws.mergeCells(`A${noteFromRow}:F${noteToRow}`)
  const note = ws.getCell(`A${noteFromRow}`)
  note.value =
    'Die Preise des Händlers können sich jederzeit ändern, da intelligente Repricer eingesetzt werden. ' +
    'Das Ergebnis sollte zeitnah ausgewertet werden. ' +
    'Es ist nicht auszuschließen, dass die Daten Fehler enthalten.'
  note.font = { size: 10, color: { argb: 'FF6B7280' }, italic: true }
  note.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  ws.getRow(noteFromRow).height = 22
  ws.getRow(noteFromRow + 1).height = 22
  ws.getRow(noteToRow).height = 22

  // =====================================================
  // Blatt 2: Details
  // =====================================================
  const ws2 = wb.addWorksheet('Details', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws2.columns = [
    { header: 'Datum', key: 'date', width: 18 },
    { header: 'Händler', key: 'seller', width: 24 },
    { header: 'Buchtitel', key: 'title', width: 55 },
    { header: 'Amazon-Preis (€)', key: 'amazon', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'VLB-Preis (€)', key: 'vlb', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'ISBN13', key: 'isbn', width: 16 },
    { header: 'ASIN', key: 'asin', width: 12 },
    { header: 'Amazon-URL', key: 'url', width: 38 },
    { header: 'Status', key: 'status', width: 18 },
  ]
  const head = ws2.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1E14' } }
  head.alignment = { vertical: 'middle' }
  head.height = 22

  // Sortierung: Verstöße zuerst, dann „Kein VLB", dann OK
  const rank = (v: boolean | null) => v === false ? 0 : v == null ? 1 : 2
  const sorted = [...items].sort((a, b) => rank(a.is_compliant) - rank(b.is_compliant))

  const sellerLabelTable = seller.seller_name?.trim()
    ? `${seller.seller_name.trim()} (${seller.amazon_seller_id})`
    : seller.amazon_seller_id

  for (const it of sorted) {
    const statusText = it.is_compliant === true ? 'OK'
      : it.is_compliant === false ? 'VERSTOSS'
      : 'Kein VLB-Preis'
    const row = ws2.addRow({
      date: datumStr,
      seller: sellerLabelTable,
      title: it.title ?? '—',
      amazon: num(it.amazon_price),
      vlb: num(it.vlb_price),
      isbn: it.isbn13,
      asin: it.asin ?? '—',
      url: it.amazon_url ?? '',
      status: statusText,
    })
    // ISBN als Text (Excel sonst evtl. wissenschaftliche Notation)
    row.getCell('isbn').numFmt = '@'
    // URL als Hyperlink
    if (it.amazon_url) {
      row.getCell('url').value = { text: it.amazon_url, hyperlink: it.amazon_url }
      row.getCell('url').font = { color: { argb: 'FF1D4ED8' }, underline: true }
    }
    // Verstoß: ganze Zeile hellrot, Status-Zelle fett rot
    if (it.is_compliant === false) {
      row.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
      })
      const sc = row.getCell('status')
      sc.font = { bold: true, color: { argb: 'FFB91C1C' } }
    } else if (it.is_compliant === true) {
      const sc = row.getCell('status')
      sc.font = { color: { argb: 'FF15803D' } }
    } else {
      const sc = row.getCell('status')
      sc.font = { color: { argb: 'FFB45309' } }
    }
  }

  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } }

  const arr = await wb.xlsx.writeBuffer()
  return Buffer.from(arr as ArrayBuffer)
}
