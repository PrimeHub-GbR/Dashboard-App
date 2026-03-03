'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          ({formatBytes(file.size)})
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Datei entfernen"
        className="h-6 w-6 shrink-0"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
