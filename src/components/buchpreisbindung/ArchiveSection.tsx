'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BuchpreischeckRun } from '@/hooks/useBuchpreisbindung'

interface Props {
  runs: BuchpreischeckRun[]
  selectedSellerId: string | null
}

export function ArchiveSection({ runs, selectedSellerId }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)

  const archives = runs.filter(r => r.status === 'success' && r.excel_file_path).slice(0, 3)

  async function handleDownload(run: BuchpreischeckRun) {
    setDownloading(run.id)
    try {
      const res = await fetch(`/api/buchpreisbindung/runs/${run.id}/download`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Download fehlgeschlagen')
        return
      }
      window.open(data.url, '_blank')
    } catch {
      toast.error('Netzwerkfehler beim Download')
    } finally {
      setDownloading(null)
    }
  }

  function formatDate(ts: string) {
    return new Date(ts).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function getFilename(run: BuchpreischeckRun) {
    const d = new Date(run.started_at)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const time = `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`
    return `buchpreischeck_${run.amazon_seller_id}_${date}_${time}.xlsx`
  }

  if (!selectedSellerId) return null

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base">Excel-Archiv</CardTitle>
        <p className="text-xs text-white/40 mt-0.5">Die letzten 3 Prüfläufe (ältere werden automatisch gelöscht)</p>
      </CardHeader>
      <CardContent>
        {archives.length === 0 && (
          <p className="text-sm text-white/30 py-4 text-center">
            Noch keine abgeschlossenen Prüfläufe mit Excel-Export.
          </p>
        )}

        <div className="space-y-2">
          {archives.map(run => (
            <div key={run.id} className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
              <FileSpreadsheet className="h-4 w-4 text-green-400/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 truncate font-mono">{getFilename(run)}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-white/30">{formatDate(run.started_at)}</span>
                  {run.total_items != null && (
                    <span className="text-[11px] text-white/30">{run.total_items} Titel</span>
                  )}
                  {run.violations_count != null && run.violations_count > 0 && (
                    <span className="text-[11px] text-red-400/70">{run.violations_count} Verstöße</span>
                  )}
                  {run.violations_count === 0 && (
                    <span className="text-[11px] text-green-400/70">Keine Verstöße</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-8 px-2 text-white/40 hover:text-white hover:bg-white/8"
                onClick={() => handleDownload(run)}
                disabled={downloading === run.id}
              >
                {downloading === run.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
