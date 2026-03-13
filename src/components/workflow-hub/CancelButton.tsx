'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CancelButtonProps {
  jobId: string
}

export function CancelButton({ jobId }: CancelButtonProps) {
  const [isCancelling, setIsCancelling] = useState(false)

  async function handleCancel() {
    setIsCancelling(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Abbruch fehlgeschlagen')
      } else {
        toast.success('Job abgebrochen')
      }
    } catch {
      toast.error('Netzwerkfehler beim Abbrechen')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={isCancelling}
      title="Job abbrechen"
      className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20 hover:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isCancelling ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      Abbrechen
    </button>
  )
}
