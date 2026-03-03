'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface DownloadButtonProps {
  jobId: string
  hasResultFile: boolean
}

export function DownloadButton({ jobId, hasResultFile }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  if (!hasResultFile) return null

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/download`)

      if (!res.ok) {
        toast.error('Download-Link abgelaufen. Bitte starte den Job erneut.')
        return
      }

      const { url } = await res.json()
      window.open(url, '_blank')
    } catch {
      toast.error('Download-Link abgelaufen. Bitte starte den Job erneut.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={isDownloading}
      aria-label="Ergebnisdatei herunterladen"
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isDownloading ? 'Lädt...' : 'Download'}
    </Button>
  )
}
